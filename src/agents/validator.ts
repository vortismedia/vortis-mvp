import { runAgent, AgentResult } from './base-agent';

const SYSTEM_PROMPT = `Eres el Agente Validador de Vortis Media. Tu trabajo es revisar que los textos de anuncios cumplan con las políticas de publicidad de Meta (Facebook/Instagram).

Políticas clave de Meta Ads que debes verificar:
1. NO promesas de ingresos, ROI, o resultados financieros específicos
2. NO discriminación por raza, etnia, religión, orientación sexual, discapacidad
3. NO claims médicos sin evidencia (antes/después prohibido en salud)
4. NO contenido engañoso o misleading
5. NO uso excesivo de mayúsculas (máximo 1 palabra en caps por oración)
6. NO emojis excesivos (máximo 3 por anuncio)
7. NO lenguaje agresivo o de presión extrema
8. NO mencionar atributos personales directamente ("¿Estás gordo?" → prohibido)
9. Los CTAs deben ser claros y honestos
10. Las landing pages deben coincidir con lo prometido en el anuncio

Para cada anuncio, indica:
- APROBADO: cumple con todas las políticas
- AJUSTADO: requirió cambios menores (incluir versión corregida)
- RECHAZADO: viola políticas graves (explicar por qué)

IMPORTANTE: Responde SOLAMENTE en formato JSON válido.

Formato:
\`\`\`json
{
  "validations": [
    {
      "variant": 1,
      "status": "APROBADO|AJUSTADO|RECHAZADO",
      "issues": ["string"],
      "corrected_headline": "string (solo si AJUSTADO)",
      "corrected_body": "string (solo si AJUSTADO)",
      "corrected_description": "string (solo si AJUSTADO)",
      "notes": "string"
    }
  ],
  "overall_compliance": "PASS|PARTIAL|FAIL",
  "recommendations": "string"
}
\`\`\``;

export async function validateAds(params: {
  clientId: string;
  campaignId: string;
  ads: Array<{
    variant: number;
    headline: string;
    body: string;
    description: string;
    cta_text: string;
  }>;
  industry: string;
  prohibitedWords: string;
}): Promise<AgentResult> {
  const userMessage = `Valida estos anuncios contra las políticas de Meta Ads:

RUBRO DEL NEGOCIO: ${params.industry}
PALABRAS PROHIBIDAS DEL NEGOCIO: ${params.prohibitedWords || 'ninguna'}

ANUNCIOS A VALIDAR:
${params.ads
  .map(
    (ad) => `
--- Variante ${ad.variant} ---
Headline: ${ad.headline}
Body: ${ad.body}
Description: ${ad.description}
CTA: ${ad.cta_text}
`
  )
  .join('\n')}

Valida cada anuncio y corrige los que necesiten ajustes.`;

  return runAgent({
    agentName: 'validator',
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    clientId: params.clientId,
    campaignId: params.campaignId,
    tier: 'haiku', // Simple yes/no policy check
    maxTokens: 4096, // Needs space for 15 validations
  });
}
