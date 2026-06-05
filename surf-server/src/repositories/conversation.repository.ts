import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { buildDmConversationId, ConservationDoc, type MarketplaceConversationContext } from '../types/conversation.js';
import { getDb } from '../config/firebase-admin.js';
import { getRedis } from '../config/redis.js';

const col = () => getDb().collection('conversations');

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
};

const mapMemberIds = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const cleanDisplayText = (value?: string | null): string => {
  if (!value) return '';
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s._\-•·:]+/u, '')
    .trim();
};

const mapMarketplaceContext = (value: unknown): MarketplaceConversationContext | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const listingId = typeof data.listingId === 'string' ? data.listingId : '';
  const buyerId = typeof data.buyerId === 'string' ? data.buyerId : '';
  const sellerId = typeof data.sellerId === 'string' ? data.sellerId : '';
  if (!listingId || !buyerId || !sellerId) return undefined;
  return {
    kind: 'marketplace',
    listingId,
    buyerId,
    sellerId,
    title: typeof data.title === 'string' ? data.title : 'Bài niêm yết',
    price: typeof data.price === 'number' && Number.isFinite(data.price) ? data.price : 0,
    currency: 'VND',
    imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : null,
    location: typeof data.location === 'string' ? data.location : '',
    status: typeof data.status === 'string' ? data.status : 'active',
    saleStatus: typeof data.saleStatus === 'string' ? data.saleStatus : null,
    sellerDisplayName:
      cleanDisplayText(typeof data.sellerDisplayName === 'string' ? data.sellerDisplayName : '') ||
      'Người bán',
    sellerPhotoURL: typeof data.sellerPhotoURL === 'string' && data.sellerPhotoURL ? data.sellerPhotoURL : null,
  };
};

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
  marketplace: mapMarketplaceContext(data.marketplace),
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
  muted: boolean;
  muteMessages: boolean;
  muteCalls: boolean;
  muteExpiresAt: Date | null;
};

export type ConversationMuteSettings = {
  muted: boolean;
  muteMessages: boolean;
  muteCalls: boolean;
  expiresAt: Date | null;
};

