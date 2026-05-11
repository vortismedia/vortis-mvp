import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { getDb, initializeSchema } from './database';
import { v4 as uuid } from 'uuid';

const sampleKnowledge = [
  {
    category: 'brand_rules',
    industry: 'general',
    content: 'Nunca prometer ventas ni ROI específico. Vortis genera visibilidad, alcance y mensajes. Lo que pase después depende del negocio del cliente.',
  },
  {
    category: 'brand_rules',
    industry: 'general',
    content: 'Tono profesional pero cercano. Usar "vos" en Argentina, "tú" en México y Colombia. Evitar jerga técnica de marketing.',
  },
  {
    category: 'meta_policies',
    industry: 'general',
    content: 'Prohibido en Meta Ads: promesas de ingresos específicos, antes/después en salud, contenido engañoso, claims médicos sin evidencia, discriminación por edad/género/raza.',
  },
  {
    category: 'best_practices',
    industry: 'deportes_recreacion',
    content: 'Canchas, gimnasios, escuelas deportivas: CPC promedio $0.42 USD, CTR 2.5%+. Muy alta interacción. Optimizar por mensajes directos. Usar fotos reales del lugar.',
  },
  {
    category: 'best_practices',
    industry: 'estetica_cuidado_personal',
    content: 'Estética, peluquerías, spa: CPC $0.54, CTR 1.8%. Muy receptivo a creativos visuales. Ideal para mensajes directos. Mostrar resultados reales.',
  },
  {
    category: 'best_practices',
    industry: 'servicios_hogar',
    content: 'Aberturas, construcción, plomería: CPC $0.60-1.00, CTR 1.2-1.8%. Mucho espacio para diferenciarse. Destacar certificaciones y garantías.',
  },
  {
    category: 'best_practices',
    industry: 'educacion',
    content: 'Cursos, academias, tutorías: CPC $0.80, CTR 1.4%. Funciona bien con video testimonial. Tickets medios, leads de calidad.',
  },
  {
    category: 'best_practices',
    industry: 'gastronomia',
    content: 'Restaurantes, bares, delivery: CPC $0.85, CTR 1.5%. Funciona bien con fotos de producto y ofertas. Urgencia temporal funciona.',
  },
  {
    category: 'best_practices',
    industry: 'salud',
    content: 'Clínicas, dentistas, bienestar: CPC $1.20, CTR 1.5%. Competido. Requiere creativos de alta calidad. No hacer claims médicos.',
  },
  {
    category: 'best_practices',
    industry: 'inmobiliaria',
    content: 'Real estate, inmuebles: CPC $1.50-2.00, CTR bajo. Requiere segmentación precisa. Ticket alto justifica CPL mayor. Fotos profesionales esenciales.',
  },
  {
    category: 'cpm_benchmarks',
    industry: 'general',
    content: 'CPM por país con $200 USD/mes: Argentina ~$1 (200k impresiones), Colombia ~$1.50 (133k), México ~$4 (50k), USA Latinos ~$8 (25k). LATAM tiene los CPM más bajos del mundo.',
  },
];

async function main() {
  await initializeSchema();
  const db = getDb();

  const existing = await db.prepare('SELECT COUNT(*) as count FROM knowledge_base').get<{ count: string }>();
  const count = parseInt(String(existing?.count || '0'), 10);

  if (count === 0) {
    const insert = db.prepare(
      `INSERT INTO knowledge_base (id, category, industry, content) VALUES (?, ?, ?, ?)`
    );
    for (const item of sampleKnowledge) {
      await insert.run(uuid(), item.category, item.industry, item.content);
    }
    console.log(`Loaded ${sampleKnowledge.length} knowledge base entries.`);
  } else {
    console.log(`Knowledge base already has ${count} entries.`);
  }

  console.log('Database setup complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Setup] Error:', err);
  process.exit(1);
});
