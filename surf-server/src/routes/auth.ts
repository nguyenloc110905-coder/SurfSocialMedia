import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { sendLoginNotification, sendWelcomeEmail } from '../services/email.js';
import { getAuth } from '../config/firebase-admin.js';

const router = Router();

router.get('/me', requireAuth, (req: AuthRequest, res) => {
  res.json({ uid: req.uid });
});

/** POST /api/auth/notify-login — Gửi email thông báo đăng nhập */
router.post('/notify-login', requireAuth, async (req: AuthRequest, res) => {
  try {
    const fbUser = await getAuth().getUser(req.uid!);
    if (!fbUser.email) {
      res.json({ sent: false, reason: 'no-email' });
      return;
    }
    const name = fbUser.displayName ?? fbUser.email.split('@')[0];
    // Gửi email bất đồng bộ, không chặn response
    sendLoginNotification(fbUser.email, name).catch((err) =>
      console.error('❌ Gửi email login thất bại:', err.message)
    );
    res.json({ sent: true });
  } catch (e) {
    console.error('❌ notify-login error:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/auth/notify-register — Gửi email chào mừng đăng ký */
router.post('/notify-register', requireAuth, async (req: AuthRequest, res) => {
  try {
    const fbUser = await getAuth().getUser(req.uid!);
    if (!fbUser.email) {
      res.json({ sent: false, reason: 'no-email' });
      return;
    }
    const name = fbUser.displayName ?? fbUser.email.split('@')[0];
    sendWelcomeEmail(fbUser.email, name).catch((err) =>
      console.error('❌ Gửi email welcome thất bại:', err.message)
    );
    res.json({ sent: true });
  } catch (e) {
    console.error('❌ notify-register error:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
