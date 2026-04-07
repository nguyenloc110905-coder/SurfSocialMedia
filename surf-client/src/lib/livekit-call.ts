import { api } from '@/lib/api';

export type CallMode = 'audio' | 'video';
export type VideoProfile = 'p480' | 'p720';

type CallProvider = 'livekit' | 'webrtc';

export type LiveKitTokenResponse = {
  provider: 'livekit' | 'fallback';
  roomName: string;
  fallbackUrl?: string;
  reason?: string;
  serverUrl?: string;
  token?: string;
  usagePercent?: number | null;
  usageSource?: 'manual' | 'api' | 'unavailable';
  softLimitPercent?: number;
  hardLimitPercent?: number;
  fallbackRecommended?: boolean;
  maxRecommendedFps?: number;
};

type FetchLiveKitTokenInput = {
  callId: string;
  conversationId: string;
  peerId: string;
  mode: CallMode;
  quality: VideoProfile;
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
};

const normalizeProvider = (value: string | undefined): CallProvider => {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'webrtc' ? 'webrtc' : 'livekit';
};

const normalizeProfile = (value: string | undefined): VideoProfile => {
  const normalized = value?.trim().toLowerCase();
  return normalized === '720p' ? 'p720' : 'p480';
};

const normalizeFallbackBase = (value: string | undefined): string => {
  const base = value?.trim();
  if (!base) return 'https://meet.jit.si';
  return base.replace(/\/$/, '');
};

const requestedFps = Math.trunc(parseNumber(import.meta.env.VITE_CALL_VIDEO_FPS, 30));
export const maxCameraFps = 60;
export const minCameraFps = 30;

export const callProvider = normalizeProvider(import.meta.env.VITE_CALL_PROVIDER);
export const useLiveKitProvider = callProvider === 'livekit';

export const defaultVideoProfile = normalizeProfile(import.meta.env.VITE_CALL_VIDEO_PROFILE);
export const targetVideoFps = Math.min(Math.max(requestedFps, minCameraFps), maxCameraFps);
export const isVideoFpsClamped = targetVideoFps !== requestedFps;

export const normalizeVideoProfile = (value: string | undefined): VideoProfile =>
  normalizeProfile(value);

export const getVideoSpec = (profile: VideoProfile, fps: number) => {
  if (profile === 'p720') {
    return {
      resolution: {
        width: 1280,
        height: 720,
      },
      encoding: {
        maxBitrate: 1_900_000,
        maxFramerate: fps,
      },
    };
  }

  return {
    resolution: {
      width: 854,
      height: 480,
    },
    encoding: {
      maxBitrate: 1_200_000,
      maxFramerate: fps,
    },
  };
};

export const buildDeterministicFallbackUrl = (conversationId: string, callId: string): string => {
  const base = normalizeFallbackBase(import.meta.env.VITE_CALL_FALLBACK_BASE_URL);
  const safeConversation = conversationId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const safeCall = callId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const roomName = `surf-${safeConversation || 'conversation'}-${safeCall || 'call'}`;
  return `${base}/${encodeURIComponent(roomName)}`;
};

export const fetchLiveKitToken = (payload: FetchLiveKitTokenInput) =>
  api.post<LiveKitTokenResponse>('/api/calls/livekit-token', payload);
