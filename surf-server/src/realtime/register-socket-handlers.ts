import type { Server } from 'socket.io';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase-admin.js';
import { registerCallHandlers } from './handlers/call.handlers.js';
import { conversationRoom, liveStreamRoom, postRoom, userRoom } from './rooms.js';
import { conversationRepository } from '../repositories/conversation.repository.js';
import {
  getUserIdBySocket,
  markOffline,
  markOnline,
  refreshPresence,
} from '../services/presence.js';
import { getCachedLiveStream, invalidateLiveStreamCache } from '../services/live-cache.js';

const friendIdsCache = new Map<string, { ids: string[]; expiresAt: number }>();
const FRIEND_IDS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const LIVE_VIEWER_COUNT_PERSIST_INTERVAL_MS = Math.max(
  Number(process.env.LIVE_VIEWER_COUNT_PERSIST_INTERVAL_MS) || 15000,
  2000
);
const LIVE_REACTION_PERSIST_INTERVAL_MS = Math.max(
  Number(process.env.LIVE_REACTION_PERSIST_INTERVAL_MS) || 10000,
  2000
);
const liveViewerSockets = new Map<string, Set<string>>();
const liveHostSockets = new Map<string, string>();
const liveViewerStreamsBySocket = new Map<string, Set<string>>();
const liveHostStreamsBySocket = new Map<string, Set<string>>();
const liveViewerCountPersistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const liveViewerCountPending = new Map<string, number>();
const liveReactionCounts = new Map<string, Record<string, number>>();
const liveReactionDeltas = new Map<string, Record<string, number>>();
const liveReactionPersistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const liveReactionEmojis = new Set(['❤️', '🔥', '👏', '😂', '😮', '👍']);
type SocketUserProfile = { uid: string; name: string; photoURL: string | null };
const socketUserProfileCache = new Map<string, { profile: SocketUserProfile; expiresAt: number }>();
const SOCKET_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
type TypingEventName = 'typing:start' | 'typing:stop';

const getFriendIds = async (uid: string): Promise<string[]> => {
  const cached = friendIdsCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.ids;

  const doc = await getDb().collection('friends').doc(uid).get();
  const value = doc.exists ? doc.data()?.friendIds : undefined;
  const ids = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
  friendIdsCache.set(uid, { ids, expiresAt: Date.now() + FRIEND_IDS_CACHE_TTL_MS });
  return ids;
};

export const invalidateFriendIdsCache = (uid: string): void => {
  friendIdsCache.delete(uid);
};

const emitPresenceOnlineToFriends = async (io: Server, uid: string) => {
  const friendIds = await getFriendIds(uid);
  if (friendIds.length === 0) return;

  friendIds.forEach((friendUid) => {
    io.to(userRoom(friendUid)).emit('presence:online', { userId: uid });
  });
};

const emitPresenceOfflineToFriends = async (io: Server, uid: string, lastSeen: number) => {
  const friendIds = await getFriendIds(uid);
  if (friendIds.length === 0) return;

  friendIds.forEach((friendUid) => {
    io.to(userRoom(friendUid)).emit('presence:offline', { userId: uid, lastSeen });
  });
};

const addSocketStream = (map: Map<string, Set<string>>, socketId: string, streamId: string) => {
  const streams = map.get(socketId) ?? new Set<string>();
  streams.add(streamId);
  map.set(socketId, streams);
};

const removeSocketStream = (map: Map<string, Set<string>>, socketId: string, streamId: string) => {
  const streams = map.get(socketId);
  if (!streams) return;
  streams.delete(streamId);
  if (streams.size === 0) map.delete(socketId);
};