const readMuteSettingsForUser = (
  data: Record<string, unknown>,
  userId: string
): ConversationMuteSettings => {
  const mutedBy = Array.isArray(data.mutedBy) ? (data.mutedBy as string[]) : [];
  const legacyMuted = mutedBy.includes(userId);
  const settingsByUser =
    data.muteSettingsByUser &&
    typeof data.muteSettingsByUser === 'object' &&
    !Array.isArray(data.muteSettingsByUser)
      ? (data.muteSettingsByUser as Record<string, unknown>)
      : {};
  const raw = settingsByUser[userId];
  const settings =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;

  const expiresAt = settings ? toDate(settings.expiresAt) ?? null : null;
  const expired = Boolean(expiresAt && expiresAt.getTime() <= Date.now());
  const muteMessages = settings
    ? settings.muteMessages !== false && !expired
    : legacyMuted;
  const muteCalls = settings
    ? settings.muteCalls !== false && !expired
    : legacyMuted;

  return {
    muted: (muteMessages || muteCalls) && !expired,
    muteMessages,
    muteCalls,
    expiresAt: expired ? null : expiresAt,
  };
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

  async findOrCreateMarketplaceDm(input: {
    buyerId: string;
    sellerId: string;
    context: MarketplaceConversationContext;
  }): Promise<{ item: ConservationDoc; created: boolean }> {
    const memberIds = [input.buyerId, input.sellerId].sort();
    const conversationId = `market_${input.context.listingId}_${input.buyerId}`;
    const ref = col().doc(conversationId);

    let created = false;

    await getDb().runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        tx.update(ref, {
          marketplace: input.context,
          title: input.context.title,
          marketplaceListingId: input.context.listingId,
          marketplaceBuyerId: input.buyerId,
          marketplaceSellerId: input.sellerId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      created = true;
      tx.set(ref, {
        type: 'dm',
        title: input.context.title,
        memberIds,
        memberPairKey: `${input.context.listingId}__${input.buyerId}__${input.sellerId}`,
        marketplace: input.context,
        marketplaceListingId: input.context.listingId,
        marketplaceBuyerId: input.buyerId,
        marketplaceSellerId: input.sellerId,
        unreadCountByUser: Object.fromEntries(memberIds.map((uid) => [uid, 0])),
        memberCount: memberIds.length,
        createdBy: input.buyerId,
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

    return snap.docs
      .filter((doc) => {
        const data = (doc.data() ?? {}) as Record<string, unknown>;
        const hiddenFor = Array.isArray(data.hiddenFor) ? (data.hiddenFor as string[]) : [];
        return !hiddenFor.includes(userId);
      })
      .map((doc) => {
        const data = (doc.data() ?? {}) as Record<string, unknown>;
        const muteSettings = readMuteSettingsForUser(data, userId);
        return {
          item: mapConservationDoc(doc.id, data),
          memberIds: mapMemberIds(data.memberIds),
          unreadCount: getUnreadCountForUser(data, userId),
          muted: muteSettings.muted,
          muteMessages: muteSettings.muteMessages,
          muteCalls: muteSettings.muteCalls,
          muteExpiresAt: muteSettings.expiresAt,
        };
      });
  },

  async listMarketplaceByListingForSeller(
    listingId: string,
    sellerId: string,
    limit = 50
  ): Promise<ConversationListDetail[]> {
    const snap = await col()
      .where('marketplaceListingId', '==', listingId)
      .limit(limit)
      .get();

    return snap.docs
      .map((doc) => {
        const data = (doc.data() ?? {}) as Record<string, unknown>;
        return {
          item: mapConservationDoc(doc.id, data),
          memberIds: mapMemberIds(data.memberIds),
          unreadCount: getUnreadCountForUser(data, sellerId),
          rawSellerId: typeof data.marketplaceSellerId === 'string' ? data.marketplaceSellerId : '',
        };
      })
      .filter((detail) => detail.rawSellerId === sellerId && detail.memberIds.includes(sellerId))
      .sort((a, b) => {
        const aTime = a.item.lastMessageAt?.getTime() ?? a.item.updatedAt.getTime();
        const bTime = b.item.lastMessageAt?.getTime() ?? b.item.updatedAt.getTime();
        return bTime - aTime;
      })
      .slice(0, limit)
      .map((detail) => ({
        item: detail.item,
        memberIds: detail.memberIds,
        unreadCount: detail.unreadCount,
        muted: false,
        muteMessages: false,
        muteCalls: false,
        muteExpiresAt: null,
      }));
  },

  async sumUnreadByUser(userId: string): Promise<number> {
    const redis = getRedis();
    const cacheKey = `unreadCount:${userId}`;
    
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return parseInt(cached, 10) || 0;
    }

    const snap = await col().where('memberIds', 'array-contains', userId).get();
    const total = snap.docs.reduce((sum, doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      return sum + getUnreadCountForUser(data, userId);
    }, 0);
    
    if (redis) {
      await redis.set(cacheKey, total.toString(), { EX: 3600 }); // cache for 1 hour
    }
    
    return total;
  },

  async markReadByUser(conversationId: string, userId: string): Promise<void> {
    await col().doc(conversationId).update({
      [`unreadCountByUser.${userId}`]: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    const redis = getRedis();
    if (redis) {
      await redis.del(`unreadCount:${userId}`);
    }
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
    
    const redis = getRedis();
    if (redis) {
      await Promise.all(newMemberIds.map(uid => redis.del(`unreadCount:${uid}`)));
    }
  },

  async hideForUser(conversationId: string, userId: string): Promise<void> {
    await col().doc(conversationId).update({
      hiddenFor: FieldValue.arrayUnion(userId),
      updatedAt: FieldValue.serverTimestamp(),
    });
  },

  async setMutedForUser(
    conversationId: string,
    userId: string,
    settings: {
      muted: boolean;
      muteMessages: boolean;
      muteCalls: boolean;
      expiresAt: Date | null;
    }
  ): Promise<ConversationMuteSettings> {
    const active = settings.muted && (settings.muteMessages || settings.muteCalls);
    const normalized: ConversationMuteSettings = active
      ? {
          muted: true,
          muteMessages: settings.muteMessages,
          muteCalls: settings.muteCalls,
          expiresAt: settings.expiresAt,
        }
      : {
          muted: false,
          muteMessages: false,
          muteCalls: false,
          expiresAt: null,
        };

    await col().doc(conversationId).update({
      mutedBy: normalized.muted ? FieldValue.arrayUnion(userId) : FieldValue.arrayRemove(userId),
      [`muteSettingsByUser.${userId}`]: normalized.muted
        ? {
            muteMessages: normalized.muteMessages,
            muteCalls: normalized.muteCalls,
            expiresAt: normalized.expiresAt,
            updatedAt: FieldValue.serverTimestamp(),
          }
        : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return normalized;
  },

  async getMutedBy(conversationId: string): Promise<string[]> {
    const snap = await col().doc(conversationId).get();
    if (!snap.exists) return [];
    const data = snap.data() ?? {};
    return Array.isArray(data.mutedBy) ? (data.mutedBy as string[]) : [];
  },

  async getMuteSettingsByUser(
    conversationId: string
  ): Promise<Record<string, ConversationMuteSettings>> {
    const snap = await col().doc(conversationId).get();
    if (!snap.exists) return {};
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const memberIds = mapMemberIds(data.memberIds);
    return Object.fromEntries(
      memberIds.map((userId) => [userId, readMuteSettingsForUser(data, userId)])
    );
  },

  async refreshPreviewIfLatestMessage(
    conversationId: string,
    latestMessageCreatedAt: Date,
    preview: string
  ): Promise<void> {
    const conversationRef = col().doc(conversationId);

    await getDb().runTransaction(async (transaction) => {
      const snap = await transaction.get(conversationRef);
      if (!snap.exists) return;

      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const currentLastMessageAt = toDate(data.lastMessageAt);
      if (!currentLastMessageAt) return;
      if (currentLastMessageAt.getTime() !== latestMessageCreatedAt.getTime()) return;

      transaction.update(conversationRef, {
        lastMessagePreview: preview,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  },
};
