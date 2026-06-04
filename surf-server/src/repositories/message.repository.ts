import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase-admin.js';
import { getRedis } from '../config/redis.js';
import type {
  CreateCallLogInput,
  MessageDoc,
  MessageReactionActor,
  MessageReactionsByEmoji,
} from '../types/message.js';

const conversationsCol = () => getDb().collection('conversations');

const messagesCol = (conversationId: string) =>
  conversationsCol().doc(conversationId).collection('messages');

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const REPLY_TARGET_MARKER_INLINE_PATTERN = /__reply_to:[^\s]+__/g;
const REPLY_SENDER_MARKER_INLINE_PATTERN = /__reply_sender:[^\s]+__/g;
const REPLY_TARGET_MARKER_LINE_PATTERN = /^__reply_to:[^\n]+__\n?/;
const REPLY_SENDER_MARKER_LINE_PATTERN = /^__reply_sender:[^\n]+__\n?/;
const REPLY_PREFIX_PATTERN = /^↪\s*(.+?):\s*(.+)$/u;

const unwrapReplyPrefix = (value: string) => {
  let normalized = value.trim();

  for (let depth = 0; depth < 4; depth += 1) {
    const match = normalized.match(REPLY_PREFIX_PATTERN);
    if (!match) break;
    normalized = match[2].trim();
  }

  return normalized;
};

const extractLatestChatContent = (value: string) => {
  const stripped = value
    .replace(REPLY_TARGET_MARKER_LINE_PATTERN, '')
    .replace(REPLY_SENDER_MARKER_LINE_PATTERN, '')
    .replace(REPLY_TARGET_MARKER_INLINE_PATTERN, ' ')
    .replace(REPLY_SENDER_MARKER_INLINE_PATTERN, ' ')
    .trim();
  if (!stripped) return '';

  const lines = stripped.split('\n');
  const firstLine = lines[0]?.trim() ?? '';
  const replyMatch = firstLine.match(REPLY_PREFIX_PATTERN);
  if (!replyMatch) return stripped;

  const body = lines.slice(1).join('\n').trim();
  if (body) return body;

  return unwrapReplyPrefix(replyMatch[2]);
};

const mapMessageReactions = (value: unknown): MessageReactionsByEmoji => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const result: MessageReactionsByEmoji = {};

  Object.entries(value as Record<string, unknown>).forEach(([emoji, usersRaw]) => {
    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji) return;
    if (!usersRaw || typeof usersRaw !== 'object' || Array.isArray(usersRaw)) return;

    const usersById: Record<string, MessageReactionActor> = {};

    Object.entries(usersRaw as Record<string, unknown>).forEach(([uid, actorRaw]) => {
      const normalizedUid = uid.trim();
      if (!normalizedUid) return;

      const actor =
        actorRaw && typeof actorRaw === 'object' && !Array.isArray(actorRaw)
          ? (actorRaw as Record<string, unknown>)
          : {};

      const actorName = typeof actor.name === 'string' ? actor.name.trim() : '';
      const avatarValue = actor.avatarUrl;

      usersById[normalizedUid] = {
        uid: normalizedUid,
        name: actorName || 'Người dùng',
        avatarUrl: typeof avatarValue === 'string' ? avatarValue : null,
      };
    });

    if (Object.keys(usersById).length > 0) {
      result[normalizedEmoji] = usersById;
    }
  });

  return result;
};

const mapMessageDoc = (id: string, data: Record<string, unknown>): MessageDoc => {
  const reactions = mapMessageReactions(data.reactions);
  const pinnedBy = toStringArray(data.pinnedBy);

  return {
    id,
    conversationId: (data.conversationId as string) ?? '',
    senderId: (data.senderId as string) ?? '',
    type: (data.type as MessageDoc['type']) ?? 'text',
    text: (data.text as string) ?? '',
    ...(data.mediaUrl ? { mediaUrl: data.mediaUrl as string } : {}),
    ...(data.fileName ? { fileName: data.fileName as string } : {}),
    ...(toDate(data.editedAt) ? { editedAt: toDate(data.editedAt)! } : {}),
    ...(typeof data.editedBy === 'string' ? { editedBy: data.editedBy as string } : {}),
    ...(typeof data.isForwarded === 'boolean' ? { isForwarded: data.isForwarded } : {}),
    ...(typeof data.forwardedFromMessageId === 'string'
      ? { forwardedFromMessageId: data.forwardedFromMessageId as string }
      : {}),
    ...(typeof data.forwardedFromConversationId === 'string'
      ? { forwardedFromConversationId: data.forwardedFromConversationId as string }
      : {}),
    ...(pinnedBy.length > 0 ? { pinnedBy } : {}),
    ...(Object.keys(reactions).length > 0 ? { reactions } : {}),
    createdAt: toDate(data.createdAt) ?? new Date(),
    callMode: data.callMode as MessageDoc['callMode'],
    callOutcome: data.callOutcome as MessageDoc['callOutcome'],
    durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : undefined,
  };
};

