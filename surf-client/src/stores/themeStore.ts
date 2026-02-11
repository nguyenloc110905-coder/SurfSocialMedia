import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
/** @deprecated Use ThemeMode */
export type Theme = ThemeMode;

interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  applyTheme: () => void;
}

function applyThemeToDocument(mode: ThemeMode) {
  const root = document.documentElement;
  let isDark = false;
  if (mode === 'dark') isDark = true;
  else if (mode === 'system' && typeof window !== 'undefined')
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (isDark) root.classList.add('dark');
  else root.classList.remove('dark');
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (theme) => {
        set({ theme });
        applyThemeToDocument(theme);
      },
      applyTheme: () => {
        applyThemeToDocument(get().theme);
      },
    }),
    { name: 'surf-theme', skipHydration: true }
  )
);
