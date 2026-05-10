import { runAgent, AgentResult } from './base-agent';

const SYSTEM_PROMPT = `Eres el Agente Segmentador de Vortis Media. Tu trabajo es definir la audiencia ideal para una campaña de Meta Ads basándote en el análisis del negocio.

Debes generar una configuración de targeting lista para usar con la API de Meta Ads.

Reglas:
- La segmentación geográfica debe ser precisa (ciudad + radio)
- Los intereses deben ser IDs válidos de Meta Ads cuando sea posible, o categorías descriptivas
- Definir edad, género, idioma
- Incluir comportamientos relevantes (compradores online, viajeros frecuentes, etc.)
- Para negocios locales, radio de 10-30 km según la ciudad
- Para servicios nacionales, incluir las ciudades principales del país

IMPORTANTE: Responde SOLAMENTE en formato JSON válido.

Formato:
\`\`\`json
{
  "targeting": {
    "geo_locations": {
      "cities": [
        {
          "name": "string",
          "radius": number,
          "radius_unit": "kilometer"
        }
      ],
      "countries": ["string"]
    },
    "age_min": number,
    "age_max": number,
    "genders": [0],
    "locales": [28],
    "interests": [
      {
        "name": "string",
        "description": "string"
      }
    ],
    "behaviors": [
      {
        "name": "string",
        "description": "string"
      }
    ]
  },
  "placement_recommendations": ["FEED", "STORIES", "REELS", "INSTAGRAM_FEED", "INSTAGRAM_STORIES"],
  "audience_size_estimate": "string",
  "notes": "string"
}
\`\`\``;

export async function defineSegmentation(params: {
  clientId: string;
  campaignId: string;
  businessName: string;
  industry: string;
  city: string;
  country: string;
  productService: string;
  analysis: any;
}): Promise<AgentResult> {
  const userMessage = `Define la segmentación de audiencia para esta campaña de Meta Ads:

NEGOCIO:
- Nombre: ${params.businessName}
- Rubro: ${params.industry}
- Ciudad: ${params.city}, ${params.country}
- Producto/Servicio: ${params.productService}

ANÁLISIS PREVIO:
${JSON.stringify(params.analysis, null, 2)}

Define la segmentación óptima.`;

  return runAgent({
    agentName: 'segmenter',
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    clientId: params.clientId,
    campaignId: params.campaignId,
  });
}
