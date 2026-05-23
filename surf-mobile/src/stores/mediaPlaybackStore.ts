import { create } from 'zustand';

type MediaPlaybackState = {
  videosMuted: boolean;
  setVideosMuted: (muted: boolean) => void;
  toggleVideosMuted: () => void;
};

export const useMediaPlaybackStore = create<MediaPlaybackState>((set) => ({
  videosMuted: false,
  setVideosMuted: (videosMuted) => set({ videosMuted }),
  toggleVideosMuted: () => set((state) => ({ videosMuted: !state.videosMuted })),
}));
