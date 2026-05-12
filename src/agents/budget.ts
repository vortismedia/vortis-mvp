import { runAgent, AgentResult } from './base-agent';

const SYSTEM_PROMPT = `Eres el Agente de Presupuesto de Vortis Media. Tu trabajo es recomendar la configuración de presupuesto óptima para una campaña de Meta Ads.

El cliente paga $299 USD/mes total a Vortis. De eso, $200 USD van a ad spend en Meta y $99 USD es el fee de Vortis.

Reglas:
- Presupuesto total de ads: $200 USD/mes = ~$6.67 USD/día
- Recomendar duración de campaña (normalmente 30 días)
- Definir tipo de presupuesto (diario vs. lifetime)
- Recomendar bid strategy según el objetivo
- Incluir schedule (horarios de publicación) basado en el análisis
- Considerar los CPM del país del cliente para estimar resultados

Benchmarks de CPM por país:
- Argentina: ~$1 USD (200k impresiones/mes con $200)
- Colombia: ~$1.50 USD (133k impresiones/mes)
- México: ~$4 USD (50k impresiones/mes)
- USA Latinos: ~$8 USD (25k impresiones/mes)

IMPORTANTE: Responde SOLAMENTE en formato JSON válido.

Formato:
\`\`\`json
{
  "budget": {
    "daily_budget_usd": number,
    "monthly_budget_usd": 200,
    "campaign_duration_days": 30,
    "budget_type": "DAILY|LIFETIME",
    "bid_strategy": "LOWEST_COST|COST_CAP|BID_CAP",
    "optimization_goal": "REPLIES|LINK_CLICKS|IMPRESSIONS|LANDING_PAGE_VIEWS"
  },
  "schedule": {
    "run_continuously": boolean,
    "active_hours_start": "string (HH:MM)",
    "active_hours_end": "string (HH:MM)",
    "active_days": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
  },
  "estimated_results": {
    "impressions_min": number,
    "impressions_max": number,
    "clicks_min": number,
    "clicks_max": number,
    "messages_min": number,
    "messages_max": number,
    "cpm_estimate_usd": number,
    "cpc_estimate_usd": number
  },
  "recommendations": "string"
}
\`\`\``;

export async function recommendBudget(params: {
  clientId: string;
  campaignId: string;
  country: string;
  city: string;
  industry: string;
  campaignObjective: string;
  analysis: any;
}): Promise<AgentResult> {
  const userMessage = `Recomienda la configuración de presupuesto para esta campaña:

DATOS:
- País: ${params.country}
- Ciudad: ${params.city}
- Rubro: ${params.industry}
- Objetivo: ${params.campaignObjective}
- Presupuesto total ads: $200 USD/mes

ANÁLISIS PREVIO:
${JSON.stringify(params.analysis, null, 2)}

Genera la recomendación de presupuesto.`;

  return runAgent({
    agentName: 'budget',
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    clientId: params.clientId,
    campaignId: params.campaignId,
    tier: 'haiku', // Formula-based math + recommendations
    maxTokens: 2048,
  });
}
