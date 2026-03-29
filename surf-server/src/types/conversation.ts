export type ConversationType = 'dm' | 'group';

export type ConservationDoc = {
  id: string;
  type: ConversationType;
  memberIds: string[];
  memberPairKey?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
};

export const buildDmPairKey = (uid1: string, uid2: string): string =>
  [uid1, uid2].sort().join('__');

export const buildDmConversationId = (pairKey: string): string => `dm_${pairKey}`;
