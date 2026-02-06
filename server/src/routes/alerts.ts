import { Router, Response } from 'express';
import { query } from '../models/db.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT a.id, a.product_id as "productId", p.name as "productName",
       a.threshold, a.is_active as "isActive", a.created_by as "createdBy"
       FROM alerts a
       JOIN products p ON a.product_id = p.id
       ORDER BY p.name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    res.status(500).json({ message: 'Failed to fetch alerts' });
  }
});

router.post('/', requireRole('admin', 'analyst'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productId, threshold } = req.body;

    if (!productId || threshold === undefined) {
      res.status(400).json({ message: 'Product ID and threshold are required' });
      return;
    }

    // Check if alert already exists for this product
    const existing = await query(
      'SELECT id FROM alerts WHERE product_id = $1',
      [productId]
    );

    if (existing.rows.length > 0) {
      res.status(400).json({ message: 'Alert already exists for this product' });
      return;
    }

    const result = await query(
      `INSERT INTO alerts (product_id, threshold, is_active, created_by)
       VALUES ($1, $2, true, $3)
       RETURNING id, product_id as "productId", threshold, is_active as "isActive"`,
      [productId, threshold, req.user!.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create alert:', error);
    res.status(500).json({ message: 'Failed to create alert' });
  }
});

router.put('/:id', requireRole('admin', 'analyst'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { threshold, isActive } = req.body;

    const result = await query(
      `UPDATE alerts SET
        threshold = COALESCE($1, threshold),
        is_active = COALESCE($2, is_active)
       WHERE id = $3
       RETURNING id, product_id as "productId", threshold, is_active as "isActive"`,
      [threshold, isActive, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Alert not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update alert:', error);
    res.status(500).json({ message: 'Failed to update alert' });
  }
});

router.delete('/:id', requireRole('admin', 'analyst'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM alerts WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Alert not found' });
      return;
    }

    res.json({ message: 'Alert deleted' });
  } catch (error) {
    console.error('Failed to delete alert:', error);
    res.status(500).json({ message: 'Failed to delete alert' });
  }
});

export default router;
