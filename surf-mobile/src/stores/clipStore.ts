import { create } from 'zustand';

type ClipState = {
  refreshSignal: number;
  requestRefresh: () => void;
};

export const useClipStore = create<ClipState>((set) => ({
  refreshSignal: 0,
  requestRefresh: () => set((state) => ({ refreshSignal: state.refreshSignal + 1 })),
}));
