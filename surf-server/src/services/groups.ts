import { groupRepository } from '../repositories/group.repository.js';
import { getDb } from '../config/firebase-admin.js';
import type { CreateGroupInput, GroupDoc } from '../types/group.js';

export type ApiGroup = Omit<GroupDoc, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

export type ApiDiscoverGroup = ApiGroup & {
  membershipStatus: 'member' | 'pending' | 'none';
};

export type CreateGroupResult =
  | { ok: true; item: GroupDoc }
  | { ok: false; reason: 'invalid_name' | 'invalid_privacy' };

export type JoinGroupResult =
  | { ok: true; status: 'joined' | 'pending'; item: GroupDoc; adminIds: string[] }
  | { ok: false; reason: 'not_found' | 'already_member' | 'already_pending' };

export const toApiGroup = (item: GroupDoc): ApiGroup => ({
  ...item,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
});

export const createGroup = async (input: CreateGroupInput): Promise<CreateGroupResult> => {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: 'invalid_name' };
  if (!['public', 'private'].includes(input.privacy)) {
    return { ok: false, reason: 'invalid_privacy' };
  }

  const item = await groupRepository.create({
    ...input,
    name,
    description: input.description?.trim() ?? '',
    coverImageUrl: input.coverImageUrl?.trim() ?? '',
    category: input.category?.trim() ?? '',
  });

  return { ok: true, item };
};

export const listDiscoverGroups = async (
  viewerId: string,
  qRaw?: string,
  categoryRaw?: string,
  limit = 20
): Promise<ApiDiscoverGroup[]> => {
  const [groups, pendingRequests] = await Promise.all([
    groupRepository.listPublic(Math.max(limit, 50)),
    groupRepository.listPendingJoinRequestsByUser(viewerId),
  ]);

  const q = qRaw?.trim().toLowerCase() ?? '';
  const category = categoryRaw?.trim().toLowerCase() ?? '';
  const pendingGroupIds = new Set(pendingRequests.map((request) => request.groupId));

  return groups
    .filter((group) => {
      const matchesQ = !q || group.name.toLowerCase().includes(q);
      const matchesCategory = !category || (group.category ?? '').toLowerCase() === category;
      return matchesQ && matchesCategory;
    })
    .slice(0, limit)
    .map((group) => ({
      ...toApiGroup(group),
      membershipStatus: group.memberIds.includes(viewerId)
        ? 'member'
        : pendingGroupIds.has(group.id)
          ? 'pending'
          : 'none',
    }));
};

export const listUserGroups = async (userId: string, limit = 50): Promise<ApiDiscoverGroup[]> => {
  const groups = await groupRepository.listUserJoinedGroups(userId, limit);
  return groups.map((group) => ({
    ...toApiGroup(group),
    membershipStatus: 'member',
  }));
};

export const joinGroup = async (userId: string, groupId: string): Promise<JoinGroupResult> => {
  const group = await groupRepository.getById(groupId);
  if (!group) return { ok: false, reason: 'not_found' };
  if (group.memberIds.includes(userId)) return { ok: false, reason: 'already_member' };

  if (group.privacy === 'private') {
    const existingRequest = await groupRepository.getJoinRequest(groupId, userId);
    if (existingRequest?.status === 'pending') {
      return { ok: false, reason: 'already_pending' };
    }

    await groupRepository.upsertPendingJoinRequest(groupId, userId);
    return { ok: true, status: 'pending', item: group, adminIds: group.adminIds };
  }

  await groupRepository.addMember(groupId, userId);
  const updatedGroup = await groupRepository.getById(groupId);

  return {
    ok: true,
    status: 'joined',
    item: updatedGroup ?? group,
    adminIds: group.adminIds,
  };
};

export const getGroupDetails = async (viewerId: string, groupId: string) => {
  const group = await groupRepository.getById(groupId);
  if (!group) return { ok: false, reason: 'not_found' };

  let membershipStatus: 'member' | 'pending' | 'none' = 'none';
  if (group.memberIds.includes(viewerId)) {
    membershipStatus = 'member';
  } else {
    const req = await groupRepository.getJoinRequest(groupId, viewerId);
    if (req?.status === 'pending') membershipStatus = 'pending';
  }

  return {
    ok: true,
    item: {
      ...toApiGroup(group),
      membershipStatus
    }
  };
};

