import { create } from 'zustand';

export type ClipFeedItem = {
  _source?: 'clip' | 'post';
  id: string;
  authorId?: string;
  authorDisplayName?: string;
  authorPhotoURL?: string | null;
  title?: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string | null;
  likeCount?: number;
  likedBy?: string[];
  commentCount?: number;
  viewCount?: number;
  allowComments?: boolean;
  editOptions?: {
    contentFit?: 'contain' | 'cover';
    mutedOriginal?: boolean;
  };
  textOverlays?: Array<{
    id?: string;
    text?: string;
    color?: string;
    fontSize?: number;
    placement?: 'top' | 'center' | 'bottom';
  }>;
};

type ClipState = {
  refreshSignal: number;
  items: ClipFeedItem[];
  hasMore: boolean;
  nextCursor: number | null;
  lastFetched: number | null;
  setFeed: (payload: {
    items: ClipFeedItem[];
    hasMore: boolean;
    nextCursor: number | null;
    lastFetched?: number;
  }) => void;
  appendFeed: (payload: {
    items: ClipFeedItem[];
    hasMore: boolean;
    nextCursor: number | null;
  }) => void;
  replaceItems: (updater: ClipFeedItem[] | ((items: ClipFeedItem[]) => ClipFeedItem[])) => void;
  updateItem: (item: Partial<ClipFeedItem> & { id: string; _source?: 'clip' | 'post' }) => void;
  requestRefresh: () => void;
};

export const useClipStore = create<ClipState>((set, get) => ({
  refreshSignal: 0,
  items: [],
  hasMore: true,
  nextCursor: null,
  lastFetched: null,

  setFeed: ({ items, hasMore, nextCursor, lastFetched }) =>
    set({
      items,
      hasMore,
      nextCursor,
      lastFetched: lastFetched ?? Date.now(),
    }),

  appendFeed: ({ items, hasMore, nextCursor }) => {
    const current = get().items;
    const existing = new Set(current.map((item) => `${item._source ?? 'clip'}:${item.id}`));
    set({
      items: [
        ...current,
        ...items.filter((item) => !existing.has(`${item._source ?? 'clip'}:${item.id}`)),
      ],
      hasMore,
      nextCursor,
      lastFetched: Date.now(),
    });
  },

  replaceItems: (updater) =>
    set((state) => ({
      items: typeof updater === 'function' ? updater(state.items) : updater,
      lastFetched: Date.now(),
    })),

  updateItem: (item) =>
    set((state) => ({
      items: state.items.map((current) =>
        current.id === item.id && (item._source == null || current._source === item._source)
          ? { ...current, ...item }
          : current
      ),
    })),

  requestRefresh: () => set((state) => ({ refreshSignal: state.refreshSignal + 1 })),
}));
