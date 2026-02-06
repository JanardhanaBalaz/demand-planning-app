import { Router, Response } from 'express';
import { query } from '../models/db.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productId, startDate, endDate } = req.query;

    let sql = `
      SELECT d.id, d.product_id as "productId", p.name as "productName",
       d.quantity, d.date, d.source
       FROM demand_records d
       JOIN products p ON d.product_id = p.id
       WHERE 1=1
    `;
    const params: unknown[] = [];

    if (productId) {
      params.push(productId);
      sql += ` AND d.product_id = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      sql += ` AND d.date >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND d.date <= $${params.length}`;
    }

    sql += ' ORDER BY d.date DESC LIMIT 1000';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch demand records:', error);
    res.status(500).json({ message: 'Failed to fetch demand records' });
  }
});

router.post('/', requireRole('admin', 'analyst'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productId, quantity, date, source } = req.body;

    if (!productId || quantity === undefined || !date) {
      res.status(400).json({ message: 'Product ID, quantity, and date are required' });
      return;
    }

    const result = await query(
      `INSERT INTO demand_records (product_id, quantity, date, source)
       VALUES ($1, $2, $3, $4)
       RETURNING id, product_id as "productId", quantity, date, source`,
      [productId, quantity, date, source || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create demand record:', error);
    res.status(500).json({ message: 'Failed to create demand record' });
  }
});

router.post('/bulk', requireRole('admin', 'analyst'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      res.status(400).json({ message: 'Records array is required' });
      return;
    }

    let insertedCount = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        const { productId, quantity, date, source } = record;
        if (productId && quantity !== undefined && date) {
          await query(
            'INSERT INTO demand_records (product_id, quantity, date, source) VALUES ($1, $2, $3, $4)',
            [productId, quantity, date, source || null]
          );
          insertedCount++;
        }
      } catch (err) {
        errors.push(`Failed to insert record: ${JSON.stringify(record)}`);
      }
    }

    res.json({ message: `Imported ${insertedCount} records`, count: insertedCount, errors });
  } catch (error) {
    console.error('Failed to bulk create demand records:', error);
    res.status(500).json({ message: 'Failed to bulk create demand records' });
  }
});

export default router;
