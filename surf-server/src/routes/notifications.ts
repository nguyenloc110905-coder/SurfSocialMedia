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

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Danh sách thông báo (cursor pagination)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: cursor
 *         schema: { type: integer }
 *         description: Unix ms từ nextCursor của trang trước
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items: { type: array, items: { type: object } }
 *                 nextCursor: { type: integer, nullable: true }
 */
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

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Số thông báo chưa đọc
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 */
router.get('/unread-count', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const count = await getUnreadNotificationCount(uid);
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Đánh dấu 1 thông báo đã đọc
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Không tìm thấy }
 *       403: { description: Không có quyền }
 */
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

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Đánh dấu tất cả đã đọc
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 updated: { type: integer }
 *                 count: { type: integer }
 */
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
