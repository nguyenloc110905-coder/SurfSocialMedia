import { getDb } from '../config/firebase-admin.js';
import { getRedis } from '../config/redis.js';
import { hasBlockRelation } from '../middleware/auth.js';
import { conversationMemberRepository } from '../repositories/conversation-member.repository.js';
import { conversationRepository } from '../repositories/conversation.repository.js';
import { buildMessagePreview, messageRepository } from '../repositories/message.repository.js';
import { buildDmPairKey, ConservationDoc } from '../types/conversation.js';
import type {
  CreateCallLogInput,
  MessageDoc,
  SendMediaMessageInput,
  SendTextMessageInput,
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

export type ApiReadReceiptItem = {
  userId: string;
  lastReadMessageId: string;
  lastReadMessageCreatedAt: string;
  lastReadAt: string | null;
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
  | { ok: true; item: ApiReadReceiptItem | null }
  | { ok: false; reason: 'not_found' | 'forbidden' };

export type MarkMessageReadByIdResult =
  | { ok: true; conversationId: string; item: ApiReadReceiptItem | null }
  | { ok: false; reason: 'not_found' | 'forbidden' };

export type HideMessageForSelfResult =
  | { ok: true; conversationId: string; messageId: string }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'not_sender' };

export type RecallMessageForEveryoneResult =
  | { ok: true; conversationId: string; item: MessageDoc }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'not_sender' };

export type ListReadReceiptsResult =
  | { ok: true; items: ApiReadReceiptItem[] }
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

export const toApiReadReceipt = (item: {
  userId: string;
  lastReadMessageId: string;
  lastReadMessageCreatedAt: Date;
  lastReadAt?: Date;
}): ApiReadReceiptItem => ({
  userId: item.userId,
  lastReadMessageId: item.lastReadMessageId,
  lastReadMessageCreatedAt: item.lastReadMessageCreatedAt.toISOString(),
  lastReadAt: item.lastReadAt ? item.lastReadAt.toISOString() : null,
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

const toConversationPreview = (message: MessageDoc | null) => {
  if (!message) {
    return {
      preview: null,
      at: null,
    };
  }

  const previewMap: Record<string, string> = {
    image: '📷 Hình ảnh',
    file: '📎 Tệp đính kèm',
    audio: '🎤 Tin nhắn thoại',
  };

  const preview =
    message.type === 'text'
      ? buildMessagePreview(message.text)
      : message.text
        ? buildMessagePreview(message.text)
        : (previewMap[message.type] ?? '📎 Tệp');

  return {
    preview,
    at: message.createdAt.toISOString(),
  };
};

const userExists = async (uid: string): Promise<boolean> => {
  const snap = await getDb().collection('users').doc(uid).get();
  return snap.exists;
};

const extractParticipantIds = async (conversationId: string): Promise<string[]> =>
  conversationRepository.getMemberIds(conversationId);

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
    if (cached) {
      await conversationMemberRepository.ensureMembers(cached.id, [actorUid, peerUid]);
      return { ok: true, created: false, item: cached };
    }
    await redis?.del(dmCacheKey(pairKey));
  }

  const result = await conversationRepository.findOrCreateDm(actorUid, peerUid);
  await conversationMemberRepository.ensureMembers(result.item.id, [actorUid, peerUid]);
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

  const memberIds = await extractParticipantIds(input.conversationId);
  if (!memberIds.includes(input.senderId)) {
    return { ok: false, reason: 'forbidden' };
  }

  const recipientIds = memberIds.filter((id) => id !== input.senderId);
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

  const memberIds = await extractParticipantIds(input.conversationId);
  if (!memberIds.includes(input.senderId)) {
    return { ok: false, reason: 'forbidden' };
  }

  const recipientIds = memberIds.filter((id) => id !== input.senderId);
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

  const participantIds = await extractParticipantIds(input.conversationId);
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

  const memberIds = await extractParticipantIds(conversationId);
  if (!memberIds.includes(userId)) {
    return { ok: false, reason: 'forbidden' };
  }

  const page = await messageRepository.listByConversation({
    conversationId,
    limit,
    beforeCursor,
    viewerId: userId,
  });
  return { ok: true, items: page.items, nextCursor: page.nextCursor };
};