export const buildMessagePreview = (text: string): string => {
  const normalized = extractLatestChatContent(text).replace(/\s+/g, ' ').trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
};

const formatCallDuration = (durationSeconds?: number) => {
  if (!durationSeconds || durationSeconds <= 0) return '0 giây';

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  if (minutes > 0 && seconds > 0) return `${minutes} phút ${seconds} giây`;
  if (minutes > 0) return `${minutes} phút`;
  return `${seconds} giây`;
};

export const buildCallLogText = (
  mode: NonNullable<MessageDoc['callMode']>,
  outcome: NonNullable<MessageDoc['callOutcome']>,
  durationSeconds?: number
) => {
  const modeLabel = mode === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';

  switch (outcome) {
    case 'started':
      return `${modeLabel} đã bắt đầu`;
    case 'completed':
      return `${modeLabel} • ${formatCallDuration(durationSeconds)}`;
    case 'missed':
      return `${modeLabel} nhỡ`;
    case 'declined':
      return `${modeLabel} bị từ chối`;
    case 'busy':
      return `${modeLabel} khi đối phương đang bận`;
    case 'failed':
      return `${modeLabel} không thể kết nối`;
    case 'ended':
      return durationSeconds && durationSeconds > 0
        ? `${modeLabel} đã kết thúc • ${formatCallDuration(durationSeconds)}`
        : `${modeLabel} đã kết thúc`;
    default:
      return `${modeLabel} đã kết thúc`;
  }
};

type ListConversationMessagesInput = {
  conversationId: string;
  limit: number;
  beforeCursor?: string;
  viewerId?: string;
  searchText?: string;
  mediaOnly?: boolean;
};

type ListConversationMessagesResult = {
  items: MessageDoc[];
  nextCursor: string | null;
};

