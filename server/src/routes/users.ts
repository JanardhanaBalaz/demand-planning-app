import { Router, Response } from 'express';
import { query } from '../models/db.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('admin'));

router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      'SELECT user_id as id, email, full_name as name, role, assigned_channels as "assignedChannels", created_at as "createdAt" FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

router.patch('/:id/role', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'analyst', 'viewer'].includes(role)) {
      res.status(400).json({ message: 'Invalid role' });
      return;
    }

    if (parseInt(id as string) === req.user!.id) {
      res.status(400).json({ message: 'Cannot change your own role' });
      return;
    }

    const result = await query(
      'UPDATE users SET role = $1 WHERE user_id = $2 RETURNING user_id as id, email, full_name as name, role, assigned_channels as "assignedChannels"',
      [role, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update user role:', error);
    res.status(500).json({ message: 'Failed to update role' });
  }
});

router.patch('/:id/channels', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { assigned_channels } = req.body;

    if (!Array.isArray(assigned_channels)) {
      res.status(400).json({ message: 'assigned_channels must be an array' });
      return;
    }

    const result = await query(
      'UPDATE users SET assigned_channels = $1 WHERE user_id = $2 RETURNING user_id as id, email, full_name as name, role, assigned_channels as "assignedChannels"',
      [assigned_channels, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update user channels:', error);
    res.status(500).json({ message: 'Failed to update channels' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (parseInt(id as string) === req.user!.id) {
      res.status(400).json({ message: 'Cannot delete yourself' });
      return;
    }

    const result = await query('DELETE FROM users WHERE user_id = $1 RETURNING user_id as id', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Failed to delete user:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

export default router;
