import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

// GET /api/approval/:clientId - Get ads pending approval for a client
router.get('/:clientId', (req: Request, res: Response) => {
  const db = getDb();
  const { clientId } = req.params;

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as any;
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const ads = db.prepare(
    "SELECT * FROM ads WHERE client_id = ? AND validation_status = 'approved' ORDER BY created_at"
  ).all(clientId) as any[];

  const pendingApproval = ads.filter(a => !a.client_approved);
  const approved = ads.filter(a => a.client_approved === 1);
  const rejected = ads.filter(a => a.client_approved === -1);

  res.json({
    client: { id: client.id, business_name: client.business_name },
    summary: {
      total: ads.length,
      pending: pendingApproval.length,
      approved: approved.length,
      rejected: rejected.length,
    },
    ads: ads.map(ad => ({
      id: ad.id,
      headline: ad.headline,
      description: ad.description,
      cta_text: ad.cta_text,
      format: ad.format || 'feed',
      client_approved: ad.client_approved,
      client_feedback: ad.client_feedback,
      approved_at: ad.approved_at,
    })),
  });
});

// POST /api/approval/:clientId/approve - Client approves an ad
router.post('/:clientId/approve', (req: Request, res: Response) => {
  const db = getDb();
  const { clientId } = req.params;
  const { adId, feedback } = req.body;

  if (!adId) return res.status(400).json({ error: 'adId es requerido' });

  const ad = db.prepare('SELECT * FROM ads WHERE id = ? AND client_id = ?').get(adId, clientId) as any;
  if (!ad) return res.status(404).json({ error: 'Anuncio no encontrado' });

  db.prepare(
    `UPDATE ads SET client_approved = 1, client_feedback = ?, approved_at = datetime('now') WHERE id = ?`
  ).run(feedback || null, adId);

  // Check if all ads are now approved
  const pendingCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM ads WHERE client_id = ? AND validation_status = 'approved' AND client_approved = 0"
  ).get(clientId) as any;

  if (pendingCount.cnt === 0) {
    db.prepare(
      "UPDATE clients SET status = 'approved_by_client', updated_at = datetime('now') WHERE id = ?"
    ).run(clientId);
  }

  res.json({ success: true, message: 'Anuncio aprobado' });
});

// POST /api/approval/:clientId/reject - Client rejects an ad with feedback
router.post('/:clientId/reject', (req: Request, res: Response) => {
  const db = getDb();
  const { clientId } = req.params;
  const { adId, feedback } = req.body;

  if (!adId) return res.status(400).json({ error: 'adId es requerido' });
  if (!feedback) return res.status(400).json({ error: 'Feedback es requerido al rechazar un anuncio' });

  const ad = db.prepare('SELECT * FROM ads WHERE id = ? AND client_id = ?').get(adId, clientId) as any;
  if (!ad) return res.status(404).json({ error: 'Anuncio no encontrado' });

  db.prepare(
    `UPDATE ads SET client_approved = -1, client_feedback = ?, approved_at = datetime('now') WHERE id = ?`
  ).run(feedback, adId);

  res.json({ success: true, message: 'Anuncio rechazado. Tomaremos el feedback para ajustarlo.' });
});

// POST /api/approval/:clientId/approve-all - Client approves all pending ads
router.post('/:clientId/approve-all', (req: Request, res: Response) => {
  const db = getDb();
  const { clientId } = req.params;

  const result = db.prepare(
    `UPDATE ads SET client_approved = 1, approved_at = datetime('now')
     WHERE client_id = ? AND validation_status = 'approved' AND client_approved = 0`
  ).run(clientId);

  db.prepare(
    "UPDATE clients SET status = 'approved_by_client', updated_at = datetime('now') WHERE id = ?"
  ).run(clientId);

  res.json({
    success: true,
    message: `${result.changes} anuncios aprobados`,
    adsApproved: result.changes,
  });
});

export default router;
