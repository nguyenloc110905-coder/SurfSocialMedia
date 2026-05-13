import { create } from 'zustand';

type SidebarStore = {
  isOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
};

export const useSidebarStore = create<SidebarStore>((set) => ({
  isOpen: false,

  openSidebar: () => {
    console.log('📂 Opening sidebar');
    set({ isOpen: true });
  },

  closeSidebar: () => {
    console.log('📂 Closing sidebar');
    set({ isOpen: false });
  },

  toggleSidebar: () => {
    set((state) => {
      console.log(`📂 Toggling sidebar: ${state.isOpen} → ${!state.isOpen}`);
      return { isOpen: !state.isOpen };
    });
  },
}));
