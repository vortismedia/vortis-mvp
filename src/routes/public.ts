// Public API for clients - accessed via secure access_token (no admin auth needed)
// This is what the client's dashboard at /mi-campana?token=XXX uses
import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../db/database';

const router = Router();

// Middleware: load client by access_token, attach to req.client
async function requireClientToken(req: any, res: Response, next: NextFunction) {
  const token = (req.params.token || req.query.token || req.headers['x-client-token']) as string;
  if (!token || token.length < 16) {
    return res.status(401).json({ error: 'Token de acceso inválido' });
  }
  const db = getDb();
  const client = await db.prepare('SELECT * FROM clients WHERE access_token = ?').get<any>(token);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  req.client = client;
  next();
}

// GET /api/public/me?token=XXX
// Returns ONLY data the client should see — no internal AI/targeting/budget breakdowns
router.get('/me', requireClientToken, async (req: any, res: Response) => {
  const db = getDb();
  const c = req.client;

  const campaign = await db.prepare(
    'SELECT id, status, meta_status, created_at FROM campaigns WHERE client_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get<any>(c.id);

  // Only approved ads (the ones the client can review/see), no validation_notes (internal)
  const ads = await db.prepare(
    `SELECT id, headline, description, cta_text, format, client_approved, client_feedback,
            impressions, clicks, messages, spend_usd
     FROM ads WHERE client_id = ? AND validation_status = 'approved' ORDER BY created_at`
  ).all<any>(c.id);

  // Compute the simple inversion view (no CPM/CPC breakdown)
  let budget = { monthly_usd: c.plan_price_usd || 299, daily_usd: 6.67, duration_days: 30 };
  const totalImpressions = ads.reduce((s, a) => s + (a.impressions || 0), 0);
  const totalClicks = ads.reduce((s, a) => s + (a.clicks || 0), 0);
  const totalMessages = ads.reduce((s, a) => s + (a.messages || 0), 0);
  const totalSpend = ads.reduce((s, a) => s + (a.spend_usd || 0), 0);

  res.json({
    client: {
      business_name: c.business_name,
      contact_name: c.contact_name,
      city: c.city,
      campaign_objective: c.campaign_objective,
      status: c.status,
      payment_status: c.payment_status,
    },
    campaign: campaign ? {
      status: campaign.status,
      meta_status: campaign.meta_status,
      created_at: campaign.created_at,
    } : null,
    ads,
    summary: {
      total_ads: ads.length,
      pending_approval: ads.filter(a => !a.client_approved || a.client_approved === 0).length,
      approved_by_client: ads.filter(a => a.client_approved === 1).length,
      rejected_by_client: ads.filter(a => a.client_approved === -1).length,
    },
    metrics: {
      impressions: totalImpressions,
      clicks: totalClicks,
      messages: totalMessages,
      spend: totalSpend,
    },
    budget,
  });
});

// POST /api/public/approve - client approves an ad
router.post('/approve', requireClientToken, async (req: any, res: Response) => {
  const db = getDb();
  const { adId, feedback } = req.body;
  if (!adId) return res.status(400).json({ error: 'adId requerido' });

  const ad = await db.prepare('SELECT * FROM ads WHERE id = ? AND client_id = ?').get<any>(adId, req.client.id);
  if (!ad) return res.status(404).json({ error: 'Anuncio no encontrado' });

  await db.prepare(
    `UPDATE ads SET client_approved = 1, client_feedback = ?, approved_at = NOW() WHERE id = ?`
  ).run(feedback || null, adId);

  const pendingCount = await db.prepare(
    "SELECT COUNT(*) as cnt FROM ads WHERE client_id = ? AND validation_status = 'approved' AND client_approved = 0"
  ).get<any>(req.client.id);

  if (parseInt(String(pendingCount?.cnt || 0), 10) === 0) {
    await db.prepare(
      "UPDATE clients SET status = 'approved_by_client', updated_at = NOW() WHERE id = ?"
    ).run(req.client.id);
  }

  res.json({ success: true });
});

// POST /api/public/reject - client rejects an ad
router.post('/reject', requireClientToken, async (req: any, res: Response) => {
  const db = getDb();
  const { adId, feedback } = req.body;
  if (!adId) return res.status(400).json({ error: 'adId requerido' });
  if (!feedback) return res.status(400).json({ error: 'feedback requerido al rechazar' });

  const ad = await db.prepare('SELECT * FROM ads WHERE id = ? AND client_id = ?').get<any>(adId, req.client.id);
  if (!ad) return res.status(404).json({ error: 'Anuncio no encontrado' });

  await db.prepare(
    `UPDATE ads SET client_approved = -1, client_feedback = ?, approved_at = NOW() WHERE id = ?`
  ).run(feedback, adId);

  res.json({ success: true });
});

// POST /api/public/approve-all
router.post('/approve-all', requireClientToken, async (req: any, res: Response) => {
  const db = getDb();
  const result = await db.prepare(
    `UPDATE ads SET client_approved = 1, approved_at = NOW()
     WHERE client_id = ? AND validation_status = 'approved' AND client_approved = 0`
  ).run(req.client.id);

  await db.prepare(
    "UPDATE clients SET status = 'approved_by_client', updated_at = NOW() WHERE id = ?"
  ).run(req.client.id);

  res.json({ success: true, approved: result.changes });
});

// POST /api/public/consultant - client chat with AI
router.post('/consultant', requireClientToken, async (req: any, res: Response) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({ error: 'Pregunta inválida' });
    }
    const { consultAgent } = await import('../agents/consultant');
    const response = await consultAgent({ clientId: req.client.id, question: question.trim() });
    res.json({ success: true, ...response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
