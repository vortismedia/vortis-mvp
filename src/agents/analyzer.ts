import { runAgent, AgentResult } from './base-agent';
import { getDb } from '../db/database';

const SYSTEM_PROMPT = `Eres el Agente Analizador de Vortis Media. Tu trabajo es analizar la información de un negocio y clasificarlo para que los otros agentes puedan generar la mejor campaña posible.

Tu análisis debe incluir:
1. Tipo de negocio (categoría principal)
2. Ticket promedio del producto/servicio (bajo <$100, medio $100-2000, alto >$2000)
3. Tipo de cliente ideal (edad, género, intereses, comportamiento)
4. Competencia estimada en el mercado digital (baja, media, alta)
5. Mejor objetivo de campaña en Meta Ads (mensajes, tráfico, leads, reconocimiento)
6. Horarios recomendados para mostrar anuncios
7. Puntos de dolor del cliente potencial que el anuncio debe resolver

IMPORTANTE: Responde SOLAMENTE en formato JSON válido, sin texto adicional fuera del JSON.

Formato de respuesta:
\`\`\`json
{
  "business_type": "string",
  "industry_category": "string",
  "ticket_level": "bajo|medio|alto",
  "ticket_estimate_usd": number,
  "ideal_customer": {
    "age_min": number,
    "age_max": number,
    "gender": "all|male|female",
    "interests": ["string"],
    "behaviors": ["string"]
  },
  "market_competition": "baja|media|alta",
  "recommended_objective": "MESSAGES|TRAFFIC|LEAD_GENERATION|BRAND_AWARENESS",
  "best_hours": "string",
  "pain_points": ["string"],
  "key_selling_points": ["string"],
  "notes": "string"
}
\`\`\``;

function getRelevantKnowledge(industry: string): string {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT content FROM knowledge_base
       WHERE industry = ? OR industry = 'general'
       ORDER BY category`
    )
    .all(industry) as { content: string }[];
  if (rows.length === 0) return '';
  return '\n\nBase de conocimiento relevante:\n' + rows.map((r) => `- ${r.content}`).join('\n');
}

export async function analyzeClient(clientData: {
  id: string;
  business_name: string;
  industry: string;
  city: string;
  country: string;
  product_service: string;
  differentiators: string;
  price_range: string;
  campaign_objective: string;
  brand_tone: string;
}): Promise<AgentResult> {
  const knowledge = getRelevantKnowledge(clientData.industry);

  const userMessage = `Analiza este negocio para crear una campaña de Meta Ads:

Nombre: ${clientData.business_name}
Rubro: ${clientData.industry}
Ciudad: ${clientData.city}, ${clientData.country}
Producto/Servicio: ${clientData.product_service}
Diferenciadores: ${clientData.differentiators}
Rango de precios: ${clientData.price_range}
Objetivo de campaña: ${clientData.campaign_objective}
Tono de marca: ${clientData.brand_tone}
${knowledge}`;

  return runAgent({
    agentName: 'analyzer',
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    clientId: clientData.id,
  });
}
