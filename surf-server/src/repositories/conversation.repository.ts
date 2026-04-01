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

const mapConservationDoc = (id: string, data: Record<string, unknown>): ConservationDoc => ({
  id,
  type: (data.type as ConservationDoc['type']) ?? 'dm',
  title: (data.title as string) ?? undefined,
  memberIds: Array.isArray(data.memberIds) ? (data.memberIds as string[]) : [],
  memberPairKey: data.memberPairKey as string | undefined,
  unreadCountByUser:
    data.unreadCountByUser && typeof data.unreadCountByUser === 'object'
      ? Object.fromEntries(
          Object.entries(data.unreadCountByUser as Record<string, unknown>).map(([uid, count]) => [
            uid,
            typeof count === 'number' ? count : 0,
          ])
        )
      : undefined,
  createdBy: (data.createdBy as string) ?? '',
  createdAt: toDate(data.createdAt) ?? new Date(),
  updatedAt: toDate(data.updatedAt) ?? new Date(),
  lastMessageAt: toDate(data.lastMessageAt),
  lastMessagePreview: (data.lastMessagePreview as string) ?? undefined,
});

export const conversationRepository = {
  async getById(id: string): Promise<ConservationDoc | null> {
    const snap = await col().doc(id).get();
    if (!snap.exists) return null;
    return mapConservationDoc(snap.id, snap.data() ?? ({} as Record<string, unknown>));
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
        createdBy: uidA,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastMessageAt: null,
        lastMessagePreview: null,
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

    return snap.docs.map((d) =>
      mapConservationDoc(d.id, (d.data() ?? {}) as Record<string, unknown>)
    );
  },

  async listByMemberForUnread(userId: string): Promise<ConservationDoc[]> {
    const snap = await col().where('memberIds', 'array-contains', userId).get();

    return snap.docs.map((d) =>
      mapConservationDoc(d.id, (d.data() ?? {}) as Record<string, unknown>)
    );
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
      createdBy,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: null,
      lastMessagePreview: null,
    });

    const snap = await ref.get();
    return mapConservationDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async addMembers(conversationId: string, newMemberIds: string[]): Promise<void> {
    const updates: Record<string, unknown> = {
      memberIds: FieldValue.arrayUnion(...newMemberIds),
      updatedAt: FieldValue.serverTimestamp(),
    };
    for (const uid of newMemberIds) {
      updates[`unreadCountByUser.${uid}`] = 0;
    }
    await col().doc(conversationId).update(updates);
  },
};