const persistLiveViewerCount = async (streamId: string, viewerCount: number) => {
  try {
    await getDb().collection('live_streams').doc(streamId).set(
      {
        viewerCount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('[live] failed to persist viewer count:', error);
  }
};

const flushLiveViewerCount = async (streamId: string) => {
  const timer = liveViewerCountPersistTimers.get(streamId);
  if (timer) clearTimeout(timer);
  liveViewerCountPersistTimers.delete(streamId);

  const pending = liveViewerCountPending.get(streamId);
  if (pending == null) return;

  liveViewerCountPending.delete(streamId);
  await persistLiveViewerCount(streamId, pending);
};

const scheduleLiveViewerCountPersist = (streamId: string, viewerCount: number) => {
  liveViewerCountPending.set(streamId, viewerCount);
  if (liveViewerCountPersistTimers.has(streamId)) return;

  const timer = setTimeout(() => {
    liveViewerCountPersistTimers.delete(streamId);
    void flushLiveViewerCount(streamId);
  }, LIVE_VIEWER_COUNT_PERSIST_INTERVAL_MS);
  liveViewerCountPersistTimers.set(streamId, timer);
};

const emitLiveViewerCount = (io: Server, streamId: string) => {
  const viewerCount = liveViewerSockets.get(streamId)?.size ?? 0;
  io.to(liveStreamRoom(streamId)).emit('live:viewer-count', { streamId, count: viewerCount });
  scheduleLiveViewerCountPersist(streamId, viewerCount);
};

const getSocketUserProfile = async (socketId: string): Promise<SocketUserProfile | null> => {
  const uid = getUserIdBySocket(socketId);
  if (!uid) return null;

  const cached = socketUserProfileCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;

  const doc = await getDb().collection('users').doc(uid).get();
  const data = doc.data() ?? {};
  const profile = {
    uid,
    name:
      (data.displayName as string | undefined)?.trim() ||
      (data.email as string | undefined)?.split('@')[0] ||
      'Surf user',
    photoURL: (data.photoURL as string | null | undefined) ?? null,
  };
  socketUserProfileCache.set(uid, {
    profile,
    expiresAt: Date.now() + SOCKET_PROFILE_CACHE_TTL_MS,
  });
  return profile;
};

const getLiveReactionCounts = async (streamId: string): Promise<Record<string, number>> => {
  const current = liveReactionCounts.get(streamId);
  if (current) return current;

  const cached = await getCachedLiveStream<{ reactionCounts?: Record<string, number> }>(streamId);
  const counts =
    cached?.reactionCounts && typeof cached.reactionCounts === 'object'
      ? { ...cached.reactionCounts }
      : {};
  liveReactionCounts.set(streamId, counts);
  return counts;
};

const flushLiveReactionDeltas = async (streamId: string) => {
  const timer = liveReactionPersistTimers.get(streamId);
  if (timer) clearTimeout(timer);
  liveReactionPersistTimers.delete(streamId);

  const deltas = liveReactionDeltas.get(streamId);
  if (!deltas) return;

  liveReactionDeltas.delete(streamId);
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  Object.entries(deltas).forEach(([emoji, value]) => {
    if (value > 0) update[`reactionCounts.${emoji}`] = FieldValue.increment(value);
  });

  if (Object.keys(update).length <= 1) return;

  try {
    await getDb().collection('live_streams').doc(streamId).set(update, { merge: true });
  } catch (error) {
    console.error('[live] failed to persist reaction counts:', error);
  }
};

const scheduleLiveReactionPersist = (streamId: string) => {
  if (liveReactionPersistTimers.has(streamId)) return;

  const timer = setTimeout(() => {
    liveReactionPersistTimers.delete(streamId);
    void flushLiveReactionDeltas(streamId);
  }, LIVE_REACTION_PERSIST_INTERVAL_MS);
  liveReactionPersistTimers.set(streamId, timer);
};

const endHostedLiveStream = async (io: Server, streamId: string, socketId: string) => {
  if (liveHostSockets.get(streamId) !== socketId) return;

  liveHostSockets.delete(streamId);
  removeSocketStream(liveHostStreamsBySocket, socketId, streamId);

  try {
    await flushLiveViewerCount(streamId);
    await flushLiveReactionDeltas(streamId);
    await getDb().collection('live_streams').doc(streamId).set(
      {
        status: 'ended',
        endedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('[live] failed to mark stream ended:', error);
  }

  liveReactionCounts.delete(streamId);
  await invalidateLiveStreamCache(streamId);
  io.to(liveStreamRoom(streamId)).emit('live:ended', { streamId });
};

const leaveViewedLiveStream = async (
  io: Server,
  streamId: string,
  socketId: string,
  reason = 'left'
) => {
  const viewers = liveViewerSockets.get(streamId);
  if (!viewers?.has(socketId)) return;

  viewers.delete(socketId);
  if (viewers.size === 0) liveViewerSockets.delete(streamId);
  removeSocketStream(liveViewerStreamsBySocket, socketId, streamId);

  const hostSocketId = liveHostSockets.get(streamId);
  if (hostSocketId) {
    io.to(hostSocketId).emit('live:viewer-left', {
      streamId,
      viewerSocketId: socketId,
      reason,
    });
  }

  emitLiveViewerCount(io, streamId);
};

const cleanupLiveSocket = async (io: Server, socketId: string, reason = 'disconnect') => {
  const viewedStreams = [...(liveViewerStreamsBySocket.get(socketId) ?? [])];
  await Promise.all(
    viewedStreams.map((streamId) => leaveViewedLiveStream(io, streamId, socketId, reason))
  );

  const hostedStreams = [...(liveHostStreamsBySocket.get(socketId) ?? [])];
  await Promise.all(hostedStreams.map((streamId) => endHostedLiveStream(io, streamId, socketId)));
};

export const registerSocketHandlers = (io: Server) => {
  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    socket.on('join', async (userId: string) => {
      if (!userId || typeof userId !== 'string') return;

      try {
        const normalizedUid = userId.trim();
        if (!normalizedUid) return;

        const previousUid = getUserIdBySocket(socket.id);
        if (previousUid && previousUid !== normalizedUid) {
          const previousLastSeen = await markOffline(previousUid, socket.id);
          if (previousLastSeen != null) {
            await emitPresenceOfflineToFriends(io, previousUid, previousLastSeen);
          }
        }

        await markOnline(normalizedUid, socket.id);

        socket.join(userRoom(normalizedUid));
        const room = io.sockets.adapter.rooms.get(userRoom(normalizedUid));
        const roomSize = room ? room.size : 0;
        console.log(`👤 User ${normalizedUid} joined their room (${roomSize} clients in room)`);

        // Emitting online on each join is safe (idempotent on client Set) and avoids stale-state misses.
        await emitPresenceOnlineToFriends(io, normalizedUid);
      } catch (error) {
        console.error('[presence] failed to process join:', error);
      }
    });

    socket.on('presence:heartbeat', async (userIdPayload: string) => {
      try {
        const mappedUid = getUserIdBySocket(socket.id);
        const normalizedPayload = typeof userIdPayload === 'string' ? userIdPayload.trim() : '';

        // Only accept heartbeats for the user currently bound to this socket.
        if (mappedUid && normalizedPayload && mappedUid !== normalizedPayload) return;

        const uid = mappedUid || normalizedPayload;
        if (!uid) return;

        await refreshPresence(uid);
      } catch (error) {
        console.error('[presence] failed to refresh heartbeat:', error);
      }
    });

    socket.on('post:join', (postId: string) => {
      socket.join(postRoom(postId));
    });

    socket.on('post:leave', (postId: string) => {
      socket.leave(postRoom(postId));
    });

    socket.on('conversation:join', (conversationId: string) => {
      socket.join(conversationRoom(conversationId));
    });

    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(conversationRoom(conversationId));
    });

    const emitTypingEvent = async (
      eventName: TypingEventName,
      payload: { conversationId?: string }
    ) => {
      try {
        const uid = getUserIdBySocket(socket.id);
        const conversationId =
          typeof payload?.conversationId === 'string' ? payload.conversationId.trim() : '';
        if (!uid || !conversationId) return;

        const memberIds = await conversationRepository.getMemberIds(conversationId);
        if (!memberIds.includes(uid)) return;

        socket.to(conversationRoom(conversationId)).emit(eventName, {
          conversationId,
          userId: uid,
        });
      } catch (error) {
        console.error(`[messages] failed to emit ${eventName}:`, error);
      }
    };

    socket.on('typing:start', (payload: { conversationId?: string }) => {
      void emitTypingEvent('typing:start', payload);
    });

    socket.on('typing:stop', (payload: { conversationId?: string }) => {
      void emitTypingEvent('typing:stop', payload);
    });

    socket.on(
      'live:join',
      async (payload: { streamId?: string; role?: 'broadcaster' | 'viewer' }) => {
        const streamId = typeof payload?.streamId === 'string' ? payload.streamId.trim() : '';
        if (!streamId) return;

        socket.join(liveStreamRoom(streamId));

        if (payload.role === 'broadcaster') {
          liveHostSockets.set(streamId, socket.id);
          addSocketStream(liveHostStreamsBySocket, socket.id, streamId);
          socket.to(liveStreamRoom(streamId)).emit('live:host-ready', { streamId });
          return;
        }

        const viewers = liveViewerSockets.get(streamId) ?? new Set<string>();
        viewers.add(socket.id);
        liveViewerSockets.set(streamId, viewers);
        addSocketStream(liveViewerStreamsBySocket, socket.id, streamId);

        emitLiveViewerCount(io, streamId);

        const hostSocketId = liveHostSockets.get(streamId);
        if (hostSocketId) {
          io.to(hostSocketId).emit('live:viewer-joined', {
            streamId,
            viewerSocketId: socket.id,
            viewerId: getUserIdBySocket(socket.id) ?? null,
          });
        }
      }
    );

    socket.on('live:leave', async (payload: { streamId?: string }) => {
      const streamId = typeof payload?.streamId === 'string' ? payload.streamId.trim() : '';
      if (!streamId) return;

      await leaveViewedLiveStream(io, streamId, socket.id, 'left');
      await endHostedLiveStream(io, streamId, socket.id);
      socket.leave(liveStreamRoom(streamId));
    });

    socket.on(
      'live:signal',
      (payload: { streamId?: string; targetSocketId?: string; signal?: unknown }) => {
        const streamId = typeof payload?.streamId === 'string' ? payload.streamId.trim() : '';
        const targetSocketId =
          typeof payload?.targetSocketId === 'string' ? payload.targetSocketId.trim() : '';
        if (!streamId || !targetSocketId || !payload.signal) return;

        io.to(targetSocketId).emit('live:signal', {
          streamId,
          fromSocketId: socket.id,
          signal: payload.signal,
        });
      }
    );

    socket.on('live:comment', async (payload: { streamId?: string; text?: string }) => {
      try {
        const streamId = typeof payload?.streamId === 'string' ? payload.streamId.trim() : '';
        const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, 500) : '';
        if (!streamId || !text) return;

        const profile = await getSocketUserProfile(socket.id);
        if (!profile) return;

        const createdAt = new Date();
        const ref = await getDb().collection('live_stream_comments').add({
          streamId,
          userId: profile.uid,
          authorName: profile.name,
          authorPhotoURL: profile.photoURL,
          text,
          createdAt,
        });

        io.to(liveStreamRoom(streamId)).emit('live:comment', {
          id: ref.id,
          streamId,
          userId: profile.uid,
          authorName: profile.name,
          authorPhotoURL: profile.photoURL,
          text,
          createdAt: createdAt.toISOString(),
        });
      } catch (error) {
        console.error('[live] failed to process comment:', error);
      }
    });

    socket.on('live:reaction', async (payload: { streamId?: string; emoji?: string }) => {
      try {
        const streamId = typeof payload?.streamId === 'string' ? payload.streamId.trim() : '';
        const emoji = typeof payload?.emoji === 'string' ? payload.emoji.trim() : '';
        if (!streamId || !liveReactionEmojis.has(emoji)) return;

        const uid = getUserIdBySocket(socket.id);
        if (!uid) return;

        const counts = await getLiveReactionCounts(streamId);
        counts[emoji] = (typeof counts[emoji] === 'number' ? counts[emoji] : 0) + 1;

        const deltas = liveReactionDeltas.get(streamId) ?? {};
        deltas[emoji] = (typeof deltas[emoji] === 'number' ? deltas[emoji] : 0) + 1;
        liveReactionDeltas.set(streamId, deltas);
        scheduleLiveReactionPersist(streamId);

        io.to(liveStreamRoom(streamId)).emit('live:reaction', {
          streamId,
          userId: uid,
          emoji,
          counts: { ...counts },
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[live] failed to process reaction:', error);
      }
    });

    registerCallHandlers(io, socket);

    socket.on('disconnect', async () => {
      try {
        await cleanupLiveSocket(io, socket.id);

        const uid = getUserIdBySocket(socket.id);
        if (uid) {
          const lastSeen = await markOffline(uid, socket.id);
          if (lastSeen != null) {
            await emitPresenceOfflineToFriends(io, uid, lastSeen);
          }
        }
      } catch (error) {
        console.error('[presence] failed to process disconnect:', error);
      }

      console.log('🔌 Client disconnected:', socket.id);
    });
  });
};
