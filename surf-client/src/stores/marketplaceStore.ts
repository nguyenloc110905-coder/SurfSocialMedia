import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';
import { auth } from '@/lib/firebase/auth';

export type Category =
  | 'all'
  | 'electronics'
  | 'clothing'
  | 'vehicles'
  | 'property'
  | 'home'
  | 'sports'
  | 'other';
export type Condition = 'new' | 'like_new' | 'good' | 'fair';
export type ListingStatus = 'pending' | 'active' | 'rejected' | 'sold' | 'deleted';
export type MyListingsFilter =
  | 'all'
  | 'pending'
  | 'active'
  | 'boosted'
  | 'boosting'
  | 'error';
export type MarketplaceModerationMode = 'auto' | 'manual';
export type MarketplaceModerationDecision = 'approved' | 'rejected' | 'needs_review';
export type ListingAvailability = 'in_stock' | 'single_item';
export type SellerSaleStatus = 'available' | 'pending';
export type BoostStatus =
  | 'none'
  | 'awaiting_moderation'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'rejected';
export type BoostPaymentMode = 'sandbox' | 'live';
export type BoostPaymentStatus =
  | 'none'
  | 'sandbox_authorized'
  | 'sandbox_voided'
  | 'paid'
  | 'refunded';
export type BoostSandboxPaymentProvider = 'zalopay' | 'vnpay' | 'momo';

export interface BoostMetrics {
  impressions: number;
  clicks: number;
  saves: number;
  spent: number;
}

export interface MarketplaceModerationResult {
  decision: MarketplaceModerationDecision;
  reason?: string;
  confidence?: number;
  flags: string[];
  provider: 'gemini' | 'openai';
}

export interface Listing {
  id: string;
  sellerId: string;
  sellerDisplayName: string;
  sellerPhotoURL: string | null;
  title: string;
  description: string;
  price: number;
  currency: 'VND';
  category: Exclude<Category, 'all'>;
  condition: Condition;
  mediaUrls: string[];
  location: string;
  brand?: string;
  productType?: string;
  material?: string;
  availability?: ListingAvailability;
  saleStatus?: SellerSaleStatus;
  tags?: string[];
  sku?: string;
  meetingPreferences?: string[];
  hideFromFriends?: boolean;
  boostEnabled?: boolean;
  boostPlan?: {
    dailyBudget: number;
    durationDays: number;
    placements: string[];
  } | null;
  boostStatus?: BoostStatus;
  boostCampaignId?: string | null;
  boostStartedAt?: unknown;
  boostEndsAt?: unknown;
  boostPaymentMode?: BoostPaymentMode | null;
  boostPaymentStatus?: BoostPaymentStatus;
  boostPaymentProvider?: BoostSandboxPaymentProvider | null;
  boostBudgetTotal?: number;
  boostEstimatedTax?: number;
  boostTotal?: number;
  boostMetrics?: BoostMetrics;
  boostScore?: number;
  status: ListingStatus;
  savedBy: string[];
  viewCount: number;
  moderationMode?: MarketplaceModerationMode;
  moderationResult?: MarketplaceModerationResult | null;
  moderationReason?: string | null;
  moderationFlags?: string[];
  moderatedBy?: 'ai' | 'admin' | null;
  reviewedBy?: string | null;
  createdAt: { _seconds?: number; seconds?: number } | string | number | null;
  updatedAt: { _seconds?: number; seconds?: number } | string | number | null;
}

export interface CreateListingInput {
  title: string;
  description: string;
  price: number;
  category: Exclude<Category, 'all'>;
  condition: Condition;
  mediaUrls: string[];
  location: string;
  brand?: string;
  productType?: string;
  material?: string;
  availability?: ListingAvailability;
  saleStatus?: SellerSaleStatus;
  tags?: string[];
  sku?: string;
  meetingPreferences?: string[];
  hideFromFriends?: boolean;
  boostEnabled?: boolean;
  boostPlan?: {
    dailyBudget: number;
    durationDays: number;
    placements: string[];
  } | null;
  boostPaymentProvider?: BoostSandboxPaymentProvider | null;
  boostPaymentId?: string | null;
}

