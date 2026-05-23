export type ConversationType = 'dm' | 'group';

export type MarketplaceConversationContext = {
  kind: 'marketplace';
  listingId: string;
  buyerId: string;
  sellerId: string;
  title: string;
  price: number;
  currency: 'VND';
  imageUrl: string | null;
  location: string;
  status: string;
  saleStatus?: string | null;
  sellerDisplayName: string;
  sellerPhotoURL: string | null;
};

export type ConservationDoc = {
  id: string;
  type: ConversationType;
  title?: string;
  marketplace?: MarketplaceConversationContext;
  createdBy: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  lastMessageSeq: number;
};

export const buildDmPairKey = (uid1: string, uid2: string): string =>
  [uid1, uid2].sort().join('__');

export const buildDmConversationId = (pairKey: string): string => `dm_${pairKey}`;
