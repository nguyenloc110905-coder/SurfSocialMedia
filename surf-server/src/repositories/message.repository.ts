import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase-admin.js';
import type { CreateCallLogInput, MessageDoc } from '../types/message.js';

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

const mapMessageDoc = (id: string, data: Record<string, unknown>): MessageDoc => ({
  id,
  conversationId: (data.conversationId as string) ?? '',
  senderId: (data.senderId as string) ?? '',
  type: (data.type as MessageDoc['type']) ?? 'text',
  text: (data.text as string) ?? '',
  ...(data.mediaUrl ? { mediaUrl: data.mediaUrl as string } : {}),
  ...(data.fileName ? { fileName: data.fileName as string } : {}),
  createdAt: toDate(data.createdAt) ?? new Date(),
  callMode: data.callMode as MessageDoc['callMode'],
  callOutcome: data.callOutcome as MessageDoc['callOutcome'],
  durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : undefined,
});

export const buildMessagePreview = (text: string): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
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
    const scanLimit = Math.min(100, Math.max(targetLimit * 3, targetLimit + 1));
    const collected: MessageDoc[] = [];

    let cursorDate: Date | undefined;
    if (input.beforeCursor) {
      const parsed = new Date(input.beforeCursor);
      if (!Number.isNaN(parsed.getTime())) cursorDate = parsed;
    }

    let exhausted = false;

    for (let attempt = 0; attempt < 12; attempt += 1) {
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

        collected.push(mapMessageDoc(doc.id, data));
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
      collected.length > targetLimit || (!exhausted && collected.length >= targetLimit);
    const page = hasMore ? collected.slice(0, targetLimit) : collected;
    const ascending = [...page].reverse();
    const nextCursor = hasMore ? ascending[0]?.createdAt.toISOString() ?? null : null;

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

  async hideForSelf(conversationId: string, messageId: string, userId: string): Promise<void> {
    await messagesCol(conversationId).doc(messageId).update({
      hiddenFor: FieldValue.arrayUnion(userId),
    });
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
