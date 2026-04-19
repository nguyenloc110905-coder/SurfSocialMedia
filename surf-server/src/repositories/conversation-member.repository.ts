import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase-admin.js';
import type { ConversationMemberDoc } from '../types/conversation-member.js';

const col = () => getDb().collection('conversation_members');
const docId = (conversationId: string, userId: string) => `${conversationId}__${userId}`;

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
};

const mapConversationMemberDoc = (
  id: string,
  data: Record<string, unknown>
): ConversationMemberDoc => ({
  id,
  conversationId: (data.conversationId as string) ?? id.split('__')[0] ?? '',
  userId: (data.userId as string) ?? id.split('__')[1] ?? '',
  joinedAt: toDate(data.joinedAt),
  lastReadMessageId:
    typeof data.lastReadMessageId === 'string' ? data.lastReadMessageId : null,
  lastReadMessageCreatedAt: toDate(data.lastReadMessageCreatedAt),
  lastReadAt: toDate(data.lastReadAt),
});

export const conversationMemberRepository = {
  async ensureMembers(conversationId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    const refs = userIds.map((userId) => col().doc(docId(conversationId, userId)));
    const snaps = await getDb().getAll(...refs);
    const batch = getDb().batch();

    refs.forEach((ref, index) => {
      if (snaps[index]?.exists) return;
      batch.set(ref, {
        conversationId,
        userId: userIds[index],
        joinedAt: FieldValue.serverTimestamp(),
        lastReadMessageId: null,
        lastReadMessageCreatedAt: null,
        lastReadAt: null,
      });
    });

    await batch.commit();
  },

  async markRead(
    conversationId: string,
    userId: string,
    lastReadMessageId: string,
    lastReadMessageCreatedAt: string
  ): Promise<boolean> {
    const nextCreatedAt = new Date(lastReadMessageCreatedAt);
    if (Number.isNaN(nextCreatedAt.getTime())) return false;

    const ref = col().doc(docId(conversationId, userId));
    let updated = false;

    await getDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists
        ? mapConversationMemberDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>)
        : null;
      const currentCreatedAt = current?.lastReadMessageCreatedAt?.getTime() ?? 0;
      const nextTime = nextCreatedAt.getTime();
      const isSameCursor =
        current?.lastReadMessageId === lastReadMessageId && currentCreatedAt === nextTime;

      if (isSameCursor || currentCreatedAt > nextTime) return;

      tx.set(
        ref,
        {
          conversationId,
          userId,
          joinedAt: current?.joinedAt ?? FieldValue.serverTimestamp(),
          lastReadMessageId,
          lastReadMessageCreatedAt: nextCreatedAt,
          lastReadAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      updated = true;
    });

    return updated;
  },

  async listReadReceiptsInWindow(
    conversationId: string,
    fromCreatedAt: string,
    toCreatedAt: string,
    limit = 150
  ): Promise<ConversationMemberDoc[]> {
    const fromDate = new Date(fromCreatedAt);
    const toDateValue = new Date(toCreatedAt);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDateValue.getTime())) return [];

    // Query only by conversationId to avoid brittle composite-index requirements,
    // then perform window filtering and sorting in-memory.
    const snap = await col().where('conversationId', '==', conversationId).get();

    const mapped = snap.docs.map((doc) =>
      mapConversationMemberDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>)
    );

    return mapped
      .filter((item) => {
        const cursor = item.lastReadMessageCreatedAt;
        if (!cursor) return false;
        const cursorMs = cursor.getTime();
        return cursorMs >= fromDate.getTime() && cursorMs <= toDateValue.getTime();
      })
      .sort((a, b) => {
        const aCursorMs = a.lastReadMessageCreatedAt?.getTime() ?? 0;
        const bCursorMs = b.lastReadMessageCreatedAt?.getTime() ?? 0;
        if (bCursorMs !== aCursorMs) return bCursorMs - aCursorMs;

        const aReadAtMs = a.lastReadAt?.getTime() ?? 0;
        const bReadAtMs = b.lastReadAt?.getTime() ?? 0;
        return bReadAtMs - aReadAtMs;
      })
      .slice(0, limit);
  },
};
