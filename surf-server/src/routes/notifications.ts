import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';

const router = Router();

// GET /api/notifications — fetch current user's notifications, newest first
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    // No orderBy to avoid requiring a composite index; sort in memory
    const snap = await db
      .collection('notifications')
      .where('recipientId', '==', req.uid)
      .limit(100)
      .get();

    type NotifDoc = { id: string; createdAt?: { _seconds?: number; seconds?: number } | string };
    const notifications = (snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as NotifDoc[])
      .sort((a, b) => {
        const ts = (n: NotifDoc) => {
          const c = n.createdAt;
          if (!c) return 0;
          if (typeof c === 'string') return new Date(c).getTime();
          return ((c._seconds ?? c.seconds ?? 0) * 1000);
        };
        return ts(b) - ts(a);
      })
      .slice(0, 50);

    res.json({ notifications });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// PATCH /api/notifications/:id/read — mark single notification as read
router.patch('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('notifications').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.recipientId !== req.uid) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await ref.update({ read: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// PATCH /api/notifications/read-all — mark all notifications as read
router.patch('/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    // Fetch all recipient's notifications, filter unread in memory (avoids composite index)
    const snap = await db
      .collection('notifications')
      .where('recipientId', '==', req.uid)
      .limit(200)
      .get();
    const unread = snap.docs.filter((d) => d.data().read === false);
    if (unread.length > 0) {
      const batch = db.batch();
      unread.forEach((doc) => batch.update(doc.ref, { read: true }));
      await batch.commit();
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
