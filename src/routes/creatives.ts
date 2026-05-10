import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database';

const router = Router();

// Industry-specific asset requirements
const INDUSTRY_ASSETS: Record<string, { required: string[]; optional: string[]; tips: string }> = {
  deportes_recreacion: {
    required: ['logo', 'foto_local', 'foto_actividad'],
    optional: ['foto_equipo', 'foto_clientes'],
    tips: 'Fotos de acción, gente disfrutando, instalaciones. Evitar fotos estáticas.',
  },
  estetica_cuidado_personal: {
    required: ['logo', 'foto_local', 'foto_antes_despues'],
    optional: ['foto_productos', 'foto_equipo'],
    tips: 'Fotos de alta calidad, iluminación clara. Antes/después son clave. Ambiente limpio y profesional.',
  },
  servicios_hogar: {
    required: ['logo', 'foto_trabajo_terminado', 'foto_proceso'],
    optional: ['foto_equipo', 'foto_materiales'],
    tips: 'Mostrar resultados finales impactantes. Fotos del antes/después de obras. Equipo trabajando.',
  },
  educacion: {
    required: ['logo', 'foto_aula', 'foto_alumnos'],
    optional: ['foto_certificados', 'foto_instalaciones'],
    tips: 'Ambiente de aprendizaje, gente concentrada o celebrando logros. Certificaciones visibles.',
  },
  gastronomia: {
    required: ['logo', 'foto_plato_estrella', 'foto_local'],
    optional: ['foto_cocina', 'foto_equipo', 'foto_ambiente'],
    tips: 'Fotos de comida con buena iluminación natural. Platos servidos, no en proceso. Ambiente acogedor.',
  },
  salud: {
    required: ['logo', 'foto_consultorio', 'foto_profesional'],
    optional: ['foto_equipamiento', 'foto_recepcion'],
    tips: 'Transmitir confianza y profesionalismo. Ambiente limpio, ordenado. Doctor/a con guardapolvo.',
  },
  inmobiliaria: {
    required: ['logo', 'foto_propiedad_exterior', 'foto_propiedad_interior'],
    optional: ['foto_barrio', 'foto_amenities'],
    tips: 'Fotos amplias con buena luz. Mostrar espacios limpios y decorados. Resaltar mejores ángulos.',
  },
  automotriz: {
    required: ['logo', 'foto_vehiculo', 'foto_taller'],
    optional: ['foto_equipo', 'foto_repuestos'],
    tips: 'Vehículos limpios y bien iluminados. Taller ordenado. Mecánicos trabajando profesionalmente.',
  },
  tecnologia: {
    required: ['logo', 'foto_producto', 'screenshot_app'],
    optional: ['foto_equipo', 'foto_oficina'],
    tips: 'Screenshots limpios del producto. Mostrar interfaz moderna. Si es hardware, sobre fondo limpio.',
  },
  otro: {
    required: ['logo', 'foto_negocio', 'foto_producto_servicio'],
    optional: ['foto_equipo', 'foto_clientes'],
    tips: 'Fotos que representen lo mejor de tu negocio. Buena iluminación, ambiente profesional.',
  },
};

// Asset labels in Spanish
const ASSET_LABELS: Record<string, string> = {
  logo: 'Logo (PNG transparente preferido)',
  foto_local: 'Foto del local/establecimiento',
  foto_actividad: 'Foto de la actividad principal',
  foto_equipo: 'Foto del equipo de trabajo',
  foto_clientes: 'Foto con clientes (con permiso)',
  foto_antes_despues: 'Fotos antes/después',
  foto_productos: 'Fotos de productos',
  foto_trabajo_terminado: 'Foto de trabajo terminado',
  foto_proceso: 'Foto del proceso de trabajo',
  foto_materiales: 'Foto de materiales/herramientas',
  foto_aula: 'Foto del aula/espacio de clase',
  foto_alumnos: 'Foto de alumnos (con permiso)',
  foto_certificados: 'Foto de certificaciones/diplomas',
  foto_instalaciones: 'Foto de instalaciones',
  foto_plato_estrella: 'Foto del plato estrella',
  foto_cocina: 'Foto de la cocina',
  foto_ambiente: 'Foto del ambiente/decoración',
  foto_consultorio: 'Foto del consultorio',
  foto_profesional: 'Foto del profesional',
  foto_equipamiento: 'Foto del equipamiento',
  foto_recepcion: 'Foto de la recepción',
  foto_propiedad_exterior: 'Foto exterior de la propiedad',
  foto_propiedad_interior: 'Foto interior de la propiedad',
  foto_barrio: 'Foto del barrio/zona',
  foto_amenities: 'Foto de amenities',
  foto_vehiculo: 'Foto del vehículo',
  foto_taller: 'Foto del taller',
  foto_repuestos: 'Foto de repuestos/productos',
  foto_producto: 'Foto del producto',
  screenshot_app: 'Screenshot de la app/plataforma',
  foto_oficina: 'Foto de la oficina',
  foto_negocio: 'Foto del negocio',
  foto_producto_servicio: 'Foto del producto/servicio principal',
};