export const getGroupMembers = async (groupId: string, viewerId: string) => {
  const group = await groupRepository.getById(groupId);
  if (!group) return { ok: false, reason: 'not_found' };

  if (group.privacy === 'private' && !group.memberIds.includes(viewerId)) {
    return { ok: false, reason: 'unauthorized' };
  }

  const chunks = [];
  for (let i = 0; i < group.memberIds.length; i += 10) {
    chunks.push(group.memberIds.slice(i, i + 10));
  }
  
  const members: any[] = [];
  const roleOf = (uid: string): 'admin' | 'moderator' | 'member' => {
    if (group.adminIds.includes(uid)) return 'admin';
    if (group.moderatorIds.includes(uid)) return 'moderator';
    return 'member';
  };
  const rolePriority = { admin: 0, moderator: 1, member: 2 } as const;

  for (const chunk of chunks) {
     const snaps = await getDb().collection('users').where('__name__', 'in', chunk).get();
     snaps.docs.forEach(doc => {
        const role = roleOf(doc.id);
        members.push({
          id: doc.id,
          ...doc.data(),
          role,
          isOwner: group.ownerId === doc.id,
        });
     });
  }

  // Sort: owner first, then admin, moderator, member; within same role by displayName
  members.sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    if (a.role !== b.role) return rolePriority[a.role as keyof typeof rolePriority] - rolePriority[b.role as keyof typeof rolePriority];
    return String(a.displayName ?? '').localeCompare(String(b.displayName ?? ''));
  });

  return { ok: true, members };
};

export const getGroupPendingRequests = async (groupId: string, viewerId: string) => {
  const group = await groupRepository.getById(groupId);
  if (!group || !group.adminIds.includes(viewerId)) return { ok: false, reason: 'unauthorized' };

  const reqs = await groupRepository.listPendingJoinRequestsByGroup(groupId);
  if (reqs.length === 0) return { ok: true, requests: [] };

  const userIds = reqs.map(r => r.userId);
  const chunks = [];
  for (let i = 0; i < userIds.length; i += 10) {
     chunks.push(userIds.slice(i, i + 10));
  }
  const usersMap = new Map();
  for (const chunk of chunks) {
     const snaps = await getDb().collection('users').where('__name__', 'in', chunk).get();
     snaps.docs.forEach(doc => usersMap.set(doc.id, { id: doc.id, ...doc.data() }));
  }

  const requests = reqs.map(r => ({
     ...r,
     user: usersMap.get(r.userId)
  }));
  return { ok: true, requests };
};

export const handleJoinRequest = async (groupId: string, adminId: string, targetUserId: string, action: 'approve' | 'reject') => {
  const group = await groupRepository.getById(groupId);
  if (!group || !group.adminIds.includes(adminId)) return { ok: false, reason: 'unauthorized' };

  await groupRepository.updateJoinRequestStatus(groupId, targetUserId, action === 'approve' ? 'approved' : 'rejected');

  if (action === 'approve') {
    await groupRepository.addMember(groupId, targetUserId);
  }
  return { ok: true };
};

export type MemberAction =
  | 'make_admin'
  | 'remove_admin'
  | 'make_moderator'
  | 'remove_moderator'
  | 'remove';

export const updateMemberRoleOrRemove = async (
  groupId: string,
  adminId: string,
  targetUserId: string,
  action: MemberAction
) => {
  const group = await groupRepository.getById(groupId);
  if (!group || !group.adminIds.includes(adminId)) return { ok: false, reason: 'unauthorized' };

  if (action === 'remove') {
    if (group.ownerId === targetUserId) return { ok: false, reason: 'cannot_remove_owner_admin' };
    await groupRepository.removeMember(groupId, targetUserId);
  } else if (action === 'make_admin') {
    // Promoting to admin also removes moderator role (admin > moderator)
    if (group.moderatorIds.includes(targetUserId)) {
      await groupRepository.demoteFromModerator(groupId, targetUserId);
    }
    await groupRepository.promoteToAdmin(groupId, targetUserId);
  } else if (action === 'remove_admin') {
    if (group.ownerId === targetUserId) return { ok: false, reason: 'cannot_remove_owner_admin' };
    await groupRepository.demoteFromAdmin(groupId, targetUserId);
  } else if (action === 'make_moderator') {
    if (group.adminIds.includes(targetUserId)) return { ok: false, reason: 'already_admin' };
    await groupRepository.promoteToModerator(groupId, targetUserId);
  } else if (action === 'remove_moderator') {
    await groupRepository.demoteFromModerator(groupId, targetUserId);
  }

  return { ok: true };
};
