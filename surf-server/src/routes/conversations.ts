import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import {
  addMembersToGroup,
  createGroupConversation,
  createOrGetDmConversation,
  getGroupMembers,
  getUnreadConversationCount,
  listMessagesForConversation,
  listConversationsForUser,
  listReadReceiptsForConversation,
  markConversationRead,
  sendTextMessage,
  sendMediaMessage,
  toApiConversation,
  toApiMessage,
  toRealtimeMessagePayload,
} from '../services/conversations.js';
import {
  emitMessageNew,
  emitMessageRead,
  emitMessageUnreadCount,
} from '../realtime/emitters/message.emitter.js';
import { conversationRepository } from '../repositories/conversation.repository.js';

const router = Router();

const parseIntSafe = (value: unknown, fallback: number): number => {
  if (typeof value !== 'string') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const parseCursorSafe = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/**
 * @swagger
 * /api/conversations:
 *   post:
 *     tags: [Conversations]
 *     summary: Tạo hoặc lấy cuộc trò chuyện 1-1 với user khác
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [peerUid]
 *             properties:
 *               peerUid: { type: string }
 *     responses:
 *       200: { description: Conversation đã tồn tại hoặc mới tạo }
 *       400: { description: Thiếu peerUid }
 *   get:
 *     tags: [Conversations]
 *     summary: Danh sách cuộc trò chuyện
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: cursor
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 */
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const actorUid = req.uid!;
    const peerUid = typeof req.body?.peerUid === 'string' ? req.body.peerUid : '';

    const result = await createOrGetDmConversation(actorUid, peerUid);
    if (!result.ok) {
      if (result.reason === 'invalid_peer') {
        res.status(400).json({ error: 'Invalid peer UID' });
        return;
      }
      if (result.reason === 'peer_not_found') {
        res.status(404).json({ error: 'Peer user not found' });
        return;
      }
      res.status(403).json({ error: 'Blocked users cannot interact', code: 'USER_BLOCKED' });
      return;
    }

    res.status(result.created ? 201 : 200).json({
      created: result.created,
      item: toApiConversation(result.item),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const limit = Math.min(parseIntSafe(req.query.limit, 20), 50);

    const items = await listConversationsForUser(uid, limit);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/conversations/unread-count:
 *   get:
 *     tags: [Conversations]
 *     summary: Số cuộc trò chuyện chưa đọc
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
    const count = await getUnreadConversationCount(uid);
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/conversations/{id}/messages:
 *   get:
 *     tags: [Conversations]
 *     summary: Tin nhắn trong cuộc trò chuyện (cursor pagination)
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
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Không phải thành viên }
 *   post:
 *     tags: [Conversations]
 *     summary: Gửi tin nhắn vào cuộc trò chuyện
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text: { type: string }
 *               mediaUrl: { type: string, nullable: true }
 *               replyToId: { type: string, nullable: true }
 *     responses:
 *       201: { description: Tin nhắn đã gửi }
 *       403: { description: Không phải thành viên }
 */
router.get('/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const limit = Math.min(parseIntSafe(req.query.limit, q ? 20 : 10), q ? 50 : 20);
    const cursor = parseCursorSafe(req.query.cursor);

    const result = await listMessagesForConversation(
      uid,
      req.params.id,
      limit,
      cursor,
      q || undefined
    );
    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    res.json({ items: result.items.map(toApiMessage), nextCursor: result.nextCursor });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/conversations/{id}/read:
 *   patch:
 *     tags: [Conversations]
 *     summary: Đánh dấu đã đọc cuộc trò chuyện
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.get('/:id/read-receipts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const fromCreatedAt = parseCursorSafe(req.query.fromCreatedAt);
    const toCreatedAt = parseCursorSafe(req.query.toCreatedAt);
    const limit = Math.min(parseIntSafe(req.query.limit, 150), 300);

    if (!fromCreatedAt || !toCreatedAt) {
      res.status(400).json({ error: 'Invalid receipt window' });
      return;
    }

    const result = await listReadReceiptsForConversation(
      uid,
      req.params.id,
      fromCreatedAt,
      toCreatedAt,
      limit
    );

    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    res.json({ items: result.items });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const lastReadMessageId =
      typeof req.body?.lastReadMessageId === 'string' && req.body.lastReadMessageId.trim()
        ? req.body.lastReadMessageId.trim()
        : undefined;
    const lastReadMessageCreatedAt = parseCursorSafe(req.body?.lastReadMessageCreatedAt);
    const result = await markConversationRead(
      uid,
      req.params.id,
      lastReadMessageId,
      lastReadMessageCreatedAt
    );

    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    const count = await getUnreadConversationCount(uid);
    emitMessageUnreadCount(uid, count);

    if (result.item) {
      emitMessageRead(req.params.id, {
        conversationId: req.params.id,
        item: result.item,
      });
    }

    res.json({ ok: true, count, item: result.item });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/conversations/group:
 *   post:
 *     tags: [Conversations]
 *     summary: Tạo nhóm chat mới
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [memberIds]
 *             properties:
 *               title: { type: string }
 *               memberIds: { type: array, items: { type: string }, description: 'Không bao gồm bản thân' }
 *     responses:
 *       201: { description: Nhóm chat mới }
 *       400: { description: Cần ít nhất 2 memberIds }
 */
router.post('/group', requireAuth, async (req: AuthRequest, res) => {
  try {
    const actorUid = req.uid!;
    const { title, memberIds } = req.body as { title?: string; memberIds?: string[] };

    const result = await createGroupConversation(
      actorUid,
      title ?? '',
      Array.isArray(memberIds) ? memberIds : []
    );

    if (!result.ok) {
      if (result.reason === 'invalid_title') {
        res.status(400).json({ error: 'Group title is required' });
        return;
      }
      res.status(400).json({ error: 'At least one other member is required' });
      return;
    }

    res.status(201).json({ item: toApiConversation(result.item) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/conversations/{id}/members:
 *   get:
 *     tags: [Conversations]
 *     summary: Danh sách thành viên nhóm chat
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *   post:
 *     tags: [Conversations]
 *     summary: Thêm thành viên vào nhóm chat
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               memberIds: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: OK }
 */
router.get('/:id/members', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const result = await getGroupMembers(uid, req.params.id);

    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    res.json({ members: result.members });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/members', requireAuth, async (req: AuthRequest, res) => {
  try {
    const actorUid = req.uid!;
    const { memberIds } = req.body as { memberIds?: string[] };

    const result = await addMembersToGroup(
      actorUid,
      req.params.id,
      Array.isArray(memberIds) ? memberIds : []
    );

    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      if (result.reason === 'not_group') {
        res.status(400).json({ error: 'Can only add members to group conversations' });
        return;
      }
      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    res.json({ addedIds: result.addedIds });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    const senderId = req.uid!;
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const mediaUrl = typeof req.body?.mediaUrl === 'string' ? req.body.mediaUrl : '';
    const mediaType = req.body?.mediaType;
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName : undefined;

    // Media message
    if (mediaUrl && ['image', 'file', 'audio'].includes(mediaType)) {
      const result = await sendMediaMessage({
        conversationId: req.params.id,
        senderId,
        type: mediaType as 'image' | 'file' | 'audio',
        mediaUrl,
        fileName,
        text: text || undefined,
      });

      if (!result.ok) {
        if (result.reason === 'invalid_media') {
          res.status(400).json({ error: 'Invalid media' });
          return;
        }
        if (result.reason === 'not_found') {
          res.status(404).json({ error: 'Conversation not found' });
          return;
        }
        if (result.reason === 'forbidden') {
          res.status(403).json({ error: 'You are not a member of this conversation' });
          return;
        }
        res.status(403).json({ error: 'Blocked users cannot interact', code: 'USER_BLOCKED' });
        return;
      }

      const payload = toRealtimeMessagePayload(result.item);
      const mutedBy = await conversationRepository.getMutedBy(req.params.id);
      result.recipientIds.forEach((uid) => {
        emitMessageNew(uid, { ...payload, muted: mutedBy.includes(uid) });
      });
      emitMessageNew(senderId, payload);

      const recipientCounts = await Promise.all(
        result.recipientIds.map(async (uid) => ({
          uid,
          count: await getUnreadConversationCount(uid),
        }))
      );
      recipientCounts.forEach(({ uid, count }) => {
        emitMessageUnreadCount(uid, count);
      });
      const senderCount = await getUnreadConversationCount(senderId);
      emitMessageUnreadCount(senderId, senderCount);

      res.status(201).json({ item: toApiMessage(result.item), conversation: payload.conversation });
      return;
    }

    // Text message
    const result = await sendTextMessage({
      conversationId: req.params.id,
      senderId,
      text,
    });

    if (!result.ok) {
      if (result.reason === 'invalid_text') {
        res.status(400).json({ error: 'Message text is invalid' });
        return;
      }
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      if (result.reason === 'forbidden') {
        res.status(403).json({ error: 'You are not a member of this conversation' });
        return;
      }

      res.status(403).json({
        error: 'Blocked users cannot interact',
        code: 'USER_BLOCKED',
      });
      return;
    }

    const payload = toRealtimeMessagePayload(result.item);
    const mutedBy = await conversationRepository.getMutedBy(req.params.id);

    result.recipientIds.forEach((uid) => {
      emitMessageNew(uid, { ...payload, muted: mutedBy.includes(uid) });
    });

    emitMessageNew(senderId, payload);

    const recipientCounts = await Promise.all(
      result.recipientIds.map(async (uid) => ({
        uid,
        count: await getUnreadConversationCount(uid),
      }))
    );

    recipientCounts.forEach(({ uid, count }) => {
      emitMessageUnreadCount(uid, count);
    });

    const senderCount = await getUnreadConversationCount(senderId);
    emitMessageUnreadCount(senderId, senderCount);

    res.status(201).json({ item: toApiMessage(result.item), conversation: payload.conversation });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const snap = await conversationRepository.getById(req.params.id);
    if (!snap) { res.status(404).json({ error: 'Conversation not found' }); return; }
    const memberIds = await conversationRepository.getMemberIds(req.params.id);
    if (!memberIds.includes(uid)) { res.status(403).json({ error: 'Forbidden' }); return; }
    await conversationRepository.hideForUser(req.params.id, uid);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/:id/mute', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const muted = req.body?.muted !== false;
    const memberIds = await conversationRepository.getMemberIds(req.params.id);
    if (!memberIds.includes(uid)) { res.status(403).json({ error: 'Forbidden' }); return; }
    await conversationRepository.setMutedForUser(req.params.id, uid, muted);
    res.json({ success: true, muted });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
