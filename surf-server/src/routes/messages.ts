import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import {
  emitMessageReactionUpdated,
  emitMessageRecalled,
  emitMessageRead,
  emitMessageSelfHidden,
  emitMessageNewToTargets,
  emitMessageUnreadCount,
  emitMessageUpdated,
} from '../realtime/emitters/message.emitter.js';
import {
  editMessageText,
  forwardMessageToConversation,
  getUnreadConversationCount,
  hideMessageForSelf,
  markMessageReadById,
  reportMessageForModeration,
  recallMessageForEveryone,
  toggleMessageReactionForMessage,
  toggleMessagePinForMessage,
  toApiMessage,
  toRealtimeMessagePayload,
} from '../services/conversations.js';
import { conversationRepository } from '../repositories/conversation.repository.js';

const router = Router();

const parseCursorSafe = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
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

router.patch('/:id/reactions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const messageId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : '';

    if (!messageId) {
      res.status(400).json({ error: 'Message ID is required' });
      return;
    }

    if (!emoji) {
      res.status(400).json({ error: 'Emoji is required' });
      return;
    }

    const conversationId =
      typeof req.body?.conversationId === 'string' && req.body.conversationId.trim()
        ? req.body.conversationId.trim()
        : undefined;

    const result = await toggleMessageReactionForMessage(uid, messageId, emoji, conversationId);

    if (!result.ok) {
      if (result.reason === 'invalid_emoji') {
        res.status(400).json({ error: 'Emoji is invalid' });
        return;
      }

      if (result.reason === 'not_reactable') {
        res.status(400).json({ error: 'Cannot react to this message type' });
        return;
      }

      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    const message = toApiMessage(result.item);

    emitMessageReactionUpdated(result.conversationId, {
      conversationId: result.conversationId,
      message,
    });

    res.json({
      ok: true,
      conversationId: result.conversationId,
      message,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/:id/edit', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const messageId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const text = typeof req.body?.text === 'string' ? req.body.text : '';

    if (!messageId) {
      res.status(400).json({ error: 'Message ID is required' });
      return;
    }

    const conversationId =
      typeof req.body?.conversationId === 'string' && req.body.conversationId.trim()
        ? req.body.conversationId.trim()
        : undefined;

    const result = await editMessageText(uid, messageId, text, conversationId);
    if (!result.ok) {
      if (result.reason === 'invalid_text') {
        res.status(400).json({ error: 'Message text is invalid' });
        return;
      }

      if (result.reason === 'not_editable') {
        res.status(400).json({ error: 'Only text messages can be edited' });
        return;
      }

      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      if (result.reason === 'not_sender') {
        res.status(403).json({ error: 'Only the sender can edit this message' });
        return;
      }

      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    const message = toApiMessage(result.item);
    emitMessageUpdated(result.conversationId, {
      conversationId: result.conversationId,
      message,
    });

    res.json({
      ok: true,
      conversationId: result.conversationId,
      message,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/forward', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const messageId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const targetConversationId =
      typeof req.body?.targetConversationId === 'string' ? req.body.targetConversationId : '';

    if (!messageId) {
      res.status(400).json({ error: 'Message ID is required' });
      return;
    }

    if (!targetConversationId.trim()) {
      res.status(400).json({ error: 'Target conversation ID is required' });
      return;
    }

    const conversationId =
      typeof req.body?.conversationId === 'string' && req.body.conversationId.trim()
        ? req.body.conversationId.trim()
        : undefined;

    const result = await forwardMessageToConversation(
      uid,
      messageId,
      targetConversationId,
      conversationId
    );

    if (!result.ok) {
      if (result.reason === 'invalid_target') {
        res.status(400).json({ error: 'Target conversation is invalid' });
        return;
      }

      if (result.reason === 'invalid_content') {
        res.status(400).json({ error: 'Message cannot be forwarded' });
        return;
      }

      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      if (result.reason === 'blocked') {
        res.status(409).json({ error: 'Cannot forward due to block status' });
        return;
      }

      res.status(403).json({ error: 'You are not allowed to forward to this conversation' });
      return;
    }

    const payload = toRealtimeMessagePayload(result.item);
    const muteSettingsByUser = await conversationRepository.getMuteSettingsByUser(result.conversationId);
    const mutedBy = Object.entries(muteSettingsByUser)
      .filter(([, settings]) => settings.muteMessages)
      .map(([userId]) => userId);
    emitMessageNewToTargets([uid, ...result.recipientIds], result.conversationId, {
      ...payload,
      mutedBy,
    });

    await Promise.all(
      result.recipientIds.map(async (recipientId) => {
        const unreadCount = await getUnreadConversationCount(recipientId);
        emitMessageUnreadCount(recipientId, unreadCount);
      })
    );

    const senderUnreadCount = await getUnreadConversationCount(uid);
    emitMessageUnreadCount(uid, senderUnreadCount);

    res.status(201).json({
      ok: true,
      conversationId: result.conversationId,
      message: payload.message,
      conversation: payload.conversation,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/:id/pin', requireAuth, async (req: AuthRequest, res) => {
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
    const pinned = parseOptionalBoolean(req.body?.pinned);

    const result = await toggleMessagePinForMessage(uid, messageId, pinned, conversationId);
    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    const message = toApiMessage(result.item);
    emitMessageUpdated(result.conversationId, {
      conversationId: result.conversationId,
      message,
    });

    res.json({
      ok: true,
      conversationId: result.conversationId,
      message,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/report', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const messageId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';

    if (!messageId) {
      res.status(400).json({ error: 'Message ID is required' });
      return;
    }

    const conversationId =
      typeof req.body?.conversationId === 'string' && req.body.conversationId.trim()
        ? req.body.conversationId.trim()
        : undefined;

    const result = await reportMessageForModeration(uid, messageId, reason, conversationId);
    if (!result.ok) {
      if (result.reason === 'invalid_reason') {
        res.status(400).json({ error: 'Reason is required' });
        return;
      }

      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      res.status(403).json({ error: 'You are not a member of this conversation' });
      return;
    }

    res.status(201).json({
      ok: true,
      conversationId: result.conversationId,
      reportId: result.reportId,
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
