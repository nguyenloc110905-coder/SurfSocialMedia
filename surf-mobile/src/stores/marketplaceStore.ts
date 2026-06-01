import { create } from 'zustand';
import { api } from '@/lib/api';
import { auth } from '@/lib/firebase/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Category = 'all' | 'electronics' | 'clothing' | 'vehicles' | 'property' | 'home' | 'sports' | 'other';
export type Condition = 'new' | 'like_new' | 'good' | 'fair';
export type ListingStatus = 'pending' | 'active' | 'rejected' | 'sold' | 'deleted';
export type MarketplaceModerationMode = 'auto' | 'manual';
export type ListingAvailability = 'in_stock' | 'single_item';
export type SellerSaleStatus = 'available' | 'pending';
export type BoostStatus = 'none' | 'awaiting_moderation' | 'active' | 'paused' | 'completed' | 'cancelled' | 'rejected';
export type BoostPaymentMode = 'sandbox' | 'live';
export type BoostPaymentStatus = 'none' | 'sandbox_authorized' | 'sandbox_voided' | 'paid' | 'refunded';
export type BoostSandboxPaymentProvider = 'zalopay' | 'vnpay' | 'momo';

export interface BoostMetrics {
  impressions: number;
  clicks: number;
  saves: number;
  spent: number;
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
  moderationReason?: string | null;
  moderationFlags?: string[];
  moderatedBy?: 'ai' | 'admin' | null;
  reviewedBy?: string | null;
  createdAt: { _seconds?: number; seconds?: number } | number | string;
  updatedAt: { _seconds?: number; seconds?: number } | number | string;
}

