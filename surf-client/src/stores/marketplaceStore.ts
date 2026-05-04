import { create } from 'zustand';
import { api } from '@/lib/api';
import { auth } from '@/lib/firebase/auth';

export type Category = 'all' | 'electronics' | 'clothing' | 'vehicles' | 'home' | 'sports' | 'other';
export type Condition = 'new' | 'like_new' | 'good' | 'fair';

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
  status: 'active' | 'sold' | 'deleted';
  savedBy: string[];
  viewCount: number;
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
}

const SEED_NOW = Date.now();
const SEED_LISTINGS: Listing[] = [
  {
    id: 'seed-1',
    sellerId: 'seed-user-1',
    sellerDisplayName: 'Minh Anh',
    sellerPhotoURL: null,
    title: 'Tai nghe Bluetooth Baseus E13',
    description: 'Con moi, day du hop, pin tot.',
    price: 100000,
    currency: 'VND',
    category: 'electronics',
    condition: 'like_new',
    mediaUrls: [
      'https://images.unsplash.com/photo-1518441902115-48a0f4f1bb2f?auto=format&fit=crop&w=800&q=80',
    ],
    location: 'Quan 3, TP.HCM',
    status: 'active',
    savedBy: [],
    viewCount: 142,
    createdAt: SEED_NOW - 1000 * 60 * 35,
    updatedAt: SEED_NOW - 1000 * 60 * 20,
  },
  {
    id: 'seed-2',
    sellerId: 'seed-user-2',
    sellerDisplayName: 'Quoc Huy',
    sellerPhotoURL: null,
    title: 'Iphone 12 64GB xanh',
    description: 'May zin, pin 86%, co sac nhanh.',
    price: 5200000,
    currency: 'VND',
    category: 'electronics',
    condition: 'good',
    mediaUrls: [
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80',
    ],
    location: 'Quan 10, TP.HCM',
    status: 'active',
    savedBy: ['me'],
    viewCount: 318,
    createdAt: SEED_NOW - 1000 * 60 * 60 * 3,
    updatedAt: SEED_NOW - 1000 * 60 * 60 * 2,
  },
  {
    id: 'seed-3',
    sellerId: 'seed-user-3',
    sellerDisplayName: 'Lan Phuong',
    sellerPhotoURL: null,
    title: 'May anh film 35mm',
    description: 'Da bao duong, kem bao da.',
    price: 1800000,
    currency: 'VND',
    category: 'electronics',
    condition: 'good',
    mediaUrls: [
      'https://images.unsplash.com/photo-1519183071298-a2962eadc9c2?auto=format&fit=crop&w=800&q=80',
    ],
    location: 'Quan 1, TP.HCM',
    status: 'active',
    savedBy: [],
    viewCount: 97,
    createdAt: SEED_NOW - 1000 * 60 * 60 * 6,
    updatedAt: SEED_NOW - 1000 * 60 * 60 * 5,
  },
  {
    id: 'seed-4',
    sellerId: 'seed-user-4',
    sellerDisplayName: 'Gia Bao',
    sellerPhotoURL: null,
    title: 'Ban phim co mini',
    description: 'Switch brown, co den nen.',
    price: 450000,
    currency: 'VND',
    category: 'electronics',
    condition: 'like_new',
    mediaUrls: [
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80',
    ],
    location: 'Tan Binh, TP.HCM',
    status: 'active',
    savedBy: [],
    viewCount: 204,
    createdAt: SEED_NOW - 1000 * 60 * 60 * 24,
    updatedAt: SEED_NOW - 1000 * 60 * 60 * 22,
  },
  {
    id: 'seed-5',
    sellerId: 'seed-user-5',
    sellerDisplayName: 'Khanh Linh',
    sellerPhotoURL: null,
    title: 'Xe may tay ga 110cc',
    description: 'Giay to day du, may em ru.',
    price: 11500000,
    currency: 'VND',
    category: 'vehicles',
    condition: 'good',
    mediaUrls: [
      'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=800&q=80',
    ],
    location: 'Go Vap, TP.HCM',
    status: 'active',
    savedBy: [],
    viewCount: 73,
    createdAt: SEED_NOW - 1000 * 60 * 60 * 10,
    updatedAt: SEED_NOW - 1000 * 60 * 60 * 9,
  },
  {
    id: 'seed-6',
    sellerId: 'seed-user-6',
    sellerDisplayName: 'Thu Trang',
    sellerPhotoURL: null,
    title: 'Ao khoac denim',
    description: 'Size M, mac 2 lan.',
    price: 120000,
    currency: 'VND',
    category: 'clothing',
    condition: 'like_new',
    mediaUrls: [
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80',
    ],
    location: 'Quan 7, TP.HCM',
    status: 'active',
    savedBy: [],
    viewCount: 56,
    createdAt: SEED_NOW - 1000 * 60 * 60 * 14,
    updatedAt: SEED_NOW - 1000 * 60 * 60 * 12,
  },
  {
    id: 'seed-7',
    sellerId: 'seed-user-7',
    sellerDisplayName: 'Tuan Kiet',
    sellerPhotoURL: null,
    title: 'Ghe luoi phong khach',
    description: 'Mau xanh dam, ngoi rat em.',
    price: 250000,
    currency: 'VND',
    category: 'home',
    condition: 'good',
    mediaUrls: [
      'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80',
    ],
    location: 'Binh Thanh, TP.HCM',
    status: 'active',
    savedBy: [],
    viewCount: 89,
    createdAt: SEED_NOW - 1000 * 60 * 60 * 20,
    updatedAt: SEED_NOW - 1000 * 60 * 60 * 18,
  },
  {
    id: 'seed-8',
    sellerId: 'seed-user-8',
    sellerDisplayName: 'Hoai Nam',
    sellerPhotoURL: null,
    title: 'Noi chien khong dau 4L',
    description: 'Chay tot, phu kien day du.',
    price: 690000,
    currency: 'VND',
    category: 'home',
    condition: 'good',
    mediaUrls: [
      'https://images.unsplash.com/photo-1520848315518-b991dd16a2b0?auto=format&fit=crop&w=800&q=80',
    ],
    location: 'Thu Duc, TP.HCM',
    status: 'active',
    savedBy: [],
    viewCount: 131,
    createdAt: SEED_NOW - 1000 * 60 * 60 * 8,
    updatedAt: SEED_NOW - 1000 * 60 * 60 * 7,
  },
  {
    id: 'seed-9',
    sellerId: 'seed-user-9',
    sellerDisplayName: 'Bao Tran',
    sellerPhotoURL: null,
    title: 'Giay chay bo size 42',
    description: 'Da ve sinh, it su dung.',
    price: 320000,
    currency: 'VND',
    category: 'sports',
    condition: 'like_new',
    mediaUrls: [
      'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=800&q=80',
    ],
    location: 'Quan 2, TP.HCM',
    status: 'active',
    savedBy: [],
    viewCount: 64,
    createdAt: SEED_NOW - 1000 * 60 * 60 * 28,
    updatedAt: SEED_NOW - 1000 * 60 * 60 * 26,
  },
  {
    id: 'seed-10',
    sellerId: 'seed-user-10',
    sellerDisplayName: 'Duc Thien',
    sellerPhotoURL: null,
    title: 'Ke sach go mini',
    description: 'Rong 80cm, cao 120cm.',
    price: 0,
    currency: 'VND',
    category: 'home',
    condition: 'fair',
    mediaUrls: [
      'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80',
    ],
    location: 'Quan 11, TP.HCM',
    status: 'active',
    savedBy: [],
    viewCount: 41,
    createdAt: SEED_NOW - 1000 * 60 * 60 * 32,
    updatedAt: SEED_NOW - 1000 * 60 * 60 * 30,
  },
];

