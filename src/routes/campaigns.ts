import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

// GET /api/campaigns - List all campaigns
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const campaigns = db.prepare(
    `SELECT c.*, cl.business_name, cl.industry, cl.city
     FROM campaigns c
     JOIN clients cl ON c.client_id = cl.id
     ORDER BY c.created_at DESC`
  ).all();
  res.json({ campaigns });
});

// GET /api/campaigns/:id - Get campaign with all ads
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const campaign = db.prepare(
    `SELECT c.*, cl.business_name, cl.industry, cl.city, cl.country
     FROM campaigns c
     JOIN clients cl ON c.client_id = cl.id
     WHERE c.id = ?`
  ).get(req.params.id) as any;

  if (!campaign) {
    res.status(404).json({ error: 'Campaña no encontrada' });
    return;
  }

  const ads = db.prepare(
    'SELECT * FROM ads WHERE campaign_id = ? ORDER BY created_at'
  ).all(req.params.id);

  // Parse JSON fields
  try { campaign.business_analysis = JSON.parse(campaign.business_analysis); } catch {}
  try { campaign.targeting_config = JSON.parse(campaign.targeting_config); } catch {}
  try { campaign.budget_config = JSON.parse(campaign.budget_config); } catch {}

  res.json({ campaign, ads });
});

// GET /api/campaigns/:id/logs - Get agent execution logs
router.get('/:id/logs', (req: Request, res: Response) => {
  const db = getDb();
  const logs = db.prepare(
    `SELECT agent_name, tokens_used, duration_ms, status, error_message, created_at
     FROM agent_logs
     WHERE campaign_id = ?
     ORDER BY created_at`
  ).all(req.params.id);
  res.json({ logs });
});

export default router;
