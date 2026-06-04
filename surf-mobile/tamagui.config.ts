import { createTamagui, createTokens } from '@tamagui/core';

const tokens = createTokens({
  color: {
    surfCyan: '#06b6d4',
    surfBlue: '#0ea5e9',
    surfViolet: '#8b5cf6',
    surfInk: '#0b1120',
    surfSurface: '#111827',
    white: '#ffffff',
    black: '#000000',
  },
  radius: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    true: 12,
  },
  size: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 32,
    8: 40,
    9: 48,
    true: 16,
  },
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 32,
    8: 40,
    true: 16,
  },
  zIndex: {
    0: 0,
    1: 10,
    2: 100,
    3: 1000,
    true: 10,
  },
});

export const tamaguiConfig = createTamagui({
  tokens,
  shorthands: {
    bg: 'backgroundColor',
    br: 'borderRadius',
    bw: 'borderWidth',
    px: 'paddingHorizontal',
    py: 'paddingVertical',
    mx: 'marginHorizontal',
    my: 'marginVertical',
  },
  themes: {
    light_surf: {
      background: '#f3f7fb',
      color: '#0f172a',
      borderColor: '#dbe7f3',
      accentBackground: '#e0f2fe',
      accentColor: '#0284c7',
    },
    dark_surf: {
      background: '#0b1120',
      color: '#f8fafc',
      borderColor: '#243044',
      accentBackground: '#082f49',
      accentColor: '#38bdf8',
    },
  },
});

export default tamaguiConfig;

export type TamaguiAppConfig = typeof tamaguiConfig;

declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends TamaguiAppConfig {}
}
