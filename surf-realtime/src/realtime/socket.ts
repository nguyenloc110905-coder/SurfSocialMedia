import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { getAuth } from '../config/firebase-admin.js';
import {
  appendMessage,
  getConversationById,
} from '../repositories/chat-repository.js';
import {
  incrementUnreadForMembers,
  resetUnread,
  redisPub,
  redisSub,
  setUserOffline,
  setUserOnline,
} from '../services/redis-service.js';

type SendMessagePayload = {
  conversationId: string;
  text: string;
  clientMessageId?: string;
};

type ReadPayload = {
  conversationId: string;
  messageId: string;
};

type TypingPayload = {
  conversationId: string;
  isTyping: boolean;
};

const roomForConversation = (conversationId: string) => `conversation:${conversationId}`;
const roomForUser = (uid: string) => `user:${uid}`;

const normalizeToken = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  if (!value) return null;
  if (value.startsWith('Bearer ')) return value.slice(7).trim();
  return value.trim();
};

export const createSocketServer = async (app: FastifyInstance): Promise<Server> => {
  const io = new Server(app.server, {
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.adapter(createAdapter(redisPub, redisSub));

  io.use(async (socket, next) => {
    try {
      const authToken = normalizeToken(socket.handshake.auth.token);
      const headerToken = normalizeToken(socket.handshake.headers.authorization);
      const token = authToken ?? headerToken;

      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }

      const decoded = await getAuth().verifyIdToken(token);
      socket.data.uid = decoded.uid;
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  io.on('connection', async (socket) => {
    const uid = socket.data.uid as string;
    const userRoom = roomForUser(uid);
    socket.join(userRoom);
    await setUserOnline(uid);

    socket.on('presence:ping', async () => {
      await setUserOnline(uid);
    });

    socket.on('conversation:join', async (conversationId: string) => {
      const conversation = await getConversationById(conversationId);
      if (!conversation) return;
      if (!conversation.memberIds.includes(uid)) return;
      socket.join(roomForConversation(conversationId));
    });

    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(roomForConversation(conversationId));
    });

    socket.on('message:send', async (payload: SendMessagePayload, ack?: (body: unknown) => void) => {
      try {
        const text = payload.text?.trim();
        if (!payload.conversationId || !text) {
          ack?.({ ok: false, error: 'Invalid payload' });
          return;
        }

        const conversation = await getConversationById(payload.conversationId);
        if (!conversation || !conversation.memberIds.includes(uid)) {
          ack?.({ ok: false, error: 'No permission for conversation' });
          return;
        }

        const message = await appendMessage({
          conversationId: payload.conversationId,
          senderId: uid,
          text,
          clientMessageId: payload.clientMessageId,
        });

        await incrementUnreadForMembers(conversation.memberIds, uid, payload.conversationId);

        const eventBody = {
          conversationId: payload.conversationId,
          message,
        };

        io.to(roomForConversation(payload.conversationId)).emit('message:new', eventBody);
        io.to(roomForUser(uid)).emit('conversation:updated', {
          conversationId: payload.conversationId,
          lastMessageText: text,
          lastMessageAt: message.createdAt.toISOString(),
        });

        ack?.({ ok: true, message: eventBody.message });
      } catch (error) {
        ack?.({ ok: false, error: (error as Error).message });
      }
    });

    socket.on('message:read', async (payload: ReadPayload) => {
      const conversation = await getConversationById(payload.conversationId);
      if (!conversation || !conversation.memberIds.includes(uid)) return;

      await resetUnread(uid, payload.conversationId);

      socket.to(roomForConversation(payload.conversationId)).emit('message:read', {
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        readerId: uid,
        readAt: new Date().toISOString(),
      });
    });

    socket.on('typing', async (payload: TypingPayload) => {
      const conversation = await getConversationById(payload.conversationId);
      if (!conversation || !conversation.memberIds.includes(uid)) return;

      socket.to(roomForConversation(payload.conversationId)).emit('typing', {
        conversationId: payload.conversationId,
        userId: uid,
        isTyping: Boolean(payload.isTyping),
      });
    });

    socket.on('disconnect', async () => {
      await setUserOffline(uid);
    });
  });

  return io;
};
