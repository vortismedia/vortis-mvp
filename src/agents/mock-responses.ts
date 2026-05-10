export function getMockAnalysis(client: any) {
  const industryNames: Record<string, string> = {
    deportes_recreacion: 'Deportes y Recreación',
    estetica_cuidado_personal: 'Estética y Cuidado Personal',
    servicios_hogar: 'Servicios del Hogar / Construcción',
    educacion: 'Educación y Cursos',
    gastronomia: 'Gastronomía',
    salud: 'Salud y Bienestar',
    inmobiliaria: 'Inmobiliaria',
    automotriz: 'Automotriz',
    tecnologia: 'Tecnología',
    otro: 'Otro',
  };

  return {
    business_type: industryNames[client.industry] || client.industry,
    ticket_level: client.price_range ? 'medio-alto' : 'medio',
    ideal_customer: {
      age_range: { min: 25, max: 50 },
      gender: 'todos',
      interests: ['negocios locales', industryNames[client.industry] || client.industry, 'calidad'],
      location: client.city,
    },
    market_competition: 'media',
    recommended_objective: client.campaign_objective,
    pain_points: [
      'No conoce opciones de calidad en la zona',
      'Busca confianza y respaldo profesional',
      'Necesita resolver su problema rápido',
    ],
    key_selling_points: [
      client.differentiators || 'Experiencia y calidad comprobada',
      'Atención personalizada',
      `Ubicado en ${client.city}`,
    ],
  };
}

export function getMockCopies(client: any, analysis: any) {
  const biz = client.business_name;
  const city = client.city;
  const product = client.product_service?.substring(0, 60) || 'nuestros servicios';

  return {
    ads: [
      {
        variant: 'beneficio_directo',
        headline: `${biz} - La Mejor Opción`,
        body: `¿Buscás ${product} en ${city}? En ${biz} ofrecemos exactamente lo que necesitás. Calidad profesional, atención personalizada y resultados garantizados. Contactanos hoy y descubrí por qué somos la elección preferida de ${city}.`,
        description: `${biz} en ${city}. Calidad que se nota.`,
        cta_type: 'SEND_MESSAGE',
        cta_text: 'Enviar mensaje',
      },
      {
        variant: 'problema_dolor',
        headline: `¿Cansado de Buscar sin Encontrar?`,
        body: `Sabemos lo frustrante que es buscar ${product} de calidad en ${city}. Por eso en ${biz} nos enfocamos en darte una solución real, profesional y a tu medida. No pierdas más tiempo. Escribinos y te asesoramos sin compromiso.`,
        description: `${biz}: tu solución profesional en ${city}.`,
        cta_type: 'SEND_MESSAGE',
        cta_text: 'Quiero más info',
      },
      {
        variant: 'urgencia',
        headline: `Últimos Turnos Disponibles`,
        body: `La demanda por ${product} en ${city} está creciendo. En ${biz} estamos abriendo nuevos turnos esta semana. Reservá el tuyo antes de que se agoten. Atención premium, resultados visibles desde el primer día.`,
        description: `Turnos limitados en ${biz}. Reservá ahora.`,
        cta_type: 'SEND_MESSAGE',
        cta_text: 'Reservar turno',
      },
      {
        variant: 'prueba_social',
        headline: `+500 Clientes ya Eligieron ${biz}`,
        body: `Cada vez más personas en ${city} confían en ${biz} para ${product}. Nuestra trayectoria y el boca a boca de nuestros clientes habla por sí solo. Sumate vos también y viví la experiencia.`,
        description: `Elegido por cientos en ${city}.`,
        cta_type: 'SEND_MESSAGE',
        cta_text: 'Unirme ahora',
      },
      {
        variant: 'emocional',
        headline: `Hacé Realidad lo que Imaginás`,
        body: `En ${biz} creemos que merecés lo mejor. Nuestro equipo profesional en ${city} está listo para brindarte ${product} con la dedicación y el cariño que esperás. Porque vos merecés un servicio diferente.`,
        description: `${biz}: dedicación y calidad en ${city}.`,
        cta_type: 'SEND_MESSAGE',
        cta_text: 'Contactar',
      },
    ],
  };
}

export function getMockSegmentation(client: any, analysis: any) {
  return {
    geo_locations: {
      cities: [{ name: client.city, radius: 25, distance_unit: 'kilometer' }],
    },
    age_range: { min: 25, max: 55 },
    genders: 'todos',
    locales: ['es_LA'],
    interests: [
      'Compras y moda',
      'Hogar y jardín',
      'Servicios locales',
    ],
    behaviors: ['Usuarios activos de WhatsApp'],
    placements: ['facebook_feed', 'instagram_feed', 'instagram_stories'],
  };
}

export function getMockValidation(ads: any[]) {
  return {
    overall_compliance: 'APROBADO',
    validations: ads.map((ad: any, i: number) => ({
      variant: ad.variant,
      status: 'APROBADO',
      notes: 'Cumple con todas las políticas de Meta Ads.',
      corrected_headline: null,
      corrected_body: null,
    })),
  };
}

export function getMockBudget(client: any) {
  const countryBenchmarks: Record<string, { cpm: number; cpc: number }> = {
    Argentina: { cpm: 1.8, cpc: 0.12 },
    Mexico: { cpm: 2.5, cpc: 0.18 },
    Colombia: { cpm: 1.5, cpc: 0.10 },
    Chile: { cpm: 3.0, cpc: 0.22 },
    USA: { cpm: 12.0, cpc: 0.80 },
  };

  const bench = countryBenchmarks[client.country] || countryBenchmarks.Argentina;
  const dailyBudget = 6.67;
  const monthlyBudget = 200;
  const estImpressions = Math.round((monthlyBudget / bench.cpm) * 1000);
  const estClicks = Math.round(monthlyBudget / bench.cpc);
  const estMessages = Math.round(estClicks * 0.3);

  return {
    daily_budget_usd: dailyBudget,
    monthly_budget_usd: monthlyBudget,
    recommended_duration_days: 30,
    schedule: { start: 'Al activar', optimization_window: '7 días para aprendizaje' },
    estimated_results: {
      impressions: { min: Math.round(estImpressions * 0.7), max: Math.round(estImpressions * 1.3) },
      clicks: { min: Math.round(estClicks * 0.7), max: Math.round(estClicks * 1.3) },
      messages: { min: Math.round(estMessages * 0.6), max: Math.round(estMessages * 1.4) },
    },
    benchmarks: {
      estimated_cpm: bench.cpm,
      estimated_cpc: bench.cpc,
      estimated_ctr: '1.5-2.5%',
    },
  };
}