// GET /api/creatives/assets-checklist/:industry - What images to ask for
router.get('/assets-checklist/:industry', (req: Request, res: Response) => {
  const { industry } = req.params;
  const config = INDUSTRY_ASSETS[industry] || INDUSTRY_ASSETS.otro;

  res.json({
    industry,
    required: config.required.map(key => ({
      key,
      label: ASSET_LABELS[key] || key,
    })),
    optional: config.optional.map(key => ({
      key,
      label: ASSET_LABELS[key] || key,
    })),
    tips: config.tips,
  });
});

// GET /api/creatives/all-checklists - All industry checklists
router.get('/all-checklists', (_req: Request, res: Response) => {
  const result = Object.entries(INDUSTRY_ASSETS).map(([industry, config]) => ({
    industry,
    required: config.required.map(key => ({ key, label: ASSET_LABELS[key] || key })),
    optional: config.optional.map(key => ({ key, label: ASSET_LABELS[key] || key })),
    tips: config.tips,
  }));
  res.json({ checklists: result });
});

// POST /api/creatives/assets/:clientId - Save client asset URLs
router.post('/assets/:clientId', (req: Request, res: Response) => {
  const db = getDb();
  const { clientId } = req.params;
  const { assets } = req.body; // [{asset_type, label, url}]

  if (!Array.isArray(assets) || assets.length === 0) {
    return res.status(400).json({ error: 'Enviá al menos un asset' });
  }

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const insert = db.prepare(
    'INSERT INTO client_assets (id, client_id, asset_type, label, url) VALUES (?, ?, ?, ?, ?)'
  );

  const saved: string[] = [];
  for (const asset of assets) {
    if (!asset.url || !asset.asset_type) continue;
    const id = uuid();
    insert.run(id, clientId, asset.asset_type, asset.label || '', asset.url);
    saved.push(id);
  }

  res.json({ success: true, saved: saved.length });
});

// GET /api/creatives/assets/:clientId - Get client assets
router.get('/assets/:clientId', (req: Request, res: Response) => {
  const db = getDb();
  const { clientId } = req.params;

  const assets = db.prepare(
    'SELECT * FROM client_assets WHERE client_id = ? ORDER BY uploaded_at DESC'
  ).all(clientId);

  res.json({ assets });
});

