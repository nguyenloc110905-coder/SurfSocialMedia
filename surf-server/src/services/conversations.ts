import { getDb } from '../config/firebase-admin.js';
import { getRedis } from '../config/redis.js';
import { hasBlockRelation } from '../middleware/auth.js';
import { conversationMemberRepository } from '../repositories/conversation-member.repository.js';
import {
  conversationRepository,
  type ConversationListDetail,
} from '../repositories/conversation.repository.js';
import { buildMessagePreview, messageRepository } from '../repositories/message.repository.js';
import {
  buildDmPairKey,
  ConservationDoc,
  type MarketplaceConversationContext,
} from '../types/conversation.js';
import type {
  CreateCallLogInput,
  MessageDoc,
  MessageReactionActor,
  SendMediaMessageInput,
  SendTextMessageInput,
} from '../types/message.js';

const DM_CACHE_TTL_SEC = 60 * 60 * 24 * 30;
const dmCacheKey = (pairKey: string) => `dm:${pairKey}`;
const REPLY_PREFIX_PATTERN = /^↪\s*(.+?):\s*(.+)$/u;
const REPLY_TARGET_MARKER_INLINE_PATTERN = /__reply_to:[^\s]+__/g;
const REPLY_SENDER_MARKER_INLINE_PATTERN = /__reply_sender:[^\s]+__/g;
const REPLY_TARGET_MARKER_LINE_PATTERN = /^__reply_to:[^\n]+__\n?/;
const REPLY_SENDER_MARKER_LINE_PATTERN = /^__reply_sender:[^\n]+__\n?/;

export type CreateDmResult =
  | { ok: true; created: boolean; item: ConservationDoc }
  | { ok: false; reason: 'invalid_peer' | 'peer_not_found' | 'blocked' };

export type CreateMarketplaceConversationResult = CreateDmResult;

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
  conversationId: string;
  message: ApiMessage;
  conversation: RealtimeConversationPatch;
};

type UserLite = {
  displayName?: string;
  photoURL?: string | null;
  email?: string;
};

export type ApiConversationListItem = {
  id: string;
  type: ConservationDoc['type'];
  title?: string;
  marketplace?: ConservationDoc['marketplace'];
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
  | { ok: false; reason: 'not_found' | 'forbidden' };

export type RecallMessageForEveryoneResult =
  | { ok: true; conversationId: string; item: MessageDoc }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'not_sender' };

export type ToggleMessageReactionResult =
  | { ok: true; conversationId: string; item: MessageDoc }
  | {
      ok: false;
      reason: 'not_found' | 'forbidden' | 'invalid_emoji' | 'not_reactable';
    };

export type EditMessageTextResult =
  | { ok: true; conversationId: string; item: MessageDoc }
  | {
      ok: false;
      reason: 'not_found' | 'forbidden' | 'not_sender' | 'invalid_text' | 'not_editable';
    };

export type ForwardMessageResult =
  | { ok: true; conversationId: string; item: MessageDoc; recipientIds: string[] }
  | {
      ok: false;
      reason: 'not_found' | 'forbidden' | 'invalid_target' | 'invalid_content' | 'blocked';
    };

export type ToggleMessagePinResult =
  | { ok: true; conversationId: string; item: MessageDoc }
  | {
      ok: false;
      reason: 'not_found' | 'forbidden';
    };

export type ReportMessageResult =
  | { ok: true; conversationId: string; reportId: string }
  | {
      ok: false;
      reason: 'not_found' | 'forbidden' | 'invalid_reason';
    };

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
    conversationId: item.conversationId,
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
      senderId: null,
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
    senderId: message.senderId,
  };
};

const extractLatestChatContent = (input: string): string => {
  let text = input ?? '';

  text = text.replace(REPLY_TARGET_MARKER_INLINE_PATTERN, '');
  text = text.replace(REPLY_SENDER_MARKER_INLINE_PATTERN, '');

  if (REPLY_TARGET_MARKER_LINE_PATTERN.test(text)) {
    text = text.replace(REPLY_TARGET_MARKER_LINE_PATTERN, '');
  }
  if (REPLY_SENDER_MARKER_LINE_PATTERN.test(text)) {
    text = text.replace(REPLY_SENDER_MARKER_LINE_PATTERN, '');
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const match = line.match(REPLY_PREFIX_PATTERN);
    if (match) {
      const content = match[2].trim();
      if (content) {
        return content;
      }
    }
    return line;
  }

  return '';
};

