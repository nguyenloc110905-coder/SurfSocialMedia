import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { sendSupportContactEmail } from '../services/email.js';

const router = Router();

type SupportContactBody = {
  category?: unknown;
  subject?: unknown;
  message?: unknown;
};

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/**
 * @swagger
 * /api/support/contact:
 *   post:
 *     tags: [Support]
 *     summary: Gửi form liên hệ hỗ trợ qua email
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subject, message]
 *             properties:
 *               category: { type: string }
 *               subject: { type: string }
 *               message: { type: string }
 *     responses:
 *       200: { description: Đã gửi liên hệ }
 */
router.post('/contact', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as SupportContactBody;
    const category = cleanText(body.category, 80) || 'general';
    const subject = cleanText(body.subject, 160);
    const message = cleanText(body.message, 4000);

    if (subject.length < 3 || message.length < 10) {
      res.status(400).json({ error: 'Subject and message are required' });
      return;
    }

    const db = getDb();
    const userDoc = await db.collection('users').doc(req.uid!).get();
    const user = userDoc.data() ?? {};
    const displayName =
      typeof user.displayName === 'string' && user.displayName.trim()
        ? user.displayName.trim()
        : 'Surf user';
    const email = typeof user.email === 'string' ? user.email : '';

    const supportRef = await db.collection('support_messages').add({
      uid: req.uid,
      displayName,
      email,
      category,
      subject,
      message,
      status: 'new',
      createdAt: new Date(),
    });

    await sendSupportContactEmail({
      uid: req.uid!,
      displayName,
      email,
      category,
      subject,
      message,
      supportMessageId: supportRef.id,
    });

    res.json({ success: true, id: supportRef.id });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
