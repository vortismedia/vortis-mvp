import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const FROM_NAME = 'Vortis Media';
const RESEND_FROM = process.env.RESEND_FROM || `${FROM_NAME} <onboarding@resend.dev>`;

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[Email] No RESEND_API_KEY. Would send to ${to}: "${subject}"`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
    });
    const data: any = await res.json();
    if (data.id) {
      console.log(`[Email] Sent to ${to}: "${subject}" (id=${data.id})`);
      return true;
    }
    console.error(`[Email] Error:`, JSON.stringify(data));
    return false;
  } catch (err: any) {
    console.error(`[Email] Exception:`, err.message);
    return false;
  }
}

function clientUrl(token: string): string {
  return `${process.env.APP_URL || 'http://localhost:3000'}/mi-campana?token=${token}`;
}

function adminPanelUrl(): string {
  return `${process.env.APP_URL || 'http://localhost:3000'}/panel#clientes`;
}

// =================== CLIENT EMAILS (only 2) ===================

/**
 * (CLIENTE) Pago confirmado - con link al onboarding.
 * Es el ÚNICO email al cliente al principio del flujo.
 */
export async function sendPaymentConfirmedToClient(params: {
  contact_name: string;
  contact_email: string;
  onboarding_link: string;
  plan_price_usd: number;
}): Promise<boolean> {
  return sendEmail(
    params.contact_email,
    `(CLIENTE) ✓ Pago confirmado — Completá tu onboarding en Vortis Media`,
    `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0a0e27;color:#e0e0e0;padding:40px 20px;">
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="color:#fff;font-size:28px;letter-spacing:2px;margin:0;">VORTIS MEDIA</h1>
        <p style="color:#8b8fa3;font-size:14px;margin-top:4px;">IA generativa para campañas publicitarias</p>
      </div>
      <div style="background:#141832;border:1px solid #1e2345;border-radius:14px;padding:32px;">
        <div style="background:#0d3320;border:1px solid #1a5c38;border-radius:10px;padding:14px;margin-bottom:24px;text-align:center;">
          <p style="color:#4ade80;font-weight:600;font-size:16px;margin:0;">✓ Pago confirmado — USD $${params.plan_price_usd}</p>
        </div>
        <h2 style="color:#fff;font-size:22px;margin:0 0 12px;">Hola ${params.contact_name},</h2>
        <p style="color:#b0b4cc;font-size:15px;line-height:1.6;margin:0 0 24px;">
          Gracias por confiar en Vortis Media. El siguiente paso es completar el <strong style="color:#fff;">onboarding de tu negocio</strong>. Toma 5-10 minutos.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${params.onboarding_link}" style="display:inline-block;padding:16px 36px;background:linear-gradient(135deg,#4f6ef7,#3b5de7);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:16px;">Completar mi onboarding →</a>
        </div>
        <p style="color:#8b8fa3;font-size:13px;line-height:1.5;text-align:center;margin-top:24px;">
          También te vamos a avisar el próximo paso por WhatsApp.
        </p>
      </div>
    </div>
    `
  );
}

/**
 * (CLIENTE) Campaña activa - cuando se activa en Meta Ads.
 * Es el SEGUNDO y último email al cliente.
 */
export async function sendCampaignActiveToClient(client: {
  contact_name: string;
  contact_email: string;
  business_name: string;
  access_token: string;
}): Promise<boolean> {
  const viewUrl = clientUrl(client.access_token);
  return sendEmail(
    client.contact_email,
    `(CLIENTE) 🚀 Tu campaña de ${client.business_name} está ACTIVA`,
    `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0a0e27;color:#e0e0e0;padding:40px 20px;">
      <h1 style="color:#fff;font-size:24px;letter-spacing:2px;text-align:center;">VORTIS MEDIA</h1>
      <div style="background:#141832;border:1px solid #1e2345;border-radius:14px;padding:32px;">
        <p style="color:#b0b4cc;font-size:15px;">Hola <strong style="color:#fff;">${client.contact_name}</strong>,</p>
        <p style="color:#b0b4cc;font-size:15px;line-height:1.6;">
          Tu campaña de <strong style="color:#fff;">${client.business_name}</strong> ya está
          <span style="color:#4ade80;font-weight:700;">ACTIVA</span> en Meta Ads.
          Los anuncios comenzarán a mostrarse en las próximas horas.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${viewUrl}" style="display:inline-block;padding:14px 32px;background:#0d9f4f;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Ver Métricas en Vivo</a>
        </div>
        <p style="color:#facc15;font-size:13px;margin-top:24px;text-align:center;">
          💡 Tip: Respondé los mensajes de WhatsApp en menos de 1 hora para maximizar conversiones.
        </p>
      </div>
    </div>
    `
  );
}

// =================== ADMIN EMAILS (3) ===================

/**
 * (VORTIS) Cliente pagó - notificación al admin cuando un cliente paga.
 */
