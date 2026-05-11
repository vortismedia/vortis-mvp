import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database';
import { requireAuth } from './auth';

const router = Router();

// Industry-specific asset requirements
const INDUSTRY_ASSETS: Record<string, { required: string[]; optional: string[]; tips: string }> = {
  deportes_recreacion: { required: ['logo', 'foto_local', 'foto_actividad'], optional: ['foto_equipo', 'foto_clientes'], tips: 'Fotos de acción, gente disfrutando, instalaciones.' },
  estetica_cuidado_personal: { required: ['logo', 'foto_local', 'foto_antes_despues'], optional: ['foto_productos', 'foto_equipo'], tips: 'Alta calidad, iluminación clara. Antes/después clave.' },
  servicios_hogar: { required: ['logo', 'foto_trabajo_terminado', 'foto_proceso'], optional: ['foto_equipo', 'foto_materiales'], tips: 'Mostrar resultados finales impactantes.' },
  educacion: { required: ['logo', 'foto_aula', 'foto_alumnos'], optional: ['foto_certificados', 'foto_instalaciones'], tips: 'Ambiente de aprendizaje, gente concentrada.' },
  gastronomia: { required: ['logo', 'foto_plato_estrella', 'foto_local'], optional: ['foto_cocina', 'foto_equipo'], tips: 'Comida con buena iluminación, platos servidos.' },
  salud: { required: ['logo', 'foto_consultorio', 'foto_profesional'], optional: ['foto_equipamiento'], tips: 'Transmitir confianza, profesionalismo.' },
  inmobiliaria: { required: ['logo', 'foto_propiedad_exterior', 'foto_propiedad_interior'], optional: ['foto_barrio'], tips: 'Fotos amplias con buena luz.' },
  automotriz: { required: ['logo', 'foto_vehiculo', 'foto_taller'], optional: ['foto_equipo'], tips: 'Vehículos limpios y bien iluminados.' },
  tecnologia: { required: ['logo', 'foto_producto', 'screenshot_app'], optional: ['foto_equipo'], tips: 'Screenshots limpios, interfaz moderna.' },
  otro: { required: ['logo', 'foto_negocio', 'foto_producto_servicio'], optional: ['foto_equipo'], tips: 'Fotos representativas del negocio.' },
};

const ASSET_LABELS: Record<string, string> = {
  logo: 'Logo', foto_local: 'Foto del local', foto_actividad: 'Foto de actividad',
  foto_equipo: 'Foto del equipo', foto_clientes: 'Foto con clientes', foto_antes_despues: 'Fotos antes/después',
  foto_productos: 'Fotos de productos', foto_trabajo_terminado: 'Trabajo terminado', foto_proceso: 'Foto del proceso',
  foto_aula: 'Foto del aula', foto_alumnos: 'Foto alumnos', foto_certificados: 'Certificaciones',
  foto_plato_estrella: 'Plato estrella', foto_cocina: 'Cocina', foto_consultorio: 'Consultorio',
  foto_profesional: 'Foto profesional', foto_propiedad_exterior: 'Exterior', foto_propiedad_interior: 'Interior',
  foto_vehiculo: 'Vehículo', foto_taller: 'Taller', foto_producto: 'Producto', screenshot_app: 'Screenshot app',
  foto_negocio: 'Foto del negocio', foto_producto_servicio: 'Producto/servicio', foto_materiales: 'Materiales',
  foto_instalaciones: 'Instalaciones', foto_ambiente: 'Ambiente', foto_equipamiento: 'Equipamiento',
  foto_recepcion: 'Recepción', foto_barrio: 'Barrio', foto_amenities: 'Amenities', foto_repuestos: 'Repuestos',
  foto_oficina: 'Oficina',
};

// =================== Public endpoints (no auth) ===================
// These are used by the onboarding form
router.get('/assets-checklist/:industry', (req, res) => {
  const config = INDUSTRY_ASSETS[req.params.industry] || INDUSTRY_ASSETS.otro;
  res.json({
    industry: req.params.industry,
    required: config.required.map(k => ({ key: k, label: ASSET_LABELS[k] || k })),
    optional: config.optional.map(k => ({ key: k, label: ASSET_LABELS[k] || k })),
    tips: config.tips,
  });
});

