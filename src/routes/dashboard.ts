import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { requireAuth } from './auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req: Request, res: Response) => {
  const db = getDb();

  const totalClients = parseInt(String(((await db.prepare('SELECT COUNT(*) as count FROM clients').get<any>())?.count) || 0), 10);
  const activeClients = parseInt(String(((await db.prepare("SELECT COUNT(*) as count FROM clients WHERE status NOT IN ('error', 'onboarding')").get<any>())?.count) || 0), 10);
  const totalCampaigns = parseInt(String(((await db.prepare('SELECT COUNT(*) as count FROM campaigns').get<any>())?.count) || 0), 10);
  const readyCampaigns = parseInt(String(((await db.prepare("SELECT COUNT(*) as count FROM campaigns WHERE status = 'ready'").get<any>())?.count) || 0), 10);
  const totalAds = parseInt(String(((await db.prepare('SELECT COUNT(*) as count FROM ads').get<any>())?.count) || 0), 10);
  const approvedAds = parseInt(String(((await db.prepare("SELECT COUNT(*) as count FROM ads WHERE validation_status = 'approved'").get<any>())?.count) || 0), 10);
  const totalTokens = parseInt(String(((await db.prepare('SELECT COALESCE(SUM(tokens_used), 0) as total FROM agent_logs').get<any>())?.total) || 0), 10);
  const totalAgentRuns = parseInt(String(((await db.prepare('SELECT COUNT(*) as count FROM agent_logs').get<any>())?.count) || 0), 10);

  const recentClients = await db.prepare(
    `SELECT id, business_name, industry, city, status, created_at FROM clients ORDER BY created_at DESC LIMIT 10`
  ).all();

  res.json({
    stats: {
      totalClients, activeClients, totalCampaigns, readyCampaigns,
      totalAds, approvedAds, totalTokens, totalAgentRuns,
      estimatedTokenCostUsd: (totalTokens / 1_000_000 * 1.0).toFixed(4),
    },
    recentClients,
  });
});

export default router;
