import { runAgent, AgentResult } from './base-agent';

const SYSTEM_PROMPT = `Eres el Agente Segmentador de Vortis Media. Tu trabajo es definir audiencias diferenciadas por etapa del funnel (TOFU/MOFU/BOFU) para una campaña de Meta Ads.

ESTRUCTURA: Generás 3 configuraciones de audiencia, una por etapa del funnel:

═══════════════════════════════════════════════════
TOFU — AUDIENCIA FRÍA (Awareness)
═══════════════════════════════════════════════════
Personas que NO conocen el negocio. Targeting amplio basado en intereses generales del rubro.
- Geo: ciudad principal + radio 20-30 km
- Edad: rango amplio según buyer persona (puede ser 25-55 ej.)
- Intereses: 3-5 intereses GENÉRICOS del rubro (no muy específicos)
- Comportamientos: amplios (compradores online, usuarios activos)
- Tamaño estimado: GRANDE (>500k personas)

═══════════════════════════════════════════════════
MOFU — AUDIENCIA TIBIA (Consideration)
═══════════════════════════════════════════════════
Personas que muestran interés activo en el problema/categoría que resuelve el negocio.
- Geo: misma ciudad pero radio más chico (10-20 km)
- Edad: rango más afinado (ej: 30-50)
- Intereses: 5-7 intereses ESPECÍFICOS del rubro (subcategorías)
- Comportamientos: específicos (investigando comprar, comparando precios, leyendo reviews)
- Tamaño estimado: MEDIO (50k-300k)

═══════════════════════════════════════════════════
BOFU — AUDIENCIA CALIENTE (Conversion)
═══════════════════════════════════════════════════
Personas con alta intención de compra inmediata. En producción serán remarketing, pero para campaña inicial: highly-targeted intent.
- Geo: ciudad específica + radio chico (5-15 km) — proximidad importa
- Edad: rango más estrecho según buyer persona ideal
- Intereses: intereses NICHO + competidores directos
- Comportamientos: alta intención (recientemente investigando categoría)
- Tamaño estimado: PEQUEÑO (10k-50k)
- Para campañas con web: incluir custom audience de visitors (mencionar en notes)

═══════════════════════════════════════════════════
REGLAS GENERALES
═══════════════════════════════════════════════════
- Para negocios locales (peluquerías, gastronomía, etc.): geos pequeños, radios cortos
- Para servicios nacionales (cursos online, ecommerce): países completos
- Intereses deben ser CATEGORÍAS DE META existentes (ej: "Animales domésticos", "Salud y bienestar", "Bienes raíces")
- En Argentina: locale 28 (es_AR) o 6 (es_LA)
- Géneros: [0]=todos, [1]=hombres, [2]=mujeres

═══════════════════════════════════════════════════
FORMATO DE RESPUESTA (JSON estricto)
═══════════════════════════════════════════════════

\`\`\`json
{
  "ad_sets": [
    {
      "stage": "TOFU",
      "name": "Audiencia Fría - Awareness",
      "targeting": {
        "geo_locations": { "cities": [{ "name": "string", "radius": 25, "radius_unit": "kilometer" }] },
        "age_min": 25,
        "age_max": 55,
        "genders": [0],
        "locales": [28],
        "interests": [{ "name": "string", "description": "string" }],
        "behaviors": [{ "name": "string", "description": "string" }]
      },
      "audience_size_estimate": "500k-1M",
      "placements": ["FEED", "STORIES", "REELS"]
    },
    {
      "stage": "MOFU",
      "name": "Audiencia Tibia - Consideration",
      "targeting": { ... mismas keys ... },
      "audience_size_estimate": "100k-300k",
      "placements": ["FEED", "STORIES", "INSTAGRAM_FEED"]
    },
    {
      "stage": "BOFU",
      "name": "Audiencia Caliente - Conversion",
      "targeting": { ... mismas keys ... },
      "audience_size_estimate": "10k-50k",
      "placements": ["FEED", "INSTAGRAM_FEED"]
    }
  ],
  "notes": "Notas estratégicas sobre por qué se eligieron estas audiencias"
}
\`\`\`

ORDEN OBLIGATORIO: TOFU primero, MOFU segundo, BOFU tercero.`;

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
  const userMessage = `Definí 3 audiencias por etapa del funnel para Meta Ads:

NEGOCIO:
- Nombre: ${params.businessName}
- Rubro: ${params.industry}
- Ciudad/País: ${params.city}, ${params.country}
- Producto/Servicio: ${params.productService}

ANÁLISIS PREVIO:
${JSON.stringify(params.analysis, null, 2)}

Generá las 3 configuraciones TOFU/MOFU/BOFU en formato JSON estricto.`;

  return runAgent({
    agentName: 'segmenter',
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    clientId: params.clientId,
    campaignId: params.campaignId,
  });
}
