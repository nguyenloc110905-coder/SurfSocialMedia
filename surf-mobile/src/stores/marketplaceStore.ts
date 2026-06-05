import { create } from 'zustand';
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
export type MyListingsFilter = 'all' | 'pending' | 'active' | 'error';
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
  createdAt: { _seconds?: number; seconds?: number } | number | string | null;
  updatedAt: { _seconds?: number; seconds?: number } | number | string | null;
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
  availability?: ListingAvailability;
  status?: Extract<ListingStatus, 'active' | 'sold'>;
  saleStatus?: SellerSaleStatus;
  tags?: string[];
  sku?: string;
  meetingPreferences?: string[];
  hideFromFriends?: boolean;
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

function matchesMyListingsFilter(listing: Listing, filter: MyListingsFilter): boolean {
  if (filter === 'active') return listing.status === 'active';
  if (filter === 'pending') return listing.status === 'pending' && !isMyListingSpamOrError(listing);
  if (filter === 'error') return isMyListingSpamOrError(listing);
  return listing.status !== 'deleted' && !isMyListingSpamOrError(listing);
}

function setSavedBy(listing: Listing, id: string, userId: string | undefined, saved: boolean): Listing {
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

function findListingInState(state: MarketplaceState, id: string) {
  return (
    state.listings.find((l) => l.id === id) ??
    state.searchResults.find((l) => l.id === id) ??
    state.savedListings.find((l) => l.id === id) ??
    state.myListings.find((l) => l.id === id) ??
    (state.detailListing?.id === id ? state.detailListing : undefined)
  );
}

function applySavedState(state: MarketplaceState, id: string, userId: string, saved: boolean) {
  const source = findListingInState(state, id);
  const updatedSource = source ? setSavedBy(source, id, userId, saved) : undefined;
  const savedExists = state.savedListings.some((l) => l.id === id);

  return {
    listings: state.listings.map((l) => setSavedBy(l, id, userId, saved)),
    searchResults: state.searchResults.map((l) => setSavedBy(l, id, userId, saved)),
    myListings: state.myListings.map((l) => setSavedBy(l, id, userId, saved)),
    savedListings: saved
      ? savedExists
        ? state.savedListings.map((l) => setSavedBy(l, id, userId, saved))
        : updatedSource
          ? [updatedSource, ...state.savedListings]
          : state.savedListings
      : state.savedListings.filter((l) => l.id !== id),
    detailListing: state.detailListing ? setSavedBy(state.detailListing, id, userId, saved) : null,
  };
}

function applyListingUpdate(state: MarketplaceState, id: string, updated: Listing) {
  const visible = updated.status === 'active';
  return {
    listings: visible
      ? [updated, ...state.listings.filter((l) => l.id !== id)]
      : state.listings.filter((l) => l.id !== id),
    searchResults: visible
      ? replaceListingById(state.searchResults, updated)
      : state.searchResults.filter((l) => l.id !== id),
    myListings: replaceListingById(state.myListings, updated).filter((l) =>
      matchesMyListingsFilter(l, state.myListingsFilter)
    ),
    savedListings: visible
      ? replaceListingById(state.savedListings, updated)
      : state.savedListings.filter((l) => l.id !== id),
    detailListing: state.detailListing?.id === id ? updated : state.detailListing,
  };
}

type MarketplaceListPayload = { items: Listing[]; nextCursor: string | null };
const marketplaceListRequests = new Map<string, Promise<MarketplaceListPayload>>();

function getMarketplaceListRequest(path: string) {
  const existing = marketplaceListRequests.get(path);
  if (existing) return existing;
  const request = api.get<MarketplaceListPayload>(path).finally(() => {
    marketplaceListRequests.delete(path);
  });
  marketplaceListRequests.set(path, request);
  return request;
}

interface MarketplaceState {
  listings: Listing[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
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
  setCategory: (category: Category) => Promise<void>;
  search: (query: string) => Promise<void>;
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
  bulkApproveAiFailedListings: (demoOnly?: boolean) => Promise<{ updated: number; items: Listing[] }>;
  rerunAiModeration: (id: string) => Promise<Listing>;
  approveListing: (id: string, reason?: string) => Promise<Listing>;
  rejectListing: (id: string, reason: string) => Promise<Listing>;
}

const DEFAULT_COUNTS: MyListingsCounts = {
  all: 0,
  error: 0,
  active: 0,
  pending: 0,
  rejected: 0,
  sold: 0,
};

const DEFAULT_SUMMARY: MyListingsSummary = {
  views: 0,
  saves: 0,
  activeBoosts: 0,
  boostImpressions: 0,
  boostSpent: 0,
};

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  listings: [],
  loading: false,
  refreshing: false,
  error: null,
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
  myListingsCounts: DEFAULT_COUNTS,
  myListingsSummary: DEFAULT_SUMMARY,
  savedListings: [],
  savedLoading: false,

  fetchListings: async (reset = false) => {
    const { loading, nextCursor, activeCategory } = get();
    if (loading && !reset) return;
    if (!reset && !nextCursor) return;
    set({ loading: true, error: null, ...(reset ? { refreshing: true, nextCursor: null } : {}) });
    try {
      const params = new URLSearchParams();
      if (activeCategory !== 'all') params.set('category', activeCategory);
      if (!reset && nextCursor) params.set('cursor', nextCursor);
      const path = `/api/marketplace?${params.toString()}`;
      const data = await getMarketplaceListRequest(path);
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
    } catch (e) {
      set({
        loading: false,
        refreshing: false,
        error: (e as Error).message ?? 'Khong the tai marketplace',
      });
    }
  },

  setCategory: async (category) => {
    set({
      activeCategory: category,
      listings: [],
      nextCursor: null,
      isSearchMode: false,
      searchQuery: '',
      searchResults: [],
    });
    await get().fetchListings(true);
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchMode: (v) => set({ isSearchMode: v }),

  search: async (query) => {
    if (!query.trim()) {
      set({ searchResults: [], searching: false, isSearchMode: false, error: null });
      return;
    }
    set({ searching: true, isSearchMode: true, error: null });
    try {
      const { activeCategory } = get();
      const params = new URLSearchParams({ q: query });
      if (activeCategory !== 'all') params.set('category', activeCategory);
      const data = await api.get<{ items: Listing[] }>(`/api/marketplace/search?${params.toString()}`);
      set({ searchResults: data.items, searching: false });
    } catch (e) {
      set({ searching: false, error: (e as Error).message ?? 'Khong the tim kiem' });
    }
  },

  fetchDetail: async (id) => {
    set({ detailLoading: true, detailListing: null, error: null });
    try {
      const listing = await api.get<Listing>(`/api/marketplace/${id}`);
      set({ detailListing: listing, detailLoading: false });
    } catch (e) {
      set({ detailLoading: false, error: (e as Error).message ?? 'Khong the tai tin dang' });
    }
  },

  clearDetail: () => set({ detailListing: null }),

  fetchMyListings: async (reset = true, filter = get().myListingsFilter) => {
    const { myListingsLoading, myListingsLoadingMore, myListingsNextCursor } = get();
    if (reset && myListingsLoading) return;
    if (!reset && (myListingsLoading || myListingsLoadingMore || !myListingsNextCursor)) return;
    set({
      myListingsFilter: filter,
      error: null,
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
      }>(`/api/marketplace/my?${params.toString()}`);
      set((s) => ({
        myListings: reset
          ? data.items
          : [
              ...s.myListings,
              ...data.items.filter((item) => !s.myListings.some((listing) => listing.id === item.id)),
            ],
        myListingsNextCursor: data.nextCursor,
        myListingsCounts: data.counts ?? s.myListingsCounts,
        myListingsSummary: data.summary ?? s.myListingsSummary,
        myListingsLoading: false,
        myListingsLoadingMore: false,
      }));
    } catch (e) {
      set({
        myListingsLoading: false,
        myListingsLoadingMore: false,
        error: (e as Error).message ?? 'Khong the tai tin cua toi',
      });
    }
  },

  fetchSavedListings: async () => {
    set({ savedLoading: true, error: null });
    try {
      const data = await api.get<{ items: Listing[] }>('/api/marketplace/saved');
      set({ savedListings: data.items, savedLoading: false });
    } catch (e) {
      set({ savedLoading: false, error: (e as Error).message ?? 'Khong the tai tin da luu' });
    }
  },

  toggleSave: async (id) => {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Chua dang nhap');

    const wasSaved = findListingInState(get(), id)?.savedBy?.includes(userId) ?? false;
    set((s) => applySavedState(s, id, userId, !wasSaved));
    try {
      const res = await api.post<{ saved: boolean; item?: Listing }>(`/api/marketplace/${id}/save`);
      set((s) =>
        res.item
          ? {
              listings: replaceListingById(s.listings, res.item),
              searchResults: replaceListingById(s.searchResults, res.item),
              myListings: replaceListingById(s.myListings, res.item),
              savedListings: res.saved
                ? [res.item, ...s.savedListings.filter((l) => l.id !== id)]
                : s.savedListings.filter((l) => l.id !== id),
              detailListing: s.detailListing?.id === id ? res.item : s.detailListing,
            }
          : applySavedState(s, id, userId, res.saved)
      );
      return res.saved;
    } catch (e) {
      set((s) => applySavedState(s, id, userId, wasSaved));
      throw e;
    }
  },

  createListing: async (data) => {
    const listing = await api.post<Listing>('/api/marketplace', data);
    const isSpamOrError = isMyListingSpamOrError(listing);
    set((s) => ({
      listings:
        listing.status === 'active' && (s.activeCategory === 'all' || s.activeCategory === listing.category)
          ? [listing, ...s.listings]
          : s.listings,
      myListings: matchesMyListingsFilter(listing, s.myListingsFilter)
        ? [listing, ...s.myListings]
        : s.myListings,
      myListingsCounts: {
        ...s.myListingsCounts,
        all: s.myListingsCounts.all + (listing.status !== 'deleted' && !isSpamOrError ? 1 : 0),
        active: s.myListingsCounts.active + (listing.status === 'active' ? 1 : 0),
        error: s.myListingsCounts.error + (isSpamOrError ? 1 : 0),
        pending: s.myListingsCounts.pending + (listing.status === 'pending' && !isSpamOrError ? 1 : 0),
        rejected: s.myListingsCounts.rejected + (listing.status === 'rejected' ? 1 : 0),
        sold: s.myListingsCounts.sold + (listing.status === 'sold' ? 1 : 0),
      },
    }));
    return listing;
  },

  boostListing: async (id, data) => {
    const updated = await api.post<Listing>(`/api/marketplace/${id}/boost`, data);
    set((s) => applyListingUpdate(s, id, updated));
    return updated;
  },

  pauseBoost: async (id) => {
    const updated = await api.patch<Listing>(`/api/marketplace/${id}/boost/pause`);
    set((s) => applyListingUpdate(s, id, updated));
    return updated;
  },

  resumeBoost: async (id) => {
    const updated = await api.patch<Listing>(`/api/marketplace/${id}/boost/resume`);
    set((s) => applyListingUpdate(s, id, updated));
    return updated;
  },

  updateListing: async (id, data) => {
    const updated = await api.patch<Listing>(`/api/marketplace/${id}`, data);
    set((s) => applyListingUpdate(s, id, updated));
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
      myListings: replaceListingById(s.myListings, updated).filter((l) =>
        matchesMyListingsFilter(l, s.myListingsFilter)
      ),
      savedListings: s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing?.id === id ? updated : s.detailListing,
    }));
  },

  reportListing: async (id, reason) =>
    api.post<{ reportId: string }>(`/api/marketplace/${id}/report`, { reason }),

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
      { demoOnly, limit: 100 }
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
          ? result.items.find((updated) => updated.id === s.detailListing?.id) ?? s.detailListing
          : null,
      };
    });
    return result;
  },

  rerunAiModeration: async (id) => {
    const updated = await api.patch<Listing>(`/api/marketplace/moderation/${id}/rerun-ai`);
    set((s) => applyListingUpdate(s, id, updated));
    return updated;
  },

  approveListing: async (id, reason) => {
    const updated = await api.patch<Listing>(`/api/marketplace/moderation/${id}/approve`, { reason });
    set((s) => applyListingUpdate(s, id, updated));
    return updated;
  },

  rejectListing: async (id, reason) => {
    const updated = await api.patch<Listing>(`/api/marketplace/moderation/${id}/reject`, { reason });
    set((s) => ({
      listings: s.listings.filter((l) => l.id !== id),
      searchResults: s.searchResults.filter((l) => l.id !== id),
      myListings: replaceListingById(s.myListings, updated).filter((l) =>
        matchesMyListingsFilter(l, s.myListingsFilter)
      ),
      savedListings: s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing?.id === id ? updated : s.detailListing,
    }));
    return updated;
  },
}));
