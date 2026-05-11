import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { getDb } from '../db/database';
import { sendPaymentConfirmedToClient, sendClientPaidToAdmin } from '../services/email';
import { sendPaymentConfirmedWhatsApp } from '../services/whatsapp';
import { requireAuth } from './auth';

function generateAccessToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

const router = Router();
router.use(requireAuth);

/**
 * POST /api/payment/simulate
 * Admin marks a new client as paid. Sends:
 * - CLIENT email: pago confirmado + link al onboarding
 * - CLIENT WhatsApp: pago confirmado + link al onboarding
 * - ADMIN email: notificación de cliente pagó
 */
router.post('/simulate', async (req: Request, res: Response) => {
  try {
    const {
      contact_name,
      contact_email,
      contact_phone,
      business_name = 'Negocio (pendiente onboarding)',
      plan_price_usd = 299,
    } = req.body;

    if (!contact_name || !contact_email) {
      return res.status(400).json({ error: 'contact_name y contact_email son requeridos' });
    }

    const db = getDb();
    const clientId = uuid();
    const accessToken = generateAccessToken();

    await db.prepare(
      `INSERT INTO clients (
        id, access_token, business_name, industry, city, country, product_service,
        campaign_objective, contact_email, contact_phone, contact_name,
        payment_status, plan_price_usd, status
      ) VALUES (?, ?, ?, 'pending', 'pending', 'Argentina', 'Pendiente onboarding',
                'Mensajes por WhatsApp', ?, ?, ?, 'paid', ?, 'paid_pending_onboarding')`
    ).run(
      clientId, accessToken, business_name,
      contact_email, contact_phone || '', contact_name, plan_price_usd
    );

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const onboardingLink = `${appUrl}/?cid=${clientId}&token=${accessToken}`;

    // Run notifications in parallel with timeouts
    const withTimeout = <T,>(p: Promise<T>, ms: number, fb: T): Promise<T> =>
      Promise.race([p, new Promise<T>(r => setTimeout(() => r(fb), ms))]);

    const [clientEmail, clientWa, adminEmail] = await Promise.all([
      withTimeout(
        sendPaymentConfirmedToClient({ contact_name, contact_email, onboarding_link: onboardingLink, plan_price_usd }),
        15000, false
      ),
      withTimeout(
        sendPaymentConfirmedWhatsApp({ contact_name, contact_phone: contact_phone || '', onboarding_link: onboardingLink }),
        10000, false
      ),
      withTimeout(
        sendClientPaidToAdmin({ business_name, contact_name, contact_email, contact_phone: contact_phone || '', plan_price_usd, id: clientId }),
        15000, false
      ),
    ]);

    res.json({
      success: true,
      clientId,
      accessToken,
      onboardingLink,
      notifications: {
        client_email: clientEmail ? 'sent' : 'failed',
        client_whatsapp: clientWa ? 'sent' : 'failed',
        admin_email: adminEmail ? 'sent' : 'failed',
      },
    });
  } catch (err: any) {
    console.error('[Payment Simulate Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
