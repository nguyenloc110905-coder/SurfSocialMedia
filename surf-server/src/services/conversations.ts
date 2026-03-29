import { getDb } from '../config/firebase-admin.js';
import { getRedis } from '../config/redis.js';
import { hasBlockRelation } from '../middleware/auth.js';
import { conversationRepository } from '../repositories/conversation.repository.js';
import { buildDmPairKey, ConservationDoc } from '../types/conversation.js';

const DM_CACHE_TTL_SEC = 60 * 60 * 24 * 30;
const dmCacheKey = (pairKey: string) => `dm:${pairKey}`;

export type CreateDmResult =
  | { ok: true; created: boolean; item: ConservationDoc }
  | { ok: false; reason: 'invalid_peer' | 'peer_not_found' | 'blocked' };

export type ApiConversation = Omit<ConservationDoc, 'createdAt' | 'updatedAt' | 'lastMessageAt'> & {
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
};

export const toApiConversation = (item: ConservationDoc): ApiConversation => ({
  ...item,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  lastMessageAt: item.lastMessageAt ? item.lastMessageAt.toISOString() : null,
});

const userExists = async (uid: string): Promise<boolean> => {
  const snap = await getDb().collection('users').doc(uid).get();
  return snap.exists;
};

export const createOrGetDmConversation = async (
  actorUid: string,
  peerUidRaw: string
): Promise<CreateDmResult> => {
  const peerUid = peerUidRaw.trim();
  if (!peerUid || peerUid === actorUid) return { ok: false, reason: 'invalid_peer' };
  if (!(await userExists(peerUid))) return { ok: false, reason: 'peer_not_found' };
  if (await hasBlockRelation(actorUid, peerUid)) return { ok: false, reason: 'blocked' };

  const pairKey = buildDmPairKey(actorUid, peerUid);
  const redis = getRedis();

  const cachedConservationId = redis ? await redis.get(dmCacheKey(pairKey)) : null;
  if (cachedConservationId) {
    const cached = await conversationRepository.getById(cachedConservationId);
    if (cached) return { ok: true, created: false, item: cached };
    // Cache bị lỗi, xóa cache để lần sau tạo mới
    await redis?.del(dmCacheKey(pairKey));
  }
  const result = await conversationRepository.findOrCreateDm(actorUid, peerUid);
  await redis?.set(dmCacheKey(pairKey), result.item.id, { EX: DM_CACHE_TTL_SEC });
  return { ok: true, created: result.created, item: result.item };
};
