import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { deployToMeta } from '../services/meta-deployer';
import { updateCampaignStatus, getCampaignInsights } from '../services/meta-ads';
import { sendCampaignActiveEmail } from '../services/email';
import { sendCampaignActiveWhatsApp } from '../services/whatsapp';

const router = Router();

// Deploy a campaign to Meta Ads (creates campaign + adset + ads in PAUSED state)
router.post('/:campaignId/deploy', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const db = getDb();

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as any;
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.meta_campaign_id) {
      return res.status(400).json({ error: 'Campaign already deployed to Meta', metaCampaignId: campaign.meta_campaign_id });
    }

    if (campaign.status !== 'ready') {
      return res.status(400).json({ error: `Campaign is not ready (status: ${campaign.status})` });
    }

    const result = await deployToMeta(campaignId);

    res.json({
      success: true,
      metaCampaignId: result.metaCampaignId,
      metaAdSetId: result.metaAdSetId,
      adsCreated: result.metaAdIds.length,
      status: 'PAUSED',
    });
  } catch (err: any) {
    console.error('[Meta Deploy Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Activate a deployed campaign
router.post('/:campaignId/activate', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const db = getDb();

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as any;
    if (!campaign?.meta_campaign_id) {
      return res.status(400).json({ error: 'Campaign not deployed to Meta yet' });
    }

    await updateCampaignStatus(campaign.meta_campaign_id, 'ACTIVE');

    db.prepare(
      "UPDATE campaigns SET meta_status = 'ACTIVE', updated_at = datetime('now') WHERE id = ?"
    ).run(campaignId);

    db.prepare(
      "UPDATE clients SET status = 'active', updated_at = datetime('now') WHERE id = ?"
    ).run(campaign.client_id);

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(campaign.client_id) as any;
    if (client) {
      sendCampaignActiveEmail({
        contact_name: client.contact_name,
        contact_email: client.contact_email,
        business_name: client.business_name,
        id: client.id,
      }).catch(() => {});
      sendCampaignActiveWhatsApp({
        contact_name: client.contact_name,
        contact_phone: client.contact_phone || '',
        business_name: client.business_name,
      }).catch(() => {});
    }

    res.json({ success: true, status: 'ACTIVE' });
  } catch (err: any) {
    console.error('[Meta Activate Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Pause a campaign
router.post('/:campaignId/pause', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const db = getDb();

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as any;
    if (!campaign?.meta_campaign_id) {
      return res.status(400).json({ error: 'Campaign not deployed to Meta yet' });
    }

    await updateCampaignStatus(campaign.meta_campaign_id, 'PAUSED');

    db.prepare(
      "UPDATE campaigns SET meta_status = 'PAUSED', updated_at = datetime('now') WHERE id = ?"
    ).run(campaignId);

    res.json({ success: true, status: 'PAUSED' });
  } catch (err: any) {
    console.error('[Meta Pause Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Get campaign insights from Meta
router.get('/:campaignId/insights', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const db = getDb();

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as any;
    if (!campaign?.meta_campaign_id) {
      return res.status(400).json({ error: 'Campaign not deployed to Meta yet' });
    }

    const insights = await getCampaignInsights(campaign.meta_campaign_id);

    res.json({ success: true, insights: insights.data || [] });
  } catch (err: any) {
    console.error('[Meta Insights Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
