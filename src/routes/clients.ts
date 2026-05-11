import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { sendCampaignReadyEmail } from '../services/email';
import { requireAuth } from './auth';

const router = Router();

// All client management routes require admin login
router.use(requireAuth);

// GET /api/clients - List all clients
router.get('/', async (_req: Request, res: Response) => {
  const db = getDb();
  const clients = await db.prepare(
    `SELECT id, access_token, business_name, industry, city, country, contact_name, contact_email,
            status, payment_status, plan_price_usd, admin_reviewed, created_at
     FROM clients ORDER BY created_at DESC`
  ).all();
  res.json({ clients });
});

// GET /api/clients/:id - Get client details
router.get('/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) {
    res.status(404).json({ error: 'Cliente no encontrado' });
    return;
  }

  const campaigns = await db.prepare(
    'SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  const ads = await db.prepare(
    'SELECT * FROM ads WHERE client_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  res.json({ client, campaigns, ads });
});

// POST /api/clients/:id/notify-ready - Resend the "campaign ready" email
router.post('/:id/notify-ready', async (req: Request, res: Response) => {
  const db = getDb();
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) as any;
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const sent = await sendCampaignReadyEmail({
    contact_name: client.contact_name,
    contact_email: client.contact_email,
    business_name: client.business_name,
    id: client.id,
    access_token: client.access_token,
  });

  res.json({ success: sent, email: client.contact_email });
});

// POST /api/clients/:id/admin-approve - Admin reviewed the AI output, OK to notify client
router.post('/:id/admin-approve', async (req: Request, res: Response) => {
  const db = getDb();
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) as any;
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  await db.prepare(
    "UPDATE clients SET admin_reviewed = 1, admin_reviewed_at = NOW(), status = 'campaign_ready' WHERE id = ?"
  ).run(req.params.id);

  const sent = await sendCampaignReadyEmail({
    contact_name: client.contact_name,
    contact_email: client.contact_email,
    business_name: client.business_name,
    id: client.id,
    access_token: client.access_token,
  });

  res.json({ success: true, emailSent: sent });
});

export default router;
