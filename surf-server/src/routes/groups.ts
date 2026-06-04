import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { createNotification, getUnreadNotificationCount, toApiNotification } from '../services/notifications.js';
import { createGroup, joinGroup, listDiscoverGroups, listUserGroups, toApiGroup, getGroupDetails, getGroupMembers, getGroupPendingRequests, handleJoinRequest, updateMemberRoleOrRemove } from '../services/groups.js';
import { moderatePost } from '../services/aiModeration.js';
import {
  emitNotificationNew,
  emitNotificationUnreadCount,
} from '../realtime/emitters/notification.emitter.js';

const router = Router();

const POST_TEXT_FONTS = new Set(['system', 'serif', 'rounded', 'bold', 'mono']);
const POST_TEXT_COLORS = new Set([
  '#0f172a',
  '#f8fafc',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]);

function normalizePostTextStyle(input: unknown): { font?: string; color?: string } | null {
  if (!input || typeof input !== 'object') return null;
  const style = input as { font?: unknown; color?: unknown };
  const normalized: { font?: string; color?: string } = {};
  if (typeof style.font === 'string' && POST_TEXT_FONTS.has(style.font) && style.font !== 'system') {
    normalized.font = style.font;
  }
  if (typeof style.color === 'string' && POST_TEXT_COLORS.has(style.color)) {
    normalized.color = style.color;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

const parseIntSafe = (value: unknown, fallback: number): number => {
  if (typeof value !== 'string') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * @swagger
 * /api/groups:
 *   post:
 *     tags: [Groups]
 *     summary: Tạo nhóm mới
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: 'Lập trình viên Việt Nam' }
 *               description: { type: string }
 *               coverImageUrl: { type: string }
 *               category: { type: string }
 *               privacy: { type: string, enum: [public, private], default: public }
 *     responses:
 *       201: { description: Tạo thành công, content: { application/json: { schema: { type: object, properties: { item: { $ref: '#/components/schemas/Group' } } } } } }
 *       400: { description: Tên không hợp lệ, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
 */
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

/**
 * @swagger
 * /api/groups:
 *   get:
 *     tags: [Groups]
 *     summary: Danh sách nhóm công khai (khám phá)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Từ khóa tìm tên nhóm
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *     responses:
 *       200:
 *         description: Danh sách nhóm
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Group' }
 */
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

/**
 * @swagger
 * /api/groups/{id}/join:
 *   post:
 *     tags: [Groups]
 *     summary: Tham gia nhóm (public = join ngay, private = gửi yêu cầu)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Đã join (public group) }
 *       202: { description: Yêu cầu đang chờ duyệt (private group) }
 *       404: { description: Không tìm thấy nhóm }
 *       409: { description: Đã là thành viên hoặc đã gửi yêu cầu }
 */
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

        if (notification) {
          const unreadCount = await getUnreadNotificationCount(adminId);
          emitNotificationNew(adminId, toApiNotification(notification));
          emitNotificationUnreadCount(adminId, unreadCount);
        }
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

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseIntSafe(req.query.limit, 20), 50);
    const items = await listUserGroups(req.uid!, limit);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await getGroupDetails(req.uid!, req.params.id);
    if (!result.ok) return res.status(404).json({ error: result.reason });
    res.json({ item: result.item });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = req.params.id;
    const { coverImageUrl } = req.body;
    
    const result = await getGroupDetails(req.uid!, groupId);
    if (!result.ok) return res.status(404).json({ error: result.reason });
    
    // Check if user is admin
    const isAdmin = result.item?.adminIds?.includes(req.uid!);
    if (!isAdmin) return res.status(403).json({ error: 'Chỉ quản trị viên mới được sửa nhóm' });

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (coverImageUrl !== undefined) updates.coverImageUrl = coverImageUrl;

    await getDb().collection('groups').doc(groupId).update(updates);
    res.json({ success: true, item: { ...result.item, ...updates } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:id/members', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await getGroupMembers(req.params.id, req.uid!);
    if (!result.ok) {
      if (result.reason === 'unauthorized') return res.status(403).json({ error: 'Unauthorized' });
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ items: result.members });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:id/requests', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await getGroupPendingRequests(req.params.id, req.uid!);
    if (!result.ok) {
      if (result.reason === 'unauthorized') return res.status(403).json({ error: 'Unauthorized' });
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ items: result.requests });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/requests/:userId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { action } = req.body; // 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

    const result = await handleJoinRequest(req.params.id, req.uid!, req.params.userId, action);
    if (!result.ok) {
      if (result.reason === 'unauthorized') return res.status(403).json({ error: 'Unauthorized' });
      return res.status(404).json({ error: 'Not found / action failed' });
    }

    if (action === 'approve') {
       const groupResult = await getGroupDetails(req.uid!, req.params.id);
       if (groupResult.ok) {
         const actorDoc = await getDb().collection('users').doc(req.uid!).get();
         const actorName = actorDoc.data()?.displayName ?? 'Admin';
         const notification = await createNotification({
           userId: req.params.userId,
           type: 'system',
           actorId: req.uid!,
           entityType: 'group',
           entityId: req.params.id,
           message: `Yêu cầu tham gia nhóm ${groupResult.item?.name} của bạn đã được phê duyệt bởi ${actorName}.`
         });
         if (notification) {
           const unreadCount = await getUnreadNotificationCount(req.params.userId);
           emitNotificationNew(req.params.userId, toApiNotification(notification));
           emitNotificationUnreadCount(req.params.userId, unreadCount);
         }
       }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.put('/:id/members/:userId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { action } = req.body; // 'make_admin' | 'remove_admin' | 'make_moderator' | 'remove_moderator'
    if (!['make_admin', 'remove_admin', 'make_moderator', 'remove_moderator'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const result = await updateMemberRoleOrRemove(req.params.id, req.uid!, req.params.userId, action);
    if (!result.ok) {
      if (result.reason === 'unauthorized') return res.status(403).json({ error: 'Unauthorized' });
      if (result.reason === 'cannot_remove_owner_admin') return res.status(400).json({ error: 'Bạn không thể hạ quyền người tạo nhóm' });
      return res.status(404).json({ error: 'Not found / action failed' });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/:id/members/:userId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await updateMemberRoleOrRemove(req.params.id, req.uid!, req.params.userId, 'remove');
    if (!result.ok) {
      if (result.reason === 'unauthorized') return res.status(403).json({ error: 'Unauthorized' });
      if (result.reason === 'cannot_remove_owner_admin') return res.status(400).json({ error: 'Bạn không thể xoá người tạo nhóm' });
      return res.status(404).json({ error: 'Not found / action failed' });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/invites', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = req.params.id;
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs required' });
    }

    const groupResult = await getGroupDetails(req.uid!, groupId);
    if (!groupResult.ok) return res.status(404).json({ error: groupResult.reason });
    if (groupResult.item?.membershipStatus !== 'member') {
      return res.status(403).json({ error: 'Only members can invite users' });
    }

    const db = getDb();
    const actorDoc = await db.collection('users').doc(req.uid!).get();
    const actorName = actorDoc.data()?.displayName ?? 'Một người bạn';

    const promises = userIds.map(async (userId: string) => {
      // Don't invite members
      if (groupResult.item?.memberIds?.includes(userId)) return;

      const notification = await createNotification({
        userId,
        type: 'system',
        actorId: req.uid!,
        entityType: 'group',
        entityId: groupId,
        message: `${actorName} đã mời bạn tham gia nhóm ${groupResult.item?.name}.`,
      });

      if (notification) {
        const unreadCount = await getUnreadNotificationCount(userId);
        emitNotificationNew(userId, toApiNotification(notification));
        emitNotificationUnreadCount(userId, unreadCount);
      }
    });

    await Promise.allSettled(promises);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/groups/{id}/posts:
 *   post:
 *     tags: [Groups]
 *     summary: Đăng bài vào nhóm (chỉ dành cho thành viên)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID nhóm
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content: { type: string, example: 'Xin chào nhóm!' }
 *               mediaUrls: { type: array, items: { type: string } }
 *               feeling: { type: string, nullable: true }
 *               location: { type: string, nullable: true }
 *               taggedFriends: { type: array, items: { type: object } }
 *               isAnonymous: { type: boolean, default: false }
 *               poll:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   options: { type: array, items: { type: object, properties: { text: { type: string } } } }
 *     responses:
 *       201: { description: Bài đã được tạo, content: { application/json: { schema: { $ref: '#/components/schemas/Post' } } } }
 *       400: { description: Thiếu nội dung & media }
 *       403: { description: Không phải thành viên }
 *       404: { description: Nhóm không tồn tại }
 *       422: { description: Vi phạm AI moderation }
 */
router.post('/:id/posts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = req.params.id;
    const uid = req.uid!;
    const db = getDb();

    const groupResult = await getGroupDetails(uid, groupId);
    if (!groupResult.ok) return res.status(404).json({ error: 'Group not found' });
    if (groupResult.item?.membershipStatus !== 'member') {
      return res.status(403).json({ error: 'Only group members can post' });
    }

    const {
      content,
      mediaUrls = [],
      feeling,
      location,
      taggedFriends = [],
      isAnonymous = false,
      poll,
      textStyle,
    } = req.body;

    if (!content?.trim() && (!Array.isArray(mediaUrls) || mediaUrls.length === 0)) {
      return res.status(400).json({ error: 'Content or media is required' });
    }

    const moderation = await moderatePost(
      content?.trim() ?? '',
      Array.isArray(mediaUrls) ? mediaUrls : []
    );
    if (!moderation.allowed) {
      try {
        await db.collection('moderation_logs').add({
          userId: uid,
          contentSnippet: (content?.trim() ?? '').substring(0, 200),
          mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [],
          reason: moderation.reason ?? 'Nội dung không phù hợp',
          type: 'group_post',
          groupId,
          createdAt: new Date(),
        });
      } catch { /* ignore log errors */ }
      return res.status(422).json({
        error: `Bài đăng vi phạm tiêu chuẩn cộng đồng: ${moderation.reason ?? 'Nội dung không phù hợp'}`,
      });
    }

    const userDoc = await db.collection('users').doc(uid).get();
    const user = userDoc.data();

    const hasVideo =
      Array.isArray(mediaUrls) &&
      mediaUrls.some(
        (u: string) =>
          typeof u === 'string' &&
          (u.includes('/video/upload/') || /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(u))
      );

    let formattedPoll: object | null = null;
    if (poll && Array.isArray(poll.options) && poll.options.length > 0) {
      formattedPoll = {
        options: poll.options.map((opt: any, index: number) => ({
          id: `opt_${Date.now()}_${index}`,
          text: opt.text ?? String(opt),
          votes: [],
        })),
      };
    }

    const docRef = db.collection('posts').doc();
    const normalizedTextStyle = content?.trim() ? normalizePostTextStyle(textStyle) : null;
    await docRef.set({
      authorId: uid,
      authorDisplayName: user?.displayName ?? 'Anonymous',
      authorPhotoURL: user?.photoURL ?? null,
      content: content?.trim() || '',
      mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [],
      feeling: feeling || null,
      location: location || null,
      taggedFriends: Array.isArray(taggedFriends) ? taggedFriends : [],
      privacy: 'group',
      parentId: null,
      groupId,
      createdAt: new Date(),
      updatedAt: new Date(),
      likeCount: 0,
      replyCount: 0,
      likedBy: [],
      hasVideo,
      isAnonymous: !!isAnonymous,
      poll: formattedPoll,
      textStyle: normalizedTextStyle,
    });

    const created = await docRef.get();
    res.status(201).json({ id: created.id, ...created.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/groups/{id}/posts:
 *   get:
 *     tags: [Groups]
 *     summary: Feed bài viết trong nhóm (cursor pagination)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: cursor
 *         schema: { type: integer }
 *         description: Unix ms timestamp từ `nextCursor` của trang trước
 *     responses:
 *       200:
 *         description: Trang bài viết
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 posts:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Post' }
 *                 nextCursor: { type: integer, nullable: true }
 *       403: { description: Nhóm private và user không phải thành viên }
 *       404: { description: Nhóm không tồn tại }
 */
router.get('/:id/posts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const groupId = req.params.id;
    const limitN = Math.min(parseIntSafe(req.query.limit, 20), 50);
    const cursorParam =
      typeof req.query.cursor === 'string' && req.query.cursor
        ? Number(req.query.cursor)
        : null;

    const result = await getGroupDetails(req.uid!, groupId);
    if (!result.ok) return res.status(404).json({ error: result.reason });
    if (result.item?.privacy === 'private' && result.item?.membershipStatus !== 'member') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const db = getDb();
    const baseQuery = db
      .collection('posts')
      .where('groupId', '==', groupId)
      .orderBy('createdAt', 'desc');

    const pagedQuery = cursorParam
      ? baseQuery.startAfter(new Date(cursorParam)).limit(limitN + 1)
      : baseQuery.limit(limitN + 1);

    const snap = await pagedQuery.get();
    const hasMore = snap.docs.length > limitN;
    const pageDocs = hasMore ? snap.docs.slice(0, limitN) : snap.docs;

    const posts = pageDocs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((post: any) => !post.deleted)
      .map((post: any) => {
        if (post.isAnonymous && post.authorId !== req.uid) {
          return {
            ...post,
            authorId: `anon_${post.id}`,
            authorDisplayName: 'Thành viên ẩn danh',
            authorPhotoURL: null,
          };
        }
        return post;
      });

    const lastDoc = pageDocs[pageDocs.length - 1];
    const nextCursor: number | null =
      hasMore && lastDoc ? (lastDoc.data().createdAt?.toMillis?.() ?? null) : null;

    res.json({ posts, nextCursor });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