interface MarketplaceState {
  // Feed
  listings: Listing[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  nextCursor: string | null;
  activeCategory: Category;

  // Search
  searchQuery: string;
  searchResults: Listing[];
  searching: boolean;

  // Detail
  detailListing: Listing | null;
  detailLoading: boolean;

  // My listings
  myListings: Listing[];
  myListingsLoading: boolean;

  // Saved
  savedListings: Listing[];
  savedLoading: boolean;

  // Actions
  fetchListings: (reset?: boolean) => Promise<void>;
  setCategory: (category: Category) => Promise<void>;
  search: (query: string) => Promise<void>;
  fetchDetail: (id: string) => Promise<void>;
  fetchMyListings: () => Promise<void>;
  fetchSavedListings: () => Promise<void>;
  toggleSave: (id: string) => Promise<boolean>;
  createListing: (data: CreateListingInput) => Promise<Listing>;
  deleteListing: (id: string) => Promise<void>;
  markAsSold: (id: string) => Promise<void>;
  setSearchQuery: (q: string) => void;
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

function replaceListingById(listings: Listing[], updated: Listing): Listing[] {
  return listings.map((listing) => (listing.id === updated.id ? updated : listing));
}

// ── Store ─────────────────────────────────────────────────────────────────────

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

  detailListing: null,
  detailLoading: false,

  myListings: [],
  myListingsLoading: false,

  savedListings: [],
  savedLoading: false,

  // ── Fetch danh sách (có phân trang) ──────────────────────────────────────
  fetchListings: async (reset = false) => {
    const { loading, nextCursor, activeCategory } = get();
    if (loading && !reset) return;

    set({ loading: true, error: null, ...(reset ? { refreshing: true, nextCursor: null } : {}) });
    try {
      const params = new URLSearchParams();
      if (activeCategory !== 'all') params.set('category', activeCategory);
      if (!reset && nextCursor) params.set('cursor', nextCursor);

      const data = await api.get<{ items: Listing[]; nextCursor: string | null }>(
        `/api/marketplace?${params.toString()}`
      );

      set((s) => ({
        listings: reset
          ? data.items
          : [...s.listings, ...data.items.filter((item) => !s.listings.some((l) => l.id === item.id))],
        nextCursor: data.nextCursor,
        loading: false,
        refreshing: false,
      }));
    } catch (e) {
      set({ loading: false, refreshing: false, error: (e as Error).message ?? 'Không thể tải marketplace' });
    }
  },

  // ── Đổi category ─────────────────────────────────────────────────────────
  setCategory: async (category) => {
    set({ activeCategory: category, listings: [], nextCursor: null, searchQuery: '', searchResults: [] });
    await get().fetchListings(true);
  },

  // ── Tìm kiếm ─────────────────────────────────────────────────────────────
  setSearchQuery: (q) => set({ searchQuery: q }),

  search: async (query) => {
    if (!query.trim()) {
      set({ searchResults: [], searching: false, error: null });
      return;
    }
    set({ searching: true, error: null });
    try {
      const { activeCategory } = get();
      const params = new URLSearchParams({ q: query });
      if (activeCategory !== 'all') params.set('category', activeCategory);

      const data = await api.get<{ items: Listing[]; nextCursor: string | null }>(
        `/api/marketplace/search?${params.toString()}`
      );
      set({ searchResults: data.items, searching: false });
    } catch (e) {
      set({ searching: false, error: (e as Error).message ?? 'Không thể tìm kiếm' });
    }
  },

  // ── Chi tiết tin ─────────────────────────────────────────────────────────
  fetchDetail: async (id) => {
    set({ detailLoading: true, detailListing: null, error: null });
    try {
      const listing = await api.get<Listing>(`/api/marketplace/${id}`);
      set({ detailListing: listing, detailLoading: false });
    } catch (e) {
      set({ detailLoading: false, error: (e as Error).message ?? 'Không thể tải tin đăng' });
    }
  },

  // ── Tin của tôi ───────────────────────────────────────────────────────────
  fetchMyListings: async () => {
    set({ myListingsLoading: true, error: null });
    try {
      const data = await api.get<{ items: Listing[] }>('/api/marketplace/my?status=all');
      set({ myListings: data.items, myListingsLoading: false });
    } catch (e) {
      set({ myListingsLoading: false, error: (e as Error).message ?? 'Không thể tải tin của tôi' });
    }
  },

  // ── Tin đã lưu ───────────────────────────────────────────────────────────
  fetchSavedListings: async () => {
    set({ savedLoading: true, error: null });
    try {
      const data = await api.get<{ items: Listing[] }>('/api/marketplace/saved');
      set({ savedListings: data.items, savedLoading: false });
    } catch (e) {
      set({ savedLoading: false, error: (e as Error).message ?? 'Không thể tải tin đã lưu' });
    }
  },

  // ── Lưu / bỏ lưu ─────────────────────────────────────────────────────────
  toggleSave: async (id) => {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Chưa đăng nhập');

    const wasSaved = findListingInState(get(), id)?.savedBy?.includes(userId) ?? false;
    const nextSaved = !wasSaved;
    set((s) => applySavedState(s, id, userId, nextSaved));

    try {
      const res = await api.post<{ saved: boolean; item?: Listing }>(`/api/marketplace/${id}/save`);
      set((s) => res.item
        ? {
            listings: replaceListingById(s.listings, res.item),
            searchResults: replaceListingById(s.searchResults, res.item),
            myListings: replaceListingById(s.myListings, res.item),
            savedListings: res.saved
              ? [res.item, ...s.savedListings.filter((l: Listing) => l.id !== id)]
              : s.savedListings.filter((l: Listing) => l.id !== id),
            detailListing: s.detailListing?.id === id ? res.item : s.detailListing,
          }
        : applySavedState(s, id, userId, res.saved));
      return res.saved;
    } catch (e) {
      set((s) => applySavedState(s, id, userId, wasSaved));
      throw e;
    }
  },

  // ── Tạo tin mới ───────────────────────────────────────────────────────────
  createListing: async (data) => {
    const listing = await api.post<Listing>('/api/marketplace', data);
    set((s) => ({
      listings:
        listing.status === 'active' && (s.activeCategory === 'all' || s.activeCategory === listing.category)
          ? [listing, ...s.listings]
          : s.listings,
      myListings: [listing, ...s.myListings],
    }));
    return listing;
  },

  // ── Xóa tin ──────────────────────────────────────────────────────────────
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

  // ── Đánh dấu đã bán ──────────────────────────────────────────────────────
  markAsSold: async (id) => {
    const updated = await api.patch<Listing>(`/api/marketplace/${id}`, { status: 'sold' });
    set((s) => ({
      listings: s.listings.filter((l) => l.id !== id),
      searchResults: s.searchResults.filter((l) => l.id !== id),
      myListings: s.myListings.map((l) =>
        l.id === id ? updated : l
      ),
      savedListings: s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing?.id === id ? updated : s.detailListing,
    }));
  },
}));
