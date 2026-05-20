import { Router } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase-admin.js';
import { getRedis } from '../config/redis.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { getIo } from '../realtime/io.js';
import { liveStreamRoom, userRoom } from '../realtime/rooms.js';
import {
  getCachedLiveStream,
  getCachedLiveStreamList,
  invalidateLiveStreamCache,
  setCachedLiveStream,
  setCachedLiveStreamList,
} from '../services/live-cache.js';

type LiveStreamStatus = 'live' | 'ended';

type LiveStreamDoc = {
  id: string;
  hostId: string;
  hostName: string;
  hostPhotoURL: string | null;
  title: string;
  status: LiveStreamStatus;
  provider: 'daily';
  transport: 'daily' | 'socket-webrtc';
  providerRoomName: string | null;
  providerRoomUrl: string | null;
  viewerCount: number;
  reactionCounts: Record<string, number>;
  startedAt: Date;
  endedAt?: Date | null;
};

type DailyRoomResponse = {
  name?: string;
  url?: string;
};

type TwitchTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type TwitchHelixStream = {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tag_ids?: string[];
  tags?: string[];
  is_mature?: boolean;
};

type ExternalLivePlatform = 'twitch' | 'youtube';

type ExternalLiveStreamItem = {
  id: string;
  platform: ExternalLivePlatform;
  platformName: string;
  userId: string;
  userLogin: string;
  userName: string;
  gameId: string;
  gameName: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  language: string;
  thumbnailUrl: string;
  tags: string[];
  isMature: boolean;
  twitchUrl: string;
  watchUrl: string;
  embedUrl: string | null;
  chatEmbedUrl: string | null;
};

type TwitchStreamItem = ExternalLiveStreamItem;

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    title?: string;
    publishedAt?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
};

type YouTubeVideoItem = {
  id?: string;
  liveStreamingDetails?: {
    actualStartTime?: string;
    concurrentViewers?: string;
  };
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    title?: string;
    categoryId?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url?: string }>;
    tags?: string[];
  };
};

type YouTubeDiscoveryQuery = {
  query: string;
  categoryId?: string;
};

const router = Router();
const db = () => getDb();

const allowedReactions = new Set(['❤️', '🔥', '👏', '😂', '😮', '👍']);
const TWITCH_STREAM_CACHE_KEY = 'surf:live:twitch:streams:v1';
const TWITCH_TOKEN_CACHE_KEY = 'surf:live:twitch:app-token:v1';
const YOUTUBE_LIVE_CACHE_KEY = 'surf:live:youtube:streams:v1';
const TWITCH_STREAM_CACHE_TTL_SECONDS = Math.max(
  Number(process.env.TWITCH_STREAM_CACHE_TTL_SECONDS) || 120,
  30
);
const YOUTUBE_LIVE_CACHE_TTL_SECONDS = Math.max(
  Number(process.env.YOUTUBE_LIVE_CACHE_TTL_SECONDS) || 3600,
  120
);
const YOUTUBE_LIVE_STALE_CACHE_TTL_SECONDS = Math.max(
  Number(process.env.YOUTUBE_LIVE_STALE_CACHE_TTL_SECONDS) || 6 * 60 * 60,
  YOUTUBE_LIVE_CACHE_TTL_SECONDS
);
const TWITCH_DEFAULT_LIMIT = 20;
const YOUTUBE_DEFAULT_LIMIT = 12;
const YOUTUBE_DEFAULT_DISCOVERY_QUERIES: YouTubeDiscoveryQuery[] = [
  { categoryId: '20', query: 'esports gaming' },
  { categoryId: '10', query: 'lofi music live' },
  { categoryId: '24', query: 'vtuber live' },
];
const YOUTUBE_DEFAULT_BLOCKED_KEYWORDS = [
  'aarti',
  'bhajan',
  'bollywood',
  'breaking news',
  'church',
  'cricket',
  'gurbani',
  'hindi',
  'ipl',
  'kerala',
  'kirtan',
  'live match',
  'pakistan',
  'prayer',
  'punjabi',
  'vaishno',
  'worship',
  'free robux',
  'giveaway',
  'casino',
];
const YOUTUBE_DEFAULT_PREFERRED_KEYWORDS = [
  'am nhac',
  'dota',
  'esports',
  'giai tri',
  'game',
  'gaming',
  'lien quan',
  'lofi',
  'music',
  'nhac',
  'valorant',
  'vtuber',
];
const YOUTUBE_INDIC_SCRIPT_PATTERN =
  /[\u0900-\u097f\u0980-\u09ff\u0a00-\u0a7f\u0a80-\u0aff\u0b00-\u0b7f\u0b80-\u0bff\u0c00-\u0c7f\u0c80-\u0cff\u0d00-\u0d7f]/;
