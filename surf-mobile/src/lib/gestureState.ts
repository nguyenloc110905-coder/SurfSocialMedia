import { create } from 'zustand';

// Non-reactive flag for use inside PanResponder callbacks (synchronous reads).
export const gestureState = {
  reactionPickerActive: false,
};

// Reactive Zustand store – for components that need to re-render when the
// reaction picker opens/closes (e.g. FeedScreen to disable FlatList scroll).
type GestureStore = {
  reactionPickerActive: boolean;
  setReactionPickerActive: (v: boolean) => void;
};

export const useGestureStore = create<GestureStore>((set) => ({
  reactionPickerActive: false,
  setReactionPickerActive: (v) => set({ reactionPickerActive: v }),
}));

// Helper: set both the plain flag and the reactive store atomically.
export function setReactionPickerActive(v: boolean) {
  gestureState.reactionPickerActive = v;
  useGestureStore.getState().setReactionPickerActive(v);
}
