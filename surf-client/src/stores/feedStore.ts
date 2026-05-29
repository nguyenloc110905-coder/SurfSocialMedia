import { create } from 'zustand';
import type { Timestamp } from 'firebase/firestore';

export interface FeedPost {
  id: string;
  authorId?: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  content: string;
  mediaUrls: string[];
  createdAt: Timestamp | { _seconds: number } | { seconds: number } | string | number | null;
  likeCount: number;
  replyCount: number;
  shareCount?: number;
  likedBy: string[];
  reactions?: Record<string, string>;
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
  sharedFrom?: {
    id: string;
    authorId?: string;
    authorDisplayName: string;
    authorPhotoURL: string | null;
    content: string;
    mediaUrls: string[];
    createdAt: Timestamp | { _seconds: number } | { seconds: number } | string | number | null;
  };
}

interface FeedState {
  posts: FeedPost[];
  hasMore: boolean;
  nextCursor: string | null;
  loaded: boolean;
  scrollTop: number;
  setPosts: (posts: FeedPost[], hasMore: boolean, nextCursor: string | null) => void;
  appendPosts: (newPosts: FeedPost[], hasMore: boolean, nextCursor: string | null) => void;
  prependPost: (post: FeedPost) => void;
  updatePost: (post: FeedPost) => void;
  setScrollTop: (scrollTop: number) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  posts: [],
  hasMore: true,
  nextCursor: null,
  loaded: false,
  scrollTop: 0,
  setPosts: (posts, hasMore, nextCursor) => set({ posts, hasMore, nextCursor, loaded: true }),
  appendPosts: (newPosts, hasMore, nextCursor) =>
    set((s) => {
      const existingIds = new Set(s.posts.map((p) => p.id));
      const filtered = newPosts.filter((p) => !existingIds.has(p.id));
      return { posts: [...s.posts, ...filtered], hasMore, nextCursor };
    }),
  prependPost: (post) =>
    set((s) => {
      if (s.posts.some((p) => p.id === post.id)) return s;
      return { posts: [post, ...s.posts] };
    }),
  updatePost: (post) =>
    set((s) => ({ posts: s.posts.map((p) => (p.id === post.id ? { ...p, ...post } : p)) })),
  setScrollTop: (scrollTop) => set({ scrollTop }),
}));
