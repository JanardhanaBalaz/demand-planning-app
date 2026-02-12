import { Router, Response } from 'express';
import { query } from '../models/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT id, promo_name, country, channel, start_date, end_date,
       discount_percent, notes, status, created_at
       FROM promotions ORDER BY start_date DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch promotions:', error);
    res.status(500).json({ message: 'Failed to fetch promotions' });
  }
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { promo_name, country, channel, start_date, end_date, discount_percent, notes, status } = req.body;

    if (!promo_name || !start_date || !end_date) {
      res.status(400).json({ message: 'Promotion name, start date, and end date are required' });
      return;
    }

    const result = await query(
      `INSERT INTO promotions (promo_name, country, channel, start_date, end_date, discount_percent, notes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, promo_name, country, channel, start_date, end_date, discount_percent, notes, status, created_at`,
      [promo_name, country || null, channel || null, start_date, end_date, discount_percent || 0, notes || null, status || 'scheduled', req.user!.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create promotion:', error);
    res.status(500).json({ message: 'Failed to create promotion' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { promo_name, country, channel, start_date, end_date, discount_percent, notes, status } = req.body;

    const result = await query(
      `UPDATE promotions SET
        promo_name = COALESCE($1, promo_name),
        country = COALESCE($2, country),
        channel = COALESCE($3, channel),
        start_date = COALESCE($4, start_date),
        end_date = COALESCE($5, end_date),
        discount_percent = COALESCE($6, discount_percent),
        notes = COALESCE($7, notes),
        status = COALESCE($8, status)
       WHERE id = $9
       RETURNING id, promo_name, country, channel, start_date, end_date, discount_percent, notes, status, created_at`,
      [promo_name, country, channel, start_date, end_date, discount_percent, notes, status, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Promotion not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update promotion:', error);
    res.status(500).json({ message: 'Failed to update promotion' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM promotions WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Promotion not found' });
      return;
    }

    res.json({ message: 'Promotion deleted' });
  } catch (error) {
    console.error('Failed to delete promotion:', error);
    res.status(500).json({ message: 'Failed to delete promotion' });
  }
});

export default router;