const getSeedListings = (category: Category) =>
  category === 'all' ? SEED_LISTINGS : SEED_LISTINGS.filter((item) => item.category === category);

const searchSeedListings = (query: string, category: Category) => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return getSeedListings(category).filter((item) =>
    item.title.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q) ||
    item.location.toLowerCase().includes(q)
  );
};

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
  savedListings: Listing[];
  savedLoading: boolean;

  fetchListings: (reset?: boolean) => Promise<void>;
  setCategory: (c: Category) => Promise<void>;
  search: (q: string) => Promise<void>;
  setSearchQuery: (q: string) => void;
  setSearchMode: (v: boolean) => void;
  fetchDetail: (id: string) => Promise<void>;
  clearDetail: () => void;
  fetchMyListings: () => Promise<void>;
  fetchSavedListings: () => Promise<void>;
  toggleSave: (id: string) => Promise<boolean>;
  createListing: (data: CreateListingInput) => Promise<Listing>;
  deleteListing: (id: string) => Promise<void>;
  markAsSold: (id: string) => Promise<void>;
}

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
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
  savedListings: [],
  savedLoading: false,

  fetchListings: async (reset = false) => {
    const { loading, nextCursor, activeCategory } = get();
    if (loading && !reset) return;
    set({ loading: true, ...(reset ? { refreshing: true, listings: [], nextCursor: null } : {}) });
    try {
      const params = new URLSearchParams();
      if (activeCategory !== 'all') params.set('category', activeCategory);
      if (!reset && nextCursor) params.set('cursor', nextCursor);
      const data = await api.get<{ items: Listing[]; nextCursor: string | null }>(
        `/api/marketplace?${params.toString()}`
      );
      const shouldSeed = import.meta.env.DEV && reset && data.items.length === 0;
      const seedListings = shouldSeed ? getSeedListings(activeCategory) : data.items;
      set((s) => ({
        listings: reset
          ? seedListings
          : [...s.listings, ...data.items.filter((item) => !s.listings.some((l) => l.id === item.id))],
        nextCursor: shouldSeed ? null : data.nextCursor,
        loading: false,
        refreshing: false,
      }));
    } catch {
      if (import.meta.env.DEV && reset) {
        set({
          listings: getSeedListings(activeCategory),
          nextCursor: null,
          loading: false,
          refreshing: false,
        });
        return;
      }
      set({ loading: false, refreshing: false });
    }
  },

  setCategory: async (category) => {
    set({ activeCategory: category, listings: [], nextCursor: null, isSearchMode: false, searchQuery: '' });
    await get().fetchListings(true);
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchMode: (v) => set({ isSearchMode: v }),

  search: async (query) => {
    if (!query.trim()) { set({ searchResults: [], searching: false }); return; }
    set({ searching: true, isSearchMode: true });
    try {
      const { activeCategory } = get();
      const params = new URLSearchParams({ q: query });
      if (activeCategory !== 'all') params.set('category', activeCategory);
      const data = await api.get<{ items: Listing[] }>(`/api/marketplace/search?${params}`);
      const shouldSeed = import.meta.env.DEV && data.items.length === 0;
      set({
        searchResults: shouldSeed ? searchSeedListings(query, activeCategory) : data.items,
        searching: false,
      });
    } catch {
      if (import.meta.env.DEV) {
        const { activeCategory } = get();
        set({ searchResults: searchSeedListings(query, activeCategory), searching: false });
        return;
      }
      set({ searching: false });
    }
  },

  fetchDetail: async (id) => {
    set({ detailLoading: true, detailListing: null });
    try {
      const listing = await api.get<Listing>(`/api/marketplace/${id}`);
      set({ detailListing: listing, detailLoading: false });
    } catch { set({ detailLoading: false }); }
  },

  clearDetail: () => set({ detailListing: null }),

  fetchMyListings: async () => {
    set({ myListingsLoading: true });
    try {
      const data = await api.get<{ items: Listing[] }>('/api/marketplace/my?status=all');
      set({ myListings: data.items, myListingsLoading: false });
    } catch { set({ myListingsLoading: false }); }
  },

  fetchSavedListings: async () => {
    set({ savedLoading: true });
    try {
      const data = await api.get<{ items: Listing[] }>('/api/marketplace/saved');
      set({ savedListings: data.items, savedLoading: false });
    } catch { set({ savedLoading: false }); }
  },

  toggleSave: async (id) => {
    const res = await api.post<{ saved: boolean }>(`/api/marketplace/${id}/save`);
    const userId = auth.currentUser?.uid;
    set((s) => ({
      listings: s.listings.map((l) => setSavedBy(l, id, userId, res.saved)),
      searchResults: s.searchResults.map((l) => setSavedBy(l, id, userId, res.saved)),
      savedListings: res.saved
        ? s.savedListings.map((l) => setSavedBy(l, id, userId, res.saved))
        : s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing ? setSavedBy(s.detailListing, id, userId, res.saved) : null,
    }));
    return res.saved;
  },

  createListing: async (data) => {
    const listing = await api.post<Listing>('/api/marketplace', data);
    set((s) => ({ listings: [listing, ...s.listings], myListings: [listing, ...s.myListings] }));
    return listing;
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
    const updated = await api.patch<Listing>(`/api/marketplace/${id}`, { status: 'sold' });
    set((s) => ({
      listings: s.listings.filter((l) => l.id !== id),
      searchResults: s.searchResults.filter((l) => l.id !== id),
      myListings: s.myListings.map((l) => (l.id === id ? updated : l)),
      savedListings: s.savedListings.filter((l) => l.id !== id),
      detailListing: s.detailListing?.id === id ? updated : s.detailListing,
    }));
  },
}));
