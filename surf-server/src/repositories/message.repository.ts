import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase-admin.js';
import type { MessageDoc } from '../types/message.js';

const conversationsCol = () => getDb().collection('conversations');

const messagesCol = (conversationId: string) =>
  conversationsCol().doc(conversationId).collection('messages');

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
};

const mapMessageDoc = (id: string, data: Record<string, unknown>): MessageDoc => ({
  id,
  conversationId: (data.conversationId as string) ?? '',
  senderId: (data.senderId as string) ?? '',
  type: (data.type as MessageDoc['type']) ?? 'text',
  text: (data.text as string) ?? '',
  ...(data.mediaUrl ? { mediaUrl: data.mediaUrl as string } : {}),
  ...(data.fileName ? { fileName: data.fileName as string } : {}),
  createdAt: toDate(data.createdAt) ?? new Date(),
});

export const buildMessagePreview = (text: string): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
};

type ListConversationMessagesInput = {
  conversationId: string;
  limit: number;
  beforeCursor?: string;
};

type ListConversationMessagesResult = {
  items: MessageDoc[];
  nextCursor: string | null;
};

export const messageRepository = {
  async listByConversation(
    input: ListConversationMessagesInput
  ): Promise<ListConversationMessagesResult> {
    let query = messagesCol(input.conversationId)
      .orderBy('createdAt', 'desc')
      .limit(input.limit + 1);

    if (input.beforeCursor) {
      const cursorDate = new Date(input.beforeCursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        query = query.startAfter(cursorDate);
      }
    }

    const snap = await query.get();
    const mapped = snap.docs.map((doc) =>
      mapMessageDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>)
    );

    const hasMore = mapped.length > input.limit;
    const page = hasMore ? mapped.slice(0, input.limit) : mapped;
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
};