export interface UpdateListingInput {
  title?: string;
  description?: string;
  price?: number;
  category?: Exclude<Category, 'all'>;
  condition?: Condition;
  mediaUrls?: string[];
  location?: string;
  brand?: string;
  productType?: string;
  material?: string;
  status?: Extract<ListingStatus, 'active' | 'sold'>;
  saleStatus?: SellerSaleStatus;
}

export interface BoostListingInput {
  boostPlan: {
    dailyBudget: number;
    durationDays: number;
    placements: string[];
  };
  boostPaymentProvider?: BoostSandboxPaymentProvider;
  boostPaymentId?: string;
}

export interface MarketplaceModerationSettings {
  mode: MarketplaceModerationMode;
  priority: 'auto';
  provider: 'gemini' | 'openai';
  hasGeminiKey: boolean;
  hasOpenAiKey: boolean;
  hasAiKey: boolean;
  updatedAt?: unknown;
  updatedBy?: string | null;
}

export interface MarketplaceModerationAccess {
  isAdmin: boolean;
  settings: MarketplaceModerationSettings | null;
}

export interface MyListingsCounts {
  all: number;
  error: number;
  active: number;
  pending: number;
  rejected: number;
  sold: number;
  boosted: number;
  boosting: number;
}

export interface MyListingsSummary {
  views: number;
  saves: number;
  activeBoosts: number;
  boostImpressions: number;
  boostSpent: number;
}

const AI_INFRASTRUCTURE_MODERATION_FLAGS = new Set([
  'missing_gemini_key',
  'invalid_gemini_key',
  'gemini_quota_exceeded',
  'gemini_model_unavailable',
  'gemini_unavailable',
  'missing_openai_key',
  'invalid_openai_key',
  'openai_quota_exceeded',
  'openai_model_unavailable',
  'openai_unavailable',
  'ai_error',
  'ai_background_error',
]);

function getModerationFlags(listing: Listing) {
  return [
    ...(Array.isArray(listing.moderationFlags) ? listing.moderationFlags : []),
    ...(Array.isArray(listing.moderationResult?.flags) ? listing.moderationResult.flags : []),
  ].filter(Boolean);
}

function isMyListingSpamOrError(listing: Listing) {
  return (
    listing.status === 'rejected' ||
    (listing.status === 'pending' &&
      getModerationFlags(listing).some((flag) => AI_INFRASTRUCTURE_MODERATION_FLAGS.has(flag)))
  );
}

function getTimestampMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value === 'object') {
    const timestamp = value as { _seconds?: number; seconds?: number };
    const seconds = timestamp._seconds ?? timestamp.seconds;
    return typeof seconds === 'number' ? seconds * 1000 : 0;
  }
  return 0;
}

function hasBoostPromotion(listing: Listing): boolean {
  return Boolean(
    listing.boostEnabled &&
      listing.boostStatus &&
      !['none', 'cancelled', 'rejected'].includes(listing.boostStatus)
  );
}

function isBoostingListing(listing: Listing): boolean {
  if (!listing.boostEnabled || listing.boostStatus !== 'active') return false;
  const deadline = getTimestampMs(listing.boostEndsAt);
  return !deadline || deadline > Date.now();
}

function setSavedBy(
  listing: Listing,
  id: string,
  userId: string | undefined,
  saved: boolean
): Listing {
  if (listing.id !== id || !userId) return listing;
  const savedBy = listing.savedBy ?? [];
  return {
    ...listing,
    savedBy: saved
      ? Array.from(new Set([...savedBy, userId]))
      : savedBy.filter((uid) => uid !== userId),
  };
}

function replaceListingById(listings: Listing[], updated: Listing): Listing[] {
  return listings.map((listing) => (listing.id === updated.id ? updated : listing));
}

