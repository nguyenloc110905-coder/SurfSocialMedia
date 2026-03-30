import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { io } from '../index.js';
import { getDb } from '../config/firebase-admin.js';
import { createNotification, getUnreadNotificationCount, toApiNotification } from '../services/notifications.js';
import { createGroup, joinGroup, listDiscoverGroups, toApiGroup } from '../services/groups.js';

const router = Router();

const parseIntSafe = (value: unknown, fallback: number): number => {
  if (typeof value !== 'string') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const ownerId = req.uid!;
    const { name, description, coverImageUrl, category, privacy } = req.body as {
      name?: string;
      description?: string;
      coverImageUrl?: string;
      category?: string;
      privacy?: 'public' | 'private';
    };

    const result = await createGroup({
      ownerId,
      name: name ?? '',
      description,
      coverImageUrl,
      category,
      privacy: privacy ?? 'public',
    });

    if (!result.ok) {
      if (result.reason === 'invalid_name') {
        res.status(400).json({ error: 'Group name is required' });
        return;
      }

      res.status(400).json({ error: 'Group privacy is invalid' });
      return;
    }

    res.status(201).json({ item: toApiGroup(result.item) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const limit = Math.min(parseIntSafe(req.query.limit, 20), 50);

    const items = await listDiscoverGroups(uid, q, category, limit);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/join', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const result = await joinGroup(uid, req.params.id);

    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Group not found' });
        return;
      }
      if (result.reason === 'already_member') {
        res.status(409).json({ error: 'Already a member of this group' });
        return;
      }

      res.status(409).json({ error: 'Join request is already pending' });
      return;
    }

    const actorDoc = await getDb().collection('users').doc(uid).get();
    const actorName = actorDoc.data()?.displayName ?? 'Unknown';
    const adminIds = result.adminIds.filter((adminId) => adminId !== uid);

    await Promise.all(
      adminIds.map(async (adminId) => {
        const notification = await createNotification({
          userId: adminId,
          type: 'system',
          actorId: uid,
          entityType: 'group',
          entityId: result.item.id,
          message:
            result.status === 'pending'
              ? `${actorName} đã yêu cầu tham gia nhóm ${result.item.name}.`
              : `${actorName} đã tham gia nhóm ${result.item.name}.`,
        });

        const unreadCount = await getUnreadNotificationCount(adminId);
        io.to(`user:${adminId}`).emit('notification:new', toApiNotification(notification));
        io.to(`user:${adminId}`).emit('notification:unread-count', { count: unreadCount });
      })
    );

    res.status(result.status === 'joined' ? 200 : 202).json({
      status: result.status,
      item: toApiGroup(result.item),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
