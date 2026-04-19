import { groupRepository } from '../repositories/group.repository.js';
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
