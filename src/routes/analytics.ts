import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

// GET /api/analytics - Global analytics for Vortis admin
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();

  // Overall metrics
  const totals = db.prepare(`
    SELECT
      COUNT(DISTINCT client_id) as total_clients,
      SUM(impressions) as total_impressions,
      SUM(clicks) as total_clicks,
      SUM(messages) as total_messages,
      SUM(spend_usd) as total_spend
    FROM ads
  `).get() as any;

  // By industry
  const byIndustry = db.prepare(`
    SELECT
      c.industry,
      COUNT(DISTINCT c.id) as clients,
      SUM(a.impressions) as impressions,
      SUM(a.clicks) as clicks,
      SUM(a.messages) as messages,
      SUM(a.spend_usd) as spend,
      CASE WHEN SUM(a.impressions) > 0
        THEN ROUND(CAST(SUM(a.clicks) AS REAL) / SUM(a.impressions) * 100, 2)
        ELSE 0 END as ctr,
      CASE WHEN SUM(a.messages) > 0
        THEN ROUND(SUM(a.spend_usd) / SUM(a.messages), 2)
        ELSE 0 END as cost_per_message
    FROM clients c
    LEFT JOIN ads a ON a.client_id = c.id
    GROUP BY c.industry
    ORDER BY clients DESC
  `).all() as any[];

  // By city
  const byCity = db.prepare(`
    SELECT
      c.city,
      COUNT(DISTINCT c.id) as clients,
      SUM(a.impressions) as impressions,
      SUM(a.clicks) as clicks,
      SUM(a.messages) as messages,
      SUM(a.spend_usd) as spend
    FROM clients c
    LEFT JOIN ads a ON a.client_id = c.id
    GROUP BY c.city
    ORDER BY clients DESC
    LIMIT 10
  `).all() as any[];

  // Campaign performance ranking
  const topCampaigns = db.prepare(`
    SELECT
      c.business_name,
      c.industry,
      c.city,
      camp.status as campaign_status,
      camp.meta_status,
      SUM(a.impressions) as impressions,
      SUM(a.clicks) as clicks,
      SUM(a.messages) as messages,
      SUM(a.spend_usd) as spend,
      CASE WHEN SUM(a.impressions) > 0
        THEN ROUND(CAST(SUM(a.clicks) AS REAL) / SUM(a.impressions) * 100, 2)
        ELSE 0 END as ctr,
      CASE WHEN SUM(a.messages) > 0
        THEN ROUND(SUM(a.spend_usd) / SUM(a.messages), 2)
        ELSE 0 END as cost_per_message
    FROM clients c
    JOIN campaigns camp ON camp.client_id = c.id
    LEFT JOIN ads a ON a.campaign_id = camp.id
    GROUP BY camp.id
    ORDER BY messages DESC
    LIMIT 20
  `).all() as any[];

  // Best performing ad copies
  const topAds = db.prepare(`
    SELECT
      a.headline,
      a.description,
      a.cta_text,
      c.industry,
      c.business_name,
      a.impressions,
      a.clicks,
      a.messages,
      a.spend_usd,
      CASE WHEN a.impressions > 0
        THEN ROUND(CAST(a.clicks AS REAL) / a.impressions * 100, 2)
        ELSE 0 END as ctr
    FROM ads a
    JOIN clients c ON c.id = a.client_id
    WHERE a.validation_status = 'approved'
    ORDER BY a.clicks DESC
    LIMIT 10
  `).all() as any[];

  // Status breakdown
  const statusBreakdown = db.prepare(`
    SELECT status, COUNT(*) as count FROM clients GROUP BY status
  `).all() as any[];

  // Approval stats
  const approvalStats = db.prepare(`
    SELECT
      SUM(CASE WHEN client_approved = 1 THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN client_approved = -1 THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN client_approved = 0 THEN 1 ELSE 0 END) as pending,
      COUNT(*) as total
    FROM ads WHERE validation_status = 'approved'
  `).get() as any;

  // Revenue estimate
  const activeClients = db.prepare(
    "SELECT COUNT(*) as cnt FROM clients WHERE status IN ('active', 'deployed', 'approved_by_client', 'campaign_ready')"
  ).get() as any;

  res.json({
    totals: {
      ...totals,
      total_impressions: totals.total_impressions || 0,
      total_clicks: totals.total_clicks || 0,
      total_messages: totals.total_messages || 0,
      total_spend: totals.total_spend || 0,
      avg_ctr: totals.total_impressions > 0
        ? ((totals.total_clicks / totals.total_impressions) * 100).toFixed(2)
        : '0',
    },
    revenue: {
      active_clients: activeClients.cnt,
      monthly_revenue_estimate: activeClients.cnt * 99,
      monthly_ad_spend_managed: activeClients.cnt * 200,
    },
    byIndustry,
    byCity,
    topCampaigns,
    topAds,
    statusBreakdown,
    approvalStats: {
      approved: approvalStats?.approved || 0,
      rejected: approvalStats?.rejected || 0,
      pending: approvalStats?.pending || 0,
      approval_rate: approvalStats?.total > 0
        ? ((approvalStats.approved / approvalStats.total) * 100).toFixed(1)
        : '0',
    },
  });
});

// GET /api/analytics/client/:id - Detailed analytics for one client
router.get('/client/:id', (req: Request, res: Response) => {
  const db = getDb();
  const { id } = req.params;

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any;
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const campaign = db.prepare(
    'SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(id) as any;

  const ads = db.prepare('SELECT * FROM ads WHERE client_id = ? ORDER BY clicks DESC').all(id) as any[];

  const snapshots = db.prepare(
    'SELECT * FROM performance_snapshots WHERE client_id = ? ORDER BY date DESC LIMIT 30'
  ).all(id) as any[];

  const totalImpressions = ads.reduce((s: number, a: any) => s + (a.impressions || 0), 0);
  const totalClicks = ads.reduce((s: number, a: any) => s + (a.clicks || 0), 0);
  const totalMessages = ads.reduce((s: number, a: any) => s + (a.messages || 0), 0);
  const totalSpend = ads.reduce((s: number, a: any) => s + (a.spend_usd || 0), 0);

  res.json({
    client: {
      id: client.id,
      business_name: client.business_name,
      industry: client.industry,
      city: client.city,
      status: client.status,
      created_at: client.created_at,
    },
    campaign: campaign ? {
      id: campaign.id,
      status: campaign.status,
      meta_status: campaign.meta_status,
    } : null,
    metrics: {
      impressions: totalImpressions,
      clicks: totalClicks,
      messages: totalMessages,
      spend: totalSpend,
      ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0',
      cost_per_message: totalMessages > 0 ? (totalSpend / totalMessages).toFixed(2) : '—',
      cost_per_click: totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : '—',
    },
    ads: ads.map(a => ({
      headline: a.headline,
      impressions: a.impressions,
      clicks: a.clicks,
      messages: a.messages,
      spend: a.spend_usd,
      ctr: a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(2) : '0',
      client_approved: a.client_approved,
    })),
    dailySnapshots: snapshots,
  });
});

export default router;
