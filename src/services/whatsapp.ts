import dotenv from 'dotenv';
dotenv.config();

const WA_API_VERSION = 'v21.0';

async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  const token = process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    console.log(`[WhatsApp] Not configured. Would send to ${to}: "${message.substring(0, 50)}..."`);
    return false;
  }

  const cleanPhone = to.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');

  try {
    const res = await fetch(
      `https://graph.facebook.com/${WA_API_VERSION}/${phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: { body: message },
        }),
      }
    );

    const data: any = await res.json();
    if (data.error) {
      console.error(`[WhatsApp] API Error:`, data.error.message);
      return false;
    }

    console.log(`[WhatsApp] Sent to ${to}`);
    return true;
  } catch (err: any) {
    console.error(`[WhatsApp] Failed:`, err.message);
    return false;
  }
}

export async function sendWelcomeWhatsApp(client: {
  contact_name: string;
  contact_phone: string;
  business_name: string;
  id: string;
}): Promise<boolean> {
  if (!client.contact_phone) return false;

  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  return sendWhatsAppMessage(
    client.contact_phone,
    `¡Hola ${client.contact_name}! 👋

Soy el asistente de *Vortis Media*. Tu campaña publicitaria para *${client.business_name}* ya fue generada por nuestra IA y está lista para revisión.

📊 Revisá tu campaña acá:
${appUrl}/mi-campana?id=${client.id}

Desde tu panel podés:
✅ Ver los anuncios generados
📈 Consultar métricas en tiempo real
💬 Chatear con nuestro asistente IA

¿Tenés alguna consulta? Respondé este mensaje y te ayudamos.`
  );
}

export async function sendCampaignActiveWhatsApp(client: {
  contact_name: string;
  contact_phone: string;
  business_name: string;
}): Promise<boolean> {
  if (!client.contact_phone) return false;

  return sendWhatsAppMessage(
    client.contact_phone,
    `🚀 *${client.contact_name}*, tu campaña de *${client.business_name}* ya está ACTIVA en Meta Ads.

Los anuncios comenzarán a mostrarse en las próximas horas. Vas a empezar a recibir mensajes de clientes potenciales.

💡 *Tip*: Respondé los mensajes en menos de 1 hora para maximizar conversiones.

Cualquier duda, escribinos por acá.`
  );
}

export async function sendWeeklyReportWhatsApp(client: {
  contact_name: string;
  contact_phone: string;
  business_name: string;
}, metrics: {
  impressions: number;
  clicks: number;
  messages: number;
  spend: number;
}): Promise<boolean> {
  if (!client.contact_phone) return false;

  const ctr = metrics.impressions > 0
    ? ((metrics.clicks / metrics.impressions) * 100).toFixed(1)
    : '0';

  return sendWhatsAppMessage(
    client.contact_phone,
    `📊 *Reporte semanal — ${client.business_name}*

👁 Impresiones: ${metrics.impressions.toLocaleString()}
👆 Clicks: ${metrics.clicks.toLocaleString()} (CTR: ${ctr}%)
💬 Mensajes: ${metrics.messages.toLocaleString()}
💰 Gasto: $${metrics.spend.toFixed(2)} USD

${metrics.messages > 0 ? `Costo por mensaje: $${(metrics.spend / metrics.messages).toFixed(2)} USD` : ''}

¿Querés ajustar algo? Respondé este mensaje.`
  );
}
