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
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
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

function clientUrl(idOrToken: string, useToken: boolean): string {
  const base = process.env.APP_URL || 'http://localhost:3000';
  return useToken ? `${base}/mi-campana?token=${idOrToken}` : `${base}/mi-campana?id=${idOrToken}`;
}

// =================== Email Templates ===================

export async function sendCampaignReadyEmail(client: {
  contact_name: string;
  contact_email: string;
  business_name: string;
  id: string;
  access_token?: string;
}): Promise<boolean> {
  const viewUrl = clientUrl(client.access_token || client.id, !!client.access_token);

  return sendEmail(
    client.contact_email,
    `Tu campaña de ${client.business_name} está lista para revisar`,
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e27; color: #e0e0e0; padding: 40px; border-radius: 12px;">
      <h1 style="color: #fff; font-size: 1.5rem; letter-spacing: 2px;">VORTIS MEDIA</h1>
      <hr style="border: none; border-top: 1px solid #1e2345; margin: 16px 0;">
      <p>Hola <strong>${client.contact_name}</strong>,</p>
      <p style="line-height: 1.6;">
        Tu campaña publicitaria para <strong>${client.business_name}</strong> fue generada por nuestra IA
        y revisada por nuestro equipo. Ya está lista para que la revises y apruebes los anuncios.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${viewUrl}" style="display: inline-block; padding: 14px 32px; background: #4f6ef7; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Revisar mi campaña →
        </a>
      </div>
      <p style="font-size: 0.85rem; color: #8b8fa3;">
        Si tenés dudas, respondé a este email.
      </p>
      <hr style="border: none; border-top: 1px solid #1e2345; margin: 24px 0;">
      <p style="font-size: 0.75rem; color: #8b8fa3; text-align: center;">
        Vortis Media - IA Generativa para Campañas Publicitarias
      </p>
    </div>
    `
  );
}

export async function sendAdminReviewNotification(client: {
  business_name: string;
  contact_name: string;
  industry: string;
  id: string;
}): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL || 'vortismedia@gmail.com';
  const adminUrl = `${process.env.APP_URL || 'http://localhost:3000'}/panel#clientes`;

  return sendEmail(
    adminEmail,
    `🤖 IA terminó: ${client.business_name} - listo para tu revisión`,
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e27; color: #e0e0e0; padding: 32px; border-radius: 12px;">
      <h1 style="color: #fff; font-size: 1.3rem; letter-spacing: 2px;">VORTIS MEDIA — ADMIN</h1>
      <hr style="border: none; border-top: 1px solid #1e2345; margin: 16px 0;">
      <p style="font-size: 1rem;">⚙ Nueva campaña lista para tu revisión:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; color: #8b8fa3;">Negocio</td><td style="padding: 8px;"><strong>${client.business_name}</strong></td></tr>
        <tr><td style="padding: 8px; color: #8b8fa3;">Rubro</td><td style="padding: 8px;">${client.industry}</td></tr>
        <tr><td style="padding: 8px; color: #8b8fa3;">Contacto</td><td style="padding: 8px;">${client.contact_name}</td></tr>
        <tr><td style="padding: 8px; color: #8b8fa3;">Client ID</td><td style="padding: 8px; font-family: monospace; font-size: 0.75rem;">${client.id}</td></tr>
      </table>
      <p style="line-height: 1.6; font-size: 0.9rem;">
        Revisá los anuncios generados, la segmentación y el presupuesto.
        Si está OK, hacé click en <strong>"Aprobar y mandar al cliente"</strong>
        para que reciba el email con su link.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${adminUrl}" style="display: inline-block; padding: 14px 32px; background: #4f6ef7; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
          Ir al Panel
        </a>
      </div>
    </div>
    `
  );
}

export async function sendNewClientNotification(client: {
  business_name: string;
  industry: string;
  city: string;
  contact_name: string;
  contact_email: string;
  id: string;
}): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return false;
  const adminUrl = `${process.env.APP_URL || 'http://localhost:3000'}/panel`;

  return sendEmail(
    adminEmail,
    `Nuevo cliente: ${client.business_name}`,
    `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #333;">Nuevo Cliente Registrado</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding:8px;color:#666;border-bottom:1px solid #eee;">Negocio</td><td style="padding:8px;border-bottom:1px solid #eee;"><strong>${client.business_name}</strong></td></tr>
        <tr><td style="padding:8px;color:#666;border-bottom:1px solid #eee;">Rubro</td><td style="padding:8px;border-bottom:1px solid #eee;">${client.industry}</td></tr>
        <tr><td style="padding:8px;color:#666;border-bottom:1px solid #eee;">Ciudad</td><td style="padding:8px;border-bottom:1px solid #eee;">${client.city}</td></tr>
        <tr><td style="padding:8px;color:#666;border-bottom:1px solid #eee;">Contacto</td><td style="padding:8px;border-bottom:1px solid #eee;">${client.contact_name} (${client.contact_email})</td></tr>
      </table>
      <p style="margin-top:12px;">La IA está generando la campaña.</p>
      <a href="${adminUrl}" style="display:inline-block;padding:10px 24px;background:#4f6ef7;color:#fff;text-decoration:none;border-radius:6px;margin-top:12px;">Ver en Panel</a>
    </div>
    `
  );
}

export async function sendCampaignActiveEmail(client: {
  contact_name: string;
  contact_email: string;
  business_name: string;
  id: string;
  access_token?: string;
}): Promise<boolean> {
  const viewUrl = clientUrl(client.access_token || client.id, !!client.access_token);

  return sendEmail(
    client.contact_email,
    `🚀 Tu campaña de ${client.business_name} está ACTIVA`,
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e27; color: #e0e0e0; padding: 40px; border-radius: 12px;">
      <h1 style="color: #fff; font-size: 1.5rem; letter-spacing: 2px;">VORTIS MEDIA</h1>
      <hr style="border: none; border-top: 1px solid #1e2345; margin: 16px 0;">
      <p>Hola <strong>${client.contact_name}</strong>,</p>
      <p style="line-height: 1.6;">
        Tu campaña de <strong>${client.business_name}</strong> ya está
        <span style="color: #4ade80; font-weight: 700;">ACTIVA</span> en Meta Ads.
        Los anuncios comenzarán a mostrarse en las próximas horas.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${viewUrl}" style="display:inline-block;padding:14px 32px;background:#0d9f4f;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
          Ver Métricas
        </a>
      </div>
    </div>
    `
  );
}
