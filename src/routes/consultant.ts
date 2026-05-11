// DEPRECATED — Consultant moved to /api/public/consultant (token auth)
// This shim keeps backward compat for legacy /api/consultant/:clientId calls,
// but requires admin auth so it doesn't leak. New code should use /api/public.
import { Router } from 'express';
import { consultAgent } from '../agents/consultant';
import { requireAuth } from './auth';

const router = Router();
router.use(requireAuth);

router.post('/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { question } = req.body;
    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({ error: 'Pregunta inválida' });
    }
    const response = await consultAgent({ clientId, question: question.trim() });
    res.json({ success: true, ...response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
