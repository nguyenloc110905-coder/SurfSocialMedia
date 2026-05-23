import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';
export type LanguageCode = 'vi' | 'en';

export type MobileSettingsPrefs = {
  themeMode: ThemeMode;
  language: LanguageCode;
  feedCache: boolean;
  autoplayClips: boolean;
  reduceDataUsage: boolean;
};

const PREFS_KEY = 'surf_mobile_settings_prefs';

export const DEFAULT_MOBILE_SETTINGS: MobileSettingsPrefs = {
  themeMode: 'system',
  language: 'vi',
  feedCache: true,
  autoplayClips: true,
  reduceDataUsage: false,
};

type SettingsState = {
  prefs: MobileSettingsPrefs;
  hydrated: boolean;
  initialize: () => Promise<void>;
  updatePreference: <K extends keyof MobileSettingsPrefs>(
    key: K,
    value: MobileSettingsPrefs[K]
  ) => Promise<void>;
  resetPreferences: () => Promise<void>;
};

function applyThemeMode(themeMode: ThemeMode) {
  Appearance.setColorScheme(themeMode === 'system' ? null : themeMode);
}

function normalizePrefs(value: unknown): MobileSettingsPrefs {
  if (!value || typeof value !== 'object') return DEFAULT_MOBILE_SETTINGS;

  const input = value as Partial<MobileSettingsPrefs>;
  return {
    ...DEFAULT_MOBILE_SETTINGS,
    themeMode:
      input.themeMode === 'light' || input.themeMode === 'dark' || input.themeMode === 'system'
        ? input.themeMode
        : DEFAULT_MOBILE_SETTINGS.themeMode,
    language:
      input.language === 'vi' || input.language === 'en'
        ? input.language
        : DEFAULT_MOBILE_SETTINGS.language,
    feedCache:
      typeof input.feedCache === 'boolean'
        ? input.feedCache
        : DEFAULT_MOBILE_SETTINGS.feedCache,
    autoplayClips:
      typeof input.autoplayClips === 'boolean'
        ? input.autoplayClips
        : DEFAULT_MOBILE_SETTINGS.autoplayClips,
    reduceDataUsage:
      typeof input.reduceDataUsage === 'boolean'
        ? input.reduceDataUsage
        : DEFAULT_MOBILE_SETTINGS.reduceDataUsage,
  };
}

async function persistPrefs(prefs: MobileSettingsPrefs) {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  prefs: DEFAULT_MOBILE_SETTINGS,
  hydrated: false,

  initialize: async () => {
    try {
      const raw = await AsyncStorage.getItem(PREFS_KEY);
      const prefs = normalizePrefs(raw ? JSON.parse(raw) : null);
      applyThemeMode(prefs.themeMode);
      set({ prefs, hydrated: true });
    } catch (err) {
      console.warn('Failed to initialize mobile settings:', err);
      applyThemeMode(DEFAULT_MOBILE_SETTINGS.themeMode);
      set({ prefs: DEFAULT_MOBILE_SETTINGS, hydrated: true });
    }
  },

  updatePreference: async (key, value) => {
    const prefs = { ...get().prefs, [key]: value };
    set({ prefs });

    if (key === 'themeMode') {
      applyThemeMode(value as ThemeMode);
    }

    try {
      await persistPrefs(prefs);
    } catch (err) {
      console.warn('Failed to save mobile settings:', err);
    }
  },

  resetPreferences: async () => {
    set({ prefs: DEFAULT_MOBILE_SETTINGS });
    applyThemeMode(DEFAULT_MOBILE_SETTINGS.themeMode);

    try {
      await persistPrefs(DEFAULT_MOBILE_SETTINGS);
    } catch (err) {
      console.warn('Failed to reset mobile settings:', err);
    }
  },
}));
