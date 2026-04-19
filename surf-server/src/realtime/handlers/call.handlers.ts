import type { Server, Socket } from 'socket.io';
import { getDb } from '../../config/firebase-admin.js';
import {
  createCallLogMessage,
  getUnreadConversationCount,
  toRealtimeMessagePayload,
} from '../../services/conversations.js';
import {
  createNotification,
  getUnreadNotificationCount,
  toApiNotification,
} from '../../services/notifications.js';
import {
  emitMessageNew,
  emitMessageUnreadCount,
} from '../emitters/message.emitter.js';
import {
  emitNotificationNew,
  emitNotificationUnreadCount,
} from '../emitters/notification.emitter.js';
import { userRoom } from '../rooms.js';

type CallMode = 'audio' | 'video';

type CallInvitePayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  mode: CallMode;
};

type CallAcceptPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  mode: CallMode;
};

type CallDeclinePayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  reason?: string;
};

type CallEndPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  reason?: string;
};

type CallSignalPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  mode: CallMode;
  signal:
    | { type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }
    | { type: 'ice'; candidate: RTCIceCandidateInit };
};

type CallSession = {
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  mode: CallMode;
  acceptedAt?: number;
};

const callSessions = new Map<string, CallSession>();

const emitCallLog = async (
  payload: Pick<CallEndPayload, 'callId' | 'conversationId' | 'fromUserId'>,
  outcome: 'completed' | 'missed' | 'declined' | 'busy' | 'failed' | 'ended',
  durationSeconds?: number
) => {
  const session = callSessions.get(payload.callId);
  const mode = session?.mode ?? 'audio';

  const result = await createCallLogMessage({
    conversationId: payload.conversationId,
    actorId: payload.fromUserId,
    recipientIds: [],
    mode,
    outcome,
    durationSeconds,
  });

  if (!result.ok) return;

  const realtimePayload = toRealtimeMessagePayload(result.item);
  result.participantIds.forEach((uid) => {
    emitMessageNew(uid, realtimePayload);
  });

  const unreadCounts = await Promise.all(
    result.participantIds.map(async (uid) => ({
      uid,
      count: await getUnreadConversationCount(uid),
    }))
  );

  unreadCounts.forEach(({ uid, count }) => {
    emitMessageUnreadCount(uid, count);
  });
};

export const registerCallHandlers = (io: Server, socket: Socket) => {
  socket.on('call:invite', (payload: CallInvitePayload) => {
    callSessions.set(payload.callId, {
      conversationId: payload.conversationId,
      fromUserId: payload.fromUserId,
      toUserId: payload.toUserId,
      mode: payload.mode,
    });
    io.to(userRoom(payload.toUserId)).emit('call:incoming', payload);
  });

  socket.on('call:accept', (payload: CallAcceptPayload) => {
    const existing = callSessions.get(payload.callId);
    if (existing) {
      callSessions.set(payload.callId, {
        ...existing,
        acceptedAt: Date.now(),
      });
    }
    io.to(userRoom(payload.toUserId)).emit('call:accepted', payload);
  });

  socket.on('call:decline', async (payload: CallDeclinePayload) => {
    io.to(userRoom(payload.toUserId)).emit('call:declined', payload);

    const outcome =
      payload.reason === 'busy'
        ? 'busy'
        : payload.reason === 'media_error'
          ? 'failed'
          : 'declined';

    await emitCallLog(payload, outcome);
    callSessions.delete(payload.callId);
  });

  socket.on('call:end', async (payload: CallEndPayload) => {
    io.to(userRoom(payload.toUserId)).emit('call:ended', payload);

    const session = callSessions.get(payload.callId);
    const durationSeconds = session?.acceptedAt
      ? Math.max(1, Math.round((Date.now() - session.acceptedAt) / 1000))
      : undefined;
    const outcome =
      payload.reason === 'missed'
        ? 'missed'
        : session?.acceptedAt
          ? 'completed'
          : 'ended';

    await emitCallLog(payload, outcome, durationSeconds);
    callSessions.delete(payload.callId);

    if (payload.reason !== 'missed') return;

    try {
      const callerDoc = await getDb().collection('users').doc(payload.fromUserId).get();
      const callerName = callerDoc.data()?.displayName ?? 'Ai đó';

      const notification = await createNotification({
        userId: payload.toUserId,
        type: 'missed_call',
        actorId: payload.fromUserId,
        entityType: 'conversation',
        entityId: payload.conversationId,
        message: `${callerName} đã gọi cho bạn nhưng bạn đã bỏ lỡ cuộc gọi.`,
      });

      const unreadCount = await getUnreadNotificationCount(payload.toUserId);
      emitNotificationNew(payload.toUserId, toApiNotification(notification));
      emitNotificationUnreadCount(payload.toUserId, unreadCount);
    } catch (error) {
      console.warn('⚠️ Không tạo được notification missed_call:', error);
    }
  });

  socket.on('call:signal', (payload: CallSignalPayload) => {
    io.to(userRoom(payload.toUserId)).emit('call:signal', payload);
  });
};