export async function sendClientPaidToAdmin(client: {
  business_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  plan_price_usd: number;
  id: string;
}): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return false;

  return sendEmail(
    adminEmail,
    `(VORTIS) 💳 Cliente nuevo pagó: ${client.business_name}`,
    `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0a0e27;color:#e0e0e0;padding:32px 20px;">
      <h2 style="color:#fff;">💳 Cliente nuevo pagó USD $${client.plan_price_usd}</h2>
      <div style="background:#141832;border:1px solid #1e2345;border-radius:12px;padding:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;color:#8b8fa3;">Negocio</td><td style="padding:8px;"><strong>${client.business_name}</strong></td></tr>
          <tr><td style="padding:8px;color:#8b8fa3;">Contacto</td><td style="padding:8px;">${client.contact_name}</td></tr>
          <tr><td style="padding:8px;color:#8b8fa3;">Email</td><td style="padding:8px;">${client.contact_email}</td></tr>
          <tr><td style="padding:8px;color:#8b8fa3;">WhatsApp</td><td style="padding:8px;">${client.contact_phone}</td></tr>
          <tr><td style="padding:8px;color:#8b8fa3;">Client ID</td><td style="padding:8px;font-family:monospace;font-size:0.75rem;">${client.id}</td></tr>
        </table>
        <p style="color:#b0b4cc;font-size:14px;margin-top:16px;">
          Le mandamos automáticamente el link de onboarding por email + WhatsApp. Esperamos que lo complete.
        </p>
      </div>
    </div>
    `
  );
}

/**
 * (VORTIS) IA terminó - notificación al admin para revisar.
 */
export async function sendAdminReviewNotification(client: {
  business_name: string;
  contact_name: string;
  industry: string;
  id: string;
}): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL || 'vortismedia@gmail.com';
  return sendEmail(
    adminEmail,
    `(VORTIS) 🤖 IA terminó: ${client.business_name} - revisá y aprobá`,
    `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0a0e27;color:#e0e0e0;padding:32px 20px;">
      <h2 style="color:#fff;">🤖 IA terminó campaña — listo para tu revisión</h2>
      <div style="background:#141832;border:1px solid #1e2345;border-radius:12px;padding:20px;">
        <table style="width:100%;">
          <tr><td style="padding:8px;color:#8b8fa3;">Negocio</td><td style="padding:8px;"><strong>${client.business_name}</strong></td></tr>
          <tr><td style="padding:8px;color:#8b8fa3;">Rubro</td><td style="padding:8px;">${client.industry}</td></tr>
          <tr><td style="padding:8px;color:#8b8fa3;">Contacto</td><td style="padding:8px;">${client.contact_name}</td></tr>
        </table>
        <p style="color:#b0b4cc;font-size:14px;margin:16px 0;">
          Revisá los 5 anuncios generados, la segmentación y el presupuesto.
          Si está OK, click <strong>"✓ Aprobar y notificar al cliente"</strong> para que le llegue el WhatsApp para aprobar.
        </p>
        <div style="text-align:center;margin:20px 0;">
          <a href="${adminPanelUrl()}" style="display:inline-block;padding:14px 32px;background:#4f6ef7;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Ir al Panel</a>
        </div>
      </div>
    </div>
    `
  );
}

/**
 * (VORTIS) Campaña activa - notificación al admin cuando una campaña se activa en Meta.
 */
export async function sendCampaignActiveToAdmin(client: {
  business_name: string;
  contact_name: string;
  id: string;
}): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return false;
  return sendEmail(
    adminEmail,
    `(VORTIS) 🚀 Campaña ACTIVA en Meta: ${client.business_name}`,
    `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0a0e27;color:#e0e0e0;padding:32px 20px;">
      <h2 style="color:#fff;">🚀 Campaña activada en Meta Ads</h2>
      <div style="background:#141832;border:1px solid #1e2345;border-radius:12px;padding:20px;">
        <p style="color:#b0b4cc;">
          <strong style="color:#fff;">${client.business_name}</strong> (${client.contact_name}) ya está corriendo en Meta.
        </p>
        <p style="color:#b0b4cc;font-size:14px;margin-top:12px;">
          Acordate de revisar las métricas mañana para confirmar que está optimizando bien.
        </p>
        <div style="text-align:center;margin:20px 0;">
          <a href="${adminPanelUrl()}" style="display:inline-block;padding:12px 28px;background:#0d9f4f;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Ver Panel</a>
        </div>
      </div>
    </div>
    `
  );
}

// =================== Backwards compat (deprecated, kept so old imports don't break) ===================

export const sendCampaignReadyEmail = async (..._args: any[]) => false; // No-op: replaced by WhatsApp
export const sendCampaignActiveEmail = sendCampaignActiveToClient;
export const sendNewClientNotification = sendClientPaidToAdmin;
