import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import {
  emitMessageRecalled,
  emitMessageRead,
  emitMessageSelfHidden,
  emitMessageUnreadCount,
} from '../realtime/emitters/message.emitter.js';
import {
  getUnreadConversationCount,
  hideMessageForSelf,
  markMessageReadById,
  recallMessageForEveryone,
  toApiMessage,
} from '../services/conversations.js';

const router = Router();

const parseCursorSafe = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

router.patch('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const messageId = typeof req.params.id === 'string' ? req.params.id.trim() : '';

    if (!messageId) {
      res.status(400).json({ error: 'Message ID is required' });
      return;
    }

    const conversationId =
      typeof req.body?.conversationId === 'string' && req.body.conversationId.trim()
        ? req.body.conversationId.trim()
        : undefined;
    const lastReadMessageCreatedAt = parseCursorSafe(req.body?.lastReadMessageCreatedAt);

    const result = await markMessageReadById(
      uid,
      messageId,
      conversationId,
      lastReadMessageCreatedAt
    );

    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    const count = await getUnreadConversationCount(uid);
    emitMessageUnreadCount(uid, count);

    if (result.item) {
      emitMessageRead(result.conversationId, {
        conversationId: result.conversationId,
        item: result.item,
      });
    }

    res.json({
      ok: true,
      count,
      item: result.item,
      conversationId: result.conversationId,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/:id/self', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const messageId = typeof req.params.id === 'string' ? req.params.id.trim() : '';

    if (!messageId) {
      res.status(400).json({ error: 'Message ID is required' });
      return;
    }

    const conversationId =
      typeof req.body?.conversationId === 'string' && req.body.conversationId.trim()
        ? req.body.conversationId.trim()
        : undefined;

    const result = await hideMessageForSelf(uid, messageId, conversationId);
    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      if (result.reason === 'not_sender') {
        res.status(403).json({ error: 'Only the sender can hide this message for self' });
        return;
      }

      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    emitMessageSelfHidden(uid, {
      conversationId: result.conversationId,
      messageId: result.messageId,
    });

    res.json({
      ok: true,
      conversationId: result.conversationId,
      messageId: result.messageId,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/:id/everyone', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const messageId = typeof req.params.id === 'string' ? req.params.id.trim() : '';

    if (!messageId) {
      res.status(400).json({ error: 'Message ID is required' });
      return;
    }

    const conversationId =
      typeof req.body?.conversationId === 'string' && req.body.conversationId.trim()
        ? req.body.conversationId.trim()
        : undefined;

    const result = await recallMessageForEveryone(uid, messageId, conversationId);
    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      if (result.reason === 'not_sender') {
        res.status(403).json({ error: 'Only the sender can recall this message' });
        return;
      }

      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    const apiMessage = toApiMessage(result.item);
    emitMessageRecalled(result.conversationId, {
      conversationId: result.conversationId,
      message: apiMessage,
    });

    res.json({
      ok: true,
      conversationId: result.conversationId,
      message: apiMessage,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
