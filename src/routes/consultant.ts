import { Router, Request, Response } from 'express';
import { consultAgent } from '../agents/consultant';

const router = Router();

router.post('/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { question } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({ error: 'Enviá una pregunta válida' });
    }

    const response = await consultAgent({ clientId: clientId as string, question: (question as string).trim() });

    res.json({ success: true, ...response });
  } catch (err: any) {
    console.error('[Consultant Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