export const messageRepository = {
  async listByConversation(
    input: ListConversationMessagesInput
  ): Promise<ListConversationMessagesResult> {
    const targetLimit = Math.max(1, input.limit);
    const normalizedSearchText = input.searchText?.trim().toLowerCase() ?? '';
    const scanLimit = normalizedSearchText
      ? Math.min(100, Math.max(targetLimit * 8, 50))
      : Math.min(100, Math.max(targetLimit * 3, targetLimit + 1));
    const collected: MessageDoc[] = [];

    let cursorDate: Date | undefined;
    if (input.beforeCursor) {
      const parsed = new Date(input.beforeCursor);
      if (!Number.isNaN(parsed.getTime())) cursorDate = parsed;
    }

    let exhausted = false;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      let query = messagesCol(input.conversationId)
        .orderBy('createdAt', 'desc')
        .limit(scanLimit);

      if (cursorDate) {
        query = query.startAfter(cursorDate);
      }

      const snap = await query.get();
      if (snap.empty) {
        exhausted = true;
        break;
      }

      for (const doc of snap.docs) {
        const data = (doc.data() ?? {}) as Record<string, unknown>;
        const hiddenFor = toStringArray(data.hiddenFor);
        if (input.viewerId && hiddenFor.includes(input.viewerId)) {
          continue;
        }

        const message = mapMessageDoc(doc.id, data);
        if (
          normalizedSearchText &&
          !`${message.text} ${message.fileName ?? ''}`.toLowerCase().includes(normalizedSearchText)
        ) {
          continue;
        }

        if (input.mediaOnly && !['image', 'file', 'audio'].includes(message.type)) {
          continue;
        }

        collected.push(message);
        if (collected.length > targetLimit) break;
      }

      const lastDoc = snap.docs[snap.docs.length - 1];
      const lastDocCreatedAt = toDate((lastDoc.data() ?? {}).createdAt);

      if (!lastDocCreatedAt || snap.docs.length < scanLimit) {
        exhausted = true;
        break;
      }

      cursorDate = lastDocCreatedAt;

      if (collected.length > targetLimit) {
        break;
      }
    }

    const hasMore =
      collected.length > targetLimit ||
      (!exhausted && Boolean(cursorDate) && (normalizedSearchText || collected.length >= targetLimit));
    const page = hasMore ? collected.slice(0, targetLimit) : collected;
    const ascending = [...page].reverse();
    const nextCursor = hasMore
      ? ascending[0]?.createdAt.toISOString() ?? cursorDate?.toISOString() ?? null
      : null;

    return {
      items: ascending,
      nextCursor,
    };
  },

  async createTextMessage(
    conversationId: string,
    senderId: string,
    text: string,
    recipientIds: string[]
  ): Promise<MessageDoc> {
    const conversationRef = conversationsCol().doc(conversationId);
    const messageRef = messagesCol(conversationId).doc();
    const preview = buildMessagePreview(text);

    const batch = getDb().batch();

    batch.set(messageRef, {
      conversationId,
      senderId,
      type: 'text',
      text,
      createdAt: FieldValue.serverTimestamp(),
    });

    const conversationUpdates: Record<string, unknown> = {
      lastMessagePreview: preview,
      lastMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageSeq: FieldValue.increment(1),
      [`unreadCountByUser.${senderId}`]: 0,
    };

    recipientIds.forEach((uid) => {
      conversationUpdates[`unreadCountByUser.${uid}`] = FieldValue.increment(1);
    });

    batch.update(conversationRef, conversationUpdates);

    await batch.commit();

    const redis = getRedis();
    if (redis) {
      await Promise.all(recipientIds.map(uid => redis.del(`unreadCount:${uid}`)));
    }

    const snap = await messageRef.get();
    return mapMessageDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async createMediaMessage(
    conversationId: string,
    senderId: string,
    type: 'image' | 'file' | 'audio',
    mediaUrl: string,
    recipientIds: string[],
    fileName?: string,
    text?: string
  ): Promise<MessageDoc> {
    const conversationRef = conversationsCol().doc(conversationId);
    const messageRef = messagesCol(conversationId).doc();

    const previewMap: Record<string, string> = { image: '📷 Hình ảnh', file: '📎 Tệp đính kèm', audio: '🎤 Tin nhắn thoại' };
    const preview = text ? buildMessagePreview(text) : (previewMap[type] ?? '📎 Tệp');

    const batch = getDb().batch();

    const msgData: Record<string, unknown> = {
      conversationId,
      senderId,
      type,
      text: text ?? '',
      mediaUrl,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (fileName) msgData.fileName = fileName;

    batch.set(messageRef, msgData);

    const conversationUpdates: Record<string, unknown> = {
      lastMessagePreview: preview,
      lastMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageSeq: FieldValue.increment(1),
      [`unreadCountByUser.${senderId}`]: 0,
    };

    recipientIds.forEach((uid) => {
      conversationUpdates[`unreadCountByUser.${uid}`] = FieldValue.increment(1);
    });

    batch.update(conversationRef, conversationUpdates);

    await batch.commit();

    const redis = getRedis();
    if (redis) {
      await Promise.all(recipientIds.map(uid => redis.del(`unreadCount:${uid}`)));
    }

    const snap = await messageRef.get();
    return mapMessageDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async createCallLogMessage(input: CreateCallLogInput): Promise<MessageDoc> {
    const conversationRef = conversationsCol().doc(input.conversationId);
    const messageRef = messagesCol(input.conversationId).doc();
    const text = buildCallLogText(input.mode, input.outcome, input.durationSeconds);

    const batch = getDb().batch();

    batch.set(messageRef, {
      conversationId: input.conversationId,
      senderId: input.actorId,
      type: 'call_log',
      text,
      callMode: input.mode,
      callOutcome: input.outcome,
      durationSeconds: input.durationSeconds ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    const conversationUpdates: Record<string, unknown> = {
      lastMessagePreview: text,
      lastMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageSeq: FieldValue.increment(1),
      [`unreadCountByUser.${input.actorId}`]: 0,
    };

    input.recipientIds.forEach((uid) => {
      conversationUpdates[`unreadCountByUser.${uid}`] = FieldValue.increment(1);
    });

    batch.update(conversationRef, conversationUpdates);

    await batch.commit();

    const redis = getRedis();
    if (redis) {
      await Promise.all(input.recipientIds.map(uid => redis.del(`unreadCount:${uid}`)));
    }

    const snap = await messageRef.get();
    return mapMessageDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async getById(messageId: string, conversationIdHint?: string): Promise<MessageDoc | null> {
    const normalizedId = messageId.trim();
    if (!normalizedId) return null;

    if (conversationIdHint) {
      const directSnap = await messagesCol(conversationIdHint).doc(normalizedId).get();
      if (directSnap.exists) {
        return mapMessageDoc(directSnap.id, (directSnap.data() ?? {}) as Record<string, unknown>);
      }
    }

    const snap = await getDb()
      .collectionGroup('messages')
      .where(FieldPath.documentId(), '==', normalizedId)
      .limit(1)
      .get();

    if (snap.empty) return null;

    const doc = snap.docs[0];
    const data = { ...(doc.data() ?? {}) } as Record<string, unknown>;
    if (!data.conversationId) {
      const parentConversationId = doc.ref.parent.parent?.id;
      if (parentConversationId) {
        data.conversationId = parentConversationId;
      }
    }

    return mapMessageDoc(doc.id, data);
  },

  async toggleReaction(
    conversationId: string,
    messageId: string,
    userId: string,
    emoji: string,
    actor: MessageReactionActor
  ): Promise<MessageDoc> {
    const ref = messagesCol(conversationId).doc(messageId);
    const normalizedEmoji = emoji.trim();

    await getDb().runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) {
        throw new Error('message_not_found');
      }

      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const reactions = mapMessageReactions(data.reactions);
      const hadSameReaction = Boolean(reactions[normalizedEmoji]?.[userId]);

      Object.keys(reactions).forEach((reactionEmoji) => {
        const usersByReaction = { ...(reactions[reactionEmoji] ?? {}) };
        if (usersByReaction[userId]) {
          delete usersByReaction[userId];
        }

        if (Object.keys(usersByReaction).length === 0) {
          delete reactions[reactionEmoji];
          return;
        }

        reactions[reactionEmoji] = usersByReaction;
      });

      if (!hadSameReaction) {
        const usersByReaction = { ...(reactions[normalizedEmoji] ?? {}) };
        usersByReaction[userId] = {
          uid: userId,
          name: actor.name,
          avatarUrl: actor.avatarUrl,
        };
        reactions[normalizedEmoji] = usersByReaction;
      }

      transaction.update(ref, {
        reactions,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    const updatedSnap = await ref.get();
    return mapMessageDoc(updatedSnap.id, (updatedSnap.data() ?? {}) as Record<string, unknown>);
  },

  async hideForSelf(conversationId: string, messageId: string, userId: string): Promise<void> {
    await messagesCol(conversationId).doc(messageId).update({
      hiddenFor: FieldValue.arrayUnion(userId),
    });
  },

  async editTextMessage(
    conversationId: string,
    messageId: string,
    editorId: string,
    text: string
  ): Promise<MessageDoc> {
    const ref = messagesCol(conversationId).doc(messageId);

    await ref.update({
      text,
      editedAt: FieldValue.serverTimestamp(),
      editedBy: editorId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const snap = await ref.get();
    return mapMessageDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async markAsForwarded(
    conversationId: string,
    messageId: string,
    forwardedFromMessageId: string,
    forwardedFromConversationId: string
  ): Promise<MessageDoc> {
    const ref = messagesCol(conversationId).doc(messageId);

    await ref.update({
      isForwarded: true,
      forwardedFromMessageId,
      forwardedFromConversationId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const snap = await ref.get();
    return mapMessageDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async togglePinForUser(
    conversationId: string,
    messageId: string,
    userId: string,
    pinned?: boolean
  ): Promise<MessageDoc> {
    const ref = messagesCol(conversationId).doc(messageId);

    await getDb().runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) {
        throw new Error('message_not_found');
      }

      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const currentPinnedBy = new Set(toStringArray(data.pinnedBy));
      const nextPinned = typeof pinned === 'boolean' ? pinned : !currentPinnedBy.has(userId);

      if (nextPinned) {
        currentPinnedBy.add(userId);
      } else {
        currentPinnedBy.delete(userId);
      }

      transaction.update(ref, {
        pinnedBy: Array.from(currentPinnedBy),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    const updatedSnap = await ref.get();
    return mapMessageDoc(updatedSnap.id, (updatedSnap.data() ?? {}) as Record<string, unknown>);
  },

  async recallForEveryone(
    conversationId: string,
    messageId: string,
    senderId: string
  ): Promise<MessageDoc> {
    const ref = messagesCol(conversationId).doc(messageId);

    await ref.update({
      type: 'text',
      text: 'Tin nhắn đã được thu hồi',
      mediaUrl: FieldValue.delete(),
      fileName: FieldValue.delete(),
      callMode: FieldValue.delete(),
      callOutcome: FieldValue.delete(),
      durationSeconds: FieldValue.delete(),
      recalledForEveryone: true,
      recalledBy: senderId,
      recalledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const snap = await ref.get();
    return mapMessageDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },
};