// POST /api/creatives/generate-briefs/:clientId - Auto-generate creative briefs
router.post('/generate-briefs/:clientId', (req: Request, res: Response) => {
  const db = getDb();
  const { clientId } = req.params;

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as any;
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const campaign = db.prepare(
    'SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(clientId) as any;

  const ads = db.prepare(
    "SELECT * FROM ads WHERE client_id = ? AND validation_status = 'approved' ORDER BY created_at"
  ).all(clientId) as any[];

  if (ads.length === 0) {
    return res.status(400).json({ error: 'No hay anuncios aprobados para generar briefs' });
  }

  const assets = db.prepare(
    'SELECT * FROM client_assets WHERE client_id = ?'
  ).all(clientId) as any[];

  const assetConfig = INDUSTRY_ASSETS[client.industry] || INDUSTRY_ASSETS.otro;

  // Check which required assets are missing
  const uploadedTypes = assets.map((a: any) => a.asset_type);
  const missingRequired = assetConfig.required.filter(r => !uploadedTypes.includes(r));

  const insertBrief = db.prepare(`
    INSERT INTO creative_briefs (
      id, client_id, campaign_id, status, industry, format, dimensions,
      headline, description, cta_text, brand_colors, brand_fonts,
      visual_style, logo_url, photo_urls, slogan, creative_notes, required_assets
    ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const formats = [
    { format: 'feed', dimensions: '1080x1080' },
    { format: 'story', dimensions: '1080x1920' },
  ];

  const briefIds: string[] = [];

  for (const ad of ads) {
    for (const fmt of formats) {
      const briefId = uuid();
      insertBrief.run(
        briefId,
        clientId,
        campaign?.id || null,
        client.industry,
        fmt.format,
        fmt.dimensions,
        ad.headline,
        ad.description,
        ad.cta_text,
        client.brand_colors || '',
        client.brand_fonts || '',
        client.visual_style || 'moderno',
        client.logo_url || '',
        client.photo_urls || '',
        client.slogan || '',
        client.creative_notes || '',
        JSON.stringify({
          required: assetConfig.required.map(k => ({ key: k, label: ASSET_LABELS[k], uploaded: uploadedTypes.includes(k) })),
          missing: missingRequired.map(k => ({ key: k, label: ASSET_LABELS[k] })),
          tips: assetConfig.tips,
        })
      );
      briefIds.push(briefId);
    }
  }

  res.json({
    success: true,
    briefsGenerated: briefIds.length,
    missingAssets: missingRequired.map(k => ASSET_LABELS[k]),
    message: missingRequired.length > 0
      ? `Briefs generados pero faltan ${missingRequired.length} assets obligatorios`
      : 'Todos los briefs generados correctamente',
  });
});

// GET /api/creatives/briefs - All briefs (for designer dashboard)
router.get('/briefs', (req: Request, res: Response) => {
  const db = getDb();
  const status = (req.query.status as string) || null;

  let query = `
    SELECT cb.*, c.business_name, c.contact_name, c.industry as client_industry
    FROM creative_briefs cb
    JOIN clients c ON cb.client_id = c.id
  `;
  const params: string[] = [];
  if (status) {
    query += ' WHERE cb.status = ?';
    params.push(status);
  }
  query += ' ORDER BY cb.created_at DESC';

  const briefs = db.prepare(query).all(...params);
  res.json({ briefs });
});

// GET /api/creatives/briefs/:briefId - Single brief detail
router.get('/briefs/:briefId', (req: Request, res: Response) => {
  const db = getDb();
  const { briefId } = req.params;

  const brief = db.prepare(`
    SELECT cb.*, c.business_name, c.contact_name, c.contact_email, c.city,
           c.product_service, c.differentiators, c.price_range, c.brand_tone,
           c.campaign_objective
    FROM creative_briefs cb
    JOIN clients c ON cb.client_id = c.id
    WHERE cb.id = ?
  `).get(briefId) as any;

  if (!brief) return res.status(404).json({ error: 'Brief no encontrado' });

  const assets = db.prepare(
    'SELECT * FROM client_assets WHERE client_id = ?'
  ).all(brief.client_id);

  res.json({ brief, assets });
});

// POST /api/creatives/briefs/:briefId/complete - Mark brief as completed
router.post('/briefs/:briefId/complete', (req: Request, res: Response) => {
  const db = getDb();
  const { briefId } = req.params;
  const { output_url, designer_notes } = req.body;

  if (!output_url) return res.status(400).json({ error: 'output_url es requerido' });

  db.prepare(`
    UPDATE creative_briefs
    SET status = 'completed', output_url = ?, designer_notes = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(output_url, designer_notes || '', briefId);

  // Also update the ad's creative_url
  const brief = db.prepare('SELECT * FROM creative_briefs WHERE id = ?').get(briefId) as any;
  if (brief) {
    db.prepare('UPDATE ads SET creative_url = ? WHERE headline = ? AND client_id = ? AND format = ?')
      .run(output_url, brief.headline, brief.client_id, brief.format);
  }

  res.json({ success: true, message: 'Brief completado' });
});

// GET /api/creatives/templates - Template specs per industry/format
router.get('/templates', (_req: Request, res: Response) => {
  const templates = [
    {
      id: 'feed-standard',
      name: 'Feed Estándar',
      format: 'feed',
      dimensions: '1080x1080',
      ratio: '1:1',
      zones: [
        { name: 'Logo', position: 'top-left', size: '120x120px', notes: 'Con fondo transparente' },
        { name: 'Imagen principal', position: 'center', size: '1080x700px', notes: 'Foto del negocio/producto' },
        { name: 'Headline', position: 'bottom-overlay', size: 'max 2 líneas', notes: 'Texto impactante, max 40 chars' },
        { name: 'CTA', position: 'bottom-right', size: 'botón', notes: 'Color de marca' },
        { name: 'Borde/Marca', position: 'bottom-bar', size: '1080x80px', notes: 'Barra con color de marca' },
      ],
      safeZone: { top: 60, bottom: 60, left: 60, right: 60 },
    },
    {
      id: 'story-standard',
      name: 'Story Estándar',
      format: 'story',
      dimensions: '1080x1920',
      ratio: '9:16',
      zones: [
        { name: 'Logo', position: 'top-center', size: '150x150px', notes: 'Centrado arriba' },
        { name: 'Imagen principal', position: 'center', size: '1080x1080px', notes: 'Foto protagonista' },
        { name: 'Headline', position: 'upper-third', size: 'max 3 líneas', notes: 'Grande y legible' },
        { name: 'CTA + Swipe', position: 'bottom', size: '1080x300px', notes: 'Zona de "Deslizar" o CTA' },
      ],
      safeZone: { top: 250, bottom: 340, left: 60, right: 60 },
    },
    {
      id: 'feed-carousel',
      name: 'Carrusel (cada slide)',
      format: 'carousel',
      dimensions: '1080x1080',
      ratio: '1:1',
      zones: [
        { name: 'Slide 1', position: 'full', notes: 'Hook / Pregunta que atrape' },
        { name: 'Slides 2-4', position: 'full', notes: 'Beneficios / Proceso / Resultados' },
        { name: 'Slide final', position: 'full', notes: 'CTA fuerte + contacto' },
      ],
      safeZone: { top: 60, bottom: 60, left: 60, right: 60 },
      slidesRecommended: 5,
    },
  ];

  res.json({ templates });
});

// Export industry assets for use in other modules
export { INDUSTRY_ASSETS, ASSET_LABELS };

export default router;
