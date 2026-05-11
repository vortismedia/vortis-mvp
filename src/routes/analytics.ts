import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { requireAuth } from './auth';

const router = Router();
router.use(requireAuth);

// Helper for postgres CTR/cost calcs - REAL division
router.get('/', async (_req: Request, res: Response) => {
  const db = getDb();

  const totals = await db.prepare(`
    SELECT COUNT(DISTINCT client_id)::int as total_clients,
           COALESCE(SUM(impressions),0)::int as total_impressions,
           COALESCE(SUM(clicks),0)::int as total_clicks,
           COALESCE(SUM(messages),0)::int as total_messages,
           COALESCE(SUM(spend_usd),0)::float as total_spend
    FROM ads
  `).get<any>();

  const byIndustry = await db.prepare(`
    SELECT c.industry,
           COUNT(DISTINCT c.id)::int as clients,
           COALESCE(SUM(a.impressions),0)::int as impressions,
           COALESCE(SUM(a.clicks),0)::int as clicks,
           COALESCE(SUM(a.messages),0)::int as messages,
           COALESCE(SUM(a.spend_usd),0)::float as spend,
           CASE WHEN COALESCE(SUM(a.impressions),0) > 0
             THEN ROUND((SUM(a.clicks)::numeric / SUM(a.impressions)) * 100, 2)::float
             ELSE 0 END as ctr,
           CASE WHEN COALESCE(SUM(a.messages),0) > 0
             THEN ROUND((SUM(a.spend_usd) / SUM(a.messages))::numeric, 2)::float
             ELSE 0 END as cost_per_message
    FROM clients c
    LEFT JOIN ads a ON a.client_id = c.id
    GROUP BY c.industry ORDER BY clients DESC
  `).all<any>();

  const byCity = await db.prepare(`
    SELECT c.city,
           COUNT(DISTINCT c.id)::int as clients,
           COALESCE(SUM(a.impressions),0)::int as impressions,
           COALESCE(SUM(a.clicks),0)::int as clicks,
           COALESCE(SUM(a.messages),0)::int as messages,
           COALESCE(SUM(a.spend_usd),0)::float as spend
    FROM clients c LEFT JOIN ads a ON a.client_id = c.id
    GROUP BY c.city ORDER BY clients DESC LIMIT 10
  `).all<any>();

  const topCampaigns = await db.prepare(`
    SELECT c.business_name, c.industry, c.city,
           camp.status as campaign_status, camp.meta_status,
           COALESCE(SUM(a.impressions),0)::int as impressions,
           COALESCE(SUM(a.clicks),0)::int as clicks,
           COALESCE(SUM(a.messages),0)::int as messages,
           COALESCE(SUM(a.spend_usd),0)::float as spend,
           CASE WHEN COALESCE(SUM(a.impressions),0) > 0
             THEN ROUND((SUM(a.clicks)::numeric / SUM(a.impressions)) * 100, 2)::float
             ELSE 0 END as ctr,
           CASE WHEN COALESCE(SUM(a.messages),0) > 0
             THEN ROUND((SUM(a.spend_usd) / SUM(a.messages))::numeric, 2)::float
             ELSE 0 END as cost_per_message
    FROM clients c
    JOIN campaigns camp ON camp.client_id = c.id
    LEFT JOIN ads a ON a.campaign_id = camp.id
    GROUP BY camp.id, c.id, camp.status, camp.meta_status
    ORDER BY messages DESC LIMIT 20
  `).all<any>();

  const topAds = await db.prepare(`
    SELECT a.headline, a.description, a.cta_text, c.industry, c.business_name,
           a.impressions, a.clicks, a.messages, a.spend_usd,
           CASE WHEN a.impressions > 0
             THEN ROUND((a.clicks::numeric / a.impressions) * 100, 2)::float
             ELSE 0 END as ctr
    FROM ads a JOIN clients c ON c.id = a.client_id
    WHERE a.validation_status = 'approved'
    ORDER BY a.clicks DESC LIMIT 10
  `).all<any>();

  const statusBreakdown = await db.prepare(
    'SELECT status, COUNT(*)::int as count FROM clients GROUP BY status'
  ).all<any>();

  const approvalStats = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN client_approved = 1 THEN 1 ELSE 0 END),0)::int as approved,
      COALESCE(SUM(CASE WHEN client_approved = -1 THEN 1 ELSE 0 END),0)::int as rejected,
      COALESCE(SUM(CASE WHEN client_approved = 0 THEN 1 ELSE 0 END),0)::int as pending,
      COUNT(*)::int as total
    FROM ads WHERE validation_status = 'approved'
  `).get<any>();

  const activeClients = await db.prepare(
    "SELECT COUNT(*)::int as cnt FROM clients WHERE status IN ('active', 'deployed', 'approved_by_client', 'campaign_ready')"
  ).get<any>();

  res.json({
    totals: {
      ...totals,
      avg_ctr: (totals?.total_impressions || 0) > 0
        ? ((totals.total_clicks / totals.total_impressions) * 100).toFixed(2)
        : '0',
    },
    revenue: {
      active_clients: activeClients?.cnt || 0,
      monthly_revenue_estimate: (activeClients?.cnt || 0) * 99,
      monthly_ad_spend_managed: (activeClients?.cnt || 0) * 200,
    },
    byIndustry, byCity, topCampaigns, topAds, statusBreakdown,
    approvalStats: {
      approved: approvalStats?.approved || 0,
      rejected: approvalStats?.rejected || 0,
      pending: approvalStats?.pending || 0,
      approval_rate: (approvalStats?.total || 0) > 0
        ? ((approvalStats.approved / approvalStats.total) * 100).toFixed(1)
        : '0',
    },
  });
});

router.get('/client/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const { id } = req.params;

  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get<any>(id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const campaign = await db.prepare('SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC LIMIT 1').get<any>(id);
  const ads = await db.prepare('SELECT * FROM ads WHERE client_id = ? ORDER BY clicks DESC').all<any>(id);
  const snapshots = await db.prepare('SELECT * FROM performance_snapshots WHERE client_id = ? ORDER BY date DESC LIMIT 30').all<any>(id);

  const totalImpressions = ads.reduce((s, a) => s + (a.impressions || 0), 0);
  const totalClicks = ads.reduce((s, a) => s + (a.clicks || 0), 0);
  const totalMessages = ads.reduce((s, a) => s + (a.messages || 0), 0);
  const totalSpend = ads.reduce((s, a) => s + (a.spend_usd || 0), 0);

  res.json({
    client: { id: client.id, business_name: client.business_name, industry: client.industry, city: client.city, status: client.status, created_at: client.created_at },
    campaign: campaign ? { id: campaign.id, status: campaign.status, meta_status: campaign.meta_status } : null,
    metrics: {
      impressions: totalImpressions, clicks: totalClicks, messages: totalMessages, spend: totalSpend,
      ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0',
      cost_per_message: totalMessages > 0 ? (totalSpend / totalMessages).toFixed(2) : '—',
      cost_per_click: totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : '—',
    },
    ads: ads.map(a => ({
      headline: a.headline, impressions: a.impressions, clicks: a.clicks, messages: a.messages, spend: a.spend_usd,
      ctr: a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(2) : '0',
      client_approved: a.client_approved,
    })),
    dailySnapshots: snapshots,
  });
});

export default router;
