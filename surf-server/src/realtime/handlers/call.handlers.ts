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
import { emitMessageNewToTargets, emitMessageUnreadCount } from '../emitters/message.emitter.js';
import {
  emitNotificationNew,
  emitNotificationUnreadCount,
} from '../emitters/notification.emitter.js';
import { userRoom } from '../rooms.js';
import { conversationRepository } from '../../repositories/conversation.repository.js';

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

type GroupCallInvitePayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  conversationTitle?: string;
  participantIds: string[];
  mode: CallMode;
};

type GroupCallAcceptPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
};

type GroupCallDeclinePayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  reason?: string;
};

type GroupCallParticipantJoinPayload = {
  callId: string;
  conversationId: string;
  userId: string;
};

type GroupCallParticipantLeavePayload = {
  callId: string;
  conversationId: string;
  userId: string;
  reason?: string;
};

type GroupCallIncomingPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  conversationTitle?: string;
  mode: CallMode;
};

type GroupCallRoomReadyPayload = {
  callId: string;
  conversationId: string;
  hostUserId: string;
  conversationTitle?: string;
  mode: CallMode;
  roomName: string;
};

type CallSession = {
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  mode: CallMode;
  acceptedAt?: number;
};

type GroupCallSession = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  conversationTitle?: string;
  participantIds: string[];
  acceptedUserIds: Set<string>;
  activeParticipantUserIds: Set<string>;
  mode: CallMode;
  roomName?: string;
  roomOpenedAt?: number;
  startLogCreated: boolean;
  endLogCreated: boolean;
};

const callSessions = new Map<string, CallSession>();
const groupCallSessions = new Map<string, GroupCallSession>();
const groupCallCleanupTimers = new Map<string, NodeJS.Timeout>();

const GROUP_CALL_INVITE_TTL_MS = 1000 * 60 * 10;
const GROUP_CALL_ACTIVE_TTL_MS = 1000 * 60 * 60 * 4;

const scheduleGroupCallSessionCleanup = (callId: string, ttlMs: number) => {
  const currentTimer = groupCallCleanupTimers.get(callId);
  if (currentTimer) {
    clearTimeout(currentTimer);
  }

  const nextTimer = setTimeout(() => {
    void finalizeGroupCallSession(callId, 'timeout');
  }, ttlMs);

  // Avoid keeping the Node.js event loop alive for stale in-memory sessions.
  nextTimer.unref?.();
  groupCallCleanupTimers.set(callId, nextTimer);
};

const toSafeSegment = (value: string, fallback: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || fallback;
};

const buildGroupRoomName = (conversationId: string, callId: string) =>
  `surf-group-${toSafeSegment(conversationId, 'conversation')}-${toSafeSegment(callId, 'call')}`;

const isCallMutedForUser = async (conversationId: string, userId: string): Promise<boolean> => {
  const settingsByUser = await conversationRepository.getMuteSettingsByUser(conversationId);
  return settingsByUser[userId]?.muteCalls === true;
};