export const markConversationRead = async (
  userId: string,
  conversationId: string,
  lastReadMessageId?: string,
  lastReadMessageCreatedAt?: string
): Promise<MarkConversationReadResult> => {
  const conversation = await conversationRepository.getById(conversationId);
  if (!conversation) return { ok: false, reason: 'not_found' };

  const memberIds = await extractParticipantIds(conversationId);
  if (!memberIds.includes(userId)) {
    return { ok: false, reason: 'forbidden' };
  }

  await conversationRepository.markReadByUser(conversationId, userId);

  if (!lastReadMessageId || !lastReadMessageCreatedAt) {
    return { ok: true, item: null };
  }

  const updated = await conversationMemberRepository.markRead(
    conversationId,
    userId,
    lastReadMessageId,
    lastReadMessageCreatedAt
  );

  return {
    ok: true,
    item: {
      userId,
      lastReadMessageId,
      lastReadMessageCreatedAt,
      lastReadAt: updated ? new Date().toISOString() : null,
    },
  };
};

export const markMessageReadById = async (
  userId: string,
  messageId: string,
  conversationIdHint?: string,
  lastReadMessageCreatedAt?: string
): Promise<MarkMessageReadByIdResult> => {
  const message = await messageRepository.getById(messageId, conversationIdHint);
  if (!message) return { ok: false, reason: 'not_found' };

  if (conversationIdHint && conversationIdHint !== message.conversationId) {
    return { ok: false, reason: 'not_found' };
  }

  const cursorDate = lastReadMessageCreatedAt
    ? new Date(lastReadMessageCreatedAt)
    : message.createdAt;
  const normalizedCursor = Number.isNaN(cursorDate.getTime())
    ? message.createdAt.toISOString()
    : cursorDate.toISOString();

  const result = await markConversationRead(
    userId,
    message.conversationId,
    message.id,
    normalizedCursor
  );

  if (!result.ok) return result;

  return {
    ok: true,
    conversationId: message.conversationId,
    item: result.item,
  };
};

export const hideMessageForSelf = async (
  userId: string,
  messageId: string,
  conversationIdHint?: string
): Promise<HideMessageForSelfResult> => {
  const message = await messageRepository.getById(messageId, conversationIdHint);
  if (!message) return { ok: false, reason: 'not_found' };

  if (conversationIdHint && conversationIdHint !== message.conversationId) {
    return { ok: false, reason: 'not_found' };
  }

  const memberIds = await extractParticipantIds(message.conversationId);
  if (!memberIds.includes(userId)) return { ok: false, reason: 'forbidden' };

  if (message.senderId !== userId) return { ok: false, reason: 'not_sender' };

  await messageRepository.hideForSelf(message.conversationId, message.id, userId);

  return {
    ok: true,
    conversationId: message.conversationId,
    messageId: message.id,
  };
};

export const recallMessageForEveryone = async (
  userId: string,
  messageId: string,
  conversationIdHint?: string
): Promise<RecallMessageForEveryoneResult> => {
  const message = await messageRepository.getById(messageId, conversationIdHint);
  if (!message) return { ok: false, reason: 'not_found' };

  if (conversationIdHint && conversationIdHint !== message.conversationId) {
    return { ok: false, reason: 'not_found' };
  }

  const memberIds = await extractParticipantIds(message.conversationId);
  if (!memberIds.includes(userId)) return { ok: false, reason: 'forbidden' };

  if (message.senderId !== userId) return { ok: false, reason: 'not_sender' };

  const item = await messageRepository.recallForEveryone(
    message.conversationId,
    message.id,
    userId
  );

  return {
    ok: true,
    conversationId: message.conversationId,
    item,
  };
};

