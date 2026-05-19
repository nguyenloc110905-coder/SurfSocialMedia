import { getRedis } from '../config/redis.js';

const LIVE_STREAMS_CACHE_KEY = 'surf:live:streams:active:v1';
const LIVE_STREAM_BY_ID_CACHE_PREFIX = 'surf:live:stream:v1:';
const LIVE_STREAM_CACHE_TTL_SECONDS = Math.max(
  Number(process.env.LIVE_STREAM_CACHE_TTL_SECONDS) || 20,
  5
);

let liveStreamsMemoryCache: { items: unknown[]; expiresAt: number } | null = null;
const liveStreamByIdMemoryCache = new Map<string, { item: unknown; expiresAt: number }>();

const redisReady = () => {
  const redis = getRedis();
  return redis?.isOpen ? redis : null;
};

const streamKey = (streamId: string) => `${LIVE_STREAM_BY_ID_CACHE_PREFIX}${streamId}`;

export const getCachedLiveStreamList = async <T>(): Promise<T[] | null> => {
  const now = Date.now();
  if (liveStreamsMemoryCache && liveStreamsMemoryCache.expiresAt > now) {
    return liveStreamsMemoryCache.items as T[];
  }

  const redis = redisReady();
  if (!redis) return null;

  const cached = await redis.get(LIVE_STREAMS_CACHE_KEY);
  if (!cached) return null;

  try {
    const items = JSON.parse(cached) as T[];
    liveStreamsMemoryCache = {
      items,
      expiresAt: now + LIVE_STREAM_CACHE_TTL_SECONDS * 1000,
    };
    return items;
  } catch {
    await redis.del(LIVE_STREAMS_CACHE_KEY);
    return null;
  }
};

export const setCachedLiveStreamList = async <T>(items: T[]): Promise<void> => {
  liveStreamsMemoryCache = {
    items,
    expiresAt: Date.now() + LIVE_STREAM_CACHE_TTL_SECONDS * 1000,
  };

  await redisReady()?.set(LIVE_STREAMS_CACHE_KEY, JSON.stringify(items), {
    EX: LIVE_STREAM_CACHE_TTL_SECONDS,
  });
};

export const getCachedLiveStream = async <T>(streamId: string): Promise<T | null> => {
  const now = Date.now();
  const memory = liveStreamByIdMemoryCache.get(streamId);
  if (memory && memory.expiresAt > now) return memory.item as T;

  const redis = redisReady();
  if (!redis) return null;

  const key = streamKey(streamId);
  const cached = await redis.get(key);
  if (!cached) return null;

  try {
    const item = JSON.parse(cached) as T;
    liveStreamByIdMemoryCache.set(streamId, {
      item,
      expiresAt: now + LIVE_STREAM_CACHE_TTL_SECONDS * 1000,
    });
    return item;
  } catch {
    await redis.del(key);
    return null;
  }
};

export const setCachedLiveStream = async <T>(streamId: string, item: T): Promise<void> => {
  liveStreamByIdMemoryCache.set(streamId, {
    item,
    expiresAt: Date.now() + LIVE_STREAM_CACHE_TTL_SECONDS * 1000,
  });

  await redisReady()?.set(streamKey(streamId), JSON.stringify(item), {
    EX: LIVE_STREAM_CACHE_TTL_SECONDS,
  });
};

export const invalidateLiveStreamCache = async (streamId?: string): Promise<void> => {
  liveStreamsMemoryCache = null;
  if (streamId) liveStreamByIdMemoryCache.delete(streamId);

  const redis = redisReady();
  if (!redis) return;

  const keys = [LIVE_STREAMS_CACHE_KEY];
  if (streamId) keys.push(streamKey(streamId));
  await redis.del(keys);
};