const emitCallLog = async (
  payload: Pick<CallEndPayload, 'callId' | 'conversationId' | 'fromUserId'>,
  outcome: 'completed' | 'missed' | 'declined' | 'busy' | 'failed' | 'ended' | 'started',
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
  emitMessageNewToTargets(result.participantIds, payload.conversationId, realtimePayload);

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

const emitGroupCallStartLog = async (session: GroupCallSession) => {
  const result = await createCallLogMessage({
    conversationId: session.conversationId,
    actorId: session.fromUserId,
    recipientIds: [],
    mode: session.mode,
    outcome: 'started',
  });

  if (!result.ok) return;

  const realtimePayload = toRealtimeMessagePayload(result.item);
  emitMessageNewToTargets(result.participantIds, session.conversationId, realtimePayload);

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

const emitGroupCallEndedLog = async (session: GroupCallSession, durationSeconds?: number) => {
  const result = await createCallLogMessage({
    conversationId: session.conversationId,
    actorId: session.fromUserId,
    recipientIds: [],
    mode: session.mode,
    outcome: 'ended',
    durationSeconds,
  });

  if (!result.ok) return;

  const realtimePayload = toRealtimeMessagePayload(result.item);
  emitMessageNewToTargets(result.participantIds, session.conversationId, realtimePayload);

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

const finalizeGroupCallSession = async (callId: string, reason: 'ended' | 'timeout') => {
  const session = groupCallSessions.get(callId);
  if (!session) {
    groupCallCleanupTimers.delete(callId);
    return;
  }

  if (session.startLogCreated && !session.endLogCreated) {
    const durationSeconds = session.roomOpenedAt
      ? Math.max(1, Math.round((Date.now() - session.roomOpenedAt) / 1000))
      : undefined;
    await emitGroupCallEndedLog(session, durationSeconds);
    session.endLogCreated = true;
  }

  const timer = groupCallCleanupTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    groupCallCleanupTimers.delete(callId);
  }

  groupCallSessions.delete(callId);

  if (reason === 'timeout') {
    console.info(`Group call session timed out and was cleaned up: ${callId}`);
  }
};

export const registerCallHandlers = (io: Server, socket: Socket) => {
  socket.on('call:invite', async (payload: CallInvitePayload) => {
    callSessions.set(payload.callId, {
      conversationId: payload.conversationId,
      fromUserId: payload.fromUserId,
      toUserId: payload.toUserId,
      mode: payload.mode,
    });
    if (await isCallMutedForUser(payload.conversationId, payload.toUserId)) return;
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
      payload.reason === 'busy' ? 'busy' : payload.reason === 'media_error' ? 'failed' : 'declined';

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
      payload.reason === 'missed' ? 'missed' : session?.acceptedAt ? 'completed' : 'ended';

    await emitCallLog(payload, outcome, durationSeconds);
    callSessions.delete(payload.callId);

    if (payload.reason !== 'missed') return;

    try {
      const callerDoc = await getDb().collection('users').doc(payload.fromUserId).get();
      const callerName = callerDoc.data()?.displayName ?? 'Ai đó';

      if (await isCallMutedForUser(payload.conversationId, payload.toUserId)) return;

      const notification = await createNotification({
        userId: payload.toUserId,
        type: 'missed_call',
        actorId: payload.fromUserId,
        entityType: 'conversation',
        entityId: payload.conversationId,
        message: `${callerName} đã gọi cho bạn nhưng bạn đã bỏ lỡ cuộc gọi.`,
      });

      if (notification) {
        const unreadCount = await getUnreadNotificationCount(payload.toUserId);
        emitNotificationNew(payload.toUserId, toApiNotification(notification));
        emitNotificationUnreadCount(payload.toUserId, unreadCount);
      }
    } catch (error) {
      console.warn('⚠️ Không tạo được notification missed_call:', error);
    }
  });

  socket.on('call:signal', (payload: CallSignalPayload) => {
    io.to(userRoom(payload.toUserId)).emit('call:signal', payload);
  });

  socket.on('call:group-invite', async (payload: GroupCallInvitePayload) => {
    const participantIds = Array.from(
      new Set((payload.participantIds ?? []).map((id) => id.trim()).filter(Boolean))
    ).filter((id) => id !== payload.fromUserId);

    if (!payload.callId || !payload.conversationId || participantIds.length === 0) {
      return;
    }

    groupCallSessions.set(payload.callId, {
      callId: payload.callId,
      conversationId: payload.conversationId,
      fromUserId: payload.fromUserId,
      fromName: payload.fromName,
      fromAvatarUrl: payload.fromAvatarUrl,
      conversationTitle: payload.conversationTitle,
      participantIds,
      acceptedUserIds: new Set<string>(),
      activeParticipantUserIds: new Set<string>(),
      mode: payload.mode,
      startLogCreated: false,
      endLogCreated: false,
    });
    scheduleGroupCallSessionCleanup(payload.callId, GROUP_CALL_INVITE_TTL_MS);

    const incomingPayload: GroupCallIncomingPayload = {
      callId: payload.callId,
      conversationId: payload.conversationId,
      fromUserId: payload.fromUserId,
      fromName: payload.fromName,
      fromAvatarUrl: payload.fromAvatarUrl,
      conversationTitle: payload.conversationTitle,
      mode: payload.mode,
    };

    await Promise.all(
      participantIds.map(async (uid) => {
        if (await isCallMutedForUser(payload.conversationId, uid)) return;
        io.to(userRoom(uid)).emit('call:group-incoming', incomingPayload);
      })
    );
  });

  socket.on('call:group-accept', async (payload: GroupCallAcceptPayload) => {
    const session = groupCallSessions.get(payload.callId);
    if (!session || session.conversationId !== payload.conversationId) return;

    session.acceptedUserIds.add(payload.fromUserId);

    if (!session.roomName) {
      session.roomName = buildGroupRoomName(session.conversationId, session.callId);
      session.roomOpenedAt = Date.now();

      if (!session.startLogCreated) {
        await emitGroupCallStartLog(session);
        session.startLogCreated = true;
      }

      groupCallSessions.set(payload.callId, session);
      scheduleGroupCallSessionCleanup(payload.callId, GROUP_CALL_ACTIVE_TTL_MS);

      const readyPayload: GroupCallRoomReadyPayload = {
        callId: session.callId,
        conversationId: session.conversationId,
        hostUserId: session.fromUserId,
        conversationTitle: session.conversationTitle,
        mode: session.mode,
        roomName: session.roomName,
      };

      io.to(userRoom(session.fromUserId)).emit('call:group-room-ready', readyPayload);
      io.to(userRoom(payload.fromUserId)).emit('call:group-room-ready', readyPayload);
      return;
    }

    const readyPayload: GroupCallRoomReadyPayload = {
      callId: session.callId,
      conversationId: session.conversationId,
      hostUserId: session.fromUserId,
      conversationTitle: session.conversationTitle,
      mode: session.mode,
      roomName: session.roomName,
    };

    scheduleGroupCallSessionCleanup(payload.callId, GROUP_CALL_ACTIVE_TTL_MS);

    io.to(userRoom(payload.fromUserId)).emit('call:group-room-ready', readyPayload);
  });

  socket.on('call:group-decline', (payload: GroupCallDeclinePayload) => {
    const session = groupCallSessions.get(payload.callId);
    if (!session || session.conversationId !== payload.conversationId) return;

    io.to(userRoom(session.fromUserId)).emit('call:group-declined', payload);
  });

  socket.on('call:group-participant-join', (payload: GroupCallParticipantJoinPayload) => {
    const session = groupCallSessions.get(payload.callId);
    if (!session || session.conversationId !== payload.conversationId) return;
    if (!session.roomName || !session.startLogCreated || session.endLogCreated) return;

    session.activeParticipantUserIds.add(payload.userId);
    groupCallSessions.set(payload.callId, session);
    scheduleGroupCallSessionCleanup(payload.callId, GROUP_CALL_ACTIVE_TTL_MS);
  });

  socket.on('call:group-participant-leave', async (payload: GroupCallParticipantLeavePayload) => {
    const session = groupCallSessions.get(payload.callId);
    if (!session || session.conversationId !== payload.conversationId) return;
    if (!session.roomName || !session.startLogCreated || session.endLogCreated) return;

    session.activeParticipantUserIds.delete(payload.userId);

    if (session.activeParticipantUserIds.size > 0) {
      groupCallSessions.set(payload.callId, session);
      scheduleGroupCallSessionCleanup(payload.callId, GROUP_CALL_ACTIVE_TTL_MS);
      return;
    }

    await finalizeGroupCallSession(payload.callId, 'ended');
  });
};
