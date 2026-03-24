import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export const redisPub = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export const redisSub = redisPub.duplicate();
export const redisState = redisPub.duplicate();

const presenceKey = (uid: string) => `presence:user:${uid}`;
const unreadKey = (uid: string, conversationId: string) => `unread:${uid}:${conversationId}`;

export const setUserOnline = async (uid: string) => {
  await redisState.set(presenceKey(uid), '1', 'EX', env.presenceTtlSeconds);
};

export const setUserOffline = async (uid: string) => {
  await redisState.del(presenceKey(uid));
};

export const isUserOnline = async (uid: string): Promise<boolean> => {
  const result = await redisState.exists(presenceKey(uid));
  return result === 1;
};

export const incrementUnreadForMembers = async (
  memberIds: string[],
  senderId: string,
  conversationId: string,
) => {
  if (memberIds.length === 0) return;
  const pipeline = redisState.pipeline();
  for (const memberId of memberIds) {
    if (memberId === senderId) continue;
    pipeline.incr(unreadKey(memberId, conversationId));
    pipeline.expire(unreadKey(memberId, conversationId), 60 * 60 * 24 * 14);
  }
  await pipeline.exec();
};

export const resetUnread = async (uid: string, conversationId: string) => {
  await redisState.set(unreadKey(uid, conversationId), '0', 'EX', 60 * 60 * 24 * 14);
};

export const getUnread = async (uid: string, conversationId: string): Promise<number> => {
  const value = await redisState.get(unreadKey(uid, conversationId));
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
