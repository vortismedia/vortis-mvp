import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const FROM_NAME = 'Vortis Media';
const FROM_EMAIL = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@vortismedia.com';

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  // Prefer Resend (works on Railway, no SMTP issues)
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || `${FROM_NAME} <onboarding@resend.dev>`,
          to: [to],
          subject,
          html,
        }),
      });
      const data: any = await res.json();
      if (data.id) {
        console.log(`[Resend] Sent to ${to}: "${subject}" (id=${data.id})`);
        return true;
      }
      console.error(`[Resend] Error for ${to}:`, JSON.stringify(data));
      return false;
    } catch (err: any) {
      console.error(`[Resend] Exception:`, err.message);
      return false;
    }
  }

  // Fallback to SMTP
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Email] Neither Resend nor SMTP configured. Would send to ${to}: "${subject}"`);
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });
    console.log(`[Email/SMTP] Sent to ${to}: "${subject}"`);
    return true;
  } catch (err: any) {
    console.error(`[Email/SMTP] Failed to send to ${to}:`, err.message);
    return false;
  }
}

export async function sendCampaignReadyEmail(client: {
  contact_name: string;
  contact_email: string;
  business_name: string;
  id: string;
}): Promise<boolean> {
  const viewUrl = `${process.env.APP_URL || 'http://localhost:3000'}/mi-campana?id=${client.id}`;

  return sendEmail(
    client.contact_email,
    `Tu campaña de ${client.business_name} está lista - Vortis Media`,
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e27; color: #e0e0e0; padding: 40px; border-radius: 12px;">
      <h1 style="color: #fff; font-size: 1.5rem; margin-bottom: 8px;">VORTIS MEDIA</h1>
      <hr style="border: none; border-top: 1px solid #1e2345; margin: 16px 0;">

      <p style="font-size: 1rem;">Hola <strong>${client.contact_name}</strong>,</p>

      <p style="font-size: 0.95rem; line-height: 1.6;">
        Nuestra IA terminó de generar la campaña publicitaria para <strong>${client.business_name}</strong>.
        Ya podés revisar los anuncios, la segmentación y el presupuesto recomendado.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${viewUrl}" style="display: inline-block; padding: 14px 32px; background: #4f6ef7; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 1rem;">
          Ver Mi Campaña
        </a>
      </div>

      <p style="font-size: 0.85rem; color: #8b8fa3;">
        Si tenés alguna consulta, respondé directamente a este email.
      </p>

      <hr style="border: none; border-top: 1px solid #1e2345; margin: 24px 0;">
      <p style="font-size: 0.75rem; color: #8b8fa3; text-align: center;">
        Vortis Media - IA Generativa para Campañas Publicitarias
      </p>
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
  if (!adminEmail) {
    console.log('[Email] ADMIN_EMAIL not configured, skipping admin notification');
    return false;
  }

  const adminUrl = `${process.env.APP_URL || 'http://localhost:3000'}/admin`;

  return sendEmail(
    adminEmail,
    `Nuevo cliente: ${client.business_name} - Vortis Media`,
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #333;">Nuevo Cliente Registrado</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; color: #666; border-bottom: 1px solid #eee;">Negocio</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${client.business_name}</strong></td></tr>
        <tr><td style="padding: 8px; color: #666; border-bottom: 1px solid #eee;">Rubro</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${client.industry}</td></tr>
        <tr><td style="padding: 8px; color: #666; border-bottom: 1px solid #eee;">Ciudad</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${client.city}</td></tr>
        <tr><td style="padding: 8px; color: #666; border-bottom: 1px solid #eee;">Contacto</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${client.contact_name} (${client.contact_email})</td></tr>
        <tr><td style="padding: 8px; color: #666;">ID</td><td style="padding: 8px;">${client.id}</td></tr>
      </table>
      <p>La generación con IA ya comenzó automáticamente.</p>
      <a href="${adminUrl}" style="display: inline-block; padding: 10px 24px; background: #4f6ef7; color: #fff; text-decoration: none; border-radius: 6px; margin-top: 12px;">Ver en Admin</a>
    </div>
    `
  );
}

export async function sendCampaignActiveEmail(client: {
  contact_name: string;
  contact_email: string;
  business_name: string;
  id: string;
}): Promise<boolean> {
  const viewUrl = `${process.env.APP_URL || 'http://localhost:3000'}/mi-campana?id=${client.id}`;

  return sendEmail(
    client.contact_email,
    `Tu campaña de ${client.business_name} está ACTIVA - Vortis Media`,
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e27; color: #e0e0e0; padding: 40px; border-radius: 12px;">
      <h1 style="color: #fff; font-size: 1.5rem; margin-bottom: 8px;">VORTIS MEDIA</h1>
      <hr style="border: none; border-top: 1px solid #1e2345; margin: 16px 0;">

      <p style="font-size: 1rem;">Hola <strong>${client.contact_name}</strong>,</p>

      <p style="font-size: 0.95rem; line-height: 1.6;">
        Tu campaña de <strong>${client.business_name}</strong> ya está <span style="color: #4ade80; font-weight: 700;">ACTIVA</span> en Meta Ads.
        Los anuncios comenzarán a mostrarse en las próximas horas.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${viewUrl}" style="display: inline-block; padding: 14px 32px; background: #0d9f4f; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 1rem;">
          Ver Métricas
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #1e2345; margin: 24px 0;">
      <p style="font-size: 0.75rem; color: #8b8fa3; text-align: center;">
        Vortis Media - IA Generativa para Campañas Publicitarias
      </p>
    </div>
    `
  );
}
