import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  ensureDirectConversation,
  getConversationById,
  listInbox,
  listMessages,
} from '../repositories/chat-repository.js';
import { getUnread, isUserOnline, resetUnread } from '../services/redis-service.js';

const parseCursor = (value: unknown): number | undefined => {
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toIso = (value?: Date) => (value ? value.toISOString() : null);

export const registerMessageRoutes = async (app: FastifyInstance) => {
  app.get('/api/messages/inbox', { preHandler: requireAuth }, async (request, reply) => {
    const uid = request.uid!;
    const cursor = parseCursor((request.query as Record<string, unknown>).cursor);
    const limit = Math.min(Number((request.query as Record<string, unknown>).limit ?? 20), 50);

    const conversations = await listInbox(uid, limit, cursor);
    const items = await Promise.all(
      conversations.map(async (conversation) => {
        const unreadCount = await getUnread(uid, conversation.id);
        const peerId = conversation.type === 'direct'
          ? conversation.memberIds.find((memberId) => memberId !== uid)
          : null;
        const peerOnline = peerId ? await isUserOnline(peerId) : false;

        return {
          id: conversation.id,
          type: conversation.type,
          memberIds: conversation.memberIds,
          lastMessageText: conversation.lastMessageText ?? '',
          lastMessageAt: toIso(conversation.lastMessageAt),
          updatedAt: toIso(conversation.updatedAt),
          unreadCount,
          peerId,
          peerOnline,
        };
      }),
    );

    reply.send({ items });
  });

  app.post('/api/messages/direct/:peerUid/conversation', { preHandler: requireAuth }, async (request, reply) => {
    const uid = request.uid!;
    const peerUid = (request.params as Record<string, string>).peerUid;
    if (!peerUid || peerUid === uid) {
      reply.status(400).send({ error: 'Invalid peerUid' });
      return;
    }

    const conversation = await ensureDirectConversation(uid, peerUid);
    reply.send({
      id: conversation.id,
      type: conversation.type,
      memberIds: conversation.memberIds,
    });
  });

  app.get('/api/messages/:conversationId', { preHandler: requireAuth }, async (request, reply) => {
    const uid = request.uid!;
    const { conversationId } = request.params as { conversationId: string };
    const cursor = parseCursor((request.query as Record<string, unknown>).cursor);
    const limit = Math.min(Number((request.query as Record<string, unknown>).limit ?? 30), 100);

    const conversation = await getConversationById(conversationId);
    if (!conversation || !conversation.memberIds.includes(uid)) {
      reply.status(404).send({ error: 'Conversation not found' });
      return;
    }

    const messages = await listMessages(conversationId, limit, cursor);
    reply.send({
      items: messages.map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        text: message.text,
        clientMessageId: message.clientMessageId ?? null,
        createdAt: message.createdAt.toISOString(),
      })),
    });
  });

  app.post('/api/messages/:conversationId/read', { preHandler: requireAuth }, async (request, reply) => {
    const uid = request.uid!;
    const { conversationId } = request.params as { conversationId: string };

    const conversation = await getConversationById(conversationId);
    if (!conversation || !conversation.memberIds.includes(uid)) {
      reply.status(404).send({ error: 'Conversation not found' });
      return;
    }

    await resetUnread(uid, conversationId);
    reply.send({ ok: true });
  });
};
