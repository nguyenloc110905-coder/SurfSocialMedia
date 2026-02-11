import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/me', requireAuth, (req: AuthRequest, res) => {
  res.json({ uid: req.uid });
});

export default router;
