import { getRedis } from '../config/redis.js';

const TTL = 90;                     // presence TTL (seconds)
const LAST_SEEN_TTL = 8 * 24 * 3600; // 8 days — keep lastSeen slightly longer than 7-day UI threshold

// In-memory fallback (no Redis)
const memSockets = new Map<string, Set<string>>(); // userId -> socketIds
const memLastSeen = new Map<string, number>();     // userId -> Unix ms timestamp

// Global map: socketId -> userId (for disconnect lookup)
const socketToUser = new Map<string, string>();

export const markOnline = async (userId: string, socketId: string): Promise<void> => {
  socketToUser.set(socketId, userId);

  const redis = getRedis();
  if (redis) {
    await redis.set(`presence:${userId}`, '1', { EX: TTL });
    await redis.sAdd(`presence:sockets:${userId}`, socketId);
    await redis.expire(`presence:sockets:${userId}`, TTL + 10);
    // Clear lastSeen when coming online
    await redis.del(`presence:lastseen:${userId}`);
  } else {
    if (!memSockets.has(userId)) memSockets.set(userId, new Set());
    memSockets.get(userId)!.add(socketId);
    memLastSeen.delete(userId);
  }
};

/** Returns the lastSeen ms timestamp if went fully offline, or null if still has sockets. */
export const markOffline = async (userId: string, socketId: string): Promise<number | null> => {
  socketToUser.delete(socketId);

  const redis = getRedis();
  if (redis) {
    await redis.sRem(`presence:sockets:${userId}`, socketId);
    const remaining = await redis.sCard(`presence:sockets:${userId}`);
    if (remaining === 0) {
      await redis.del(`presence:${userId}`);
      await redis.del(`presence:sockets:${userId}`);
      const ts = Date.now();
      await redis.set(`presence:lastseen:${userId}`, String(ts), { EX: LAST_SEEN_TTL });
      return ts;
    }
    return null;
  } else {
    const sockets = memSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        memSockets.delete(userId);
        const ts = Date.now();
        memLastSeen.set(userId, ts);
        return ts;
      }
    }
    return null;
  }
};

export const refreshPresence = async (userId: string): Promise<void> => {
  const redis = getRedis();
  if (redis) {
    await redis.expire(`presence:${userId}`, TTL);
    await redis.expire(`presence:sockets:${userId}`, TTL + 10);
  }
  // in-memory: no TTL needed
};

export const isOnline = async (userId: string): Promise<boolean> => {
  const redis = getRedis();
  if (redis) {
    return (await redis.exists(`presence:${userId}`)) === 1;
  }
  return memSockets.has(userId);
};

/** Returns last-seen Unix ms timestamp, or null if no record. */
export const getLastSeen = async (userId: string): Promise<number | null> => {
  const redis = getRedis();
  if (redis) {
    const val = await redis.get(`presence:lastseen:${userId}`);
    return val ? Number(val) : null;
  }
  return memLastSeen.get(userId) ?? null;
};

export const getOnlineFromList = async (userIds: string[]): Promise<string[]> => {
  if (userIds.length === 0) return [];
  const redis = getRedis();
  if (redis) {
    const results = await Promise.all(
      userIds.map((uid) => redis.exists(`presence:${uid}`))
    );
    return userIds.filter((_, i) => results[i] === 1);
  }
  return userIds.filter((uid) => memSockets.has(uid));
};

/** Returns { online: string[], lastSeen: Record<uid, ms_timestamp> } for offline members of userIds. */
export const getPresenceFromList = async (
  userIds: string[]
): Promise<{ online: string[]; lastSeen: Record<string, number> }> => {
  if (userIds.length === 0) return { online: [], lastSeen: {} };
  const redis = getRedis();
  if (redis) {
    const [onlineFlags, lastSeenValues] = await Promise.all([
      Promise.all(userIds.map((uid) => redis.exists(`presence:${uid}`))),
      Promise.all(userIds.map((uid) => redis.get(`presence:lastseen:${uid}`))),
    ]);
    const online = userIds.filter((_, i) => onlineFlags[i] === 1);
    const lastSeen: Record<string, number> = {};
    userIds.forEach((uid, i) => {
      if (onlineFlags[i] === 0 && lastSeenValues[i]) {
        lastSeen[uid] = Number(lastSeenValues[i]);
      }
    });
    return { online, lastSeen };
  }
  // in-memory fallback
  const online = userIds.filter((uid) => memSockets.has(uid));
  const lastSeen: Record<string, number> = {};
  userIds.forEach((uid) => {
    if (!memSockets.has(uid) && memLastSeen.has(uid)) {
      lastSeen[uid] = memLastSeen.get(uid)!;
    }
  });
  return { online, lastSeen };
};

export const getUserIdBySocket = (socketId: string): string | undefined =>
  socketToUser.get(socketId);
