import type { Server } from 'socket.io';
import { getDb } from '../config/firebase-admin.js';
import { registerCallHandlers } from './handlers/call.handlers.js';
import { conversationRoom, postRoom, userRoom } from './rooms.js';
import {
  getUserIdBySocket,
  markOffline,
  markOnline,
  refreshPresence,
} from '../services/presence.js';

const getFriendIds = async (uid: string): Promise<string[]> => {
  const doc = await getDb().collection('friends').doc(uid).get();
  if (!doc.exists) return [];
  const value = doc.data()?.friendIds;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
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
        const normalizedPayload =
          typeof userIdPayload === 'string' ? userIdPayload.trim() : '';

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

    registerCallHandlers(io, socket);

    socket.on('disconnect', async () => {
      try {
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
