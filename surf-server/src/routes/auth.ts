import { Router } from 'express';
import { randomInt } from 'crypto';
import { logger } from '../config/logger.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { sendLoginNotification, sendWelcomeEmail, sendOtpEmail } from '../services/email.js';
import { getAuth } from '../config/firebase-admin.js';
import { setOtp, verifyAndConsumeOtp } from '../utils/otp-store.js';

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
      logger.error('❌ Gửi email login thất bại:', { stack: err instanceof Error ? err.stack : String(err) })
    );
    res.json({ sent: true });
  } catch (e) {
    logger.error('❌ notify-login error:', { stack: e instanceof Error ? e.stack : String(e) });
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
      logger.error('❌ Gửi email welcome thất bại:', { stack: err instanceof Error ? err.stack : String(err) })
    );
    res.json({ sent: true });
  } catch (e) {
    logger.error('❌ notify-register error:', { stack: e instanceof Error ? e.stack : String(e) });
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/auth/send-otp — Tạo & gửi mã OTP xác nhận đổi mật khẩu / đổi email */
router.post('/send-otp', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { purpose, newPassword, newEmail } = req.body as {
      purpose?: string;
      newPassword?: string;
      newEmail?: string;
    };

    if (purpose !== 'change-password' && purpose !== 'change-email') {
      res.status(400).json({ error: 'purpose không hợp lệ.' });
      return;
    }
    if (purpose === 'change-password' && (!newPassword || String(newPassword).length < 6)) {
      res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
      return;
    }
    if (purpose === 'change-email' && !newEmail) {
      res.status(400).json({ error: 'Email mới không được để trống.' });
      return;
    }

    const fbUser = await getAuth().getUser(req.uid!);
    if (!fbUser.email) {
      res.status(400).json({ error: 'Tài khoản chưa có email.' });
      return;
    }

    const code = randomInt(100000, 1000000).toString();
    const payload: Record<string, string> = {};
    if (purpose === 'change-password') payload.newPassword = String(newPassword);
    if (purpose === 'change-email') payload.newEmail = String(newEmail);

    setOtp(req.uid!, purpose, code, payload);

    const name = fbUser.displayName ?? fbUser.email.split('@')[0];
    await sendOtpEmail(fbUser.email, name, code, purpose as 'change-password' | 'change-email');

    res.json({ sent: true });
  } catch (e) {
    logger.error('❌ send-otp error:', { stack: e instanceof Error ? e.stack : String(e) });
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/auth/verify-otp — Xác minh OTP và áp dụng thay đổi */
router.post('/verify-otp', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { purpose, code } = req.body as { purpose?: string; code?: string };
    if (!purpose || !code) {
      res.status(400).json({ error: 'Thiếu thông tin.' });
      return;
    }

    const payload = verifyAndConsumeOtp(req.uid!, purpose, String(code).trim());
    if (!payload) {
      res.status(400).json({ error: 'Mã không đúng hoặc đã hết hạn.' });
      return;
    }

    if (purpose === 'change-password') {
      await getAuth().updateUser(req.uid!, { password: payload.newPassword });
    } else if (purpose === 'change-email') {
      await getAuth().updateUser(req.uid!, { email: payload.newEmail });
    }

    res.json({ success: true });
  } catch (e) {
    logger.error('❌ verify-otp error:', { stack: e instanceof Error ? e.stack : String(e) });
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/auth/change-password — Đổi mật khẩu (đã xác thực phía client) */
router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword || String(newPassword).length < 6) {
      res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự.' });
      return;
    }
    await getAuth().updateUser(req.uid!, { password: String(newPassword) });
    res.json({ success: true });
  } catch (e) {
    logger.error('❌ change-password error:', { stack: e instanceof Error ? e.stack : String(e) });
    res.status(500).json({ error: (e as Error).message });
  }
});

/** DELETE /api/auth/account — Xóa tài khoản (đã xác thực phía client) */
router.delete('/account', requireAuth, async (req: AuthRequest, res) => {
  try {
    await getAuth().deleteUser(req.uid!);
    res.json({ success: true });
  } catch (e) {
    logger.error('❌ delete-account error:', { stack: e instanceof Error ? e.stack : String(e) });
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
