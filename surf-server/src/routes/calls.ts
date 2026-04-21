import { Router } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { AuthRequest, requireAuth } from '../middleware/auth.js';

type CallMode = 'audio' | 'video';
type QualityProfile = 'p480' | 'p720';
type FallbackProvider = 'jitsi' | 'meet' | 'custom';

type LiveKitTokenRequestBody = {
  callId?: string;
  conversationId?: string;
  peerId?: string;
  mode?: CallMode;
  quality?: QualityProfile;
};

type LiveKitTokenResponse = {
  provider: 'livekit' | 'fallback';
  roomName: string;
  fallbackUrl: string;
  reason?: string;
  serverUrl?: string;
  token?: string;
  usagePercent?: number | null;
  usageSource: 'manual' | 'api' | 'unavailable';
  softLimitPercent: number;
  hardLimitPercent: number;
  fallbackRecommended: boolean;
  maxRecommendedFps: number;
};

type UsageSource = LiveKitTokenResponse['usageSource'];

type UsageSnapshot = {
  usagePercent: number | null;
  usageSource: UsageSource;
};

const router = Router();

const parsePercentEnv = (value: string | undefined): number | null => {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return numeric;
};

const parseIntEnv = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.trunc(numeric);
};

const parseNonNegativeIntEnv = (value: string | undefined, fallback: number): number => {
  const parsed = parseIntEnv(value, fallback);
  return parsed < 0 ? 0 : parsed;
};

const asBoolean = (value: string | undefined): boolean =>
  value === '1' || value?.toLowerCase() === 'true';

const normalizeUsageValueType = (value: string | undefined): 'percent' | 'ratio' => {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'ratio' ? 'ratio' : 'percent';
};

const toSafeSegment = (value: string, fallback: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || fallback;
};

const normalizeProvider = (value: string | undefined): FallbackProvider => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'meet') return 'meet';
  if (normalized === 'custom') return 'custom';
  return 'jitsi';
};

const resolvePathValue = (payload: unknown, path: string): unknown => {
  if (!path.trim()) return payload;

  const segments = path
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);

  let current: unknown = payload;

  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    const source = current as Record<string, unknown>;
    current = source[segment];
  }

  return current;
};

const normalizeUsagePercent = (value: unknown, valueType: 'percent' | 'ratio'): number | null => {
  let numeric: number;

  if (typeof value === 'number') {
    numeric = value;
  } else if (typeof value === 'string') {
    numeric = Number(value.trim());
  } else {
    return null;
  }

  if (!Number.isFinite(numeric)) return null;
  if (valueType === 'ratio') {
    numeric *= 100;
  }

  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return numeric;
};

let usageCache: {
  value: number | null;
  source: UsageSource;
  fetchedAtMs: number;
} = {
  value: null,
  source: 'unavailable',
  fetchedAtMs: 0,
};

