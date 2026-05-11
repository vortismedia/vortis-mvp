import { Router } from 'express';
import { getDb } from '../db/database';
import { deployToMeta } from '../services/meta-deployer';
import { updateCampaignStatus, getCampaignInsights } from '../services/meta-ads';
import { sendCampaignActiveEmail } from '../services/email';
import { sendCampaignActiveWhatsApp } from '../services/whatsapp';
import { requireAuth } from './auth';

const router = Router();
router.use(requireAuth);

router.post('/:campaignId/deploy', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const db = getDb();

    const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get<any>(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.meta_campaign_id) return res.status(400).json({ error: 'Campaign already deployed', metaCampaignId: campaign.meta_campaign_id });
    if (campaign.status !== 'ready') return res.status(400).json({ error: `Campaign is not ready (status: ${campaign.status})` });

    const result = await deployToMeta(campaignId);
    res.json({ success: true, metaCampaignId: result.metaCampaignId, metaAdSetId: result.metaAdSetId, adsCreated: result.metaAdIds.length, status: 'PAUSED' });
  } catch (err: any) {
    console.error('[Meta Deploy Error]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:campaignId/activate', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const db = getDb();

    const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get<any>(campaignId);
    if (!campaign?.meta_campaign_id) return res.status(400).json({ error: 'Campaign not deployed to Meta yet' });

    await updateCampaignStatus(campaign.meta_campaign_id, 'ACTIVE');
    await db.prepare("UPDATE campaigns SET meta_status = 'ACTIVE', updated_at = NOW() WHERE id = ?").run(campaignId);
    await db.prepare("UPDATE clients SET status = 'active', updated_at = NOW() WHERE id = ?").run(campaign.client_id);

    const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get<any>(campaign.client_id);
    if (client) {
      sendCampaignActiveEmail({ contact_name: client.contact_name, contact_email: client.contact_email, business_name: client.business_name, id: client.id, access_token: client.access_token }).catch(() => {});
      sendCampaignActiveWhatsApp({ contact_name: client.contact_name, contact_phone: client.contact_phone || '', business_name: client.business_name }).catch(() => {});
    }

    res.json({ success: true, status: 'ACTIVE' });
  } catch (err: any) {
    console.error('[Meta Activate Error]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:campaignId/pause', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const db = getDb();
    const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get<any>(campaignId);
    if (!campaign?.meta_campaign_id) return res.status(400).json({ error: 'Campaign not deployed to Meta yet' });

    await updateCampaignStatus(campaign.meta_campaign_id, 'PAUSED');
    await db.prepare("UPDATE campaigns SET meta_status = 'PAUSED', updated_at = NOW() WHERE id = ?").run(campaignId);
    res.json({ success: true, status: 'PAUSED' });
  } catch (err: any) {
    console.error('[Meta Pause Error]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:campaignId/insights', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const db = getDb();
    const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get<any>(campaignId);
    if (!campaign?.meta_campaign_id) return res.status(400).json({ error: 'Campaign not deployed to Meta yet' });

    const insights = await getCampaignInsights(campaign.meta_campaign_id);
    res.json({ success: true, insights: insights.data || [] });
  } catch (err: any) {
    console.error('[Meta Insights Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
