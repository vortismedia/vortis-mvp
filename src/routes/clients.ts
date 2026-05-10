import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

// GET /api/clients - List all clients
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const clients = db.prepare(
    `SELECT id, business_name, industry, city, country, contact_name, contact_email,
            status, payment_status, plan_price_usd, created_at
     FROM clients ORDER BY created_at DESC`
  ).all();
  res.json({ clients });
});

// GET /api/clients/:id - Get client details
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }

  const campaigns = db.prepare(
    'SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  const ads = db.prepare(
    'SELECT * FROM ads WHERE client_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  res.json({ client, campaigns, ads });
});

export default router;