const fetchUsagePercentFromApi = async (): Promise<number | null> => {
  const url = process.env.LIVEKIT_USAGE_API_URL?.trim();
  if (!url) return null;

  const timeoutMs = parseNonNegativeIntEnv(process.env.LIVEKIT_USAGE_API_TIMEOUT_MS, 3000);
  const usagePath = process.env.LIVEKIT_USAGE_JSON_PATH?.trim() || 'usagePercent';
  const valueType = normalizeUsageValueType(process.env.LIVEKIT_USAGE_VALUE_TYPE);

  const headers = new Headers();
  const apiKey = process.env.LIVEKIT_USAGE_API_KEY?.trim();
  const authMode = process.env.LIVEKIT_USAGE_API_AUTH_MODE?.trim().toLowerCase() || 'bearer';
  const customHeaderName = process.env.LIVEKIT_USAGE_API_HEADER_NAME?.trim();

  if (apiKey) {
    if (authMode === 'x-api-key') {
      headers.set('x-api-key', apiKey);
    } else if (authMode === 'custom-header' && customHeaderName) {
      headers.set(customHeaderName, apiKey);
    } else {
      headers.set('authorization', `Bearer ${apiKey}`);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as unknown;
    const value = resolvePathValue(payload, usagePath);
    return normalizeUsagePercent(value, valueType);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const getUsageSnapshot = async (): Promise<UsageSnapshot> => {
  const manualUsage = parsePercentEnv(process.env.LIVEKIT_USAGE_PERCENT);
  if (manualUsage !== null) {
    usageCache = {
      value: manualUsage,
      source: 'manual',
      fetchedAtMs: Date.now(),
    };

    return {
      usagePercent: manualUsage,
      usageSource: 'manual',
    };
  }

  const apiUrl = process.env.LIVEKIT_USAGE_API_URL?.trim();
  if (!apiUrl) {
    usageCache = {
      value: null,
      source: 'unavailable',
      fetchedAtMs: Date.now(),
    };

    return {
      usagePercent: null,
      usageSource: 'unavailable',
    };
  }

  const cacheMs = parseNonNegativeIntEnv(process.env.LIVEKIT_USAGE_CACHE_MS, 120000);
  const now = Date.now();

  if (usageCache.fetchedAtMs > 0 && now - usageCache.fetchedAtMs <= cacheMs) {
    return {
      usagePercent: usageCache.value,
      usageSource: usageCache.source,
    };
  }

  const usageFromApi = await fetchUsagePercentFromApi();
  usageCache = {
    value: usageFromApi,
    source: usageFromApi === null ? 'unavailable' : 'api',
    fetchedAtMs: now,
  };

  return {
    usagePercent: usageCache.value,
    usageSource: usageCache.source,
  };
};

const buildFallbackUrl = (provider: FallbackProvider, roomName: string): string => {
  if (provider === 'custom') {
    const customBase = process.env.CALL_FALLBACK_CUSTOM_BASE_URL?.trim();
    if (customBase) {
      return `${customBase.replace(/\/$/, '')}/${encodeURIComponent(roomName)}`;
    }
  }

  if (provider === 'meet') {
    const meetBase = process.env.CALL_MEET_BASE_URL?.trim();
    if (meetBase) {
      return `${meetBase.replace(/\/$/, '')}/${encodeURIComponent(roomName)}`;
    }

    // Google Meet does not support deterministic room slugs for personal accounts.
    return 'https://meet.google.com/new';
  }

  const jitsiBase = process.env.CALL_JITSI_BASE_URL?.trim() || 'https://meet.jit.si';
  return `${jitsiBase.replace(/\/$/, '')}/${encodeURIComponent(roomName)}`;
};

/**
 * @swagger
 * /api/calls/livekit-token:
 *   post:
 *     tags: [Calls]
 *     summary: Lấy LiveKit access token để tham gia cuộc gọi
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roomName]
 *             properties:
 *               roomName: { type: string, description: 'Tên phòng LiveKit (thường là conversationId)' }
 *               participantName: { type: string }
 *               isHost: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Token thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 wsUrl: { type: string }
 *                 roomName: { type: string }
 *       400: { description: Thiếu roomName }
 *       503: { description: LiveKit chưa cấu hình }
 */
router.post('/livekit-token', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid;
    if (!uid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = (req.body ?? {}) as LiveKitTokenRequestBody;
    const callId = typeof body.callId === 'string' ? body.callId.trim() : '';
    const conversationId =
      typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
    const peerId = typeof body.peerId === 'string' ? body.peerId.trim() : '';
    const mode = body.mode === 'video' ? 'video' : body.mode === 'audio' ? 'audio' : null;
    const quality = body.quality === 'p720' ? 'p720' : 'p480';

    if (!callId || !conversationId || !peerId || !mode) {
      res.status(400).json({ error: 'Missing callId, conversationId, peerId, or mode' });
      return;
    }

    const roomName = `surf-${toSafeSegment(conversationId, 'conversation')}-${toSafeSegment(
      callId,
      'call'
    )}`;

    const fallbackProvider = normalizeProvider(process.env.CALL_FALLBACK_PROVIDER);
    const fallbackUrl = buildFallbackUrl(fallbackProvider, roomName);

    const softLimitPercent = parseIntEnv(process.env.LIVEKIT_FALLBACK_SOFT_LIMIT_PERCENT, 80);
    const hardLimitPercent = parseIntEnv(process.env.LIVEKIT_FALLBACK_HARD_LIMIT_PERCENT, 90);
    const { usagePercent, usageSource } = await getUsageSnapshot();

    const fallbackRecommended =
      usagePercent !== null && usagePercent >= Math.max(0, softLimitPercent);
    const forceFallback = asBoolean(process.env.LIVEKIT_FORCE_FALLBACK);

    const liveKitUrl = process.env.LIVEKIT_URL?.trim();
    const liveKitApiKey = process.env.LIVEKIT_API_KEY?.trim();
    const liveKitApiSecret = process.env.LIVEKIT_API_SECRET?.trim();

    const missingLiveKitConfig = !liveKitUrl || !liveKitApiKey || !liveKitApiSecret;
    const hitHardLimit = usagePercent !== null && usagePercent >= Math.max(0, hardLimitPercent);

    if (missingLiveKitConfig || forceFallback || hitHardLimit) {
      const payload: LiveKitTokenResponse = {
        provider: 'fallback',
        reason: missingLiveKitConfig
          ? 'livekit_not_configured'
          : forceFallback
            ? 'livekit_forced_fallback'
            : 'livekit_hard_quota_limit',
        roomName,
        fallbackUrl,
        usagePercent,
        usageSource,
        softLimitPercent,
        hardLimitPercent,
        fallbackRecommended,
        maxRecommendedFps: 60,
      };
      res.json(payload);
      return;
    }

    const token = new AccessToken(liveKitApiKey, liveKitApiSecret, {
      identity: uid,
      name: req.headers['x-surf-user-name']?.toString(),
      ttl: process.env.LIVEKIT_TOKEN_TTL || '1h',
      metadata: JSON.stringify({
        mode,
        quality,
        callId,
        peerId,
        conversationId,
      }),
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();

    const payload: LiveKitTokenResponse = {
      provider: 'livekit',
      roomName,
      fallbackUrl,
      serverUrl: liveKitUrl,
      token: jwt,
      usagePercent,
      usageSource,
      softLimitPercent,
      hardLimitPercent,
      fallbackRecommended,
      maxRecommendedFps: 60,
    };

    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Failed to create LiveKit token' });
  }
});

export default router;