function matchesMyListingsFilter(listing: Listing, filter: MyListingsFilter): boolean {
  if (filter === 'active') return listing.status === 'active';
  if (filter === 'pending') return listing.status === 'pending' && !isMyListingSpamOrError(listing);
  if (filter === 'boosted') return hasBoostPromotion(listing);
  if (filter === 'boosting') return isBoostingListing(listing);
  if (filter === 'error') return isMyListingSpamOrError(listing);
  return listing.status !== 'deleted' && !isMyListingSpamOrError(listing);
}

type MarketplaceListPayload = { items: Listing[]; nextCursor: string | null };
const marketplaceListRequests = new Map<string, Promise<MarketplaceListPayload>>();

function getMarketplaceListRequest(key: string, path: string) {
  const existing = marketplaceListRequests.get(key);
  if (existing) return existing;

  const request = api.get<MarketplaceListPayload>(path).finally(() => {
    marketplaceListRequests.delete(key);
  });
  marketplaceListRequests.set(key, request);
  return request;
}

interface MarketplaceState {
  listings: Listing[];
  loading: boolean;
  refreshing: boolean;
  nextCursor: string | null;
  activeCategory: Category;
  searchQuery: string;
  searchResults: Listing[];
  searching: boolean;
  isSearchMode: boolean;
  detailListing: Listing | null;
  detailLoading: boolean;
  myListings: Listing[];
  myListingsLoading: boolean;
  myListingsLoadingMore: boolean;
  myListingsNextCursor: string | null;
  myListingsFilter: MyListingsFilter;
  myListingsCounts: MyListingsCounts;
  myListingsSummary: MyListingsSummary;
  savedListings: Listing[];
  savedLoading: boolean;

  fetchListings: (reset?: boolean) => Promise<void>;
  setCategory: (c: Category) => Promise<void>;
  search: (q: string) => Promise<void>;
  setSearchQuery: (q: string) => void;
  setSearchMode: (v: boolean) => void;
  fetchDetail: (id: string) => Promise<void>;
  clearDetail: () => void;
  fetchMyListings: (reset?: boolean, filter?: MyListingsFilter) => Promise<void>;
  fetchSavedListings: () => Promise<void>;
  toggleSave: (id: string) => Promise<boolean>;
  createListing: (data: CreateListingInput) => Promise<Listing>;
  boostListing: (id: string, data: BoostListingInput) => Promise<Listing>;
  pauseBoost: (id: string) => Promise<Listing>;
  resumeBoost: (id: string) => Promise<Listing>;
  updateListing: (id: string, data: UpdateListingInput) => Promise<Listing>;
  deleteListing: (id: string) => Promise<void>;
  markAsSold: (id: string) => Promise<void>;
  reportListing: (id: string, reason: string) => Promise<{ reportId: string }>;
  fetchModerationAccess: () => Promise<MarketplaceModerationAccess>;
  fetchModerationSettings: () => Promise<MarketplaceModerationSettings>;
  setModerationMode: (mode: MarketplaceModerationMode) => Promise<MarketplaceModerationSettings>;
  fetchPendingModerationListings: (
    status?: Extract<ListingStatus, 'pending' | 'rejected' | 'active'>
  ) => Promise<Listing[]>;
  bulkApproveAiFailedListings: (
    demoOnly?: boolean
  ) => Promise<{ updated: number; items: Listing[] }>;
  rerunAiModeration: (id: string) => Promise<Listing>;
  approveListing: (id: string, reason?: string) => Promise<Listing>;
  rejectListing: (id: string, reason: string) => Promise<Listing>;
}

