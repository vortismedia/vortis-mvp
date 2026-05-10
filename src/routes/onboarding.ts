import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { getDb } from '../db/database';
import { orchestrateCampaignCreation } from '../agents/orchestrator';
import { sendNewClientNotification } from '../services/email';

const router = Router();

const OnboardingSchema = z.object({
  business_name: z.string().min(2),
  industry: z.string().min(2),
  city: z.string().min(2),
  country: z.string().default('Argentina'),
  product_service: z.string().min(10),
  differentiators: z.string().optional().default(''),
  price_range: z.string().optional().default(''),
  campaign_objective: z.string().default('Mensajes por WhatsApp'),
  destination_url: z.string().optional().default(''),
  brand_tone: z.string().default('profesional'),
  prohibited_words: z.string().optional().default(''),
  mandatory_words: z.string().optional().default(''),
  // Creative assets
  logo_url: z.string().optional().default(''),
  brand_colors: z.string().optional().default(''),
  brand_fonts: z.string().optional().default(''),
  slogan: z.string().optional().default(''),
  visual_style: z.string().optional().default('moderno'),
  photo_urls: z.string().optional().default(''),
  creative_notes: z.string().optional().default(''),
  // Contact
  contact_email: z.string().email(),
  contact_phone: z.string().optional().default(''),
  contact_name: z.string().min(2),
});

// POST /api/onboarding - Submit onboarding form
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = OnboardingSchema.parse(req.body);
    const clientId = uuid();

    const db = getDb();
    db.prepare(
      `INSERT INTO clients (
        id, business_name, industry, city, country, product_service,
        differentiators, price_range, campaign_objective, destination_url,
        brand_tone, prohibited_words, mandatory_words,
        logo_url, brand_colors, brand_fonts, slogan, visual_style, photo_urls, creative_notes,
        contact_email, contact_phone, contact_name, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing')`
    ).run(
      clientId, data.business_name, data.industry, data.city, data.country,
      data.product_service, data.differentiators, data.price_range,
      data.campaign_objective, data.destination_url, data.brand_tone,
      data.prohibited_words, data.mandatory_words,
      data.logo_url, data.brand_colors, data.brand_fonts, data.slogan,
      data.visual_style, data.photo_urls, data.creative_notes,
      data.contact_email, data.contact_phone, data.contact_name
    );

    res.status(201).json({
      success: true,
      clientId,
      message: 'Onboarding recibido. Generando campaña...',
    });

    // Notify admin
    sendNewClientNotification({
      business_name: data.business_name,
      industry: data.industry,
      city: data.city,
      contact_name: data.contact_name,
      contact_email: data.contact_email,
      id: clientId,
    }).catch(() => {});

    // Run orchestration in background (don't await in the response)
    orchestrateCampaignCreation(clientId).catch((err) => {
      console.error(`[Orchestrator] Error for client ${clientId}:`, err);
      db.prepare(
        `UPDATE clients SET status = 'error', updated_at = datetime('now') WHERE id = ?`
      ).run(clientId);
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, errors: error.errors });
    } else {
      console.error('[Onboarding] Error:', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
  }
});

export default router;
