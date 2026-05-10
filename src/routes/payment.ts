import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database';
import { sendCampaignReadyEmail } from '../services/email';
import nodemailer from 'nodemailer';

const router = Router();

/**
 * POST /api/payment/simulate
 * Simula un pago exitoso de un cliente nuevo.
 * Genera un onboarding pendiente y manda WhatsApp + Email con el link.
 *
 * Body: { contact_name, contact_email, contact_phone, business_name?, plan_price_usd? }
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
      return res.status(400).json({
        error: 'contact_name y contact_email son requeridos',
      });
    }

    const db = getDb();
    const clientId = uuid();

    // Create a "pending onboarding" client record
    db.prepare(
      `INSERT INTO clients (
        id, business_name, industry, city, country, product_service,
        campaign_objective, contact_email, contact_phone, contact_name,
        payment_status, plan_price_usd, status
      ) VALUES (?, ?, 'pending', 'pending', 'Argentina', 'Pendiente onboarding',
                'Mensajes por WhatsApp', ?, ?, ?, 'paid', ?, 'paid_pending_onboarding')`
    ).run(
      clientId,
      business_name,
      contact_email,
      contact_phone || '',
      contact_name,
      plan_price_usd
    );

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const onboardingLink = `${appUrl}/?id=${clientId}`;

    // Run email + WhatsApp in parallel with timeouts so one doesn't block the other
    const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
      ]);

    const [emailSent, waSent] = await Promise.all([
      withTimeout(
        sendPaymentConfirmationEmail({
          contact_name,
          contact_email,
          onboarding_link: onboardingLink,
          plan_price_usd,
        }),
        15000,
        false
      ),
      withTimeout(
        sendPaymentConfirmationWhatsApp({
          contact_name,
          contact_phone: contact_phone || '',
          onboarding_link: onboardingLink,
          plan_price_usd,
        }),
        10000,
        false
      ),
    ]);

    res.json({
      success: true,
      clientId,
      onboardingLink,
      notifications: {
        email: emailSent ? 'sent' : 'failed_or_not_configured',
        whatsapp: waSent ? 'sent' : 'failed_or_not_configured',
      },
      message: `Pago simulado para ${contact_name}. Revisa email y WhatsApp.`,
    });
  } catch (err: any) {
    console.error('[Payment Simulate Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ Email confirmation ============
async function sendPaymentConfirmationEmail(params: {
  contact_name: string;
  contact_email: string;
  onboarding_link: string;
  plan_price_usd: number;
}): Promise<boolean> {
  console.log(`[Email] Starting send to ${params.contact_email}`);
  console.log(`[Email] SMTP config: host=${process.env.SMTP_HOST} port=${process.env.SMTP_PORT} user=${process.env.SMTP_USER} pass=${process.env.SMTP_PASS ? '***SET***' : 'EMPTY'}`);
  if (!process.env.SMTP_PASS) {
    console.log(`[Email] SMTP_PASS not configured. Skipping.`);
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
    });

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0e27;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e0e0e0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#fff;font-size:28px;letter-spacing:2px;margin:0;">VORTIS MEDIA</h1>
      <p style="color:#8b8fa3;font-size:14px;margin-top:4px;">IA generativa para campañas publicitarias</p>
    </div>

    <div style="background:#141832;border:1px solid #1e2345;border-radius:14px;padding:32px;">
      <div style="background:#0d3320;border:1px solid #1a5c38;border-radius:10px;padding:14px;margin-bottom:24px;text-align:center;">
        <p style="color:#4ade80;font-weight:600;font-size:16px;margin:0;">✓ Pago confirmado — USD $${params.plan_price_usd}</p>
      </div>

      <h2 style="color:#fff;font-size:22px;margin:0 0 12px;">Hola ${params.contact_name},</h2>
      <p style="color:#b0b4cc;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Gracias por confiar en Vortis Media. Tu pago fue procesado correctamente.
      </p>

      <p style="color:#b0b4cc;font-size:15px;line-height:1.6;margin:0 0 24px;">
        El siguiente paso es completar el <strong style="color:#fff;">onboarding de tu negocio</strong>.
        Esto toma 5-10 minutos y nos da la información que nuestra IA necesita para generar tu campaña personalizada.
      </p>

      <div style="text-align:center;margin:32px 0;">
        <a href="${params.onboarding_link}" style="display:inline-block;padding:16px 36px;background:linear-gradient(135deg,#4f6ef7,#3b5de7);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:16px;">
          Completar mi onboarding →
        </a>
      </div>

      <p style="color:#8b8fa3;font-size:13px;line-height:1.5;margin:24px 0 0;text-align:center;">
        O copiá este link:<br>
        <a href="${params.onboarding_link}" style="color:#4f6ef7;word-break:break-all;">${params.onboarding_link}</a>
      </p>

      <hr style="border:none;border-top:1px solid #1e2345;margin:28px 0;">

      <h3 style="color:#8fa4ff;font-size:15px;margin:0 0 12px;">¿Qué viene después?</h3>
      <ol style="color:#b0b4cc;font-size:14px;line-height:1.7;padding-left:20px;margin:0;">
        <li>Completás el onboarding (datos del negocio + fotos)</li>
        <li>Nuestra IA analiza y genera 5 anuncios personalizados</li>
        <li>Te avisamos por WhatsApp cuando estén listos para revisar</li>
        <li>Aprobás los anuncios y los publicamos en Meta Ads</li>
        <li>Recibís métricas y reportes semanales</li>
      </ol>
    </div>

    <p style="text-align:center;color:#8b8fa3;font-size:12px;margin-top:24px;">
      ¿Dudas? Respondé este email y te ayudamos.<br>
      Vortis Media · IA para campañas publicitarias
    </p>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: params.contact_email,
      subject: '✓ Pago confirmado — Completá tu onboarding en Vortis Media',
      html,
    });

    console.log(`[Email] Sent payment confirmation to ${params.contact_email}`);
    return true;
  } catch (err: any) {
    console.error('[Email] FULL ERROR:', err.message, err.code, err.command);
    return false;
  }
}

// ============ WhatsApp confirmation ============
async function sendPaymentConfirmationWhatsApp(params: {
  contact_name: string;
  contact_phone: string;
  onboarding_link: string;
  plan_price_usd: number;
}): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN || process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    console.log(`[WhatsApp] Not configured`);
    return false;
  }

  const cleanPhone = params.contact_phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');

  // Use template (required for test numbers, also more reliable for production)
  // If custom Vortis template doesn't exist yet, fallback to hello_world
  const customTemplate = process.env.WHATSAPP_TEMPLATE_NAME;

  const body = customTemplate
    ? {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: {
          name: customTemplate,
          language: { code: 'es_AR' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: params.contact_name },
              { type: 'text', text: String(params.plan_price_usd) },
              { type: 'text', text: params.onboarding_link },
            ],
          }],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: {
          name: 'hello_world',
          language: { code: 'en_US' },
        },
      };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data: any = await res.json();
    if (data.error) {
      console.error(`[WhatsApp] Error:`, JSON.stringify(data.error));
      return false;
    }

    console.log(`[WhatsApp] Sent to ${params.contact_phone}, msg id: ${data.messages?.[0]?.id}`);
    return true;
  } catch (err: any) {
    console.error('[WhatsApp] Exception:', err.message);
    return false;
  }
}

export default router;
