import { create } from 'zustand';

type MessageState = {
  unreadConversations: number;
  setUnreadConversations: (count: number) => void;
  clear: () => void;
};

const normalizeCount = (count: number): number =>
  Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

export const useMessageStore = create<MessageState>((set) => ({
  unreadConversations: 0,
  setUnreadConversations: (count) => set({ unreadConversations: normalizeCount(count) }),
  clear: () => set({ unreadConversations: 0 }),
}));
