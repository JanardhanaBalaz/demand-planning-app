import { Router, Response } from 'express';
import { query } from '../models/db.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT i.id, i.product_id as "productId", p.name as "productName", p.sku as "productSku",
       i.quantity, i.location, i.last_updated as "lastUpdated"
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       ORDER BY p.name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch inventory:', error);
    res.status(500).json({ message: 'Failed to fetch inventory' });
  }
});

router.put('/:productId', requireRole('admin', 'analyst'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productId } = req.params;
    const { quantity, location } = req.body;

    if (quantity === undefined) {
      res.status(400).json({ message: 'Quantity is required' });
      return;
    }

    const result = await query(
      `UPDATE inventory SET quantity = $1, location = COALESCE($2, location), last_updated = NOW()
       WHERE product_id = $3
       RETURNING id, product_id as "productId", quantity, location, last_updated as "lastUpdated"`,
      [quantity, location, productId]
    );

    if (result.rows.length === 0) {
      // Create new inventory record if it doesn't exist
      const insertResult = await query(
        `INSERT INTO inventory (product_id, quantity, location) VALUES ($1, $2, $3)
         RETURNING id, product_id as "productId", quantity, location, last_updated as "lastUpdated"`,
        [productId, quantity, location || null]
      );
      res.json(insertResult.rows[0]);
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update inventory:', error);
    res.status(500).json({ message: 'Failed to update inventory' });
  }
});

router.get('/alerts', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT a.id, a.product_id as "productId", p.name as "productName",
       a.threshold, a.is_active as "isActive",
       i.quantity as "currentQuantity",
       CASE WHEN i.quantity < a.threshold AND a.is_active THEN true ELSE false END as "isTriggered"
       FROM alerts a
       JOIN products p ON a.product_id = p.id
       LEFT JOIN inventory i ON a.product_id = i.product_id
       ORDER BY "isTriggered" DESC, p.name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    res.status(500).json({ message: 'Failed to fetch alerts' });
  }
});

export default router;
