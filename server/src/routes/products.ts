import { Router, Response } from 'express';
import { query } from '../models/db.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT id, sku, name, description, category, unit_price as "unitPrice",
       created_at as "createdAt" FROM products ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch products:', error);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
});

router.post('/', requireRole('admin', 'analyst'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sku, name, description, category, unitPrice } = req.body;

    if (!sku || !name || unitPrice === undefined) {
      res.status(400).json({ message: 'SKU, name, and unit price are required' });
      return;
    }

    const existing = await query('SELECT id FROM products WHERE sku = $1', [sku]);
    if (existing.rows.length > 0) {
      res.status(400).json({ message: 'SKU already exists' });
      return;
    }

    const result = await query(
      `INSERT INTO products (sku, name, description, category, unit_price, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, sku, name, description, category, unit_price as "unitPrice", created_at as "createdAt"`,
      [sku, name, description || null, category || null, unitPrice, req.user!.id]
    );

    // Create initial inventory record
    await query(
      'INSERT INTO inventory (product_id, quantity, location) VALUES ($1, 0, NULL)',
      [result.rows[0].id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create product:', error);
    res.status(500).json({ message: 'Failed to create product' });
  }
});

router.put('/:id', requireRole('admin', 'analyst'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { sku, name, description, category, unitPrice } = req.body;

    if (sku) {
      const existing = await query(
        'SELECT id FROM products WHERE sku = $1 AND id != $2',
        [sku, id]
      );
      if (existing.rows.length > 0) {
        res.status(400).json({ message: 'SKU already exists' });
        return;
      }
    }

    const result = await query(
      `UPDATE products SET
        sku = COALESCE($1, sku),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        category = COALESCE($4, category),
        unit_price = COALESCE($5, unit_price)
       WHERE id = $6
       RETURNING id, sku, name, description, category, unit_price as "unitPrice", created_at as "createdAt"`,
      [sku, name, description, category, unitPrice, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update product:', error);
    res.status(500).json({ message: 'Failed to update product' });
  }
});

router.delete('/:id', requireRole('admin', 'analyst'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Delete related records first
    await query('DELETE FROM inventory WHERE product_id = $1', [id]);
    await query('DELETE FROM demand_records WHERE product_id = $1', [id]);
    await query('DELETE FROM forecasts WHERE product_id = $1', [id]);
    await query('DELETE FROM alerts WHERE product_id = $1', [id]);

    const result = await query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    res.json({ message: 'Product deleted' });
  } catch (error) {
    console.error('Failed to delete product:', error);
    res.status(500).json({ message: 'Failed to delete product' });
  }
});

export default router;