export const useMarketplaceStore = create<MarketplaceState>()(
  persist(
    (set, get) => ({
  listings: [],
  loading: false,
  refreshing: false,
  nextCursor: null,
  activeCategory: 'all',
  searchQuery: '',
  searchResults: [],
  searching: false,
  isSearchMode: false,
  detailListing: null,
  detailLoading: false,
  myListings: [],
  myListingsLoading: false,
  myListingsLoadingMore: false,
  myListingsNextCursor: null,
  myListingsFilter: 'all',
  myListingsCounts: {
    all: 0,
    error: 0,
    active: 0,
    pending: 0,
    rejected: 0,
    sold: 0,
    boosted: 0,
    boosting: 0,
  },
  myListingsSummary: { views: 0, saves: 0, activeBoosts: 0, boostImpressions: 0, boostSpent: 0 },
  savedListings: [],
  savedLoading: false,

  fetchListings: async (reset = false) => {
    const { loading, nextCursor, activeCategory } = get();
    if (loading && !reset) return;
    if (!reset && !nextCursor) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      set({ loading: false, refreshing: false });
      return;
    }
    set({ loading: true, ...(reset ? { refreshing: true, nextCursor: null } : {}) });
    try {
      const params = new URLSearchParams();
      if (activeCategory !== 'all') params.set('category', activeCategory);
      if (!reset && nextCursor) params.set('cursor', nextCursor);
      const requestPath = `/api/marketplace?${params.toString()}`;
      const data = await getMarketplaceListRequest(requestPath, requestPath);
      set((s) => ({
        listings: reset
          ? data.items
          : [
              ...s.listings,
              ...data.items.filter((item) => !s.listings.some((l) => l.id === item.id)),
            ],
        nextCursor: data.nextCursor,
        loading: false,
        refreshing: false,
      }));
    } catch {
      set({ loading: false, refreshing: false });
    }
  },

  setCategory: async (category) => {
    set({
      activeCategory: category,
      listings: [],
      nextCursor: null,
      isSearchMode: false,
      searchQuery: '',
    });
    await get().fetchListings(true);
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchMode: (v) => set({ isSearchMode: v }),

  search: async (query) => {
    if (!query.trim()) {
      set({ searchResults: [], searching: false });
      return;
    }
    set({ searching: true, isSearchMode: true });
    try {
      const { activeCategory } = get();
      const params = new URLSearchParams({ q: query });
      if (activeCategory !== 'all') params.set('category', activeCategory);
      const data = await api.get<{ items: Listing[] }>(`/api/marketplace/search?${params}`);
      set({
        searchResults: data.items,
        searching: false,
      });
    } catch {
      set({ searching: false });
    }
  },

  fetchDetail: async (id) => {
    set({ detailLoading: true, detailListing: null });
    try {
      const listing = await api.get<Listing>(`/api/marketplace/${id}`);
      set({ detailListing: listing, detailLoading: false });
    } catch {
      set({ detailLoading: false });
    }
  },

  clearDetail: () => set({ detailListing: null }),

  fetchMyListings: async (reset = true, filter = get().myListingsFilter) => {
    const { myListingsLoading, myListingsLoadingMore, myListingsNextCursor } = get();
    if (reset && myListingsLoading) return;
    if (!reset && (myListingsLoading || myListingsLoadingMore || !myListingsNextCursor)) return;
    set({
      myListingsFilter: filter,
      ...(reset
        ? { myListingsLoading: true, myListingsLoadingMore: false, myListingsNextCursor: null }
        : { myListingsLoadingMore: true }),
    });
    try {
      const params = new URLSearchParams({ status: filter, limit: '10' });
      if (!reset && myListingsNextCursor) params.set('cursor', myListingsNextCursor);
      const data = await api.get<{
        items: Listing[];
        nextCursor: string | null;
        counts?: MyListingsCounts;
        summary?: MyListingsSummary;
      }>(`/api/marketplace/my?${params}`);
      set((s) => ({
        myListings: reset
          ? data.items
          : [
              ...s.myListings,
              ...data.items.filter(
                (item) => !s.myListings.some((listing) => listing.id === item.id)
              ),
            ],
        myListingsNextCursor: data.nextCursor,
        myListingsCounts: data.counts ?? s.myListingsCounts,
        myListingsSummary: data.summary ?? s.myListingsSummary,
        myListingsLoading: false,
        myListingsLoadingMore: false,
      }));
    } catch {
      set({ myListingsLoading: false, myListingsLoadingMore: false });
    }
  },

  fetchSavedListings: async () => {
    set({ savedLoading: true });
    try {
      const data = await api.get<{ items: Listing[] }>('/api/marketplace/saved');
      set({ savedListings: data.items, savedLoading: false });
    } catch {
      set({ savedLoading: false });
    }
  },

  toggleSave: async (id) => {
    const res = await api.post<{ saved: boolean; item?: Listing }>(`/api/marketplace/${id}/save`);
    const userId = auth.currentUser?.uid;
    set((s) => ({
      listings: res.item
        ? replaceListingById(s.listings, res.item)
        : s.listings.map((l) => setSavedBy(l, id, userId, res.saved)),
      searchResults: res.item
        ? replaceListingById(s.searchResults, res.item)
        : s.searchResults.map((l) => setSavedBy(l, id, userId, res.saved)),
      myListings: res.item
        ? replaceListingById(s.myListings, res.item)
        : s.myListings.map((l) => setSavedBy(l, id, userId, res.saved)),
      savedListings: res.saved
        ? res.item
          ? [res.item, ...s.savedListings.filter((l) => l.id !== id)]
          : s.savedListings.map((l) => setSavedBy(l, id, userId, res.saved))
        : s.savedListings.filter((l) => l.id !== id),
      detailListing:
        res.item && s.detailListing?.id === id
          ? res.item
          : s.detailListing
            ? setSavedBy(s.detailListing, id, userId, res.saved)
            : null,
    }));
    return res.saved;
  },

  createListing: async (data) => {
    const listing = await api.post<Listing>('/api/marketplace', data);
    const isSpamOrError = isMyListingSpamOrError(listing);
    set((s) => ({
      listings: listing.status === 'active' ? [listing, ...s.listings] : s.listings,
      myListings: matchesMyListingsFilter(listing, s.myListingsFilter)
        ? [listing, ...s.myListings]
        : s.myListings,
      myListingsCounts: {
        ...s.myListingsCounts,
        all: s.myListingsCounts.all + (listing.status !== 'deleted' && !isSpamOrError ? 1 : 0),
        active: s.myListingsCounts.active + (listing.status === 'active' ? 1 : 0),
        error: s.myListingsCounts.error + (isSpamOrError ? 1 : 0),
        pending:
          s.myListingsCounts.pending + (listing.status === 'pending' && !isSpamOrError ? 1 : 0),
        rejected: s.myListingsCounts.rejected + (listing.status === 'rejected' ? 1 : 0),
        sold: s.myListingsCounts.sold + (listing.status === 'sold' ? 1 : 0),
        boosted: s.myListingsCounts.boosted + (hasBoostPromotion(listing) ? 1 : 0),
        boosting: s.myListingsCounts.boosting + (isBoostingListing(listing) ? 1 : 0),
      },
    }));
    return listing;
  },

  boostListing: async (id, data) => {
    const updated = await api.post<Listing>(`/api/marketplace/${id}/boost`, data);
    set((s) => ({
      listings:
        updated.status === 'active'
          ? [updated, ...s.listings.filter((l) => l.id !== id)]
          : s.listings.filter((l) => l.id !== id),
      searchResults:
        updated.status === 'active'
          ? s.searchResults.map((l) => (l.id === id ? updated : l))
          : s.searchResults.filter((l) => l.id !== id),
      myListings: s.myListings
        .map((l) => (l.id === id ? updated : l))
        .filter((l) => matchesMyListingsFilter(l, s.myListingsFilter)),
      savedListings:
        updated.status === 'active'
          ? s.savedListings.map((l) => (l.id === id ? updated : l))
          : s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing?.id === id ? updated : s.detailListing,
    }));
    return updated;
  },

  pauseBoost: async (id) => {
    const updated = await api.patch<Listing>(`/api/marketplace/${id}/boost/pause`);
    set((s) => ({
      listings:
        updated.status === 'active'
          ? [updated, ...s.listings.filter((l) => l.id !== id)]
          : s.listings.filter((l) => l.id !== id),
      searchResults:
        updated.status === 'active'
          ? s.searchResults.map((l) => (l.id === id ? updated : l))
          : s.searchResults.filter((l) => l.id !== id),
      myListings: s.myListings
        .map((l) => (l.id === id ? updated : l))
        .filter((l) => matchesMyListingsFilter(l, s.myListingsFilter)),
      savedListings:
        updated.status === 'active'
          ? s.savedListings.map((l) => (l.id === id ? updated : l))
          : s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing?.id === id ? updated : s.detailListing,
    }));
    return updated;
  },

  resumeBoost: async (id) => {
    const updated = await api.patch<Listing>(`/api/marketplace/${id}/boost/resume`);
    set((s) => ({
      listings:
        updated.status === 'active'
          ? [updated, ...s.listings.filter((l) => l.id !== id)]
          : s.listings.filter((l) => l.id !== id),
      searchResults:
        updated.status === 'active'
          ? s.searchResults.map((l) => (l.id === id ? updated : l))
          : s.searchResults.filter((l) => l.id !== id),
      myListings: s.myListings
        .map((l) => (l.id === id ? updated : l))
        .filter((l) => matchesMyListingsFilter(l, s.myListingsFilter)),
      savedListings:
        updated.status === 'active'
          ? s.savedListings.map((l) => (l.id === id ? updated : l))
          : s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing?.id === id ? updated : s.detailListing,
    }));
    return updated;
  },

  updateListing: async (id, data) => {
    const updated = await api.patch<Listing>(`/api/marketplace/${id}`, data);
    set((s) => ({
      listings:
        updated.status === 'active'
          ? [updated, ...s.listings.filter((l) => l.id !== id)]
          : s.listings.filter((l) => l.id !== id),
      searchResults:
        updated.status === 'active'
          ? s.searchResults.map((l) => (l.id === id ? updated : l))
          : s.searchResults.filter((l) => l.id !== id),
      myListings: s.myListings
        .map((l) => (l.id === id ? updated : l))
        .filter((l) => matchesMyListingsFilter(l, s.myListingsFilter)),
      savedListings:
        updated.status === 'active'
          ? s.savedListings.map((l) => (l.id === id ? updated : l))
          : s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing?.id === id ? updated : s.detailListing,
    }));
    return updated;
  },

  deleteListing: async (id) => {
    await api.delete(`/api/marketplace/${id}`);
    set((s) => ({
      listings: s.listings.filter((l) => l.id !== id),
      searchResults: s.searchResults.filter((l) => l.id !== id),
      myListings: s.myListings.filter((l) => l.id !== id),
      savedListings: s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing?.id === id ? null : s.detailListing,
    }));
  },

  markAsSold: async (id) => {
    const updated = await api.patch<Listing>(`/api/marketplace/${id}/sell`);
    set((s) => ({
      listings: s.listings.filter((l) => l.id !== id),
      searchResults: s.searchResults.filter((l) => l.id !== id),
      myListings: s.myListings
        .map((l) => (l.id === id ? updated : l))
        .filter((l) => matchesMyListingsFilter(l, s.myListingsFilter)),
      savedListings: s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing?.id === id ? updated : s.detailListing,
    }));
  },

  reportListing: async (id, reason) => {
    return api.post<{ reportId: string }>(`/api/marketplace/${id}/report`, { reason });
  },

  fetchModerationAccess: async () =>
    api.get<MarketplaceModerationAccess>('/api/marketplace/moderation/access'),

  fetchModerationSettings: async () =>
    api.get<MarketplaceModerationSettings>('/api/marketplace/moderation/settings'),

  setModerationMode: async (mode) =>
    api.patch<MarketplaceModerationSettings>('/api/marketplace/moderation/settings', { mode }),

  fetchPendingModerationListings: async (status = 'pending') => {
    const data = await api.get<{ items: Listing[] }>(
      `/api/marketplace/moderation/pending?status=${status}`
    );
    return data.items;
  },

  bulkApproveAiFailedListings: async (demoOnly = true) => {
    const result = await api.patch<{ updated: number; items: Listing[] }>(
      '/api/marketplace/moderation/bulk-approve-ai-failed',
      {
        demoOnly,
        limit: 100,
      }
    );
    set((s) => {
      const updatedIds = new Set(result.items.map((item) => item.id));
      return {
        listings: [
          ...result.items.filter((item) => item.status === 'active'),
          ...s.listings.filter((item) => !updatedIds.has(item.id)),
        ],
        searchResults: s.searchResults.map(
          (item) => result.items.find((updated) => updated.id === item.id) ?? item
        ),
        myListings: s.myListings
          .map((item) => result.items.find((updated) => updated.id === item.id) ?? item)
          .filter((item) => matchesMyListingsFilter(item, s.myListingsFilter)),
        detailListing: s.detailListing
          ? (result.items.find((updated) => updated.id === s.detailListing?.id) ?? s.detailListing)
          : null,
      };
    });
    return result;
  },

  rerunAiModeration: async (id) => {
    const updated = await api.patch<Listing>(`/api/marketplace/moderation/${id}/rerun-ai`);
    set((s) => ({
      listings:
        updated.status === 'active'
          ? [updated, ...s.listings.filter((l) => l.id !== id)]
          : s.listings.filter((l) => l.id !== id),
      searchResults:
        updated.status === 'active'
          ? s.searchResults.map((l) => (l.id === id ? updated : l))
          : s.searchResults.filter((l) => l.id !== id),
      myListings: s.myListings
        .map((l) => (l.id === id ? updated : l))
        .filter((l) => matchesMyListingsFilter(l, s.myListingsFilter)),
      savedListings:
        updated.status === 'active'
          ? s.savedListings.map((l) => (l.id === id ? updated : l))
          : s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing?.id === id ? updated : s.detailListing,
    }));
    return updated;
  },

  approveListing: async (id, reason) => {
    const updated = await api.patch<Listing>(`/api/marketplace/moderation/${id}/approve`, {
      reason,
    });
    set((s) => ({
      listings:
        updated.status === 'active'
          ? [updated, ...s.listings.filter((l) => l.id !== id)]
          : s.listings.filter((l) => l.id !== id),
      searchResults: s.searchResults.map((l) => (l.id === id ? updated : l)),
      myListings: s.myListings
        .map((l) => (l.id === id ? updated : l))
        .filter((l) => matchesMyListingsFilter(l, s.myListingsFilter)),
      savedListings: s.savedListings.map((l) => (l.id === id ? updated : l)),
      detailListing: s.detailListing?.id === id ? updated : s.detailListing,
    }));
    return updated;
  },

  rejectListing: async (id, reason) => {
    const updated = await api.patch<Listing>(`/api/marketplace/moderation/${id}/reject`, {
      reason,
    });
    set((s) => ({
      listings: s.listings.filter((l) => l.id !== id),
      searchResults: s.searchResults.filter((l) => l.id !== id),
      myListings: s.myListings
        .map((l) => (l.id === id ? updated : l))
        .filter((l) => matchesMyListingsFilter(l, s.myListingsFilter)),
      savedListings: s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing?.id === id ? updated : s.detailListing,
    }));
    return updated;
  },
    }),
    {
      name: 'surf-market-cache',
      partialize: (state) => ({
        // Chỉ lưu activeCategory và 15 listings đầu tiên
        listings: state.listings.slice(0, 15),
        activeCategory: state.activeCategory,
      }),
    }
  )
);