export const listReadReceiptsForConversation = async (
  userId: string,
  conversationId: string,
  fromCreatedAt: string,
  toCreatedAt: string,
  limit = 150
): Promise<ListReadReceiptsResult> => {
  const conversation = await conversationRepository.getById(conversationId);
  if (!conversation) return { ok: false, reason: 'not_found' };

  const memberIds = await extractParticipantIds(conversationId);
  if (!memberIds.includes(userId)) {
    return { ok: false, reason: 'forbidden' };
  }

  const items = await conversationMemberRepository.listReadReceiptsInWindow(
    conversationId,
    fromCreatedAt,
    toCreatedAt,
    limit
  );

  return {
    ok: true,
    items: items
      .filter((item) => item.lastReadMessageId && item.lastReadMessageCreatedAt)
      .map((item) =>
        toApiReadReceipt({
          userId: item.userId,
          lastReadMessageId: item.lastReadMessageId ?? '',
          lastReadMessageCreatedAt: item.lastReadMessageCreatedAt ?? new Date(),
          lastReadAt: item.lastReadAt,
        })
      ),
  };
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
  await conversationMemberRepository.ensureMembers(item.id, uniqueMembers);
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

  const memberIds = await extractParticipantIds(conversationId);
  if (!memberIds.includes(actorUid)) return { ok: false, reason: 'forbidden' };

  const toAdd = newMemberIds.filter((id) => !memberIds.includes(id));
  if (toAdd.length === 0) return { ok: true, addedIds: [] };

  await conversationRepository.addMembers(conversationId, toAdd);
  await conversationMemberRepository.ensureMembers(conversationId, toAdd);
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

  const memberIds = await extractParticipantIds(conversationId);
  if (!memberIds.includes(actorUid)) return { ok: false, reason: 'forbidden' };

  const snaps =
    memberIds.length > 0
      ? await getDb().getAll(...memberIds.map((id) => getDb().collection('users').doc(id)))
      : [];

  const members = snaps.map((snap) => {
    const data = (snap.data() ?? {}) as UserLite;
    return {
      uid: snap.id,
      name: data.displayName ?? 'Unknown',
      avatarUrl: data.photoURL ?? null,
    };
  });

  return { ok: true, members };
};

export const getUnreadConversationCount = async (userId: string): Promise<number> =>
  conversationRepository.sumUnreadByUser(userId);

export const listConversationsForUser = async (
  userId: string,
  limit = 20
): Promise<ApiConversationListItem[]> => {
  const details = await conversationRepository.listByMemberDetails(userId, limit);
  const docs = details.map((detail) => detail.item);
  const memberIdsByConversation = new Map(
    details.map((detail) => [detail.item.id, detail.memberIds])
  );
  const unreadCountByConversation = new Map(
    details.map((detail) => [detail.item.id, detail.unreadCount])
  );

  const allMemberIds = Array.from(
    new Set(details.flatMap((detail) => detail.memberIds).filter((id) => id !== userId))
  );

  const memberSnaps =
    allMemberIds.length > 0
      ? await getDb().getAll(...allMemberIds.map((id) => getDb().collection('users').doc(id)))
      : [];

  const memberMap = new Map<string, UserLite>(
    memberSnaps.map((snap) => [snap.id, (snap.data() ?? {}) as UserLite])
  );

  const toMember = (uid: string) => {
    const data = memberMap.get(uid);
    return {
      uid,
      name: data?.displayName ?? 'Unknown',
      avatarUrl: data?.photoURL ?? null,
    };
  };

  const latestVisibleByConversation = new Map(
    await Promise.all(
      docs.map(async (doc) => {
        const page = await messageRepository.listByConversation({
          conversationId: doc.id,
          limit: 1,
          viewerId: userId,
        });
        return [doc.id, page.items[0] ?? null] as const;
      })
    )
  );

  return docs.map((doc) => {
    const memberIds = memberIdsByConversation.get(doc.id) ?? [];
    const latestVisible = latestVisibleByConversation.get(doc.id) ?? null;
    const { preview: lastMessagePreview, at: lastMessageAt } = toConversationPreview(latestVisible);

    if (doc.type === 'group') {
      const otherIds = memberIds.filter((id) => id !== userId);
      return {
        id: doc.id,
        type: doc.type,
        title: doc.title,
        peer: null,
        members: otherIds.map(toMember),
        memberCount: doc.memberCount,
        unreadCount: unreadCountByConversation.get(doc.id) ?? 0,
        lastMessagePreview,
        lastMessageAt,
      };
    }

    const peerUid = memberIds.find((id) => id !== userId) ?? null;
    return {
      id: doc.id,
      type: doc.type,
      peer: peerUid ? toMember(peerUid) : null,
      unreadCount: unreadCountByConversation.get(doc.id) ?? 0,
      lastMessagePreview,
      lastMessageAt,
    };
  });
};
