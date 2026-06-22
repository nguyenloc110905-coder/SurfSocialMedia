import { getRedis } from '../config/redis.js';
import { getDb } from '../config/firebase-admin.js';

const TTL = 90; // presence TTL (seconds)
const LAST_SEEN_TTL = 0; // 0 means lastSeen is persisted without Redis expiry

// In-memory fallback (no Redis)
const memSockets = new Map<string, Set<string>>(); // userId -> socketIds
const memLastSeen = new Map<string, number>(); // userId -> Unix ms timestamp

// Global map: socketId -> userId (for disconnect lookup)
const socketToUser = new Map<string, string>();

const getLastSeenKey = (userId: string) => `presence:lastseen:${userId}`;

function normalizeLastSeenValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (value && typeof value === 'object') {
    const timestamp = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof timestamp.toMillis === 'function') {
      const millis = timestamp.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof timestamp.toDate === 'function') {
      const millis = timestamp.toDate().getTime();
      return Number.isFinite(millis) ? millis : null;
    }
    const seconds = typeof timestamp._seconds === 'number' ? timestamp._seconds : timestamp.seconds;
    return typeof seconds === 'number' && Number.isFinite(seconds) ? seconds * 1000 : null;
  }
  return null;
}

const writeLastSeen = async (userId: string, ts: number): Promise<void> => {
  const redis = getRedis();
  const redisWrite = redis
    ? LAST_SEEN_TTL > 0
      ? redis.set(getLastSeenKey(userId), String(ts), { EX: LAST_SEEN_TTL })
      : redis.set(getLastSeenKey(userId), String(ts))
    : Promise.resolve();

  memLastSeen.set(userId, ts);

  await Promise.all([
    redisWrite,
    getDb().collection('users').doc(userId).set({ lastSeenAt: ts }, { merge: true }),
  ]);
};

const readFirestoreLastSeen = async (userId: string): Promise<number | null> => {
  const doc = await getDb().collection('users').doc(userId).get();
  if (!doc.exists) return null;
  return normalizeLastSeenValue(doc.data()?.lastSeenAt);
};

const readFirestoreLastSeenMap = async (userIds: string[]): Promise<Record<string, number>> => {
  const result: Record<string, number> = {};
  if (userIds.length === 0) return result;

  const refs = userIds.map((uid) => getDb().collection('users').doc(uid));
  const docs = await getDb().getAll(...refs);
  docs.forEach((doc, index) => {
    if (!doc.exists) return;
    const ts = normalizeLastSeenValue(doc.data()?.lastSeenAt);
    if (ts != null) result[userIds[index]] = ts;
  });
  return result;
};

export const markOnline = async (userId: string, socketId: string): Promise<void> => {
  socketToUser.set(socketId, userId);

  const redis = getRedis();
  if (redis) {
    await redis.set(`presence:${userId}`, '1', { EX: TTL });
    await redis.sAdd(`presence:sockets:${userId}`, socketId);
    await redis.expire(`presence:sockets:${userId}`, TTL + 10);
    // Clear lastSeen when coming online
    await redis.del(getLastSeenKey(userId));
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
      await writeLastSeen(userId, ts);
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
        await writeLastSeen(userId, ts);
        return ts;
      }
    }
    return null;
  }
};

export const refreshPresence = async (userId: string): Promise<void> => {
  const redis = getRedis();
  if (redis) {
    const refreshed = await redis.expire(`presence:${userId}`, TTL);
    if (refreshed === 0) {
      await redis.set(`presence:${userId}`, '1', { EX: TTL });
      await redis.del(getLastSeenKey(userId));
    }
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
    const val = await redis.get(getLastSeenKey(userId));
    const cached = normalizeLastSeenValue(val);
    if (cached != null) return cached;
    const persisted = await readFirestoreLastSeen(userId);
    if (persisted != null) {
      if (LAST_SEEN_TTL > 0) {
        await redis.set(getLastSeenKey(userId), String(persisted), { EX: LAST_SEEN_TTL });
      } else {
        await redis.set(getLastSeenKey(userId), String(persisted));
      }
    }
    return persisted;
  }
  return memLastSeen.get(userId) ?? (await readFirestoreLastSeen(userId));
};

export const getOnlineFromList = async (userIds: string[]): Promise<string[]> => {
  if (userIds.length === 0) return [];
  const redis = getRedis();
  if (redis) {
    const results = await Promise.all(userIds.map((uid) => redis.exists(`presence:${uid}`)));
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
      Promise.all(userIds.map((uid) => redis.get(getLastSeenKey(uid)))),
    ]);
    const online = userIds.filter((_, i) => onlineFlags[i] === 1);
    const lastSeen: Record<string, number> = {};
    const missingOfflineIds: string[] = [];
    userIds.forEach((uid, i) => {
      if (onlineFlags[i] !== 0) return;
      const cached = normalizeLastSeenValue(lastSeenValues[i]);
      if (cached != null) {
        lastSeen[uid] = cached;
      } else {
        missingOfflineIds.push(uid);
      }
    });
    const persistedLastSeen = await readFirestoreLastSeenMap(missingOfflineIds);
    await Promise.all(
      Object.entries(persistedLastSeen).map(([uid, ts]) =>
        LAST_SEEN_TTL > 0
          ? redis.set(getLastSeenKey(uid), String(ts), { EX: LAST_SEEN_TTL })
          : redis.set(getLastSeenKey(uid), String(ts))
      )
    );
    Object.assign(lastSeen, persistedLastSeen);
    return { online, lastSeen };
  }
  // in-memory fallback
  const online = userIds.filter((uid) => memSockets.has(uid));
  const lastSeen = await readFirestoreLastSeenMap(userIds.filter((uid) => !memSockets.has(uid)));
  userIds.forEach((uid) => {
    if (!memSockets.has(uid) && memLastSeen.has(uid)) {
      lastSeen[uid] = memLastSeen.get(uid)!;
    }
  });
  return { online, lastSeen };
};

export const getUserIdBySocket = (socketId: string): string | undefined =>
  socketToUser.get(socketId);
