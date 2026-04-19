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

router.get('/unread-count', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const count = await getUnreadConversationCount(uid);
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const limit = Math.min(parseIntSafe(req.query.limit, 10), 20);
    const cursor = parseCursorSafe(req.query.cursor);

    const result = await listMessagesForConversation(uid, req.params.id, limit, cursor);
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
      result.recipientIds.forEach((uid) => {
        emitMessageNew(uid, payload);
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

    result.recipientIds.forEach((uid) => {
      emitMessageNew(uid, payload);
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

export default router;
