import { getDb } from '../config/firebase-admin.js';
import { getRedis } from '../config/redis.js';
import { hasBlockRelation } from '../middleware/auth.js';
import { conversationRepository } from '../repositories/conversation.repository.js';
import { buildMessagePreview, messageRepository } from '../repositories/message.repository.js';
import { buildDmPairKey, ConservationDoc } from '../types/conversation.js';
import type {
  MessageDoc,
  SendTextMessageInput,
  SendMediaMessageInput,
  CreateCallLogInput,
} from '../types/message.js';

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

export type ApiMessage = Omit<MessageDoc, 'createdAt'> & {
  createdAt: string;
};

export type RealtimeConversationPatch = {
  id: string;
  lastMessagePreview: string;
  lastMessageAt: string;
};

export type RealtimeMessagePayload = {
  message: ApiMessage;
  conversation: RealtimeConversationPatch;
};

type UserLite = {
  displayName?: string;
  photoURL?: string | null;
};

export type ApiConversationListItem = {
  id: string;
  type: ConservationDoc['type'];
  title?: string;
  peer: { uid: string; name: string; avatarUrl: string | null } | null;
  members?: { uid: string; name: string; avatarUrl: string | null }[];
  memberCount?: number;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

export type SendTextMessageResult =
  | { ok: true; item: MessageDoc; recipientIds: string[] }
  | { ok: false; reason: 'invalid_text' | 'not_found' | 'forbidden' | 'blocked' };

export type SendMediaMessageResult =
  | { ok: true; item: MessageDoc; recipientIds: string[] }
  | { ok: false; reason: 'invalid_media' | 'not_found' | 'forbidden' | 'blocked' };
export type CreateCallLogResult =
  | { ok: true; item: MessageDoc; participantIds: string[]; recipientIds: string[] }
  | { ok: false; reason: 'not_found' };

export type ListMessagesResult =
  | { ok: true; items: MessageDoc[]; nextCursor: string | null }
  | { ok: false; reason: 'not_found' | 'forbidden' };

export type MarkConversationReadResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'forbidden' };

export const toApiConversation = (item: ConservationDoc): ApiConversation => ({
  ...item,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  lastMessageAt: item.lastMessageAt ? item.lastMessageAt.toISOString() : null,
});

export const toApiMessage = (item: MessageDoc): ApiMessage => ({
  ...item,
  createdAt: item.createdAt.toISOString(),
});

export const toRealtimeMessagePayload = (item: MessageDoc): RealtimeMessagePayload => {
  const message = toApiMessage(item);
  const previewMap: Record<string, string> = {
    image: '📷 Hình ảnh',
    file: '📎 Tệp đính kèm',
    audio: '🎤 Tin nhắn thoại',
  };
  const preview =
    item.type === 'text'
      ? buildMessagePreview(item.text)
      : item.text
        ? buildMessagePreview(item.text)
        : (previewMap[item.type] ?? '📎 Tệp');

  return {
    message,
    conversation: {
      id: item.conversationId,
      lastMessagePreview: preview,
      lastMessageAt: message.createdAt,
    },
  };
};

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

export const sendTextMessage = async (
  input: SendTextMessageInput
): Promise<SendTextMessageResult> => {
  const text = input.text.trim();
  if (!text) return { ok: false, reason: 'invalid_text' };

  const conversation = await conversationRepository.getById(input.conversationId);
  if (!conversation) return { ok: false, reason: 'not_found' };
  if (!conversation.memberIds.includes(input.senderId)) {
    return { ok: false, reason: 'forbidden' };
  }

  const recipientIds = conversation.memberIds.filter((id) => id !== input.senderId);
  const peerUid = recipientIds[0];

  if (peerUid && (await hasBlockRelation(input.senderId, peerUid))) {
    return { ok: false, reason: 'blocked' };
  }

  const item = await messageRepository.createTextMessage(
    input.conversationId,
    input.senderId,
    text,
    recipientIds
  );

  return { ok: true, item, recipientIds };
};

export const sendMediaMessage = async (
  input: SendMediaMessageInput
): Promise<SendMediaMessageResult> => {
  if (!input.mediaUrl) return { ok: false, reason: 'invalid_media' };

  const conversation = await conversationRepository.getById(input.conversationId);
  if (!conversation) return { ok: false, reason: 'not_found' };
  if (!conversation.memberIds.includes(input.senderId)) {
    return { ok: false, reason: 'forbidden' };
  }

  const recipientIds = conversation.memberIds.filter((id) => id !== input.senderId);
  const peerUid = recipientIds[0];

  if (peerUid && (await hasBlockRelation(input.senderId, peerUid))) {
    return { ok: false, reason: 'blocked' };
  }

  const item = await messageRepository.createMediaMessage(
    input.conversationId,
    input.senderId,
    input.type,
    input.mediaUrl,
    recipientIds,
    input.fileName,
    input.text
  );

  return { ok: true, item, recipientIds };
};
export const createCallLogMessage = async (
  input: CreateCallLogInput
): Promise<CreateCallLogResult> => {
  const conversation = await conversationRepository.getById(input.conversationId);
  if (!conversation) return { ok: false, reason: 'not_found' };

  const participantIds = conversation.memberIds;
  const recipientIds = participantIds.filter((uid) => uid !== input.actorId);

  const item = await messageRepository.createCallLogMessage({
    ...input,
    recipientIds,
  });

  return { ok: true, item, participantIds, recipientIds };
};

