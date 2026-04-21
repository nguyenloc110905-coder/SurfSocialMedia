import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';

const router = Router();

const parseIntSafe = (value: unknown, fallback: number): number => {
  if (typeof value !== 'string') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

type RawNotif = Record<string, unknown> & {
  createdAt?: { seconds?: number; _seconds?: number };
};

// GET /api/notifications — trả về thông báo của người dùng hiện tại
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const limit = Math.min(parseIntSafe(req.query.limit, 30), 100);
    // All inline notifications are stored with recipientId (comments, posts, reactions, mentions)
    const snap = await getDb()
      .collection('notifications')
      .where('recipientId', '==', uid)
      .get();
    const notifications = (snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as RawNotif[])
      .sort((a, b) => {
        const aT = a.createdAt?.seconds ?? a.createdAt?._seconds ?? 0;
        const bT = b.createdAt?.seconds ?? b.createdAt?._seconds ?? 0;
        return bT - aT;
      })
      .slice(0, limit);
    res.json({ notifications });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const snap = await getDb().collection('notifications').where('recipientId', '==', uid).get();
    const count = snap.docs.filter((doc) => !doc.data().read).length;
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    if (req.params.id.startsWith('fr-')) {
      res.json({ ok: true });
      return;
    }
    const ref = getDb().collection('notifications').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    if (doc.data()?.recipientId !== uid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await ref.update({ read: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const snap = await getDb()
      .collection('notifications')
      .where('recipientId', '==', uid)
      .get();
    const db = getDb();
    const batch = db.batch();
    let updated = 0;
    snap.docs.forEach((doc) => {
      if (!doc.data().read) {
        batch.update(doc.ref, { read: true });
        updated++;
      }
    });
    if (updated > 0) await batch.commit();
    res.json({ ok: true, updated });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
