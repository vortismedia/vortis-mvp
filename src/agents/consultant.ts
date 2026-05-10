import { getDb } from '../db/database';

export interface ConsultantInput {
  clientId: string;
  question: string;
}

export interface ConsultantResponse {
  answer: string;
  recommendations: string[];
  data?: Record<string, any>;
}

export async function consultAgent(input: ConsultantInput): Promise<ConsultantResponse> {
  const db = getDb();

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(input.clientId) as any;
  if (!client) throw new Error('Cliente no encontrado');

  const campaign = db.prepare(
    'SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(input.clientId) as any;

  const ads = db.prepare(
    'SELECT * FROM ads WHERE client_id = ? ORDER BY created_at DESC'
  ).all(input.clientId) as any[];

  let budget: any = {};
  let targeting: any = {};
  let analysis: any = {};
  try { budget = JSON.parse(campaign?.budget_config || '{}'); } catch {}
  try { targeting = JSON.parse(campaign?.targeting_config || '{}'); } catch {}
  try { analysis = JSON.parse(campaign?.business_analysis || '{}'); } catch {}

  const totalImpressions = ads.reduce((s: number, a: any) => s + (a.impressions || 0), 0);
  const totalClicks = ads.reduce((s: number, a: any) => s + (a.clicks || 0), 0);
  const totalMessages = ads.reduce((s: number, a: any) => s + (a.messages || 0), 0);
  const totalSpend = ads.reduce((s: number, a: any) => s + (a.spend_usd || 0), 0);

  const cpm = budget.benchmarks?.estimated_cpm || 1.8;
  const cpc = budget.benchmarks?.estimated_cpc || 0.12;
  const monthlyBudget = budget.monthly_budget_usd || 200;

  const q = input.question.toLowerCase();

  if (q.includes('aument') || q.includes('subir') || q.includes('más presupuesto') || q.includes('mas presupuesto')) {
    const match = q.match(/(\d+)/);
    const percent = match ? parseInt(match[1]) : 30;
    const newBudget = monthlyBudget * (1 + percent / 100);
    const newDaily = newBudget / 30;
    const newImpressions = Math.round((newBudget / cpm) * 1000);
    const newClicks = Math.round(newBudget / cpc);
    const newMessages = Math.round(newClicks * 0.3);

    return {
      answer: `Si aumentás tu presupuesto un ${percent}% (de $${monthlyBudget} a $${newBudget.toFixed(0)} USD/mes, o sea $${newDaily.toFixed(2)}/día), estimamos estos resultados:

• Impresiones: ~${newImpressions.toLocaleString()} por mes (+${percent}%)
• Clicks: ~${newClicks.toLocaleString()} por mes
• Mensajes WhatsApp: ~${newMessages.toLocaleString()} por mes

El costo por mensaje bajaría levemente porque Meta optimiza mejor con más presupuesto. Es una buena inversión si tu capacidad de atención lo permite.`,
      recommendations: [
        `Asegurate de poder responder ~${newMessages} mensajes por mes antes de escalar`,
        'Dejá correr la campaña al menos 7 días con el nuevo presupuesto antes de evaluar',
        'Considerá aumentar gradualmente (primero 15%, después otro 15%)',
      ],
      data: {
        current_budget: monthlyBudget,
        proposed_budget: newBudget,
        estimated_impressions: newImpressions,
        estimated_clicks: newClicks,
        estimated_messages: newMessages,
      },
    };
  }

  if (q.includes('reduc') || q.includes('bajar') || q.includes('menos presupuesto') || q.includes('gastar menos')) {
    const match = q.match(/(\d+)/);
    const percent = match ? parseInt(match[1]) : 30;
    const newBudget = monthlyBudget * (1 - percent / 100);
    const newImpressions = Math.round((newBudget / cpm) * 1000);
    const newClicks = Math.round(newBudget / cpc);
    const newMessages = Math.round(newClicks * 0.3);

    return {
      answer: `Si reducís tu presupuesto un ${percent}% (de $${monthlyBudget} a $${newBudget.toFixed(0)} USD/mes), los resultados estimados serían:

• Impresiones: ~${newImpressions.toLocaleString()} por mes
• Clicks: ~${newClicks.toLocaleString()} por mes
• Mensajes WhatsApp: ~${newMessages.toLocaleString()} por mes

Tené en cuenta que con menos presupuesto Meta tarda más en optimizar la campaña.`,
      recommendations: [
        'No recomendamos bajar de $100 USD/mes — la optimización de Meta pierde efectividad',
        'Si necesitás ahorrar, mejor pausá 1 semana que reducir el daily budget',
      ],
      data: {
        current_budget: monthlyBudget,
        proposed_budget: newBudget,
        estimated_impressions: newImpressions,
        estimated_clicks: newClicks,
        estimated_messages: newMessages,
      },
    };
  }

  if (q.includes('resultado') || q.includes('cómo va') || q.includes('como va') || q.includes('métricas') || q.includes('metricas') || q.includes('reporte') || q.includes('report')) {
    const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '—';
    const costPerMsg = totalMessages > 0 ? (totalSpend / totalMessages).toFixed(2) : '—';

    const hasData = totalImpressions > 0;

    return {
      answer: hasData
        ? `Acá va tu reporte actual:

• Impresiones: ${totalImpressions.toLocaleString()}
• Clicks: ${totalClicks.toLocaleString()} (CTR: ${ctr}%)
• Mensajes recibidos: ${totalMessages.toLocaleString()}
• Gasto total: $${totalSpend.toFixed(2)} USD
• Costo por mensaje: $${costPerMsg} USD

${parseFloat(ctr as string) > 2 ? 'Tu CTR está por encima del promedio. ¡Excelente performance!' : 'Tu CTR está en rango normal. Con más datos Meta seguirá optimizando.'}`
        : `Tu campaña todavía no tiene datos de performance. Esto es normal en las primeras 24-48 horas — Meta está en fase de aprendizaje.

Estimaciones basadas en tu presupuesto de $${monthlyBudget}/mes:
• Impresiones esperadas: ${Math.round((monthlyBudget / cpm) * 1000).toLocaleString()}/mes
• Clicks esperados: ${Math.round(monthlyBudget / cpc).toLocaleString()}/mes
• Mensajes esperados: ${Math.round((monthlyBudget / cpc) * 0.3).toLocaleString()}/mes`,
      recommendations: hasData
        ? [
            totalMessages > 0 && totalSpend / totalMessages > 2 ? 'Tu costo por mensaje es alto — considerá ajustar la segmentación' : 'Buen costo por mensaje — mantené la estrategia actual',
            'Revisá tus métricas semanalmente para detectar tendencias',
          ]
        : [
            'Esperá al menos 3-5 días antes de hacer cambios',
            'Asegurate de responder rápido los mensajes de WhatsApp que lleguen',
          ],
      data: {
        impressions: totalImpressions,
        clicks: totalClicks,
        messages: totalMessages,
        spend: totalSpend,
        ctr,
        cost_per_message: costPerMsg,
      },
    };
  }

  if (q.includes('horario') || q.includes('hora') || q.includes('cuándo') || q.includes('cuando') || q.includes('mejor momento')) {
    return {
      answer: `Para ${analysis.business_type || client.industry} en ${client.city}, los mejores horarios son:

• Lunes a Viernes: 10:00 - 14:00 y 19:00 - 22:00
• Sábados: 10:00 - 15:00
• Domingos: rendimiento más bajo, pero útil para awareness

Actualmente tu campaña corre 24/7. Podríamos concentrar el presupuesto en las horas pico para mejorar el costo por mensaje.`,
      recommendations: [
        'Activar programación horaria después de 2 semanas de datos',
        'Concentrar el 70% del presupuesto en horarios pico',
        'No cortar domingos completamente — sirve para branding',
      ],
    };
  }

  if (q.includes('público') || q.includes('publico') || q.includes('audiencia') || q.includes('segmentación') || q.includes('segmentacion') || q.includes('a quién') || q.includes('a quien')) {
    const ageRange = targeting.age_range || { min: 25, max: 55 };
    const interests = targeting.interests || [];

    return {
      answer: `Tu campaña está segmentada así:

• Ubicación: ${client.city} (radio 25 km)
• Edad: ${ageRange.min} - ${ageRange.max} años
• Género: ${targeting.genders || 'Todos'}
• Intereses: ${Array.isArray(interests) ? interests.join(', ') : 'Definidos por IA'}
• Plataformas: Facebook Feed, Instagram Feed, Instagram Stories

Esta segmentación fue definida por nuestra IA basándose en el análisis de tu negocio y benchmarks de tu industria.`,
      recommendations: [
        'Después de 2 semanas, podemos refinar la audiencia según los datos reales',
        'Si tus clientes son mayormente de un género, podemos ajustar para optimizar',
        'Considerá agregar lookalike audiences cuando tengas +50 conversiones',
      ],
    };
  }

  if (q.includes('anuncio') || q.includes('copy') || q.includes('texto') || q.includes('creativo')) {
    const approvedAds = ads.filter(a => a.validation_status === 'approved');
    return {
      answer: `Tenés ${approvedAds.length} anuncios activos en tu campaña. Meta rota automáticamente entre ellos y muestra más el que mejor funciona.

Tus anuncios:
${approvedAds.map((a, i) => `${i + 1}. "${a.headline}"`).join('\n')}

Meta está en proceso de optimización — después de 1.000 impresiones por anuncio, vas a ver cuál funciona mejor.`,
      recommendations: [
        'No cambies los anuncios durante las primeras 2 semanas',
        'El anuncio con mejor CTR se va a llevar más presupuesto automáticamente',
        'Podemos crear nuevas variantes cuando tengamos datos de performance',
      ],
    };
  }

  if (q.includes('cancel') || q.includes('pausar') || q.includes('parar') || q.includes('detener')) {
    return {
      answer: `Podés pausar tu campaña en cualquier momento desde tu dashboard. Al pausar:

• Los anuncios dejan de mostrarse inmediatamente
• No se genera más gasto
• Se conservan todos los datos y la optimización acumulada
• Podés reactivar cuando quieras

Si pausás por más de 7 días, Meta reinicia parcialmente la fase de aprendizaje al reactivar.`,
      recommendations: [
        'Si necesitás pausar, mejor hacerlo por períodos cortos (menos de 7 días)',
        'Considerá reducir presupuesto en vez de pausar completamente',
      ],
    };
  }

  return {
    answer: `Gracias por tu consulta. Basándome en tu campaña de ${client.business_name}:

Tu campaña está configurada con un presupuesto de $${monthlyBudget} USD/mes, segmentada en ${client.city} para ${analysis.business_type || client.industry}.

¿Sobre qué querés saber más? Podés preguntarme sobre:
• Presupuesto (ej: "¿qué pasa si aumento 30%?")
• Resultados y métricas
• Segmentación y audiencia
• Horarios óptimos
• Tus anuncios
• Pausar o modificar la campaña`,
    recommendations: [
      'Revisá tu campaña al menos una vez por semana',
      'Respondé los mensajes de WhatsApp en menos de 1 hora para mejor conversión',
    ],
  };
}