export const listMessagesForConversation = async (
  userId: string,
  conversationId: string,
  limit = 10,
  beforeCursor?: string
): Promise<ListMessagesResult> => {
  const conversation = await conversationRepository.getById(conversationId);
  if (!conversation) return { ok: false, reason: 'not_found' };
  if (!conversation.memberIds.includes(userId)) {
    return { ok: false, reason: 'forbidden' };
  }

  const page = await messageRepository.listByConversation({
    conversationId,
    limit,
    beforeCursor,
  });
  return { ok: true, items: page.items, nextCursor: page.nextCursor };
};

export const markConversationRead = async (
  userId: string,
  conversationId: string
): Promise<MarkConversationReadResult> => {
  const conversation = await conversationRepository.getById(conversationId);
  if (!conversation) return { ok: false, reason: 'not_found' };
  if (!conversation.memberIds.includes(userId)) {
    return { ok: false, reason: 'forbidden' };
  }

  await conversationRepository.markReadByUser(conversationId, userId);
  return { ok: true };
};

export type CreateGroupResult =
  | { ok: true; item: ConservationDoc }
  | { ok: false; reason: 'invalid_title' | 'too_few_members' };

export const createGroupConversation = async (
  actorUid: string,
  title: string,
  memberUids: string[]
): Promise<CreateGroupResult> => {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { ok: false, reason: 'invalid_title' };

  const uniqueMembers = Array.from(new Set([actorUid, ...memberUids]));
  if (uniqueMembers.length < 2) return { ok: false, reason: 'too_few_members' };

  const item = await conversationRepository.createGroup(actorUid, trimmedTitle, uniqueMembers);
  return { ok: true, item };
};

export type AddMembersResult =
  | { ok: true; addedIds: string[] }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'not_group' };

export const addMembersToGroup = async (
  actorUid: string,
  conversationId: string,
  newMemberIds: string[]
): Promise<AddMembersResult> => {
  const conversation = await conversationRepository.getById(conversationId);
  if (!conversation) return { ok: false, reason: 'not_found' };
  if (conversation.type !== 'group') return { ok: false, reason: 'not_group' };
  if (!conversation.memberIds.includes(actorUid)) return { ok: false, reason: 'forbidden' };

  const toAdd = newMemberIds.filter((id) => !conversation.memberIds.includes(id));
  if (toAdd.length === 0) return { ok: true, addedIds: [] };

  await conversationRepository.addMembers(conversationId, toAdd);
  return { ok: true, addedIds: toAdd };
};

export type GetGroupMembersResult =
  | { ok: true; members: { uid: string; name: string; avatarUrl: string | null }[] }
  | { ok: false; reason: 'not_found' | 'forbidden' };

export const getGroupMembers = async (
  actorUid: string,
  conversationId: string
): Promise<GetGroupMembersResult> => {
  const conversation = await conversationRepository.getById(conversationId);
  if (!conversation) return { ok: false, reason: 'not_found' };
  if (!conversation.memberIds.includes(actorUid)) return { ok: false, reason: 'forbidden' };

  const snaps =
    conversation.memberIds.length > 0
      ? await getDb().getAll(
          ...conversation.memberIds.map((id) => getDb().collection('users').doc(id))
        )
      : [];

  const members = snaps.map((s) => {
    const data = (s.data() ?? {}) as UserLite;
    return {
      uid: s.id,
      name: data.displayName ?? 'Unknown',
      avatarUrl: data.photoURL ?? null,
    };
  });

  return { ok: true, members };
};

export const getUnreadConversationCount = async (userId: string): Promise<number> => {
  const docs = await conversationRepository.listByMemberForUnread(userId);

  return docs.reduce((total, doc) => total + (doc.unreadCountByUser?.[userId] ?? 0), 0);
};

export const listConversationsForUser = async (
  userId: string,
  limit = 20
): Promise<ApiConversationListItem[]> => {
  const docs = await conversationRepository.listByMember(userId, limit);

  const allMemberIds = Array.from(
    new Set(docs.flatMap((d) => d.memberIds).filter((id) => id !== userId))
  );

  const memberSnaps =
    allMemberIds.length > 0
      ? await getDb().getAll(...allMemberIds.map((id) => getDb().collection('users').doc(id)))
      : [];

  const memberMap = new Map<string, UserLite>(
    memberSnaps.map((s) => [s.id, (s.data() ?? {}) as UserLite])
  );

  const toMember = (uid: string) => {
    const data = memberMap.get(uid);
    return {
      uid,
      name: data?.displayName ?? 'Unknown',
      avatarUrl: data?.photoURL ?? null,
    };
  };

  return docs.map((d) => {
    if (d.type === 'group') {
      const otherIds = d.memberIds.filter((id) => id !== userId);
      return {
        id: d.id,
        type: d.type,
        title: d.title,
        peer: null,
        members: otherIds.map(toMember),
        memberCount: d.memberIds.length,
        unreadCount: d.unreadCountByUser?.[userId] ?? 0,
        lastMessagePreview: d.lastMessagePreview ?? null,
        lastMessageAt: d.lastMessageAt ? d.lastMessageAt.toISOString() : null,
      };
    }

    const peerUid = d.memberIds.find((id) => id !== userId) ?? null;
    return {
      id: d.id,
      type: d.type,
      peer: peerUid ? toMember(peerUid) : null,
      unreadCount: d.unreadCountByUser?.[userId] ?? 0,
      lastMessagePreview: d.lastMessagePreview ?? null,
      lastMessageAt: d.lastMessageAt ? d.lastMessageAt.toISOString() : null,
    };
  });
};
