import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const router = Router();

// Simple session token system using crypto-signed cookies
function signToken(secret: string): string {
  const data = Date.now().toString();
  const sig = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return `${data}.${sig}`;
}

function verifyToken(token: string, secret: string): boolean {
  if (!token) return false;
  const [data, sig] = token.split('.');
  if (!data || !sig) return false;
  // Token expires after 7 days
  const tokenAge = Date.now() - parseInt(data, 10);
  if (tokenAge > 7 * 24 * 60 * 60 * 1000) return false;
  const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return sig === expectedSig;
}

// Middleware to protect routes
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.SESSION_SECRET || 'change-me';
  const token = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('vortis_auth='))?.split('=')[1];
  if (!token || !verifyToken(decodeURIComponent(token), secret)) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login');
  }
  next();
}

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  const { password } = req.body;
  const adminPwd = process.env.ADMIN_PASSWORD || 'vortis2026';
  const secret = process.env.SESSION_SECRET || 'change-me';

  if (!password || password !== adminPwd) {
    return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
  }

  const token = signToken(secret);
  res.cookie?.('vortis_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  // Fallback if res.cookie isn't available
  res.setHeader('Set-Cookie', `vortis_auth=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`);

  res.json({ success: true });
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.setHeader('Set-Cookie', 'vortis_auth=; Path=/; HttpOnly; Max-Age=0');
  res.json({ success: true });
});

// GET /api/auth/check
router.get('/check', (req: Request, res: Response) => {
  const secret = process.env.SESSION_SECRET || 'change-me';
  const token = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('vortis_auth='))?.split('=')[1];
  const ok = !!token && verifyToken(decodeURIComponent(token), secret);
  res.json({ authenticated: ok });
});

export default router;
