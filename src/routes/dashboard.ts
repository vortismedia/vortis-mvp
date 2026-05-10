import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

// GET /api/dashboard - Overview stats
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();

  const totalClients = (db.prepare('SELECT COUNT(*) as count FROM clients').get() as any).count;
  const activeClients = (db.prepare("SELECT COUNT(*) as count FROM clients WHERE status NOT IN ('error', 'onboarding')").get() as any).count;
  const totalCampaigns = (db.prepare('SELECT COUNT(*) as count FROM campaigns').get() as any).count;
  const readyCampaigns = (db.prepare("SELECT COUNT(*) as count FROM campaigns WHERE status = 'ready'").get() as any).count;
  const totalAds = (db.prepare('SELECT COUNT(*) as count FROM ads').get() as any).count;
  const approvedAds = (db.prepare("SELECT COUNT(*) as count FROM ads WHERE validation_status = 'approved'").get() as any).count;

  const totalTokens = (db.prepare('SELECT COALESCE(SUM(tokens_used), 0) as total FROM agent_logs').get() as any).total;
  const totalAgentRuns = (db.prepare('SELECT COUNT(*) as count FROM agent_logs').get() as any).count;

  const recentClients = db.prepare(
    `SELECT id, business_name, industry, city, status, created_at
     FROM clients ORDER BY created_at DESC LIMIT 10`
  ).all();

  res.json({
    stats: {
      totalClients,
      activeClients,
      totalCampaigns,
      readyCampaigns,
      totalAds,
      approvedAds,
      totalTokens,
      totalAgentRuns,
      estimatedTokenCostUsd: (totalTokens / 1_000_000 * 3).toFixed(4),
    },
    recentClients,
  });
});

export default router;
