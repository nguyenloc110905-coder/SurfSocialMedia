import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  toApiNotification,
} from '../services/notifications.js';
import {
  emitNotificationRead,
  emitNotificationReadAll,
  emitNotificationUnreadCount,
} from '../realtime/emitters/notification.emitter.js';

const router = Router();

const parseIntSafe = (value: unknown, fallback: number): number => {
  if (typeof value !== 'string') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const limit = Math.min(parseIntSafe(req.query.limit, 20), 50);
    const cursorMs = parseIntSafe(req.query.cursor, 0) || undefined;

    const items = await listNotifications({ userId: uid, limit, cursorMs });
    const nextCursor = items.length === limit ? items[items.length - 1].createdAt.getTime() : null;

    res.json({
      items: items.map(toApiNotification),
      nextCursor,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/unread-count', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const count = await getUnreadNotificationCount(uid);
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const result = await markNotificationRead(uid, req.params.id);
    if (!result.ok && result.reason === 'not_found') {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    if (!result.ok && result.reason === 'forbidden') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const count = await getUnreadNotificationCount(uid);
    emitNotificationRead(uid, req.params.id);
    emitNotificationUnreadCount(uid, count);

    res.json({ ok: true, count });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const ids = await markAllNotificationsRead(uid);
    const count = await getUnreadNotificationCount(uid);
    emitNotificationReadAll(uid, ids);
    emitNotificationUnreadCount(uid, count);
    res.json({ ok: true, updated: ids.length, count });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
