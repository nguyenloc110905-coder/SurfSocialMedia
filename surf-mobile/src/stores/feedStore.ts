import { Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { api } from '@/lib/api';
import { useSettingsStore } from '@/stores/settingsStore';

export type FeedPost = {
  id: string;
  authorId?: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  content: string;
  textStyle?: {
    font?: 'system' | 'serif' | 'rounded' | 'bold' | 'mono';
    color?: string;
  } | null;
  mediaUrls: string[];
  createdAt: { _seconds?: number; seconds?: number } | string | number | null;
  likeCount: number;
  replyCount: number;
  shareCount?: number;
  likedBy: string[];
  reactions?: Record<string, string>;
  savedBy?: string[];
  archived?: boolean;
  archivedAt?: string | null;
  sharedFrom?: {
    id: string;
    authorId: string | null;
    authorDisplayName: string;
    authorPhotoURL: string | null;
    content: string;
    textStyle?: FeedPost['textStyle'];
    mediaUrls: string[];
    createdAt: FeedPost['createdAt'];
  };
  feeling?: string;
  location?: string;
  taggedFriends?: Array<{ uid: string; displayName: string; photoURL?: string | null }>;
  privacy?: 'public' | 'friends' | 'only-me' | 'custom';
  isEdited?: boolean;
  pinnedAt?: string | null;
  _discover?: boolean;
  group?: {
    id: string;
    name: string;
    coverImageUrl?: string | null;
  };
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
  removePost: (postId: string) => void;
};

const FEED_CACHE_KEY = 'surf_mobile_feed_cache_v1';
const FEED_STALE_MS = 30_000;
const FEED_CACHE_LIMIT = 30;

type FeedCachePayload = {
  posts: FeedPost[];
  hasMore: boolean;
  nextCursor: string | null;
  savedAt: number;
};

async function saveFeedCache(payload: FeedCachePayload) {
  if (!useSettingsStore.getState().prefs.feedCache) return;

  try {
    await AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Cache is best-effort.
  }
}

function persistFeedSnapshot(posts: FeedPost[], hasMore: boolean, nextCursor: string | null) {
  void saveFeedCache({
    posts: posts.slice(0, FEED_CACHE_LIMIT),
    hasMore,
    nextCursor,
    savedAt: Date.now(),
  });
}

let feedFetchPromise: Promise<void> | null = null;

async function readFeedCache(): Promise<FeedCachePayload | null> {
  if (!useSettingsStore.getState().prefs.feedCache) return null;

  try {
    const raw = await AsyncStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<FeedCachePayload>;
    if (!Array.isArray(parsed.posts)) return null;

    return {
      posts: parsed.posts.filter((p): p is FeedPost => p != null && typeof p.id === 'string'),
      hasMore: parsed.hasMore ?? true,
      nextCursor: parsed.nextCursor ?? null,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

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
    set((s) => {
      const posts = s.posts.map((p) => (p.id === updated.id ? { ...p, ...updated } : p));
      persistFeedSnapshot(posts, s.hasMore, s.nextCursor);
      return { posts };
    }),

  addPost: (post) =>
    set((s) => {
      const posts = [post, ...s.posts.filter((p) => p.id !== post.id)];
      persistFeedSnapshot(posts, s.hasMore, s.nextCursor);
      return { posts, lastFetched: Date.now() };
    }),

  removePost: (postId) =>
    set((s) => {
      const posts = s.posts.filter((p) => p.id !== postId);
      persistFeedSnapshot(posts, s.hasMore, s.nextCursor);
      return { posts };
    }),

  fetch: async (force = false) => {
    const { loading, lastFetched } = get();
    if (loading) return;
    if (!force && lastFetched && Date.now() - lastFetched < FEED_STALE_MS) return;
    if (feedFetchPromise) return feedFetchPromise;

    feedFetchPromise = (async () => {
      let cached: FeedCachePayload | null = null;
      if (get().posts.length === 0) {
        cached = await readFeedCache();
        if (cached) {
          set({
            posts: cached.posts,
            hasMore: cached.hasMore,
            nextCursor: cached.nextCursor,
            lastFetched: cached.savedAt,
            error: null,
          });
        }
      }

      if (get().posts.length === 0) set({ loading: true, error: null });
      else set({ error: null });

      try {
        const data = await api.get<{ posts: FeedPost[]; nextLastId?: string; hasMore?: boolean }>(
          '/api/feed'
        );
        const incoming = (data.posts ?? []).filter((p): p is FeedPost => p != null && typeof p.id === 'string');
        const currentById = new Map(get().posts.map((p) => [p.id, p]));
        const posts = incoming.map((post) => ({ ...(currentById.get(post.id) ?? {}), ...post }));
        const hasMore = data.hasMore ?? !!data.nextLastId;
        const nextCursor = data.nextLastId ?? null;
        const lastFetched = Date.now();
        set({ posts, hasMore, nextCursor, lastFetched });
        await saveFeedCache({ posts: posts.slice(0, FEED_CACHE_LIMIT), hasMore, nextCursor, savedAt: lastFetched });

        const toPreload = posts
          .flatMap((p) => p.mediaUrls)
          .filter((u) => !u.includes('/video/upload/') && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(u))
          .slice(0, 20);
        toPreload.forEach((u) => Image.prefetch(u).catch(() => {}));
      } catch (e) {
        set({ error: cached || get().posts.length > 0 ? null : (e as Error).message ?? 'Khong the tai feed' });
      } finally {
        set({ loading: false, refreshing: false });
        feedFetchPromise = null;
      }
    })();

    return feedFetchPromise;
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
      const existingIds = new Set(posts.filter((p) => p != null).map((p) => p.id));
      const filtered = incoming.filter((p) => !existingIds.has(p.id));
      const nextPosts = [...posts, ...filtered];
      const nextHasMore = data.hasMore ?? !!data.nextLastId;
      const nextCursorValue = data.nextLastId ?? null;

      set({
        posts: nextPosts,
        hasMore: nextHasMore,
        nextCursor: nextCursorValue,
      });
      await saveFeedCache({
        posts: nextPosts.slice(0, FEED_CACHE_LIMIT),
        hasMore: nextHasMore,
        nextCursor: nextCursorValue,
        savedAt: Date.now(),
      });
    } catch {
      // Silent fail on load more.
    } finally {
      set({ loadingMore: false });
    }
  },
}));
