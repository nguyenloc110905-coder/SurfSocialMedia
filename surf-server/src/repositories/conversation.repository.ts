import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { buildDmConversationId, ConservationDoc } from '../types/conversation.js';
import { getDb } from '../config/firebase-admin.js';

const col = () => getDb().collection('conversations');

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
};

const mapMemberIds = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const getUnreadCountForUser = (data: Record<string, unknown>, userId: string): number => {
  const unreadMap = data.unreadCountByUser;
  if (!unreadMap || typeof unreadMap !== 'object') return 0;
  const value = (unreadMap as Record<string, unknown>)[userId];
  return typeof value === 'number' ? value : 0;
};

const mapConservationDoc = (id: string, data: Record<string, unknown>): ConservationDoc => ({
  id,
  type: (data.type as ConservationDoc['type']) ?? 'dm',
  title: (data.title as string) ?? undefined,
  createdBy: (data.createdBy as string) ?? '',
  memberCount:
    typeof data.memberCount === 'number' ? data.memberCount : mapMemberIds(data.memberIds).length,
  createdAt: toDate(data.createdAt) ?? new Date(),
  updatedAt: toDate(data.updatedAt) ?? new Date(),
  lastMessageAt: toDate(data.lastMessageAt),
  lastMessagePreview: (data.lastMessagePreview as string) ?? undefined,
  lastMessageSeq: typeof data.lastMessageSeq === 'number' ? data.lastMessageSeq : 0,
});

export type ConversationListDetail = {
  item: ConservationDoc;
  memberIds: string[];
  unreadCount: number;
};

export const conversationRepository = {
  async getById(id: string): Promise<ConservationDoc | null> {
    const snap = await col().doc(id).get();
    if (!snap.exists) return null;
    return mapConservationDoc(snap.id, snap.data() ?? ({} as Record<string, unknown>));
  },

  async getMemberIds(conversationId: string): Promise<string[]> {
    const snap = await col().doc(conversationId).get();
    if (!snap.exists) return [];
    return mapMemberIds((snap.data() ?? ({} as Record<string, unknown>)).memberIds);
  },

  async findOrCreateDm(
    uidA: string,
    uidB: string
  ): Promise<{ item: ConservationDoc; created: boolean }> {
    const memberIds = [uidA, uidB].sort();
    const pairKey = [uidA, uidB].sort().join('__');
    const conversationId = buildDmConversationId(pairKey);
    const ref = col().doc(conversationId);

    let created = false;

    await getDb().runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) return;

      created = true;
      tx.set(ref, {
        type: 'dm',
        memberIds,
        memberPairKey: pairKey,
        unreadCountByUser: Object.fromEntries(memberIds.map((uid) => [uid, 0])),
        memberCount: memberIds.length,
        createdBy: uidA,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastMessageAt: null,
        lastMessagePreview: null,
        lastMessageSeq: 0,
      });
    });

    const finalSnap = await ref.get();
    const item = mapConservationDoc(
      finalSnap.id,
      finalSnap.data() ?? ({} as Record<string, unknown>)
    );

    return { item, created };
  },

  async listByMember(userId: string, limit = 20): Promise<ConservationDoc[]> {
    const snap = await col()
      .where('memberIds', 'array-contains', userId)
      .orderBy('lastMessageAt', 'desc')
      .limit(limit)
      .get();

    return snap.docs.map((doc) =>
      mapConservationDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>)
    );
  },

  async listByMemberDetails(userId: string, limit = 20): Promise<ConversationListDetail[]> {
    const snap = await col()
      .where('memberIds', 'array-contains', userId)
      .orderBy('lastMessageAt', 'desc')
      .limit(limit)
      .get();

    return snap.docs.map((doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      return {
        item: mapConservationDoc(doc.id, data),
        memberIds: mapMemberIds(data.memberIds),
        unreadCount: getUnreadCountForUser(data, userId),
      };
    });
  },

  async sumUnreadByUser(userId: string): Promise<number> {
    const snap = await col().where('memberIds', 'array-contains', userId).get();
    return snap.docs.reduce((total, doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      return total + getUnreadCountForUser(data, userId);
    }, 0);
  },

  async markReadByUser(conversationId: string, userId: string): Promise<void> {
    await col().doc(conversationId).update({
      [`unreadCountByUser.${userId}`]: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
  },

  async createGroup(
    createdBy: string,
    title: string,
    memberIds: string[]
  ): Promise<ConservationDoc> {
    const ref = col().doc();
    const unreadCountByUser = Object.fromEntries(memberIds.map((uid) => [uid, 0]));

    await ref.set({
      type: 'group',
      title,
      memberIds,
      unreadCountByUser,
      memberCount: memberIds.length,
      createdBy,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: null,
      lastMessagePreview: null,
      lastMessageSeq: 0,
    });

    const snap = await ref.get();
    return mapConservationDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async addMembers(conversationId: string, newMemberIds: string[]): Promise<void> {
    const updates: Record<string, unknown> = {
      memberIds: FieldValue.arrayUnion(...newMemberIds),
      memberCount: FieldValue.increment(newMemberIds.length),
      updatedAt: FieldValue.serverTimestamp(),
    };
    for (const uid of newMemberIds) {
      updates[`unreadCountByUser.${uid}`] = 0;
    }
    await col().doc(conversationId).update(updates);
  },
};