const userExists = async (uid: string): Promise<boolean> => {
  const snap = await getDb().collection('users').doc(uid).get();
  return snap.exists;
};

const buildReactionActor = async (uid: string): Promise<MessageReactionActor> => {
  const snap = await getDb().collection('users').doc(uid).get();
  const data = (snap.data() ?? {}) as UserLite;
  const fallbackName = data.email?.split('@')[0] ?? 'Người dùng';

  return {
    uid,
    name: data.displayName?.trim() || fallbackName,
    avatarUrl: data.photoURL ?? null,
  };
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

export const createOrGetMarketplaceConversation = async (
  buyerIdRaw: string,
  sellerIdRaw: string,
  context: MarketplaceConversationContext
): Promise<CreateMarketplaceConversationResult> => {
  const buyerId = buyerIdRaw.trim();
  const sellerId = sellerIdRaw.trim();
  if (!buyerId || !sellerId || buyerId === sellerId) return { ok: false, reason: 'invalid_peer' };
  if (!(await userExists(sellerId))) return { ok: false, reason: 'peer_not_found' };
  if (await hasBlockRelation(buyerId, sellerId)) return { ok: false, reason: 'blocked' };

  const result = await conversationRepository.findOrCreateMarketplaceDm({
    buyerId,
    sellerId,
    context,
  });
  await conversationMemberRepository.ensureMembers(result.item.id, [buyerId, sellerId]);
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
  beforeCursor?: string,
  searchText?: string
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
    searchText,
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

export const toggleMessageReactionForMessage = async (
  userId: string,
  messageId: string,
  emoji: string,
  conversationIdHint?: string
): Promise<ToggleMessageReactionResult> => {
  const normalizedEmoji = emoji.trim();
  if (!normalizedEmoji) {
    return { ok: false, reason: 'invalid_emoji' };
  }

  const message = await messageRepository.getById(messageId, conversationIdHint);
  if (!message) return { ok: false, reason: 'not_found' };

  if (conversationIdHint && conversationIdHint !== message.conversationId) {
    return { ok: false, reason: 'not_found' };
  }

  if (message.type === 'call_log') {
    return { ok: false, reason: 'not_reactable' };
  }

  const memberIds = await extractParticipantIds(message.conversationId);
  if (!memberIds.includes(userId)) {
    return { ok: false, reason: 'forbidden' };
  }

  const actor = await buildReactionActor(userId);

  let item: MessageDoc;
  try {
    item = await messageRepository.toggleReaction(
      message.conversationId,
      message.id,
      userId,
      normalizedEmoji,
      actor
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'message_not_found') {
      return { ok: false, reason: 'not_found' };
    }

    throw error;
  }

  return {
    ok: true,
    conversationId: message.conversationId,
    item,
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

export const editMessageText = async (
  userId: string,
  messageId: string,
  text: string,
  conversationIdHint?: string
): Promise<EditMessageTextResult> => {
  const normalizedText = extractLatestChatContent(text).trim();
  if (!normalizedText) {
    return { ok: false, reason: 'invalid_text' };
  }

  const message = await messageRepository.getById(messageId, conversationIdHint);
  if (!message) return { ok: false, reason: 'not_found' };

  if (conversationIdHint && conversationIdHint !== message.conversationId) {
    return { ok: false, reason: 'not_found' };
  }

  const memberIds = await extractParticipantIds(message.conversationId);
  if (!memberIds.includes(userId)) {
    return { ok: false, reason: 'forbidden' };
  }

  if (message.senderId !== userId) {
    return { ok: false, reason: 'not_sender' };
  }

  if (message.type !== 'text') {
    return { ok: false, reason: 'not_editable' };
  }

  if (message.text.trim() === normalizedText) {
    return { ok: true, conversationId: message.conversationId, item: message };
  }

  const item = await messageRepository.editTextMessage(
    message.conversationId,
    message.id,
    userId,
    normalizedText
  );

  await conversationRepository.refreshPreviewIfLatestMessage(
    message.conversationId,
    message.createdAt,
    buildMessagePreview(item.text)
  );

  return {
    ok: true,
    conversationId: message.conversationId,
    item,
  };
};

export const forwardMessageToConversation = async (
  userId: string,
  messageId: string,
  targetConversationId: string,
  conversationIdHint?: string
): Promise<ForwardMessageResult> => {
  const normalizedTargetConversationId = targetConversationId.trim();
  if (!normalizedTargetConversationId) {
    return { ok: false, reason: 'invalid_target' };
  }

  const sourceMessage = await messageRepository.getById(messageId, conversationIdHint);
  if (!sourceMessage) {
    return { ok: false, reason: 'not_found' };
  }

  if (conversationIdHint && conversationIdHint !== sourceMessage.conversationId) {
    return { ok: false, reason: 'not_found' };
  }

  const sourceMemberIds = await extractParticipantIds(sourceMessage.conversationId);
  if (!sourceMemberIds.includes(userId)) {
    return { ok: false, reason: 'forbidden' };
  }

  const normalizedText = extractLatestChatContent(sourceMessage.text).trim();

  let forwarded:
    | { ok: true; item: MessageDoc; recipientIds: string[] }
    | {
        ok: false;
        reason: 'invalid_text' | 'invalid_media' | 'not_found' | 'forbidden' | 'blocked';
      };

  if (
    sourceMessage.type === 'image' ||
    sourceMessage.type === 'file' ||
    sourceMessage.type === 'audio'
  ) {
    if (!sourceMessage.mediaUrl) {
      return { ok: false, reason: 'invalid_content' };
    }

    forwarded = await sendMediaMessage({
      senderId: userId,
      conversationId: normalizedTargetConversationId,
      type: sourceMessage.type,
      mediaUrl: sourceMessage.mediaUrl,
      fileName: sourceMessage.fileName,
      text: normalizedText || undefined,
    });
  } else {
    const callLogText =
      sourceMessage.type === 'call_log' ? sourceMessage.text.trim() : normalizedText;
    if (!callLogText) {
      return { ok: false, reason: 'invalid_content' };
    }

    forwarded = await sendTextMessage({
      senderId: userId,
      conversationId: normalizedTargetConversationId,
      text: callLogText,
    });
  }

  if (!forwarded.ok) {
    if (forwarded.reason === 'blocked') {
      return { ok: false, reason: 'blocked' };
    }
    if (forwarded.reason === 'forbidden' || forwarded.reason === 'not_found') {
      return { ok: false, reason: forwarded.reason };
    }
    return { ok: false, reason: 'invalid_content' };
  }

  const forwardedItem = await messageRepository.markAsForwarded(
    forwarded.item.conversationId,
    forwarded.item.id,
    sourceMessage.id,
    sourceMessage.conversationId
  );

  return {
    ok: true,
    conversationId: forwardedItem.conversationId,
    item: forwardedItem,
    recipientIds: forwarded.recipientIds,
  };
};

export const toggleMessagePinForMessage = async (
  userId: string,
  messageId: string,
  pinned?: boolean,
  conversationIdHint?: string
): Promise<ToggleMessagePinResult> => {
  const message = await messageRepository.getById(messageId, conversationIdHint);
  if (!message) {
    return { ok: false, reason: 'not_found' };
  }

  if (conversationIdHint && conversationIdHint !== message.conversationId) {
    return { ok: false, reason: 'not_found' };
  }

  const memberIds = await extractParticipantIds(message.conversationId);
  if (!memberIds.includes(userId)) {
    return { ok: false, reason: 'forbidden' };
  }

  let item: MessageDoc;
  try {
    item = await messageRepository.togglePinForUser(
      message.conversationId,
      message.id,
      userId,
      pinned
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'message_not_found') {
      return { ok: false, reason: 'not_found' };
    }
    throw error;
  }

  return {
    ok: true,
    conversationId: message.conversationId,
    item,
  };
};

export const reportMessageForModeration = async (
  userId: string,
  messageId: string,
  reason: string,
  conversationIdHint?: string
): Promise<ReportMessageResult> => {
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    return { ok: false, reason: 'invalid_reason' };
  }

  const message = await messageRepository.getById(messageId, conversationIdHint);
  if (!message) {
    return { ok: false, reason: 'not_found' };
  }

  if (conversationIdHint && conversationIdHint !== message.conversationId) {
    return { ok: false, reason: 'not_found' };
  }

  const memberIds = await extractParticipantIds(message.conversationId);
  if (!memberIds.includes(userId)) {
    return { ok: false, reason: 'forbidden' };
  }

  const reportRef = await getDb().collection('message_reports').add({
    messageId: message.id,
    conversationId: message.conversationId,
    messageSenderId: message.senderId,
    reporterId: userId,
    reason: normalizedReason,
    createdAt: new Date(),
    status: 'open',
  });

  return {
    ok: true,
    conversationId: message.conversationId,
    reportId: reportRef.id,
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
  | {
      ok: false;
      reason: 'invalid_title' | 'too_few_members' | 'member_not_found' | 'blocked';
    };

export const createGroupConversation = async (
  actorUid: string,
  title: string,
  memberUids: string[]
): Promise<CreateGroupResult> => {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { ok: false, reason: 'invalid_title' };

  const normalizedMemberUids = memberUids
    .map((uid) => uid.trim())
    .filter((uid) => uid && uid !== actorUid);
  const uniqueMembers = Array.from(new Set([actorUid, ...normalizedMemberUids]));
  if (uniqueMembers.length < 2) return { ok: false, reason: 'too_few_members' };

  const invitedMemberIds = uniqueMembers.filter((uid) => uid !== actorUid);
  const memberExistsChecks = await Promise.all(invitedMemberIds.map((uid) => userExists(uid)));
  if (memberExistsChecks.some((exists) => !exists)) {
    return { ok: false, reason: 'member_not_found' };
  }

  const blockedChecks = await Promise.all(
    invitedMemberIds.map((uid) => hasBlockRelation(actorUid, uid))
  );
  if (blockedChecks.some(Boolean)) return { ok: false, reason: 'blocked' };

  const item = await conversationRepository.createGroup(actorUid, trimmedTitle, uniqueMembers);
  await conversationMemberRepository.ensureMembers(item.id, uniqueMembers);
  return { ok: true, item };
};

export type AddMembersResult =
  | { ok: true; addedIds: string[] }
  | {
      ok: false;
      reason: 'not_found' | 'forbidden' | 'not_group' | 'member_not_found' | 'blocked';
    };

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

  const toAdd = Array.from(
    new Set(newMemberIds.map((id) => id.trim()).filter((id) => id && !memberIds.includes(id)))
  );
  if (toAdd.length === 0) return { ok: true, addedIds: [] };

  const existsChecks = await Promise.all(toAdd.map((id) => userExists(id)));
  if (existsChecks.some((exists) => !exists)) {
    return { ok: false, reason: 'member_not_found' };
  }

  const blockedChecks = await Promise.all(toAdd.map((id) => hasBlockRelation(actorUid, id)));
  if (blockedChecks.some(Boolean)) return { ok: false, reason: 'blocked' };

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

const buildConversationListItemsFromDetails = async (
  userId: string,
  details: ConversationListDetail[]
): Promise<ApiConversationListItem[]> => {
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
    const {
      preview: lastMessagePreview,
      at: lastMessageAt,
      senderId: lastMessageSenderId,
    } = toConversationPreview(latestVisible);

    if (doc.type === 'group') {
      const otherIds = memberIds.filter((id) => id !== userId);
      const senderName = lastMessageSenderId
        ? lastMessageSenderId === userId
          ? 'Bạn'
          : toMember(lastMessageSenderId).name
        : null;
      const groupPreview =
        senderName && lastMessagePreview
          ? `${senderName}: ${lastMessagePreview}`
          : lastMessagePreview;

      return {
        id: doc.id,
        type: doc.type,
        title: doc.title,
        marketplace: doc.marketplace,
        peer: null,
        members: otherIds.map(toMember),
        memberCount: doc.memberCount,
        unreadCount: unreadCountByConversation.get(doc.id) ?? 0,
        lastMessagePreview: groupPreview,
        lastMessageAt,
      };
    }

    const peerUid = memberIds.find((id) => id !== userId) ?? null;
    return {
      id: doc.id,
      type: doc.type,
      title: doc.title,
      marketplace: doc.marketplace,
      peer: peerUid ? toMember(peerUid) : null,
      unreadCount: unreadCountByConversation.get(doc.id) ?? 0,
      lastMessagePreview,
      lastMessageAt,
    };
  });
};

export const listConversationsForUser = async (
  userId: string,
  limit = 20
): Promise<ApiConversationListItem[]> => {
  const details = await conversationRepository.listByMemberDetails(userId, limit);
  return buildConversationListItemsFromDetails(userId, details);
};

export const listMarketplaceConversationsForListing = async (
  sellerId: string,
  listingId: string,
  limit = 50
): Promise<ApiConversationListItem[]> => {
  const details = await conversationRepository.listMarketplaceByListingForSeller(
    listingId,
    sellerId,
    limit
  );
  return buildConversationListItemsFromDetails(sellerId, details);
};
