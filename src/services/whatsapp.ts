import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const WA_API_VERSION = 'v21.0';

/**
 * Normalize phone to Meta's expected format.
 * Argentina-specific: convert +549XX (WhatsApp format) to +5411 15 XX (Meta's old format).
 */
function normalizePhoneForWhatsApp(phone: string): string {
  let clean = phone.replace(/[\s\-\(\)\+]/g, '');
  if (clean.startsWith('549') && (clean.length === 12 || clean.length === 13)) {
    const rest = clean.substring(3);
    const areaLength = rest.startsWith('11') ? 2 : 3;
    const area = rest.substring(0, areaLength);
    const number = rest.substring(areaLength);
    clean = '54' + area + '15' + number;
  }
  return clean;
}

async function sendWhatsAppTemplate(to: string, templateName: string = 'hello_world', languageCode: string = 'en_US'): Promise<boolean> {
  const token = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) {
    console.log(`[WhatsApp] Not configured. Would send template "${templateName}" to ${to}`);
    return false;
  }
  const cleanPhone = normalizePhoneForWhatsApp(to);
  try {
    const res = await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: { name: templateName, language: { code: languageCode } },
      }),
    });
    const data: any = await res.json();
    if (data.error) {
      console.error(`[WhatsApp] Template error:`, JSON.stringify(data.error));
      return false;
    }
    console.log(`[WhatsApp] Template "${templateName}" sent to ${to}, id=${data.messages?.[0]?.id}`);
    return true;
  } catch (err: any) {
    console.error('[WhatsApp] Exception:', err.message);
    return false;
  }
}

async function sendWhatsAppText(to: string, message: string): Promise<boolean> {
  const token = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) {
    console.log(`[WhatsApp] Not configured. Would send to ${to}: "${message.substring(0, 60)}..."`);
    return false;
  }
  const cleanPhone = normalizePhoneForWhatsApp(to);
  try {
    const res = await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: message },
      }),
    });
    const data: any = await res.json();
    if (data.error) {
      console.error(`[WhatsApp] Text error:`, JSON.stringify(data.error));
      return false;
    }
    console.log(`[WhatsApp] Text sent to ${to}, id=${data.messages?.[0]?.id}`);
    return true;
  } catch (err: any) {
    console.error('[WhatsApp] Exception:', err.message);
    return false;
  }
}

/**
 * Smart send: tries text first (works within 24h window), falls back to template.
 * Test numbers can ONLY send templates, so this auto-falls back.
 */
async function sendWhatsAppSmart(to: string, message: string): Promise<boolean> {
  const ok = await sendWhatsAppText(to, message);
  if (ok) return true;
  // Fallback to template (clients should send "hola" to reopen 24h window first)
  return sendWhatsAppTemplate(to);
}

// ============ Public exports ============
export async function sendWelcomeWhatsApp(client: {
  contact_name: string;
  contact_phone: string;
  business_name: string;
  id: string;
  access_token?: string;
}): Promise<boolean> {
  if (!client.contact_phone) return false;
  const url = `${process.env.APP_URL || 'http://localhost:3000'}/mi-campana?token=${client.access_token || client.id}`;
  const message = `¡Hola ${client.contact_name}! 👋

Tu campaña para *${client.business_name}* ya fue generada por nuestra IA y está lista para que la revises.

📊 Acá podés ver y aprobar tus anuncios:
${url}

Cualquier consulta, respondé este mensaje.`;
  return sendWhatsAppSmart(client.contact_phone, message);
}

export async function sendCampaignActiveWhatsApp(client: {
  contact_name: string;
  contact_phone: string;
  business_name: string;
}): Promise<boolean> {
  if (!client.contact_phone) return false;
  const message = `🚀 *${client.contact_name}*, tu campaña de *${client.business_name}* ya está ACTIVA en Meta Ads.

Los anuncios comenzarán a mostrarse en las próximas horas. Vas a empezar a recibir mensajes de clientes potenciales.

💡 *Tip*: Respondé los mensajes en menos de 1 hora para maximizar conversiones.`;
  return sendWhatsAppSmart(client.contact_phone, message);
}

export async function sendPaymentConfirmedWhatsApp(client: {
  contact_name: string;
  contact_phone: string;
  onboarding_link: string;
}): Promise<boolean> {
  if (!client.contact_phone) return false;
  const message = `¡Hola ${client.contact_name}! 👋

✅ *Pago confirmado*. Bienvenido a *Vortis Media*.

📋 Completá tu onboarding acá para que nuestra IA arme tu campaña:
${client.onboarding_link}

Toma 5-10 minutos. Necesitamos datos del negocio + fotos.

Cualquier duda, respondé este mensaje.`;
  return sendWhatsAppSmart(client.contact_phone, message);
}

export async function sendAdsReadyForApprovalWhatsApp(client: {
  contact_name: string;
  contact_phone: string;
  business_name: string;
  access_token: string;
}): Promise<boolean> {
  if (!client.contact_phone) return false;
  const url = `${process.env.APP_URL || 'http://localhost:3000'}/mi-campana?token=${client.access_token}`;
  const message = `📋 *${client.contact_name}*, tus anuncios para *${client.business_name}* ya están listos para que los revises.

Entrá acá para aprobarlos antes de publicarlos:
${url}

Tomate unos minutos, ¡importa que cada anuncio te represente!`;
  return sendWhatsAppSmart(client.contact_phone, message);
}

export async function sendWeeklyReportWhatsApp(client: {
  contact_name: string;
  contact_phone: string;
  business_name: string;
}, metrics: { impressions: number; clicks: number; messages: number; spend: number }): Promise<boolean> {
  if (!client.contact_phone) return false;
  const ctr = metrics.impressions > 0 ? ((metrics.clicks / metrics.impressions) * 100).toFixed(1) : '0';
  const message = `📊 *Reporte semanal — ${client.business_name}*

👁 Impresiones: ${metrics.impressions.toLocaleString()}
👆 Clicks: ${metrics.clicks.toLocaleString()} (CTR: ${ctr}%)
💬 Mensajes: ${metrics.messages.toLocaleString()}
💰 Gasto: $${metrics.spend.toFixed(2)} USD

${metrics.messages > 0 ? `Costo por mensaje: $${(metrics.spend / metrics.messages).toFixed(2)} USD` : ''}`;
  return sendWhatsAppSmart(client.contact_phone, message);
}
