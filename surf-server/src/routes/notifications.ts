import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';

const router = Router();
const db = () => getDb();

/** GET /api/notifications — lấy thông báo (mới nhất trước) */
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const limitNum = Math.min(parseInt(req.query.limit as string) || 30, 50);
    const snap = await db()
      .collection('notifications')
      .where('toUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(limitNum)
      .get();
    const notifications = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ notifications });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/notifications/unread-count — đếm số chưa đọc */
router.get('/unread-count', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const snap = await db()
      .collection('notifications')
      .where('toUid', '==', uid)
      .where('read', '==', false)
      .get();
    res.json({ count: snap.size });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PATCH /api/notifications/read-all — đánh dấu tất cả đã đọc */
router.patch('/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const snap = await db()
      .collection('notifications')
      .where('toUid', '==', uid)
      .where('read', '==', false)
      .get();
    const batch = db().batch();
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
    res.json({ updated: snap.size });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PATCH /api/notifications/:id/read — đánh dấu 1 thông báo đã đọc */
router.patch('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const ref = db().collection('notifications').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.toUid !== uid) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await ref.update({ read: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
