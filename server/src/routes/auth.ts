import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { query } from '../models/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

const JWT_OPTIONS: SignOptions = {
  expiresIn: '7d',
};

function generateToken(userId: number): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, JWT_OPTIONS);
}

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
);

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ message: 'Email, password, and name are required' });
      return;
    }

    const existing = await query('SELECT user_id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(400).json({ message: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // First user becomes admin
    const countResult = await query('SELECT COUNT(*) FROM users');
    const role = parseInt(countResult.rows[0].count) === 0 ? 'admin' : 'viewer';

    const result = await query(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING user_id as id, email, full_name as name, role, assigned_channels',
      [email, passwordHash, name, role]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    res.status(201).json({ token, user });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Failed to register' });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }

    const result = await query(
      'SELECT user_id as id, email, full_name as name, role, password_hash, assigned_channels FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const token = generateToken(user.id);

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, assigned_channels: user.assigned_channels || [] },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Failed to login' });
  }
});

router.get('/me', authenticate, (req: AuthRequest, res: Response): void => {
  res.json({ user: req.user });
});

// Google OAuth - Get authorization URL
router.get('/google', (_req: Request, res: Response): void => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(500).json({ message: 'Google OAuth not configured' });
    return;
  }

  const authUrl = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['email', 'profile'],
    prompt: 'select_account',
  });

  res.json({ url: authUrl });
});

// Google OAuth - Handle callback
router.post('/google/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ message: 'Authorization code is required' });
      return;
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      res.status(500).json({ message: 'Google OAuth not configured' });
      return;
    }

    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    // Verify and decode the ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({ message: 'Failed to get user info from Google' });
      return;
    }

    const { email, name, sub: googleId } = payload;

    // Check if user exists
    let result = await query(
      'SELECT user_id as id, email, full_name as name, role, assigned_channels FROM users WHERE email = $1',
      [email]
    );

    let user;
    if (result.rows.length === 0) {
      // Create new user
      const countResult = await query('SELECT COUNT(*) FROM users');
      const role = parseInt(countResult.rows[0].count) === 0 ? 'admin' : 'viewer';

      result = await query(
        'INSERT INTO users (email, password_hash, full_name, role, google_id) VALUES ($1, $2, $3, $4, $5) RETURNING user_id as id, email, full_name as name, role, assigned_channels',
        [email, '', name || email.split('@')[0], role, googleId]
      );
      user = result.rows[0];
    } else {
      user = result.rows[0];
      // Update google_id if not set
      await query('UPDATE users SET google_id = $1 WHERE user_id = $2 AND google_id IS NULL', [googleId, user.id]);
    }

    const token = generateToken(user.id);

    res.json({ token, user });
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ message: 'Google authentication failed' });
  }
});

export default router;
