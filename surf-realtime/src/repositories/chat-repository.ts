import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase-admin.js';

export type ConversationDoc = {
  id: string;
  type: 'direct' | 'group';
  memberIds: string[];
  memberKey: string;
  title?: string;
  avatarUrl?: string;
  lastMessageText?: string;
  lastMessageAt?: Date;
  updatedAt?: Date;
  createdAt?: Date;
};

export type MessageDoc = {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  clientMessageId?: string;
  createdAt: Date;
};

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
};

const memberKeyFrom = (memberIds: string[]) => memberIds.slice().sort().join('__');

export const makeDirectConversationId = (uidA: string, uidB: string) =>
  memberKeyFrom([uidA, uidB]);

export const getConversationById = async (conversationId: string): Promise<ConversationDoc | null> => {
  const snapshot = await getDb().collection('conversations').doc(conversationId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as Record<string, unknown>;
  return {
    id: snapshot.id,
    type: (data.type as 'direct' | 'group') ?? 'direct',
    memberIds: (data.memberIds as string[]) ?? [],
    memberKey: (data.memberKey as string) ?? '',
    title: data.title as string | undefined,
    avatarUrl: data.avatarUrl as string | undefined,
    lastMessageText: data.lastMessageText as string | undefined,
    lastMessageAt: toDate(data.lastMessageAt),
    updatedAt: toDate(data.updatedAt),
    createdAt: toDate(data.createdAt),
  };
};

export const ensureDirectConversation = async (uidA: string, uidB: string): Promise<ConversationDoc> => {
  const conversationId = makeDirectConversationId(uidA, uidB);
  const ref = getDb().collection('conversations').doc(conversationId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    const memberIds = [uidA, uidB].sort();
    await ref.set({
      type: 'direct',
      memberIds,
      memberKey: memberKeyFrom(memberIds),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const updated = await ref.get();
  const data = (updated.data() ?? {}) as Record<string, unknown>;
  return {
    id: updated.id,
    type: (data.type as 'direct' | 'group') ?? 'direct',
    memberIds: (data.memberIds as string[]) ?? [uidA, uidB],
    memberKey: (data.memberKey as string) ?? memberKeyFrom([uidA, uidB]),
    title: data.title as string | undefined,
    avatarUrl: data.avatarUrl as string | undefined,
    lastMessageText: data.lastMessageText as string | undefined,
    lastMessageAt: toDate(data.lastMessageAt),
    updatedAt: toDate(data.updatedAt),
    createdAt: toDate(data.createdAt),
  };
};

export const appendMessage = async (params: {
  conversationId: string;
  senderId: string;
  text: string;
  clientMessageId?: string;
}): Promise<MessageDoc> => {
  const { conversationId, senderId, text, clientMessageId } = params;
  const conversationRef = getDb().collection('conversations').doc(conversationId);
  const messageRef = conversationRef.collection('messages').doc();

  await getDb().runTransaction(async (transaction) => {
    const conversationSnap = await transaction.get(conversationRef);
    if (!conversationSnap.exists) {
      throw new Error('Conversation not found');
    }

    transaction.set(messageRef, {
      conversationId,
      senderId,
      text,
      clientMessageId: clientMessageId ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    transaction.update(conversationRef, {
      lastMessageText: text,
      lastMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const messageSnap = await messageRef.get();
  const data = (messageSnap.data() ?? {}) as Record<string, unknown>;
  return {
    id: messageSnap.id,
    conversationId,
    senderId,
    text,
    clientMessageId: (data.clientMessageId as string | undefined) ?? clientMessageId,
    createdAt: toDate(data.createdAt) ?? new Date(),
  };
};

export const listInbox = async (uid: string, limit: number, cursorMs?: number): Promise<ConversationDoc[]> => {
  let query = getDb()
    .collection('conversations')
    .where('memberIds', 'array-contains', uid)
    .orderBy('updatedAt', 'desc')
    .limit(limit);

  if (cursorMs) {
    query = query.startAfter(new Date(cursorMs));
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      type: (data.type as 'direct' | 'group') ?? 'direct',
      memberIds: (data.memberIds as string[]) ?? [],
      memberKey: (data.memberKey as string) ?? '',
      title: data.title as string | undefined,
      avatarUrl: data.avatarUrl as string | undefined,
      lastMessageText: data.lastMessageText as string | undefined,
      lastMessageAt: toDate(data.lastMessageAt),
      updatedAt: toDate(data.updatedAt),
      createdAt: toDate(data.createdAt),
    };
  });
};

export const listMessages = async (
  conversationId: string,
  limit: number,
  cursorMs?: number,
): Promise<MessageDoc[]> => {
  let query = getDb()
    .collection('conversations')
    .doc(conversationId)
    .collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(limit);

  if (cursorMs) {
    query = query.startAfter(new Date(cursorMs));
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      conversationId,
      senderId: (data.senderId as string) ?? '',
      text: (data.text as string) ?? '',
      clientMessageId: data.clientMessageId as string | undefined,
      createdAt: toDate(data.createdAt) ?? new Date(),
    };
  });
};
