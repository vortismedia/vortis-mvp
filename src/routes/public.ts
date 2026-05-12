// Public API for clients - accessed via secure access_token (no admin auth needed)
// This is what the client's dashboard at /mi-campana?token=XXX uses
import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { getDb } from '../db/database';
import { sendPaymentConfirmedToClient, sendClientPaidToAdmin } from '../services/email';
import { sendPaymentConfirmedWhatsApp } from '../services/whatsapp';

const router = Router();

/**
 * POST /api/public/fake-checkout
 * Public endpoint: anyone with the checkout URL can simulate a payment.
 * Creates the client + sends email/WhatsApp/admin notifications.
 * Same flow as admin's /api/payment/simulate but accessible without admin login.
 */
router.post('/fake-checkout', async (req: Request, res: Response) => {
  try {
    const { contact_name, contact_email, contact_phone, business_name } = req.body;
    if (!contact_name || !contact_email || !contact_phone || !business_name) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const db = getDb();
    const clientId = uuid();
    const accessToken = crypto.randomBytes(32).toString('base64url');

    await db.prepare(
      `INSERT INTO clients (
        id, access_token, business_name, industry, city, country, product_service,
        campaign_objective, contact_email, contact_phone, contact_name,
        payment_status, plan_price_usd, status
      ) VALUES (?, ?, ?, 'pending', 'pending', 'Argentina', 'Pendiente onboarding',
                'Mensajes por WhatsApp', ?, ?, ?, 'paid', 299, 'paid_pending_onboarding')`
    ).run(
      clientId, accessToken, business_name,
      contact_email, contact_phone, contact_name
    );

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const onboardingLink = `${appUrl}/?cid=${clientId}&token=${accessToken}`;

    const withTimeout = <T,>(p: Promise<T>, ms: number, fb: T): Promise<T> =>
      Promise.race([p, new Promise<T>(r => setTimeout(() => r(fb), ms))]);

    await Promise.all([
      withTimeout(sendPaymentConfirmedToClient({ contact_name, contact_email, onboarding_link: onboardingLink, plan_price_usd: 299 }), 15000, false),
      withTimeout(sendPaymentConfirmedWhatsApp({ contact_name, contact_phone, onboarding_link: onboardingLink }), 10000, false),
      withTimeout(sendClientPaidToAdmin({ business_name, contact_name, contact_email, contact_phone, plan_price_usd: 299, id: clientId }), 15000, false),
    ]);

    res.json({ success: true });
  } catch (err: any) {
    console.error('[FakeCheckout Error]', err);
    res.status(500).json({ error: err.message });
  }
});

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
            funnel_stage, angle, creative_url,
            impressions, clicks, messages, spend_usd
     FROM ads WHERE client_id = ? AND validation_status = 'approved'
     ORDER BY CASE funnel_stage WHEN 'TOFU' THEN 1 WHEN 'MOFU' THEN 2 WHEN 'BOFU' THEN 3 ELSE 4 END, created_at`
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
    await autoDeployAndActivate(req.client.id);
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

  await autoDeployAndActivate(req.client.id);

  res.json({ success: true, approved: result.changes });
});

// Auto-deploy + auto-activate flow (runs in background after client approves all ads)
async function autoDeployAndActivate(clientId: string): Promise<void> {
  const db = getDb();

  // Set status and prevent double-trigger via deploy_lock
  const lock = await db.prepare(
    "UPDATE clients SET status = 'deploying', updated_at = NOW() WHERE id = ? AND status NOT IN ('deployed','active','deploying') RETURNING id"
  ).all(clientId);
  if (lock.length === 0) return; // Already deploying or done

  // Fire-and-forget background deploy + activate
  (async () => {
    try {
      const campaign = await db.prepare(
        "SELECT id, meta_campaign_id FROM campaigns WHERE client_id = ? ORDER BY created_at DESC LIMIT 1"
      ).get<any>(clientId);
      if (!campaign) throw new Error('No campaign found');

      // Only deploy if not already deployed
      if (!campaign.meta_campaign_id) {
        const { deployToMeta } = await import('../services/meta-deployer');
        await deployToMeta(campaign.id);
      }

      // Re-read meta_campaign_id (just set by deploy)
      const c2 = await db.prepare("SELECT meta_campaign_id FROM campaigns WHERE id = ?").get<any>(campaign.id);
      if (!c2?.meta_campaign_id) throw new Error('Deploy did not set meta_campaign_id');

      // Activate
      const { updateCampaignStatus } = await import('../services/meta-ads');
      await updateCampaignStatus(c2.meta_campaign_id, 'ACTIVE');

      await db.prepare(
        "UPDATE campaigns SET meta_status = 'ACTIVE', updated_at = NOW() WHERE id = ?"
      ).run(campaign.id);
      await db.prepare(
        "UPDATE clients SET status = 'active', updated_at = NOW() WHERE id = ?"
      ).run(clientId);

      // Notify client + admin
      const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get<any>(clientId);
      const { sendCampaignActiveToClient, sendCampaignActiveToAdmin } = await import('../services/email');
      const { sendCampaignActiveWhatsApp } = await import('../services/whatsapp');

      sendCampaignActiveToClient({
        contact_name: client.contact_name,
        contact_email: client.contact_email,
        business_name: client.business_name,
        access_token: client.access_token,
      }).catch(() => {});
      sendCampaignActiveToAdmin({
        business_name: client.business_name,
        contact_name: client.contact_name,
        id: client.id,
      }).catch(() => {});
      sendCampaignActiveWhatsApp({
        contact_name: client.contact_name,
        contact_phone: client.contact_phone || '',
        business_name: client.business_name,
      }).catch(() => {});

      console.log(`[AutoDeploy] DONE for ${client.business_name}`);
    } catch (err: any) {
      console.error('[AutoDeploy] FAILED:', err.message);
      await db.prepare(
        "UPDATE clients SET status = 'error', updated_at = NOW() WHERE id = ?"
      ).run(clientId);
    }
  })();
}

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
