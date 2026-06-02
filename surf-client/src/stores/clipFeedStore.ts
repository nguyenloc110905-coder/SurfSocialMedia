import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ClipVideo {
  id: string;
  _source?: 'clip' | 'post';
  authorId: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  likeCount: number;
  likedBy: string[];
  viewCount: number;
  commentCount: number;
  duration: number | null;
  createdAt: unknown;
}

interface ClipFeedState {
  videos: ClipVideo[];
  hasMore: boolean;
  nextCursor: number | null;
  loaded: boolean; // true = đã fetch ít nhất 1 lần, không cần fetch lại khi navigate về

  setFeed: (videos: ClipVideo[], hasMore: boolean, nextCursor: number | null) => void;
  appendFeed: (videos: ClipVideo[], hasMore: boolean, nextCursor: number | null) => void;
  removeVideo: (id: string) => void;
  prependVideo: (video: ClipVideo) => void;
}

export const useClipFeedStore = create<ClipFeedState>()(
  persist(
    (set) => ({
      videos: [],
      hasMore: true,
      nextCursor: null,
      loaded: false,

      setFeed: (videos, hasMore, nextCursor) =>
        set({ videos, hasMore, nextCursor, loaded: true }),

      appendFeed: (newVideos, hasMore, nextCursor) =>
        set((state) => ({
          videos: [...state.videos, ...newVideos],
          hasMore,
          nextCursor,
        })),

      removeVideo: (id) =>
        set((state) => ({ videos: state.videos.filter((v) => v.id !== id) })),

      prependVideo: (video) =>
        set((state) => ({ videos: [video, ...state.videos] })),
    }),
    {
      name: 'surf-clips-cache',
      partialize: (state) => ({
        // Chỉ lưu 10 clips đầu tiên để tránh quá dung lượng LocalStorage
        videos: state.videos.slice(0, 10),
      }),
    }
  )
);