const YOUTUBE_CATEGORY_NAMES: Record<string, string> = {
  '10': 'Âm nhạc',
  '20': 'Gaming',
  '22': 'IRL',
  '24': 'Giải trí',
};

let twitchTokenMemoryCache: { token: string; expiresAt: number } | null = null;
let twitchStreamsMemoryCache: { key: string; items: TwitchStreamItem[]; expiresAt: number } | null =
  null;
let youtubeLiveStreamsMemoryCache: {
  key: string;
  items: ExternalLiveStreamItem[];
  expiresAt: number;
} | null = null;
const youtubeLiveStreamsInflight = new Map<string, Promise<ExternalSourceResult>>();

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const toSafeRoomName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const mapLiveStream = (id: string, data: Record<string, unknown>): LiveStreamDoc => ({
  id,
  hostId: (data.hostId as string) ?? '',
  hostName: (data.hostName as string) ?? 'Surf user',
  hostPhotoURL: (data.hostPhotoURL as string | null | undefined) ?? null,
  title: (data.title as string) ?? 'Surf Live',
  status: data.status === 'ended' ? 'ended' : 'live',
  provider: 'daily',
  transport: data.transport === 'daily' ? 'daily' : 'socket-webrtc',
  providerRoomName: (data.providerRoomName as string | null | undefined) ?? null,
  providerRoomUrl: (data.providerRoomUrl as string | null | undefined) ?? null,
  viewerCount: typeof data.viewerCount === 'number' ? data.viewerCount : 0,
  reactionCounts:
    data.reactionCounts && typeof data.reactionCounts === 'object'
      ? (data.reactionCounts as Record<string, number>)
      : {},
  startedAt: toDate(data.startedAt) ?? new Date(),
  endedAt: toDate(data.endedAt),
});

const toApiLiveStream = (stream: LiveStreamDoc) => ({
  ...stream,
  startedAt: stream.startedAt.toISOString(),
  endedAt: stream.endedAt ? stream.endedAt.toISOString() : null,
});

type ApiLiveStream = ReturnType<typeof toApiLiveStream>;

const redisReady = () => {
  const redis = getRedis();
  return redis?.isOpen ? redis : null;
};

const normalizeForMatch = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const splitEnvList = (value: string | undefined, fallback: string[]): string[] => {
  const items = String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
};