router.get('/all-checklists', (_req, res) => {
  const result = Object.entries(INDUSTRY_ASSETS).map(([industry, config]) => ({
    industry,
    required: config.required.map(k => ({ key: k, label: ASSET_LABELS[k] || k })),
    optional: config.optional.map(k => ({ key: k, label: ASSET_LABELS[k] || k })),
    tips: config.tips,
  }));
  res.json({ checklists: result });
});

// Save assets — accepts both clientId (legacy onboarding flow) or token (secure)
router.post('/assets/:clientIdOrToken', async (req: Request, res: Response) => {
  const db = getDb();
  const { clientIdOrToken } = req.params;
  const { assets } = req.body;
  if (!Array.isArray(assets) || assets.length === 0) {
    return res.status(400).json({ error: 'Enviá al menos un asset' });
  }

  // Try by token first (more secure), then fall back to id
  let client: any = await db.prepare('SELECT id FROM clients WHERE access_token = ?').get(clientIdOrToken);
  if (!client) client = await db.prepare('SELECT id FROM clients WHERE id = ?').get(clientIdOrToken);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const insert = db.prepare('INSERT INTO client_assets (id, client_id, asset_type, label, url) VALUES (?, ?, ?, ?, ?)');
  const saved: string[] = [];
  for (const asset of assets) {
    if (!asset.url || !asset.asset_type) continue;
    const id = uuid();
    await insert.run(id, client.id, asset.asset_type, asset.label || '', asset.url);
    saved.push(id);
  }
  res.json({ success: true, saved: saved.length });
});

router.get('/templates', (_req, res) => {
  // Layout specs for designer reference
  res.json({
    templates: [
      { id: 'feed-A', name: 'Feed Layout A', format: 'feed', dimensions: '1080x1080', ratio: '1:1',
        zones: [
          { name: 'Logo', position: 'top-left', notes: 'Esquina superior izquierda' },
          { name: 'Foto principal', position: 'center', notes: 'Foto del negocio cubriendo todo' },
          { name: 'Overlay headline', position: 'bottom-overlay', notes: 'Texto con overlay oscuro' },
          { name: 'CTA', position: 'bottom-right', notes: 'Color de marca' },
        ],
        safeZone: { top: 60, bottom: 60, left: 60, right: 60 } },
      { id: 'feed-B', name: 'Feed Layout B', format: 'feed', dimensions: '1080x1080', ratio: '1:1',
        zones: [
          { name: 'Foto top', position: 'top-half', notes: 'Foto en mitad superior' },
          { name: 'Logo badge', position: 'center-divider', notes: 'Logo flotando sobre el divisor' },
          { name: 'Bloque color', position: 'bottom-half', notes: 'Color de marca con headline+CTA' },
        ],
        safeZone: { top: 60, bottom: 60, left: 60, right: 60 } },
      { id: 'story-A', name: 'Story Layout A', format: 'story', dimensions: '1080x1920', ratio: '9:16',
        zones: [
          { name: 'Logo', position: 'top-center', notes: 'Centrado arriba' },
          { name: 'Foto principal', position: 'center', notes: 'Cubre todo' },
          { name: 'Overlay', position: 'bottom-third', notes: 'Headline + CTA con overlay' },
        ],
        safeZone: { top: 250, bottom: 340, left: 60, right: 60 } },
    ],
  });
});

// =================== Admin endpoints (auth required) ===================
router.use(requireAuth);

router.get('/assets/:clientId', async (req: Request, res: Response) => {
  const db = getDb();
  const assets = await db.prepare(
    'SELECT * FROM client_assets WHERE client_id = ? ORDER BY uploaded_at DESC'
  ).all(req.params.clientId);
  res.json({ assets });
});

