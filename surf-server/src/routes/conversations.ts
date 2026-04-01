import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import {
  createOrGetDmConversation,
  getUnreadConversationCount,
  listMessagesForConversation,
  listConversationsForUser,
  markConversationRead,
  sendTextMessage,
  toApiConversation,
  toApiMessage,
  toRealtimeMessagePayload,
} from '../services/conversations.js';
import { emitMessageNew, emitMessageUnreadCount } from '../realtime/emitters/message.emitter.js';

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

router.patch('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const result = await markConversationRead(uid, req.params.id);

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

    res.json({ ok: true, count });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    const senderId = req.uid!;
    const text = typeof req.body?.text === 'string' ? req.body.text : '';

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
