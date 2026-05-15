import { create } from 'zustand';
import { Image } from 'react-native';
import { api } from '@/lib/api';

export type FeedPost = {
  id: string;
  authorId?: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  content: string;
  mediaUrls: string[];
  createdAt: { _seconds?: number; seconds?: number } | string | number | null;
  likeCount: number;
  replyCount: number;
  likedBy: string[];
  reactions?: Record<string, string>;
  feeling?: string;
  location?: string;
  taggedFriends?: Array<{ uid: string; displayName: string }>;
  privacy?: 'public' | 'friends' | 'only-me' | 'custom';
  isEdited?: boolean;
  _discover?: boolean;
};

type FeedState = {
  posts: FeedPost[];
  hasMore: boolean;
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string | null;
  lastFetched: number | null;
  fetch: (force?: boolean) => Promise<void>;
  fetchMore: () => Promise<void>;
  setRefreshing: (v: boolean) => void;
  updatePost: (updated: Partial<FeedPost> & { id: string }) => void;
  addPost: (post: FeedPost) => void;
};

export const useFeedStore = create<FeedState>((set, get) => ({
  posts: [],
  hasMore: true,
  nextCursor: null,
  loading: false,
  loadingMore: false,
  refreshing: false,
  error: null,
  lastFetched: null,

  setRefreshing: (v) => set({ refreshing: v }),

  updatePost: (updated) =>
    set((s) => ({
      posts: s.posts.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
    })),

  addPost: (post) =>
    set((s) => ({
      posts: [post, ...s.posts.filter((p) => p.id !== post.id)],
      lastFetched: Date.now(),
    })),

  fetch: async (force = false) => {
    const { loading, lastFetched } = get();
    if (loading) return;
    if (!force && lastFetched && Date.now() - lastFetched < 30_000) return;

    set({ loading: true, error: null });
    try {
      const data = await api.get<{ posts: FeedPost[]; nextLastId?: string; hasMore?: boolean }>(
        '/api/feed'
      );
      set({
        posts: (data.posts ?? []).filter((p): p is FeedPost => p != null && typeof p.id === 'string'),
        hasMore: data.hasMore ?? !!data.nextLastId,
        nextCursor: data.nextLastId ?? null,
        lastFetched: Date.now(),
      });
      // Prefetch first batch of images so they render instantly
      const toPreload = (data.posts ?? []).filter((p) => p != null)
        .flatMap((p) => p.mediaUrls)
        .filter((u) => !u.includes('/video/upload/') && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(u))
        .slice(0, 20);
      toPreload.forEach((u) => Image.prefetch(u).catch(() => {}));
    } catch (e) {
      set({ error: (e as Error).message ?? 'Không thể tải feed' });
    } finally {
      set({ loading: false, refreshing: false });
    }
  },

  fetchMore: async () => {
    const { loadingMore, hasMore, nextCursor, posts } = get();
    if (loadingMore || !hasMore || !nextCursor) return;
    set({ loadingMore: true });
    try {
      const data = await api.get<{ posts: FeedPost[]; nextLastId?: string; hasMore?: boolean }>(
        `/api/feed?lastId=${nextCursor}`
      );
      const incoming = (data.posts ?? []).filter((p): p is FeedPost => p != null && typeof p.id === 'string');
      const existingIds = new Set(posts.filter(p => p != null).map((p) => p.id));
      const filtered = incoming.filter((p) => !existingIds.has(p.id));
      set((s) => ({
        posts: [...s.posts, ...filtered],
        hasMore: data.hasMore ?? !!data.nextLastId,
        nextCursor: data.nextLastId ?? null,
      }));
    } catch {
      // Silent fail on load more
    } finally {
      set({ loadingMore: false });
    }
  },
}));