router.post('/generate-briefs/:clientId', async (req: Request, res: Response) => {
  const db = getDb();
  const { clientId } = req.params;

  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get<any>(clientId);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const campaign = await db.prepare(
    'SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get<any>(clientId);

  const ads = await db.prepare(
    "SELECT * FROM ads WHERE client_id = ? AND validation_status = 'approved' ORDER BY created_at"
  ).all<any>(clientId);

  if (ads.length === 0) return res.status(400).json({ error: 'No hay anuncios aprobados' });

  const assets = await db.prepare('SELECT * FROM client_assets WHERE client_id = ?').all<any>(clientId);
  const assetConfig = INDUSTRY_ASSETS[client.industry] || INDUSTRY_ASSETS.otro;
  const uploadedTypes = assets.map(a => a.asset_type);
  const missingRequired = assetConfig.required.filter(r => !uploadedTypes.includes(r));

  const insertBrief = db.prepare(`
    INSERT INTO creative_briefs (id, client_id, campaign_id, status, industry, format, dimensions,
      headline, description, cta_text, brand_colors, brand_fonts, visual_style, logo_url,
      photo_urls, slogan, creative_notes, required_assets)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const formats = [
    { format: 'feed', dimensions: '1080x1080' },
    { format: 'story', dimensions: '1080x1920' },
  ];
  const briefIds: string[] = [];

  for (const ad of ads) {
    for (const fmt of formats) {
      const briefId = uuid();
      await insertBrief.run(
        briefId, clientId, campaign?.id || null,
        client.industry, fmt.format, fmt.dimensions,
        ad.headline, ad.description, ad.cta_text,
        client.brand_colors || '', client.brand_fonts || '', client.visual_style || 'moderno',
        client.logo_url || '', client.photo_urls || '', client.slogan || '', client.creative_notes || '',
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
    message: missingRequired.length > 0 ? `Briefs generados pero faltan ${missingRequired.length} assets` : 'Todos generados',
  });
});

router.get('/briefs', async (req: Request, res: Response) => {
  const db = getDb();
  const status = req.query.status as string | undefined;
  let query = `SELECT cb.*, c.business_name, c.contact_name, c.industry as client_industry
               FROM creative_briefs cb JOIN clients c ON cb.client_id = c.id`;
  const params: string[] = [];
  if (status) { query += ' WHERE cb.status = ?'; params.push(status); }
  query += ' ORDER BY cb.created_at DESC';
  const briefs = await db.prepare(query).all(...params);
  res.json({ briefs });
});

router.get('/briefs/:briefId', async (req: Request, res: Response) => {
  const db = getDb();
  const brief = await db.prepare(`
    SELECT cb.*, c.business_name, c.contact_name, c.contact_email, c.city, c.product_service,
           c.differentiators, c.price_range, c.brand_tone, c.campaign_objective
    FROM creative_briefs cb JOIN clients c ON cb.client_id = c.id WHERE cb.id = ?
  `).get<any>(req.params.briefId);
  if (!brief) return res.status(404).json({ error: 'Brief no encontrado' });
  const assets = await db.prepare('SELECT * FROM client_assets WHERE client_id = ?').all(brief.client_id);
  res.json({ brief, assets });
});

router.post('/briefs/:briefId/complete', async (req: Request, res: Response) => {
  const db = getDb();
  const { output_url, designer_notes } = req.body;
  if (!output_url) return res.status(400).json({ error: 'output_url requerido' });

  await db.prepare(`
    UPDATE creative_briefs SET status = 'completed', output_url = ?, designer_notes = ?, completed_at = NOW() WHERE id = ?
  `).run(output_url, designer_notes || '', req.params.briefId);

  const brief = await db.prepare('SELECT * FROM creative_briefs WHERE id = ?').get<any>(req.params.briefId);
  if (brief) {
    await db.prepare('UPDATE ads SET creative_url = ? WHERE headline = ? AND client_id = ? AND format = ?')
      .run(output_url, brief.headline, brief.client_id, brief.format);
  }
  res.json({ success: true });
});

export { INDUSTRY_ASSETS, ASSET_LABELS };
export default router;
