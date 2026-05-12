// Admin maintenance endpoints
import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { requireAuth } from './auth';

const router = Router();
router.use(requireAuth);

// DELETE /api/admin/wipe-all-clients - DANGEROUS: deletes all clients + related data
router.delete('/wipe-all-clients', async (_req: Request, res: Response) => {
  const db = getDb();
  try {
    // Order matters due to foreign keys
    await db.prepare('DELETE FROM ads').run();
    await db.prepare('DELETE FROM ad_sets').run();
    await db.prepare('DELETE FROM agent_logs').run();
    await db.prepare('DELETE FROM performance_snapshots').run();
    await db.prepare('DELETE FROM creative_briefs').run();
    await db.prepare('DELETE FROM client_assets').run();
    await db.prepare('DELETE FROM campaigns').run();
    const r = await db.prepare('DELETE FROM clients').run();
    res.json({ success: true, deleted: r.changes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/clients/:id - delete one client + related data
router.delete('/clients/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const { id } = req.params;
  try {
    await db.prepare('DELETE FROM ads WHERE client_id = ?').run(id);
    await db.prepare('DELETE FROM ad_sets WHERE client_id = ?').run(id);
    await db.prepare('DELETE FROM agent_logs WHERE client_id = ?').run(id);
    await db.prepare('DELETE FROM performance_snapshots WHERE client_id = ?').run(id);
    await db.prepare('DELETE FROM creative_briefs WHERE client_id = ?').run(id);
    await db.prepare('DELETE FROM client_assets WHERE client_id = ?').run(id);
    await db.prepare('DELETE FROM campaigns WHERE client_id = ?').run(id);
    const r = await db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    res.json({ success: true, deleted: r.changes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
