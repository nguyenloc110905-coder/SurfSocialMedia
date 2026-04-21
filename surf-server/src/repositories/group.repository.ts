import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase-admin.js';
import type {
  CreateGroupInput,
  GroupDoc,
  GroupJoinRequestDoc,
} from '../types/group.js';

const groupsCol = () => getDb().collection('groups');
const joinRequestsCol = () => getDb().collection('group_join_requests');

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
};

const mapGroupDoc = (id: string, data: Record<string, unknown>): GroupDoc => ({
  id,
  name: (data.name as string) ?? '',
  description: (data.description as string) ?? '',
  coverImageUrl: (data.coverImageUrl as string) ?? undefined,
  category: (data.category as string) ?? undefined,
  privacy: (data.privacy as GroupDoc['privacy']) ?? 'public',
  ownerId: (data.ownerId as string) ?? '',
  adminIds: Array.isArray(data.adminIds) ? (data.adminIds as string[]) : [],
  moderatorIds: Array.isArray(data.moderatorIds) ? (data.moderatorIds as string[]) : [],
  memberIds: Array.isArray(data.memberIds) ? (data.memberIds as string[]) : [],
  memberCount: typeof data.memberCount === 'number' ? data.memberCount : 0,
  createdAt: toDate(data.createdAt) ?? new Date(),
  updatedAt: toDate(data.updatedAt) ?? new Date(),
});

const mapJoinRequestDoc = (id: string, data: Record<string, unknown>): GroupJoinRequestDoc => ({
  id,
  groupId: (data.groupId as string) ?? '',
  userId: (data.userId as string) ?? '',
  status: (data.status as GroupJoinRequestDoc['status']) ?? 'pending',
  createdAt: toDate(data.createdAt) ?? new Date(),
  updatedAt: toDate(data.updatedAt) ?? new Date(),
});

export const groupRepository = {
  async create(input: CreateGroupInput): Promise<GroupDoc> {
    const ref = groupsCol().doc();

    await ref.set({
      name: input.name,
      description: input.description ?? '',
      coverImageUrl: input.coverImageUrl ?? null,
      category: input.category ?? null,
      privacy: input.privacy,
      ownerId: input.ownerId,
      adminIds: [input.ownerId],
      moderatorIds: [],
      memberIds: [input.ownerId],
      memberCount: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const snap = await ref.get();
    return mapGroupDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async getById(groupId: string): Promise<GroupDoc | null> {
    const snap = await groupsCol().doc(groupId).get();
    if (!snap.exists) return null;
    return mapGroupDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async listPublic(limit = 50): Promise<GroupDoc[]> {
    const snap = await groupsCol().where('privacy', '==', 'public').limit(limit).get();

    return snap.docs
      .map((doc) => mapGroupDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async listUserJoinedGroups(userId: string, limit = 50): Promise<GroupDoc[]> {
    const snap = await groupsCol().where('memberIds', 'array-contains', userId).limit(limit).get();

    return snap.docs
      .map((doc) => mapGroupDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async addMember(groupId: string, userId: string): Promise<void> {
    await groupsCol()
      .doc(groupId)
      .update({
        memberIds: FieldValue.arrayUnion(userId),
        memberCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
  },

  async getJoinRequest(groupId: string, userId: string): Promise<GroupJoinRequestDoc | null> {
    const requestId = `${groupId}__${userId}`;
    const snap = await joinRequestsCol().doc(requestId).get();
    if (!snap.exists) return null;
    return mapJoinRequestDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async upsertPendingJoinRequest(groupId: string, userId: string): Promise<GroupJoinRequestDoc> {
    const requestId = `${groupId}__${userId}`;
    const ref = joinRequestsCol().doc(requestId);

    await ref.set(
      {
        groupId,
        userId,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const snap = await ref.get();
    return mapJoinRequestDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async listPendingJoinRequestsByUser(userId: string): Promise<GroupJoinRequestDoc[]> {
    const snap = await joinRequestsCol()
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .get();

    return snap.docs.map((doc) =>
      mapJoinRequestDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>)
    );
  },

  async removeMember(groupId: string, userId: string): Promise<void> {
    await groupsCol()
      .doc(groupId)
      .update({
        memberIds: FieldValue.arrayRemove(userId),
        adminIds: FieldValue.arrayRemove(userId),
        moderatorIds: FieldValue.arrayRemove(userId),
        memberCount: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      });
  },

  async updateJoinRequestStatus(groupId: string, userId: string, status: GroupJoinRequestDoc['status']): Promise<void> {
    const requestId = `${groupId}__${userId}`;
    await joinRequestsCol().doc(requestId).update({
      status,
      updatedAt: FieldValue.serverTimestamp()
    });
  },

  async listPendingJoinRequestsByGroup(groupId: string): Promise<GroupJoinRequestDoc[]> {
    const snap = await joinRequestsCol()
      .where('groupId', '==', groupId)
      .where('status', '==', 'pending')
      .get();
    return snap.docs.map((doc) => mapJoinRequestDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
  },

  async promoteToAdmin(groupId: string, userId: string): Promise<void> {
    await groupsCol()
      .doc(groupId)
      .update({
        adminIds: FieldValue.arrayUnion(userId),
        updatedAt: FieldValue.serverTimestamp(),
      });
  },

  async demoteFromAdmin(groupId: string, userId: string): Promise<void> {
    await groupsCol()
      .doc(groupId)
      .update({
        adminIds: FieldValue.arrayRemove(userId),
        updatedAt: FieldValue.serverTimestamp(),
      });
  },

  async promoteToModerator(groupId: string, userId: string): Promise<void> {
    await groupsCol()
      .doc(groupId)
      .update({
        moderatorIds: FieldValue.arrayUnion(userId),
        updatedAt: FieldValue.serverTimestamp(),
      });
  },

  async demoteFromModerator(groupId: string, userId: string): Promise<void> {
    await groupsCol()
      .doc(groupId)
      .update({
        moderatorIds: FieldValue.arrayRemove(userId),
        updatedAt: FieldValue.serverTimestamp(),
      });
  },
};
