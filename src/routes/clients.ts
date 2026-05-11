import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { sendCampaignReadyEmail } from '../services/email';

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

// POST /api/clients/:id/notify-ready - Resend the "campaign ready" email
router.post('/:id/notify-ready', async (req: Request, res: Response) => {
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) as any;
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const sent = await sendCampaignReadyEmail({
    contact_name: client.contact_name,
    contact_email: client.contact_email,
    business_name: client.business_name,
    id: client.id,
  });

  res.json({ success: sent, email: client.contact_email });
});

export default router;
