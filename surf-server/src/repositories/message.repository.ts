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
  createdAt: toDate(data.createdAt) ?? new Date(),
});

export const buildMessagePreview = (text: string): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
};

export const messageRepository = {
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
};