const parseYouTubeDiscoveryQueries = (value: string | undefined): YouTubeDiscoveryQuery[] => {
  const entries = String(value ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
  const parsed = entries
    .map((entry) => {
      const separatorIndex = entry.indexOf(':');
      if (separatorIndex > 0) {
        const categoryId = entry.slice(0, separatorIndex).trim();
        const query = entry.slice(separatorIndex + 1).trim();
        if (/^\d+$/.test(categoryId) && query) return { categoryId, query };
      }
      return { query: entry };
    })
    .filter((entry) => entry.query);

  return parsed.length > 0 ? parsed : YOUTUBE_DEFAULT_DISCOVERY_QUERIES;
};

const getYouTubeLiveText = (item: ExternalLiveStreamItem): string =>
  [item.title, item.userName, item.gameName, item.tags.join(' ')].join(' ');

const isYouTubeLiveBlocked = (item: ExternalLiveStreamItem, blockedKeywords: string[]) => {
  const original = getYouTubeLiveText(item);
  if (YOUTUBE_INDIC_SCRIPT_PATTERN.test(original)) return true;
  const normalized = normalizeForMatch(original);
  return blockedKeywords.some((keyword) => normalized.includes(keyword));
};

const scoreYouTubeLiveItem = (
  item: ExternalLiveStreamItem,
  preferredKeywords: string[]
): number => {
  const normalized = normalizeForMatch(getYouTubeLiveText(item));
  const preferenceBoost = preferredKeywords.reduce(
    (score, keyword) => score + (normalized.includes(keyword) ? 5000 : 0),
    0
  );
  return item.viewerCount + preferenceBoost;
};

const mapTwitchStream = (item: TwitchHelixStream): TwitchStreamItem => ({
  id: item.id,
  platform: 'twitch',
  platformName: 'Twitch',
  userId: item.user_id,
  userLogin: item.user_login,
  userName: item.user_name,
  gameId: item.game_id,
  gameName: item.game_name || 'Twitch',
  title: item.title || `${item.user_name} đang live`,
  viewerCount: item.viewer_count || 0,
  startedAt: item.started_at,
  language: item.language,
  thumbnailUrl: item.thumbnail_url
    ? item.thumbnail_url.replace('{width}', '960').replace('{height}', '540')
    : '',
  tags: Array.isArray(item.tags) ? item.tags.slice(0, 6) : [],
  isMature: Boolean(item.is_mature),
  twitchUrl: `https://www.twitch.tv/${item.user_login}`,
  watchUrl: `https://www.twitch.tv/${item.user_login}`,
  embedUrl: null,
  chatEmbedUrl: null,
});

const getYouTubeThumbnail = (
  searchItem?: YouTubeSearchItem,
  videoItem?: YouTubeVideoItem
): string => {
  const thumbnails = videoItem?.snippet?.thumbnails ?? searchItem?.snippet?.thumbnails ?? {};
  return (
    thumbnails.maxres?.url ??
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url ??
    ''
  );
};

const mapYouTubeLiveStream = (
  searchItem: YouTubeSearchItem,
  videoItem?: YouTubeVideoItem
): ExternalLiveStreamItem | null => {
  const videoId = videoItem?.id ?? searchItem.id?.videoId;
  if (!videoId) return null;

  const videoSnippet = videoItem?.snippet;
  const searchSnippet = searchItem.snippet;
  const channelId = videoSnippet?.channelId ?? searchSnippet?.channelId ?? '';
  const channelTitle = videoSnippet?.channelTitle ?? searchSnippet?.channelTitle ?? 'YouTube Live';
  const title = videoSnippet?.title ?? searchSnippet?.title ?? `${channelTitle} đang live`;
  const viewerCount = Number(videoItem?.liveStreamingDetails?.concurrentViewers ?? 0) || 0;
  const startedAt =
    videoItem?.liveStreamingDetails?.actualStartTime ??
    searchItem.snippet?.publishedAt ??
    new Date().toISOString();

  return {
    id: videoId,
    platform: 'youtube',
    platformName: 'YouTube',
    userId: channelId,
    userLogin: videoId,
    userName: channelTitle,
    gameId: videoSnippet?.categoryId ?? '',
    gameName: YOUTUBE_CATEGORY_NAMES[videoSnippet?.categoryId ?? ''] ?? 'YouTube Live',
    title,
    viewerCount,
    startedAt,
    language: '',
    thumbnailUrl: getYouTubeThumbnail(searchItem, videoItem),
    tags: Array.isArray(videoSnippet?.tags) ? videoSnippet.tags.slice(0, 6) : ['YouTube', 'Live'],
    isMature: false,
    twitchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=0&playsinline=1`,
    chatEmbedUrl: `https://www.youtube.com/live_chat?v=${videoId}`,
  };
};

const getTwitchAppToken = async (): Promise<string | null> => {
  const now = Date.now();
  if (twitchTokenMemoryCache && twitchTokenMemoryCache.expiresAt > now) {
    return twitchTokenMemoryCache.token;
  }

  const redis = redisReady();
  if (redis) {
    const cached = await redis.get(TWITCH_TOKEN_CACHE_KEY);
    if (cached) {
      twitchTokenMemoryCache = { token: cached, expiresAt: now + 5 * 60 * 1000 };
      return cached;
    }
  }

  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const tokenUrl = new URL('https://id.twitch.tv/oauth2/token');
  tokenUrl.searchParams.set('client_id', clientId);
  tokenUrl.searchParams.set('client_secret', clientSecret);
  tokenUrl.searchParams.set('grant_type', 'client_credentials');

  const response = await fetch(tokenUrl, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Twitch token request failed: ${response.status}`);
  }

  const data = (await response.json()) as TwitchTokenResponse;
  if (!data.access_token) throw new Error('Twitch token response missing access_token');

  const ttlSeconds = Math.max((data.expires_in ?? 3600) - 60, 60);
  twitchTokenMemoryCache = {
    token: data.access_token,
    expiresAt: now + ttlSeconds * 1000,
  };
  await redis?.set(TWITCH_TOKEN_CACHE_KEY, data.access_token, { EX: ttlSeconds });
  return data.access_token;
};

const getCachedTwitchStreams = async (key: string): Promise<TwitchStreamItem[] | null> => {
  const now = Date.now();
  if (twitchStreamsMemoryCache?.key === key && twitchStreamsMemoryCache.expiresAt > now) {
    return twitchStreamsMemoryCache.items;
  }

  const redis = redisReady();
  if (!redis) return null;
  const cached = await redis.get(key);
  if (!cached) return null;

  try {
    const items = JSON.parse(cached) as TwitchStreamItem[];
    twitchStreamsMemoryCache = {
      key,
      items,
      expiresAt: now + TWITCH_STREAM_CACHE_TTL_SECONDS * 1000,
    };
    return items;
  } catch {
    await redis.del(key);
    return null;
  }
};

const setCachedTwitchStreams = async (key: string, items: TwitchStreamItem[]) => {
  twitchStreamsMemoryCache = {
    key,
    items,
    expiresAt: Date.now() + TWITCH_STREAM_CACHE_TTL_SECONDS * 1000,
  };
  await redisReady()?.set(key, JSON.stringify(items), { EX: TWITCH_STREAM_CACHE_TTL_SECONDS });
};

const staleYouTubeCacheKey = (key: string) => `${key}:stale`;

const getCachedYouTubeLiveStreams = async (
  key: string
): Promise<ExternalLiveStreamItem[] | null> => {
  const now = Date.now();
  if (youtubeLiveStreamsMemoryCache?.key === key && youtubeLiveStreamsMemoryCache.expiresAt > now) {
    return youtubeLiveStreamsMemoryCache.items;
  }

  const redis = redisReady();
  if (!redis) return null;
  const cached = await redis.get(key);
  if (!cached) return null;

  try {
    const items = JSON.parse(cached) as ExternalLiveStreamItem[];
    youtubeLiveStreamsMemoryCache = {
      key,
      items,
      expiresAt: now + YOUTUBE_LIVE_CACHE_TTL_SECONDS * 1000,
    };
    return items;
  } catch {
    await redis.del(key);
    return null;
  }
};

const getStaleYouTubeLiveStreams = async (
  key: string
): Promise<ExternalLiveStreamItem[] | null> => {
  if (youtubeLiveStreamsMemoryCache?.key === key) {
    return youtubeLiveStreamsMemoryCache.items;
  }

  const redis = redisReady();
  if (!redis) return null;
  const cached = await redis.get(staleYouTubeCacheKey(key));
  if (!cached) return null;

  try {
    const items = JSON.parse(cached) as ExternalLiveStreamItem[];
    youtubeLiveStreamsMemoryCache = {
      key,
      items,
      expiresAt: Date.now() + YOUTUBE_LIVE_CACHE_TTL_SECONDS * 1000,
    };
    return items;
  } catch {
    await redis.del(staleYouTubeCacheKey(key));
    return null;
  }
};

const setCachedYouTubeLiveStreams = async (key: string, items: ExternalLiveStreamItem[]) => {
  youtubeLiveStreamsMemoryCache = {
    key,
    items,
    expiresAt: Date.now() + YOUTUBE_LIVE_CACHE_TTL_SECONDS * 1000,
  };
  const redis = redisReady();
  if (!redis) return;
  const serialized = JSON.stringify(items);
  await redis.set(key, serialized, { EX: YOUTUBE_LIVE_CACHE_TTL_SECONDS });
  await redis.set(staleYouTubeCacheKey(key), serialized, {
    EX: YOUTUBE_LIVE_STALE_CACHE_TTL_SECONDS,
  });
};

type ExternalSourceResult = {
  items: ExternalLiveStreamItem[];
  source: 'twitch' | 'youtube' | 'cache' | 'stale-cache' | 'unconfigured' | 'error';
  configured: boolean;
  message?: string;
  error?: string;
};

const getTwitchStreams = async (input: {
  limit: number;
  language?: string;
  gameId?: string;
  userLogins?: string[];
}): Promise<ExternalSourceResult> => {
  const language = input.language?.trim() ?? '';
  const gameId = input.gameId?.trim() ?? '';
  const configuredUsers = (input.userLogins ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
  const cacheKey = [
    TWITCH_STREAM_CACHE_KEY,
    `limit:${input.limit}`,
    `lang:${language || 'any'}`,
    `game:${gameId || 'any'}`,
    `users:${configuredUsers.join(',') || 'top'}`,
  ].join(':');

  const cached = await getCachedTwitchStreams(cacheKey);
  if (cached) {
    return {
      items: cached,
      source: 'cache',
      configured: Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET),
    };
  }

  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const token = await getTwitchAppToken();
  if (!clientId || !token) {
    return {
      items: [],
      source: 'unconfigured',
      configured: false,
      message:
        'Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to load currently live Twitch streams.',
    };
  }

  const url = new URL('https://api.twitch.tv/helix/streams');
  url.searchParams.set('first', String(input.limit));
  if (language) url.searchParams.set('language', language);
  if (gameId) url.searchParams.set('game_id', gameId);
  configuredUsers.forEach((login) => url.searchParams.append('user_login', login));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': clientId,
    },
  });

  if (!response.ok) {
    throw new Error(`Twitch streams request failed: ${response.status}`);
  }

  const data = (await response.json()) as { data?: TwitchHelixStream[] };
  const items = (data.data ?? []).map(mapTwitchStream);
  await setCachedTwitchStreams(cacheKey, items);
  return { items, source: 'twitch', configured: true };
};

const getYouTubeLiveStreams = async (input: {
  limit: number;
  regionCode?: string;
  query?: string;
  relevanceLanguage?: string;
}): Promise<ExternalSourceResult> => {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const regionCode = input.regionCode?.trim() ?? process.env.YOUTUBE_LIVE_REGION_CODE?.trim() ?? '';
  const query = input.query?.trim() ?? process.env.YOUTUBE_LIVE_QUERY?.trim() ?? '';
  const relevanceLanguage =
    input.relevanceLanguage?.trim() ?? process.env.YOUTUBE_LIVE_RELEVANCE_LANGUAGE?.trim() ?? 'vi';
  const maxSearchQueries = Math.min(
    Math.max(Number(process.env.YOUTUBE_LIVE_MAX_SEARCH_QUERIES) || 3, 1),
    5
  );
  const discoveryQueries = (
    query ? [{ query }] : parseYouTubeDiscoveryQueries(process.env.YOUTUBE_LIVE_DISCOVERY_QUERIES)
  ).slice(0, maxSearchQueries);
  const blockedKeywords = splitEnvList(
    process.env.YOUTUBE_LIVE_BLOCKED_KEYWORDS,
    YOUTUBE_DEFAULT_BLOCKED_KEYWORDS
  ).map(normalizeForMatch);
  const preferredKeywords = splitEnvList(
    process.env.YOUTUBE_LIVE_PREFERRED_KEYWORDS,
    YOUTUBE_DEFAULT_PREFERRED_KEYWORDS
  ).map(normalizeForMatch);
  const cacheKey = [
    YOUTUBE_LIVE_CACHE_KEY,
    `limit:${input.limit}`,
    `region:${regionCode || 'any'}`,
    `language:${relevanceLanguage || 'any'}`,
    `queries:${discoveryQueries
      .map((item) => `${item.categoryId ?? 'any'}=${item.query}`)
      .join('|')}`,
    `blocked:${blockedKeywords.join(',')}`,
  ].join(':');

  const cached = await getCachedYouTubeLiveStreams(cacheKey);
  if (cached) {
    return {
      items: cached,
      source: 'cache',
      configured: Boolean(apiKey),
    };
  }

  if (!apiKey) {
    return {
      items: [],
      source: 'unconfigured',
      configured: false,
      message: 'Set YOUTUBE_API_KEY to load currently live YouTube streams.',
    };
  }

  const inflight = youtubeLiveStreamsInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async (): Promise<ExternalSourceResult> => {
    try {
      const searchLimit = Math.min(Math.max(input.limit * 2, 15), 25);
      const searchResults = await Promise.all(
        discoveryQueries.map(async (discoveryQuery) => {
          const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
          searchUrl.searchParams.set('part', 'snippet');
          searchUrl.searchParams.set('eventType', 'live');
          searchUrl.searchParams.set('type', 'video');
          searchUrl.searchParams.set('order', 'viewCount');
          searchUrl.searchParams.set('maxResults', String(searchLimit));
          searchUrl.searchParams.set('key', apiKey);
          if (regionCode) searchUrl.searchParams.set('regionCode', regionCode);
          if (relevanceLanguage) searchUrl.searchParams.set('relevanceLanguage', relevanceLanguage);
          if (discoveryQuery.categoryId) {
            searchUrl.searchParams.set('videoCategoryId', discoveryQuery.categoryId);
          }
          if (discoveryQuery.query) searchUrl.searchParams.set('q', discoveryQuery.query);

          const searchResponse = await fetch(searchUrl);
          if (!searchResponse.ok) {
            throw new Error(`YouTube live search request failed: ${searchResponse.status}`);
          }

          const searchData = (await searchResponse.json()) as { items?: YouTubeSearchItem[] };
          return searchData.items ?? [];
        })
      );
      const searchItemsById = new Map<string, YouTubeSearchItem>();
      searchResults
        .flat()
        .filter((item) => Boolean(item.id?.videoId))
        .forEach((item) => {
          const videoId = item.id?.videoId;
          if (videoId && !searchItemsById.has(videoId)) searchItemsById.set(videoId, item);
        });
      const searchItems = [...searchItemsById.values()];
      const ids = searchItems.map((item) => item.id!.videoId!).slice(0, 50);
      if (ids.length === 0) {
        await setCachedYouTubeLiveStreams(cacheKey, []);
        return { items: [], source: 'youtube', configured: true };
      }

      const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      videosUrl.searchParams.set('part', 'snippet,liveStreamingDetails');
      videosUrl.searchParams.set('id', ids.join(','));
      videosUrl.searchParams.set('key', apiKey);

      const videosResponse = await fetch(videosUrl);
      if (!videosResponse.ok) {
        throw new Error(`YouTube video details request failed: ${videosResponse.status}`);
      }

      const videosData = (await videosResponse.json()) as { items?: YouTubeVideoItem[] };
      const videosById = new Map((videosData.items ?? []).map((item) => [item.id ?? '', item]));
      const items = searchItems
        .map((item) => mapYouTubeLiveStream(item, videosById.get(item.id?.videoId ?? '')))
        .filter((item): item is ExternalLiveStreamItem => Boolean(item))
        .filter((item) => item.startedAt && item.title)
        .filter((item) => !isYouTubeLiveBlocked(item, blockedKeywords))
        .sort(
          (a, b) =>
            scoreYouTubeLiveItem(b, preferredKeywords) - scoreYouTubeLiveItem(a, preferredKeywords)
        )
        .slice(0, input.limit);

      await setCachedYouTubeLiveStreams(cacheKey, items);
      return { items, source: 'youtube', configured: true };
    } catch (error) {
      const staleItems = await getStaleYouTubeLiveStreams(cacheKey);
      if (staleItems) {
        return {
          items: staleItems,
          source: 'stale-cache',
          configured: true,
          message: `YouTube refresh failed; showing saved live streams. ${(error as Error).message}`,
        };
      }
      throw error;
    }
  })().finally(() => {
    youtubeLiveStreamsInflight.delete(cacheKey);
  });

  youtubeLiveStreamsInflight.set(cacheKey, request);
  return request;
};

const getFriendIds = async (uid: string): Promise<string[]> => {
  const doc = await db().collection('friends').doc(uid).get();
  const value = doc.exists ? doc.data()?.friendIds : undefined;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
};

const maybeCreateDailyRoom = async (
  roomName: string
): Promise<{
  transport: 'daily' | 'socket-webrtc';
  roomName: string | null;
  roomUrl: string | null;
}> => {
  const apiKey = process.env.DAILY_API_KEY?.trim();
  if (!apiKey) {
    return { transport: 'socket-webrtc', roomName: null, roomUrl: null };
  }

  const response = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: roomName,
      privacy: 'private',
      properties: {
        enable_chat: false,
        enable_knocking: false,
        exp: Math.floor(Date.now() / 1000) + 6 * 60 * 60,
      },
    }),
  });

  if (!response.ok) {
    return { transport: 'socket-webrtc', roomName: null, roomUrl: null };
  }

  const data = (await response.json()) as DailyRoomResponse;
  if (!data.name || !data.url) {
    return { transport: 'socket-webrtc', roomName: null, roomUrl: null };
  }

  return { transport: 'daily', roomName: data.name, roomUrl: data.url };
};

const parseLimit = (value: unknown, fallback: number, max: number): number =>
  Math.min(Math.max(Number(value) || fallback, 1), max);

const parseCsvList = (value: unknown): string[] =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

router.get('/', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const cached = await getCachedLiveStreamList<ApiLiveStream>();
    if (cached) {
      res.json({ items: cached, cache: 'hit' });
      return;
    }

    const snap = await db().collection('live_streams').where('status', '==', 'live').get();
    const items = snap.docs
      .map((doc) => toApiLiveStream(mapLiveStream(doc.id, doc.data())))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    await setCachedLiveStreamList(items);
    await Promise.all(items.map((item) => setCachedLiveStream(item.id, item)));

    res.json({ items, cache: 'miss' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/external', requireAuth, async (req: AuthRequest, res) => {
  const limit = parseLimit(req.query.limit, 30, 60);
  const twitchLimit = parseLimit(
    req.query.twitchLimit,
    Number(process.env.TWITCH_STREAM_LIMIT) || TWITCH_DEFAULT_LIMIT,
    30
  );
  const youtubeLimit = parseLimit(
    req.query.youtubeLimit,
    Number(process.env.YOUTUBE_LIVE_LIMIT) || YOUTUBE_DEFAULT_LIMIT,
    25
  );
  const requestedUsers = parseCsvList(req.query.userLogin)
    .map((item) => item.toLowerCase())
    .slice(0, 20);
  const configuredUsers = (
    requestedUsers.length
      ? requestedUsers
      : parseCsvList(process.env.TWITCH_STREAM_USER_LOGINS).map((item) => item.toLowerCase())
  ).slice(0, 20);

  const sourcePromises: Promise<{
    platform: ExternalLivePlatform;
    platformName: string;
    result: ExternalSourceResult;
  }>[] = [
    getTwitchStreams({
      limit: twitchLimit,
      language: String(req.query.language ?? process.env.TWITCH_STREAM_LANGUAGE ?? ''),
      gameId: String(req.query.gameId ?? process.env.TWITCH_STREAM_GAME_ID ?? ''),
      userLogins: configuredUsers,
    }).then((result) => ({ platform: 'twitch', platformName: 'Twitch', result })),
    getYouTubeLiveStreams({
      limit: youtubeLimit,
      regionCode: String(req.query.regionCode ?? process.env.YOUTUBE_LIVE_REGION_CODE ?? ''),
      query: String(req.query.q ?? process.env.YOUTUBE_LIVE_QUERY ?? ''),
      relevanceLanguage: String(
        req.query.relevanceLanguage ?? process.env.YOUTUBE_LIVE_RELEVANCE_LANGUAGE ?? ''
      ),
    }).then((result) => ({ platform: 'youtube', platformName: 'YouTube', result })),
  ];

  const settled = await Promise.allSettled(sourcePromises);
  const items: ExternalLiveStreamItem[] = [];
  const sources = settled.map((entry, index) => {
    const platform: ExternalLivePlatform = index === 0 ? 'twitch' : 'youtube';
    const platformName = platform === 'twitch' ? 'Twitch' : 'YouTube';

    if (entry.status === 'rejected') {
      return {
        platform,
        platformName,
        source: 'error',
        configured:
          platform === 'twitch'
            ? Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET)
            : Boolean(process.env.YOUTUBE_API_KEY),
        count: 0,
        error: (entry.reason as Error).message,
      };
    }

    items.push(...entry.value.result.items);
    return {
      platform: entry.value.platform,
      platformName: entry.value.platformName,
      source: entry.value.result.source,
      configured: entry.value.result.configured,
      count: entry.value.result.items.length,
      message: entry.value.result.message,
      error: entry.value.result.error,
    };
  });

  items.sort((a, b) => {
    const viewerDiff = b.viewerCount - a.viewerCount;
    if (viewerDiff !== 0) return viewerDiff;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  res.json({ items: items.slice(0, limit), sources });
});

router.get('/twitch', requireAuth, async (req: AuthRequest, res) => {
  const requestedUsers = parseCsvList(req.query.userLogin)
    .map((item) => item.toLowerCase())
    .slice(0, 20);
  const configuredUsers = (
    requestedUsers.length
      ? requestedUsers
      : parseCsvList(process.env.TWITCH_STREAM_USER_LOGINS).map((item) => item.toLowerCase())
  ).slice(0, 20);

  try {
    const result = await getTwitchStreams({
      limit: parseLimit(
        req.query.limit,
        Number(process.env.TWITCH_STREAM_LIMIT) || TWITCH_DEFAULT_LIMIT,
        30
      ),
      language: String(req.query.language ?? process.env.TWITCH_STREAM_LANGUAGE ?? ''),
      gameId: String(req.query.gameId ?? process.env.TWITCH_STREAM_GAME_ID ?? ''),
      userLogins: configuredUsers,
    });
    res.json(result);
  } catch (error) {
    res.json({
      items: [],
      source: 'error',
      configured: Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET),
      error: (error as Error).message,
    });
  }
});

router.get('/youtube', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await getYouTubeLiveStreams({
      limit: parseLimit(
        req.query.limit,
        Number(process.env.YOUTUBE_LIVE_LIMIT) || YOUTUBE_DEFAULT_LIMIT,
        25
      ),
      regionCode: String(req.query.regionCode ?? process.env.YOUTUBE_LIVE_REGION_CODE ?? ''),
      query: String(req.query.q ?? process.env.YOUTUBE_LIVE_QUERY ?? ''),
      relevanceLanguage: String(
        req.query.relevanceLanguage ?? process.env.YOUTUBE_LIVE_RELEVANCE_LANGUAGE ?? ''
      ),
    });
    res.json(result);
  } catch (error) {
    res.json({
      items: [],
      source: 'error',
      configured: Boolean(process.env.YOUTUBE_API_KEY),
      error: (error as Error).message,
    });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const cached = await getCachedLiveStream<ApiLiveStream>(req.params.id);
    if (cached) {
      res.json({ item: cached, cache: 'hit' });
      return;
    }

    const doc = await db().collection('live_streams').doc(req.params.id).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Live stream not found' });
      return;
    }

    const item = toApiLiveStream(mapLiveStream(doc.id, doc.data() ?? {}));
    await setCachedLiveStream(item.id, item);

    res.json({ item, cache: 'miss' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const hostId = req.uid!;
    const body = (req.body ?? {}) as { title?: string };
    const title = body.title?.trim().slice(0, 120) || 'Surf Live';
    const hostDoc = await db().collection('users').doc(hostId).get();
    const hostData = hostDoc.data() ?? {};
    const hostName =
      (hostData.displayName as string | undefined)?.trim() ||
      (hostData.email as string | undefined)?.split('@')[0] ||
      'Surf user';
    const hostPhotoURL = (hostData.photoURL as string | null | undefined) ?? null;

    const ref = db().collection('live_streams').doc();
    const roomSlug = toSafeRoomName(`surf-${hostId}-${ref.id}`);
    const providerRoom = await maybeCreateDailyRoom(roomSlug);

    await ref.set({
      hostId,
      hostName,
      hostPhotoURL,
      title,
      status: 'live',
      provider: 'daily',
      transport: providerRoom.transport,
      providerRoomName: providerRoom.roomName,
      providerRoomUrl: providerRoom.roomUrl,
      viewerCount: 0,
      reactionCounts: {},
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const snap = await ref.get();
    const item = toApiLiveStream(mapLiveStream(snap.id, snap.data() ?? {}));
    await invalidateLiveStreamCache(item.id);
    await setCachedLiveStream(item.id, item);

    const friendIds = await getFriendIds(hostId);
    const payload = {
      streamId: item.id,
      hostId,
      hostName,
      hostPhotoURL,
      title: item.title,
      startedAt: item.startedAt,
    };

    friendIds.forEach((friendId) => {
      getIo().to(userRoom(friendId)).emit('friend:live', payload);
    });

    res.status(201).json({ item });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.patch('/:id/end', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const ref = db().collection('live_streams').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Live stream not found' });
      return;
    }

    const data = doc.data() ?? {};
    if (data.hostId !== uid) {
      res.status(403).json({ error: 'Only the host can end this live stream' });
      return;
    }

    await ref.update({
      status: 'ended',
      endedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    getIo().to(liveStreamRoom(req.params.id)).emit('live:ended', { streamId: req.params.id });

    const updated = await ref.get();
    const item = toApiLiveStream(mapLiveStream(updated.id, updated.data() ?? {}));
    await invalidateLiveStreamCache(req.params.id);
    await setCachedLiveStream(item.id, item);

    res.json({ item });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/:id/comments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const snap = await db()
      .collection('live_stream_comments')
      .where('streamId', '==', req.params.id)
      .limit(80)
      .get();

    const comments = snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          streamId: data.streamId as string,
          userId: data.userId as string,
          authorName: (data.authorName as string) ?? 'Surf user',
          authorPhotoURL: (data.authorPhotoURL as string | null | undefined) ?? null,
          text: (data.text as string) ?? '',
          createdAt: (toDate(data.createdAt) ?? new Date()).toISOString(),
        };
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    res.json({ comments });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export const isAllowedLiveReaction = (emoji: string): boolean => allowedReactions.has(emoji);

export default router;
