export type GroupPrivacy = 'public' | 'private';

export type GroupDoc = {
  id: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  category?: string;
  privacy: GroupPrivacy;
  ownerId: string;
  adminIds: string[];
  moderatorIds: string[];
  memberIds: string[];
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type GroupJoinRequestStatus = 'pending' | 'approved' | 'rejected';

export type GroupJoinRequestDoc = {
  id: string;
  groupId: string;
  userId: string;
  status: GroupJoinRequestStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateGroupInput = {
  ownerId: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  category?: string;
  privacy: GroupPrivacy;
};
