import { createHash, createHmac, randomUUID } from 'crypto';
import { Router, type Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getAuth, getDb } from '../config/firebase-admin.js';
import { getRedis } from '../config/redis.js';
import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import {
  getMarketplaceModerationProviderConfig,
  moderateMarketplaceListing,
  type MarketplaceModerationResult,
} from '../services/aiModeration.js';
import {
  createOrGetMarketplaceConversation,
  getUnreadConversationCount,
  listMarketplaceConversationsForListing,
  sendTextMessage,
  toApiConversation,
  toApiMessage,
  toRealtimeMessagePayload,
} from '../services/conversations.js';
import {
  emitMessageNewToTargets,
  emitMessageUnreadCount,
} from '../realtime/emitters/message.emitter.js';
import type { MarketplaceConversationContext } from '../types/conversation.js';
import { conversationRepository } from '../repositories/conversation.repository.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Bỏ dấu tiếng Việt & chuyển thường để full-text search */
function normalizeTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();
}

function getMarketplaceSearchTokens(...values: unknown[]) {
  const tokens = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeTitle(String(value ?? '')).replace(/[^a-z0-9]+/g, ' ');
    normalized
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && token.length <= 32)
      .forEach((token) => tokens.add(token));
  });
  return Array.from(tokens).slice(0, 80);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getMarketplaceAiModerationDelayMs() {
  const configured = Number(process.env.MARKETPLACE_AI_MODERATION_DELAY_MS ?? 1500);
  return Number.isFinite(configured) ? Math.max(0, configured) : 1500;
}

const VALID_CATEGORIES = [
  'electronics',
  'clothing',
  'vehicles',
  'property',
  'home',
  'sports',
  'other',
] as const;
const VALID_CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;
const MARKETPLACE_IMAGE_LIMIT = 5;
const PAGE_SIZE = 20;
const SEARCH_QUERY_LIMIT = 40;
const LEGACY_SEARCH_SCAN_LIMIT = 80;
const MARKETPLACE_METRIC_FLUSH_MS = 5000;
const MARKETPLACE_METRIC_MAX_BUFFERED_LISTINGS = 100;
const MARKETPLACE_CACHE_PREFIX = 'surf:marketplace';
const MARKETPLACE_PUBLIC_CACHE_TTL_SECONDS = 60;
const MARKETPLACE_SEARCH_CACHE_TTL_SECONDS = 120;
const MARKETPLACE_DETAIL_CACHE_TTL_SECONDS = 90;
const MARKETPLACE_USER_CACHE_TTL_SECONDS = 30;
const MARKETPLACE_SAVED_CACHE_TTL_SECONDS = 30;
const MARKETPLACE_IMPRESSION_DEDUPE_SECONDS = 30 * 60;
const MARKETPLACE_VIEW_DEDUPE_SECONDS = 10 * 60;
const MARKETPLACE_CLICK_DEDUPE_SECONDS = 10 * 60;
const MARKETPLACE_SELLER_LEGACY_CUTOFF_ISO =
  process.env.MARKETPLACE_SELLER_LEGACY_CUTOFF_ISO ?? '2026-03-21T08:20:48.000Z';
const MARKETPLACE_SELLER_MIN_ACCOUNT_AGE_MONTHS = 4;
const MARKETPLACE_SELLER_MIN_FRIENDS = 3;
const MARKETPLACE_SELLER_MIN_FOLLOWERS = 2;
const MARKETPLACE_SELLER_DAILY_LISTING_LIMIT = 10;
const MARKETPLACE_SELLER_MAX_OPEN_LISTINGS = 100;
const MARKETPLACE_SELLER_DUPLICATE_LOOKBACK_DAYS = 30;
const MODERATION_SETTINGS_COLLECTION = 'app_settings';
const MODERATION_SETTINGS_DOC = 'marketplace_moderation';
const BOOST_CAMPAIGNS_COLLECTION = 'marketplace_boost_campaigns';
const BOOST_PAYMENT_SESSIONS_COLLECTION = 'marketplace_boost_payment_sessions';
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BOOST_PLACEMENTS = ['surf_feed', 'surf_market', 'surf_chat', 'surf_discovery'];
const BOOST_SANDBOX_PAYMENT_PROVIDERS = ['zalopay', 'vnpay', 'momo'] as const;
const VNPAY_SANDBOX_PAYMENT_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const MOMO_SANDBOX_CREATE_URL = 'https://test-payment.momo.vn/v2/gateway/api/create';
const ZALOPAY_SANDBOX_CREATE_URL = 'https://sandbox.zalopay.com.vn/v001/tpe/createorder';
const AI_INFRASTRUCTURE_MODERATION_FLAGS = new Set([
  'missing_gemini_key',
  'invalid_gemini_key',
  'gemini_quota_exceeded',
  'gemini_model_unavailable',
  'gemini_unavailable',
  'missing_openai_key',
  'invalid_openai_key',
  'openai_quota_exceeded',
  'openai_model_unavailable',
  'openai_unavailable',
  'ai_error',
  'ai_background_error',
]);
const DEMO_SEED_TAGS = new Set(['surf-demo-seed', 'public-ecommerce-seed', 'dummyjson']);
const MARKETPLACE_CATEGORIES = [
  { key: 'electronics', label: 'Electronics' },
  { key: 'clothing', label: 'Fashion' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'property', label: 'Property' },
  { key: 'home', label: 'Home' },
  { key: 'sports', label: 'Sports' },
  { key: 'other', label: 'Other' },
] as const;

type Category = (typeof VALID_CATEGORIES)[number];
type Condition = (typeof VALID_CONDITIONS)[number];
type ListingStatus = 'pending' | 'active' | 'rejected' | 'sold' | 'deleted';
type MarketplaceModerationMode = 'auto' | 'manual';
type ListingAvailability = 'in_stock' | 'single_item';
type SellerSaleStatus = 'available' | 'pending';
type BoostStatus =
  | 'none'
  | 'awaiting_moderation'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'rejected';
type BoostPaymentMode = 'sandbox' | 'live';
type BoostPaymentStatus =
  | 'none'
  | 'sandbox_authorized'
  | 'sandbox_voided'
  | 'paid'
  | 'refunded';
type BoostSandboxPaymentProvider = (typeof BOOST_SANDBOX_PAYMENT_PROVIDERS)[number];

interface BoostPlan {
  dailyBudget: number;
  durationDays: number;
  placements: string[];
}

interface BoostMetrics {
  impressions: number;
  clicks: number;
  saves: number;
  spent: number;
}

interface MarketplaceSellerRequirement {
  key: string;
  label: string;
  met: boolean;
}

interface MarketplaceSellerEligibilityResult {
  eligible: boolean;
  bypassed: boolean;
  isAdmin: boolean;
  accountCreatedAt: string | null;
  accountAgeEligibleAt: string | null;
  legacyCutoffAt: string;
  requirements: MarketplaceSellerRequirement[];
}

interface ListingData {
  sellerId: string;
  sellerDisplayName: string;
  sellerPhotoURL: string | null;
  title: string;
  titleNormalized: string;
  searchTokens?: string[];
  description: string;
  price: number;
  currency: 'VND';
  category: Category;
  condition: Condition;
  mediaUrls: string[];
  location: string;
  brand?: string;
  productType?: string;
  material?: string;
  availability?: ListingAvailability;
  saleStatus?: SellerSaleStatus;
  tags?: string[];
  sku?: string;
  meetingPreferences?: string[];
  hideFromFriends?: boolean;
  boostEnabled?: boolean;
  boostPlan?: BoostPlan | null;
  boostStatus?: BoostStatus;
  boostCampaignId?: string | null;
  boostStartedAt?: Date | null;
  boostEndsAt?: Date | null;
  boostPaymentMode?: BoostPaymentMode | null;
  boostPaymentStatus?: BoostPaymentStatus;
  boostPaymentProvider?: BoostSandboxPaymentProvider | null;
  boostBudgetTotal?: number;
  boostEstimatedTax?: number;
  boostTotal?: number;
  boostMetrics?: BoostMetrics;
  boostScore?: number;
  status: ListingStatus;
  savedBy: string[];
  viewCount: number;
  moderationMode?: MarketplaceModerationMode;
  moderationResult?: MarketplaceModerationResult | null;
  moderationReason?: string | null;
  moderationFlags?: string[];
  moderatedBy?: 'ai' | 'admin' | null;
  moderatedAt?: Date | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type ListingItem = ListingData & { id: string };
let marketplaceAiModerationQueue = Promise.resolve();
let marketplaceMetricFlushTimer: ReturnType<typeof setTimeout> | null = null;

interface MarketplaceMetricBufferEntry {
  listingId: string;
  boostCampaignId?: string | null;
  views: number;
  impressions: number;
  clicks: number;
  saves: number;
  spent: number;
}

const marketplaceMetricBuffer = new Map<string, MarketplaceMetricBufferEntry>();

type MarketplaceListResponse = {
  items: ListingItem[];
  nextCursor: string | null;
};

type MarketplaceMyResponse = MarketplaceListResponse & {
  counts?: {
    all: number;
    error: number;
    active: number;
    pending: number;
    rejected: number;
    sold: number;
    boosted: number;
    boosting: number;
  };
  summary?: {
    views: number;
    saves: number;
    activeBoosts: number;
    boostImpressions: number;
    boostSpent: number;
  };
};

type MarketplaceCacheBucket = 'public-list' | 'search' | 'detail' | 'my' | 'saved' | 'moderation';

function isRedisReady() {
  const redis = getRedis();
  return redis?.isOpen ? redis : null;
}

function getMarketplaceCacheKey(bucket: MarketplaceCacheBucket, value: unknown) {
  const hash = createHash('sha1').update(JSON.stringify(value)).digest('hex');
  return `${MARKETPLACE_CACHE_PREFIX}:cache:${bucket}:${hash}`;
}

function getMarketplaceVersionKey(scope: string) {
  return `${MARKETPLACE_CACHE_PREFIX}:version:${scope}`;
}

async function getMarketplaceCacheVersion(scope: string) {
  const redis = isRedisReady();
  if (!redis) return '0';

  try {
    return (await redis.get(getMarketplaceVersionKey(scope))) ?? '0';
  } catch {
    return '0';
  }
}

async function getMarketplaceCache<T>(key: string): Promise<T | null> {
  const redis = isRedisReady();
  if (!redis) return null;

  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function setMarketplaceCache(key: string, value: unknown, ttlSeconds: number) {
  const redis = isRedisReady();
  if (!redis || ttlSeconds <= 0) return;

  try {
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {}
}

async function bumpMarketplaceCacheVersion(scope: string) {
  const redis = isRedisReady();
  if (!redis) return;

  try {
    await redis.incr(getMarketplaceVersionKey(scope));
  } catch {}
}

async function invalidateMarketplaceUserCache(uid?: string | null) {
  if (!uid) return;
  await bumpMarketplaceCacheVersion(`user:${uid}`);
}

async function invalidateMarketplaceSavedCache(uid?: string | null) {
  if (!uid) return;
  await bumpMarketplaceCacheVersion(`saved:${uid}`);
}

async function invalidateMarketplaceListingCaches(listing?: Partial<ListingData> | null) {
  const savedBy = Array.isArray(listing?.savedBy) ? listing.savedBy.slice(0, 200) : [];
  await Promise.all([
    bumpMarketplaceCacheVersion('public'),
    bumpMarketplaceCacheVersion('search'),
    bumpMarketplaceCacheVersion('detail'),
    invalidateMarketplaceUserCache(listing?.sellerId),
    ...savedBy.map((uid) => invalidateMarketplaceSavedCache(uid)),
  ]);
}

async function shouldRecordMarketplaceMetric(
  listingId: string,
  event: 'view' | 'impression' | 'click' | 'save',
  actorId?: string | null
) {
  if (event === 'save') return true;

  const redis = isRedisReady();
  if (!redis) return true;

  const ttl =
    event === 'impression'
      ? MARKETPLACE_IMPRESSION_DEDUPE_SECONDS
      : event === 'view'
        ? MARKETPLACE_VIEW_DEDUPE_SECONDS
        : MARKETPLACE_CLICK_DEDUPE_SECONDS;
  const actorSegment = actorId || 'anonymous';
  const key = `${MARKETPLACE_CACHE_PREFIX}:metric:${event}:${listingId}:${actorSegment}`;

  try {
    const result = await redis.set(key, '1', { EX: ttl, NX: true });
    return result === 'OK';
  } catch {
    return true;
  }
}

function setMarketplaceCacheHeader(res: Response, value: 'HIT' | 'MISS' | 'BYPASS') {
  res.setHeader('X-Surf-Cache', value);
}

function queueMarketplaceImpressions(items: ListingItem[], actorId?: string | null) {
  items.forEach((item) => void queueMarketplaceMetricEvent(item.id, item, 'impression', actorId));
}

interface BoostCampaignData {
  listingId: string;
  sellerId: string;
  status: BoostStatus;
  plan: BoostPlan;
  paymentMode: BoostPaymentMode;
  paymentStatus: BoostPaymentStatus;
  sandboxPaymentProvider: BoostSandboxPaymentProvider | null;
  sandboxPaymentId: string | null;
  budgetTotal: number;
  estimatedTax: number;
  total: number;
  metrics: BoostMetrics;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type BoostPaymentSessionStatus = 'pending' | 'paid' | 'failed' | 'expired';

interface BoostPaymentSessionData {
  userId: string;
  provider: BoostSandboxPaymentProvider;
  status: BoostPaymentSessionStatus;
  orderId: string;
  amount: number;
  title: string;
  paymentUrl: string;
  clientReturnUrl: string;
  consumed: boolean;
  consumedByListingId?: string | null;
  gatewayTransactionId?: string | null;
  gatewayResponseCode?: string | null;
  gatewayPayload?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date | null;
}

function listingFromDoc(doc: QueryDocumentSnapshot<DocumentData>): ListingItem {
  return { id: doc.id, ...(doc.data() as ListingData) };
}

function getMarketplaceConversationContext(
  listingId: string,
  listing: ListingData,
  buyerId: string
): MarketplaceConversationContext {
  return {
    kind: 'marketplace',
    listingId,
    buyerId,
    sellerId: listing.sellerId,
    title: listing.title,
    price: listing.price,
    currency: listing.currency,
    imageUrl: listing.mediaUrls?.[0] ?? null,
    location: listing.location,
    status: listing.status,
    saleStatus: listing.saleStatus ?? null,
    sellerDisplayName: listing.sellerDisplayName,
    sellerPhotoURL: listing.sellerPhotoURL ?? null,
  };
}

function normalizeMediaUrls(input: unknown) {
  return Array.isArray(input)
    ? input
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, MARKETPLACE_IMAGE_LIMIT)
    : [];
}

async function deleteMarketplaceImages(mediaUrls: string[]) {
  // Cloudinary has been removed. Images are now handled by Firebase Storage.
  return;
}

function getTimeValue(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value === 'object') {
    const raw = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof raw.toDate === 'function') return raw.toDate().getTime();
    const seconds = typeof raw._seconds === 'number' ? raw._seconds : raw.seconds;
    return typeof seconds === 'number' ? seconds * 1000 : 0;
  }
  return 0;
}

function encodePublicListingsCursor(doc: QueryDocumentSnapshot<DocumentData>) {
  const createdAt = getTimeValue(doc.get('createdAt'));
  return `${createdAt}:${doc.id}`;
}

function decodePublicListingsCursor(cursor: unknown) {
  if (typeof cursor !== 'string' || !cursor.trim()) return null;
  const [rawCreatedAt, id] = cursor.split(':');
  const createdAt = Number(rawCreatedAt);
  if (!Number.isFinite(createdAt) || !id) return null;
  return { createdAt, id };
}

function isBoostActive(listing: ListingData): boolean {
  if (!listing.boostEnabled || listing.boostStatus !== 'active') return false;
  const endsAt = getTimeValue(listing.boostEndsAt);
  return !endsAt || endsAt > Date.now();
}

function getBoostResumeDeadline(listing: ListingData): number {
  const endsAt = getTimeValue(listing.boostEndsAt);
  if (endsAt) return endsAt;
  const startedAt = getTimeValue(listing.boostStartedAt);
  const durationDays = listing.boostPlan?.durationDays ?? 0;
  return startedAt && durationDays > 0 ? startedAt + durationDays * DAY_MS : 0;
}

function getListingRank(item: ListingItem): number {
  return (
    (isBoostActive(item) ? 1_000_000_000 + (item.boostScore ?? 0) : 0) +
    getTimeValue(item.createdAt)
  );
}

function sortPublicListings(items: ListingItem[]): ListingItem[] {
  return [...items].sort((a, b) => getListingRank(b) - getListingRank(a));
}

function sortListingsByCreatedAt(items: ListingItem[]): ListingItem[] {
  return [...items].sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
}

function isTruthyFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return ['true', '1', 'yes', 'banned', 'suspended', 'blocked'].includes(value.trim().toLowerCase());
  return false;
}

function getSellerAccountCreatedAtMs(user: Record<string, unknown>, authCreationTime?: string) {
  return getTimeValue(authCreationTime) || getTimeValue(user.createdAt) || getTimeValue(user.joinedAt) || getTimeValue(user.created_at);
}

function addUtcCalendarMonths(timestampMs: number, months: number): number {
  const source = new Date(timestampMs);
  const targetMonthIndex = source.getUTCMonth() + months;
  const targetYear = source.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return Date.UTC(
    targetYear,
    targetMonth,
    Math.min(source.getUTCDate(), lastTargetDay),
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds()
  );
}

async function getFollowerCount(db: Firestore, uid: string): Promise<number> {
  const snap = await db.collection('follows').where('followingIds', 'array-contains', uid).get();
  return snap.size;
}

async function getMarketplaceSellerEligibility(
  db: Firestore,
  uid: string,
  user: Record<string, unknown>,
  listingInput?: { titleNormalized: string; mediaUrls: string[] }
): Promise<MarketplaceSellerEligibilityResult> {
  const [authUser, friendDoc, followerCount, sellerListingsSnap, isAdmin] =
    await Promise.all([
      getAuth().getUser(uid).catch(() => null),
      db.collection('friends').doc(uid).get(),
      getFollowerCount(db, uid),
      db
        .collection('marketplace')
        .where('sellerId', '==', uid)
        .select('status', 'titleNormalized', 'createdAt')
        .get(),
      isMarketplaceAdmin(db, uid),
    ]);

  const friendIds = friendDoc.exists && Array.isArray(friendDoc.data()?.friendIds)
    ? (friendDoc.data()?.friendIds as string[])
    : [];
  const displayName = typeof user.displayName === 'string' ? user.displayName.trim() : '';
  const photoURL = typeof user.photoURL === 'string' ? user.photoURL.trim() : '';
  const emailVerified = authUser?.emailVerified === true || user.emailVerified === true;
  const createdAtMs = getSellerAccountCreatedAtMs(user, authUser?.metadata.creationTime);
  const configuredCutoffMs = Date.parse(MARKETPLACE_SELLER_LEGACY_CUTOFF_ISO);
  const legacyCutoffMs = Number.isFinite(configuredCutoffMs)
    ? configuredCutoffMs
    : Date.parse('2026-03-21T08:20:48.000Z');
  const legacyCutoffLabel = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'UTC',
  }).format(new Date(legacyCutoffMs));
  const accountAgeEligibleMs =
    createdAtMs > 0
      ? addUtcCalendarMonths(createdAtMs, MARKETPLACE_SELLER_MIN_ACCOUNT_AGE_MONTHS)
      : 0;
  const accountAgeEligibleLabel = accountAgeEligibleMs
    ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC' }).format(
        new Date(accountAgeEligibleMs)
      )
    : 'không xác định';
  const isLegacyAccount = createdAtMs > 0 && createdAtMs <= legacyCutoffMs;
  const meetsMinimumAccountAge =
    accountAgeEligibleMs > 0 && Date.now() >= accountAgeEligibleMs;
  const riskFlags = Array.isArray(user.riskFlags) ? user.riskFlags : [];
  const trustStatus = typeof user.trustStatus === 'string' ? user.trustStatus.trim().toLowerCase() : '';
  const safetyStatus = typeof user.safetyStatus === 'string' ? user.safetyStatus.trim().toLowerCase() : '';
  const nowMs = Date.now();
  const duplicateLookbackMs = MARKETPLACE_SELLER_DUPLICATE_LOOKBACK_DAYS * DAY_MS;
  const sellerListings = sellerListingsSnap.docs.map((doc) => doc.data() as Partial<ListingData>);
  const recentListingCount = sellerListings.filter((listing) => nowMs - getTimeValue(listing.createdAt) < DAY_MS).length;
  const openListingCount = sellerListings.filter((listing) => listing.status === 'pending' || listing.status === 'active').length;
  const hasRecentDuplicate = sellerListings.some(
    (listing) =>
      listing.status !== 'deleted' &&
      listing.titleNormalized === listingInput?.titleNormalized &&
      nowMs - getTimeValue(listing.createdAt) < duplicateLookbackMs
  );
  const isRestricted =
    isTruthyFlag(user.isSuspended) ||
    isTruthyFlag(user.suspended) ||
    isTruthyFlag(user.isBanned) ||
    isTruthyFlag(user.banned) ||
    isTruthyFlag(user.marketplaceBlocked) ||
    isTruthyFlag(user.marketplaceRestricted) ||
    ['restricted', 'blocked', 'banned', 'suspended'].includes(trustStatus) ||
    ['restricted', 'blocked', 'banned', 'suspended'].includes(safetyStatus) ||
    riskFlags.some((flag) => ['spam', 'scam', 'fraud', 'clone', 'marketplace_abuse'].includes(String(flag).toLowerCase()));

  const requirements: MarketplaceSellerRequirement[] = [
    {
      key: 'account_age',
      label: isLegacyAccount
        ? `Tài khoản thuộc nhóm đời đầu (tạo trước hoặc đúng ${legacyCutoffLabel}).`
        : `Tài khoản cần hoạt động đủ ${MARKETPLACE_SELLER_MIN_ACCOUNT_AGE_MONTHS} tháng (đủ điều kiện từ ${accountAgeEligibleLabel}) hoặc thuộc nhóm đời đầu trước ${legacyCutoffLabel}.`,
      met: isLegacyAccount || meetsMinimumAccountAge,
    },
    {
      key: 'verified_email',
      label: emailVerified
        ? 'Email tài khoản đã được xác minh.'
        : 'Email tài khoản chưa được xác minh.',
      met: emailVerified,
    },
    { key: 'display_name', label: 'Hồ sơ có tên hiển thị từ 3 ký tự.', met: displayName.length >= 3 },
    {
      key: 'profile_photo',
      label: photoURL ? 'Hồ sơ đã có ảnh đại diện.' : 'Hồ sơ chưa có ảnh đại diện.',
      met: Boolean(photoURL),
    },
    {
      key: 'social_connections',
      label: `Có ít nhất ${MARKETPLACE_SELLER_MIN_FRIENDS} bạn bè hoặc ${MARKETPLACE_SELLER_MIN_FOLLOWERS} người theo dõi (hiện có ${friendIds.length} bạn, ${followerCount} người theo dõi).`,
      met:
        friendIds.length >= MARKETPLACE_SELLER_MIN_FRIENDS ||
        followerCount >= MARKETPLACE_SELLER_MIN_FOLLOWERS,
    },
    { key: 'safety_status', label: 'Tài khoản không bị giới hạn an toàn.', met: !isRestricted },
    {
      key: 'daily_limit',
      label: `Chưa vượt ${MARKETPLACE_SELLER_DAILY_LISTING_LIMIT} tin trong 24 giờ (hiện có ${recentListingCount}).`,
      met: recentListingCount < MARKETPLACE_SELLER_DAILY_LISTING_LIMIT,
    },
    {
      key: 'open_limit',
      label: `Có dưới ${MARKETPLACE_SELLER_MAX_OPEN_LISTINGS} tin đang mở (hiện có ${openListingCount}).`,
      met: openListingCount < MARKETPLACE_SELLER_MAX_OPEN_LISTINGS,
    },
  ];

  if (listingInput) {
    requirements.push(
      {
        key: 'product_image',
        label: 'Tin đăng có ít nhất 1 ảnh sản phẩm thật.',
        met: listingInput.mediaUrls.length > 0,
      },
      {
        key: 'duplicate_title',
        label: `Không trùng tiêu đề tin đã đăng trong ${MARKETPLACE_SELLER_DUPLICATE_LOOKBACK_DAYS} ngày gần đây.`,
        met: !hasRecentDuplicate,
      }
    );
  }

  const bypassed =
    isAdmin ||
    (process.env.NODE_ENV !== 'production' &&
      process.env.MARKETPLACE_SKIP_SELLER_ELIGIBILITY === 'true');
  return {
    eligible: bypassed || requirements.every((requirement) => requirement.met),
    bypassed,
    isAdmin,
    accountCreatedAt: createdAtMs > 0 ? new Date(createdAtMs).toISOString() : null,
    accountAgeEligibleAt:
      accountAgeEligibleMs > 0 ? new Date(accountAgeEligibleMs).toISOString() : null,
    legacyCutoffAt: new Date(legacyCutoffMs).toISOString(),
    requirements,
  };
}

async function assertMarketplaceSellerEligibility(
  db: Firestore,
  uid: string,
  user: Record<string, unknown>,
  titleNormalized: string,
  mediaUrls: string[]
): Promise<void> {
  const eligibility = await getMarketplaceSellerEligibility(db, uid, user, {
    titleNormalized,
    mediaUrls,
  });
  if (eligibility.eligible) return;

  const failures = eligibility.requirements
    .filter((requirement) => !requirement.met)
    .map((requirement) => requirement.label);
  const error = new Error(`Chưa đủ điều kiện đăng bán: ${failures.join(' ')}`) as Error & {
    statusCode: number;
    eligibility: MarketplaceSellerEligibilityResult;
  };
  error.name = 'MarketplaceSellerEligibilityError';
  error.statusCode = 403;
  error.eligibility = eligibility;
  throw error;
}

function normalizeBoostPlan(input: unknown): BoostPlan | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as { dailyBudget?: unknown; durationDays?: unknown; placements?: unknown };
  const dailyBudget = Math.max(0, Math.min(1_000_000, Number(raw.dailyBudget) || 0));
  const durationDays = Math.max(1, Math.min(30, Number(raw.durationDays) || 3));
  const placements = Array.isArray(raw.placements)
    ? raw.placements
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];

  return {
    dailyBudget,
    durationDays,
    placements: placements.length > 0 ? placements : DEFAULT_BOOST_PLACEMENTS,
  };
}

function normalizeBoostSandboxPaymentProvider(input: unknown): BoostSandboxPaymentProvider {
  const provider = String(input ?? '').trim().toLowerCase();
  return BOOST_SANDBOX_PAYMENT_PROVIDERS.includes(provider as BoostSandboxPaymentProvider)
    ? (provider as BoostSandboxPaymentProvider)
    : 'zalopay';
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Thiếu cấu hình ${name} cho cổng thanh toán sandbox chính chủ.`);
  }
  return value;
}

function hmacHex(algorithm: string, key: string, data: string) {
  return createHmac(algorithm, key).update(data, 'utf8').digest('hex');
}

function formatGatewayDate(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function getServerPublicUrl(req: AuthRequest) {
  const configured = process.env.SERVER_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`.replace(/\/+$/, '');
}

function getClientReturnUrl(req: AuthRequest, input: unknown) {
  const candidate = typeof input === 'string' ? input.trim() : '';
  if (/^https?:\/\//i.test(candidate)) return candidate;
  const configured = process.env.CLIENT_PUBLIC_URL?.trim() || process.env.FRONTEND_URL?.split(',')[0]?.trim();
  const base = (configured || req.get('origin') || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/sandbox/boost-payment-return`;
}

function createGatewayOrderId(provider: BoostSandboxPaymentProvider) {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  return `${provider.toUpperCase()}${Date.now()}${suffix}`.slice(0, 40);
}

function createZaloPayAppTransId(orderId: string) {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');
  return `${yy}${mm}${dd}_${orderId}`.slice(0, 40);
}

function toGatewayPayload(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, rawValue]) => [key, String(rawValue ?? '')])
  );
}

async function markBoostPaymentSession(
  orderId: string,
  patch: Partial<BoostPaymentSessionData>
) {
  const db = getDb();
  const snap = await db
    .collection(BOOST_PAYMENT_SESSIONS_COLLECTION)
    .where('orderId', '==', orderId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const update = { ...patch, updatedAt: new Date() };
  await doc.ref.update(update);
  return { id: doc.id, ...(doc.data() as BoostPaymentSessionData), ...update };
}

async function getBoostPaymentSession(paymentId: string) {
  const doc = await getDb().collection(BOOST_PAYMENT_SESSIONS_COLLECTION).doc(paymentId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as BoostPaymentSessionData) };
}

function createBoostPaymentError(message: string) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = 400;
  return error;
}

async function assertPaidBoostPaymentSession(
  paymentId: unknown,
  uid: string,
  provider: BoostSandboxPaymentProvider,
  expectedAmount: number
) {
  const id = typeof paymentId === 'string' ? paymentId.trim() : '';
  if (!id) {
    throw createBoostPaymentError('Vui lòng hoàn tất thanh toán sandbox chính chủ trước khi bật quảng bá.');
  }
  const session = await getBoostPaymentSession(id);
  if (!session || session.userId !== uid) {
    throw createBoostPaymentError('Không tìm thấy giao dịch thanh toán sandbox hợp lệ.');
  }
  if (session.provider !== provider) {
    throw createBoostPaymentError('Cổng thanh toán đã chọn không khớp với giao dịch đã thanh toán.');
  }
  if (session.status !== 'paid') {
    throw createBoostPaymentError('Giao dịch sandbox chưa được cổng thanh toán xác nhận thành công.');
  }
  if (session.consumed) {
    throw createBoostPaymentError('Giao dịch sandbox này đã được dùng cho một chiến dịch khác.');
  }
  if (Math.round(session.amount) !== Math.round(expectedAmount)) {
    throw createBoostPaymentError('Số tiền thanh toán sandbox không khớp với gói quảng bá.');
  }
  return { id, session };
}

function redirectPaymentResult(res: Response, session: BoostPaymentSessionData & { id: string }, status: string) {
  const url = new URL(session.clientReturnUrl);
  url.searchParams.set('paymentId', session.id);
  url.searchParams.set('orderId', session.orderId);
  url.searchParams.set('provider', session.provider);
  url.searchParams.set('status', status);
  res.redirect(url.toString());
}

function getVnpaySignedQuery(params: Record<string, string>, secret: string) {
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, string>>((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
  const signData = new URLSearchParams(sorted).toString();
  return { query: `${signData}&vnp_SecureHash=${hmacHex('sha512', secret, signData)}`, signData };
}

function verifyVnpayQuery(query: Record<string, unknown>, secret: string) {
  const secureHash = String(query.vnp_SecureHash ?? '');
  const params: Record<string, string> = {};
  Object.entries(query).forEach(([key, value]) => {
    if (key.startsWith('vnp_') && key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType') {
      params[key] = String(value ?? '');
    }
  });
  const { signData } = getVnpaySignedQuery(params, secret);
  return secureHash.toLowerCase() === hmacHex('sha512', secret, signData).toLowerCase();
}

async function createVnpayPaymentUrl(req: AuthRequest, orderId: string, amount: number, title: string) {
  const tmnCode = getRequiredEnv('VNPAY_TMN_CODE');
  const hashSecret = getRequiredEnv('VNPAY_HASH_SECRET');
  const paymentUrl = process.env.VNPAY_PAYMENT_URL?.trim() || VNPAY_SANDBOX_PAYMENT_URL;
  const params: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Amount: String(Math.round(amount) * 100),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderId,
    vnp_OrderInfo: `Surf Boost ${title}`.slice(0, 255),
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: `${getServerPublicUrl(req)}/payment/marketplace/boost-payments/vnpay/return`,
    vnp_IpAddr: req.ip || '127.0.0.1',
    vnp_CreateDate: formatGatewayDate(new Date()),
  };
  const { query } = getVnpaySignedQuery(params, hashSecret);
  return `${paymentUrl}?${query}`;
}

async function createMomoPaymentUrl(req: AuthRequest, orderId: string, amount: number, title: string) {
  const partnerCode = getRequiredEnv('MOMO_PARTNER_CODE');
  const accessKey = getRequiredEnv('MOMO_ACCESS_KEY');
  const secretKey = getRequiredEnv('MOMO_SECRET_KEY');
  const endpoint = process.env.MOMO_CREATE_URL?.trim() || MOMO_SANDBOX_CREATE_URL;
  const requestId = orderId;
  const requestType = process.env.MOMO_REQUEST_TYPE?.trim() || 'captureWallet';
  const redirectUrl = `${getServerPublicUrl(req)}/payment/marketplace/boost-payments/momo/return`;
  const ipnUrl = `${getServerPublicUrl(req)}/payment/marketplace/boost-payments/momo/ipn`;
  const extraData = '';
  const orderInfo = `Surf Boost ${title}`.slice(0, 255);
  const rawSignature =
    `accessKey=${accessKey}&amount=${Math.round(amount)}&extraData=${extraData}&ipnUrl=${ipnUrl}` +
    `&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}` +
    `&requestId=${requestId}&requestType=${requestType}`;
  const body = {
    partnerCode,
    accessKey,
    requestId,
    amount: String(Math.round(amount)),
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType,
    signature: hmacHex('sha256', secretKey, rawSignature),
    lang: 'vi',
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as { payUrl?: string; resultCode?: number; message?: string };
  if (!response.ok || !data.payUrl) {
    throw new Error(data.message || 'MoMo sandbox không trả về payUrl.');
  }
  return data.payUrl;
}

function verifyMomoResultPayload(payload: Record<string, unknown>) {
  const signature = String(payload.signature ?? '');
  if (!signature) return false;
  const accessKey = getRequiredEnv('MOMO_ACCESS_KEY');
  const secretKey = getRequiredEnv('MOMO_SECRET_KEY');
  const data = toGatewayPayload(payload);
  const rawSignature =
    `accessKey=${accessKey}&amount=${data.amount ?? ''}&extraData=${data.extraData ?? ''}` +
    `&message=${data.message ?? ''}&orderId=${data.orderId ?? ''}&orderInfo=${data.orderInfo ?? ''}` +
    `&orderType=${data.orderType ?? ''}&partnerCode=${data.partnerCode ?? ''}&payType=${data.payType ?? ''}` +
    `&requestId=${data.requestId ?? ''}&responseTime=${data.responseTime ?? ''}` +
    `&resultCode=${data.resultCode ?? ''}&transId=${data.transId ?? ''}`;
  return signature.toLowerCase() === hmacHex('sha256', secretKey, rawSignature).toLowerCase();
}

async function createZaloPayPaymentUrl(req: AuthRequest, orderId: string, amount: number, title: string, uid: string) {
  const appId = getRequiredEnv('ZALOPAY_APP_ID');
  const key1 = getRequiredEnv('ZALOPAY_KEY1');
  const endpoint = process.env.ZALOPAY_CREATE_ORDER_URL?.trim() || ZALOPAY_SANDBOX_CREATE_URL;
  const appTransId = createZaloPayAppTransId(orderId);
  const appTime = Date.now();
  const embedData = JSON.stringify({
    redirecturl: `${getServerPublicUrl(req)}/payment/marketplace/boost-payments/zalopay/return`,
  });
  const item = JSON.stringify([{ itemid: orderId, itemname: 'Surf Boost', itemprice: Math.round(amount), itemquantity: 1 }]);
  const description = `Surf Boost ${title}`.slice(0, 100);
  const macInput = `${appId}|${appTransId}|${uid}|${Math.round(amount)}|${appTime}|${embedData}|${item}`;
  const form = new URLSearchParams({
    appid: appId,
    apptransid: appTransId,
    appuser: uid,
    apptime: String(appTime),
    amount: String(Math.round(amount)),
    embeddata: embedData,
    item,
    description,
    bankcode: '',
    mac: hmacHex('sha256', key1, macInput),
  });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const data = (await response.json()) as { orderurl?: string; returncode?: number; returnmessage?: string };
  if (!response.ok || !data.orderurl || data.returncode !== 1) {
    throw new Error(data.returnmessage || 'ZaloPay sandbox không trả về orderurl.');
  }
  return { paymentUrl: data.orderurl, gatewayOrderId: appTransId };
}

function verifyZaloPayRedirectPayload(payload: Record<string, unknown>) {
  const checksum = String(payload.checksum ?? '');
  if (!checksum) return false;
  const callbackKey = process.env.ZALOPAY_CALLBACK_KEY?.trim() || getRequiredEnv('ZALOPAY_KEY2');
  const data = toGatewayPayload(payload);
  const checksumData = `${data.appid ?? ''}|${data.apptransid ?? ''}|${data.pmcid ?? ''}|${data.bankcode ?? ''}|${data.amount ?? ''}|${data.discountamount ?? ''}|${data.status ?? ''}`;
  return checksum.toLowerCase() === hmacHex('sha256', callbackKey, checksumData).toLowerCase();
}

function verifyZaloPayCallbackPayload(data: string, mac: string) {
  if (!data || !mac) return false;
  const callbackKey = process.env.ZALOPAY_CALLBACK_KEY?.trim() || getRequiredEnv('ZALOPAY_KEY2');
  return mac.toLowerCase() === hmacHex('sha256', callbackKey, data).toLowerCase();
}

function createBoostMetrics(): BoostMetrics {
  return { impressions: 0, clicks: 0, saves: 0, spent: 0 };
}

function getBoostTotals(plan: BoostPlan) {
  const budgetTotal = plan.dailyBudget * plan.durationDays;
  const estimatedTax = Math.round(budgetTotal * 0.1);
  return { budgetTotal, estimatedTax, total: budgetTotal + estimatedTax };
}

async function activateBoostIfEligible(listingId: string, listing: ListingData) {
  if (!listing.boostEnabled || !listing.boostPlan || listing.status !== 'active') return;
  if (
    listing.boostPaymentStatus !== 'sandbox_authorized' &&
    listing.boostPaymentStatus !== 'paid'
  )
    return;

  const db = getDb();
  const campaignId = listing.boostCampaignId;
  if (!campaignId) return;

  const now = new Date();
  const endsAt = new Date(now.getTime() + listing.boostPlan.durationDays * DAY_MS);
  const update = {
    boostStatus: 'active' as BoostStatus,
    boostStartedAt: now,
    boostEndsAt: endsAt,
    boostScore: listing.boostPlan.dailyBudget,
    updatedAt: now,
  };

  await Promise.all([
    db.collection('marketplace').doc(listingId).update(update),
    db.collection(BOOST_CAMPAIGNS_COLLECTION).doc(campaignId).update({
      status: 'active',
      startsAt: now,
      endsAt,
      updatedAt: now,
    }),
  ]);
  await invalidateMarketplaceListingCaches({ ...listing, ...update });
}

async function cancelBoostCampaign(
  listingId: string,
  listing: ListingData,
  status: Extract<BoostStatus, 'cancelled' | 'rejected' | 'completed'>
) {
  if (!listing.boostCampaignId) return;
  const db = getDb();
  const now = new Date();
  await Promise.all([
    db
      .collection('marketplace')
      .doc(listingId)
      .update({
        boostStatus: status,
        boostPaymentStatus:
          listing.boostPaymentStatus === 'sandbox_authorized'
            ? 'sandbox_voided'
            : (listing.boostPaymentStatus ?? 'none'),
        boostScore: 0,
        updatedAt: now,
      }),
    db
      .collection(BOOST_CAMPAIGNS_COLLECTION)
      .doc(listing.boostCampaignId)
      .update({
        status,
        paymentStatus:
          listing.boostPaymentStatus === 'sandbox_authorized'
            ? 'sandbox_voided'
            : (listing.boostPaymentStatus ?? 'none'),
        updatedAt: now,
      }),
  ]);
  await invalidateMarketplaceListingCaches({
    ...listing,
    boostStatus: status,
    boostPaymentStatus:
      listing.boostPaymentStatus === 'sandbox_authorized'
        ? 'sandbox_voided'
        : (listing.boostPaymentStatus ?? 'none'),
    boostScore: 0,
  });
}

async function pauseBoostCampaign(listingId: string, listing: ListingData) {
  if (!listing.boostCampaignId) return null;
  const db = getDb();
  const now = new Date();
  const update = {
    boostStatus: 'paused' as BoostStatus,
    boostScore: 0,
    updatedAt: now,
  };

  await Promise.all([
    db.collection('marketplace').doc(listingId).update(update),
    db.collection(BOOST_CAMPAIGNS_COLLECTION).doc(listing.boostCampaignId).update({
      status: 'paused',
      updatedAt: now,
    }),
  ]);
  await invalidateMarketplaceListingCaches({ ...listing, ...update });
  return update;
}

async function resumeBoostCampaign(listingId: string, listing: ListingData) {
  if (!listing.boostCampaignId || !listing.boostPlan) return null;
  const db = getDb();
  const now = new Date();
  const update = {
    boostStatus: 'active' as BoostStatus,
    boostScore: listing.boostPlan.dailyBudget,
    updatedAt: now,
  };

  await Promise.all([
    db.collection('marketplace').doc(listingId).update(update),
    db.collection(BOOST_CAMPAIGNS_COLLECTION).doc(listing.boostCampaignId).update({
      status: 'active',
      updatedAt: now,
    }),
  ]);
  await invalidateMarketplaceListingCaches({ ...listing, ...update });
  return update;
}

async function flushMarketplaceMetricBuffer() {
  if (marketplaceMetricFlushTimer) {
    clearTimeout(marketplaceMetricFlushTimer);
    marketplaceMetricFlushTimer = null;
  }
  const entries = Array.from(marketplaceMetricBuffer.values());
  marketplaceMetricBuffer.clear();
  if (entries.length === 0) return;

  const db = getDb();
  let batch = db.batch();
  let writeCount = 0;
  const commit = async () => {
    if (writeCount === 0) return;
    await batch.commit();
    batch = db.batch();
    writeCount = 0;
  };

  for (const entry of entries) {
    const listingUpdate: Record<string, unknown> = {};
    if (entry.views > 0) listingUpdate.viewCount = FieldValue.increment(entry.views);
    if (entry.impressions > 0)
      listingUpdate['boostMetrics.impressions'] = FieldValue.increment(entry.impressions);
    if (entry.clicks > 0) listingUpdate['boostMetrics.clicks'] = FieldValue.increment(entry.clicks);
    if (entry.saves > 0) listingUpdate['boostMetrics.saves'] = FieldValue.increment(entry.saves);
    if (entry.spent > 0) listingUpdate['boostMetrics.spent'] = FieldValue.increment(entry.spent);
    batch.update(db.collection('marketplace').doc(entry.listingId), listingUpdate);
    writeCount += 1;

    if (
      entry.boostCampaignId &&
      (entry.impressions > 0 || entry.clicks > 0 || entry.saves > 0 || entry.spent > 0)
    ) {
      const campaignUpdate: Record<string, unknown> = {};
      if (entry.impressions > 0)
        campaignUpdate['metrics.impressions'] = FieldValue.increment(entry.impressions);
      if (entry.clicks > 0) campaignUpdate['metrics.clicks'] = FieldValue.increment(entry.clicks);
      if (entry.saves > 0) campaignUpdate['metrics.saves'] = FieldValue.increment(entry.saves);
      if (entry.spent > 0) campaignUpdate['metrics.spent'] = FieldValue.increment(entry.spent);
      batch.update(
        db.collection(BOOST_CAMPAIGNS_COLLECTION).doc(entry.boostCampaignId),
        campaignUpdate
      );
      writeCount += 1;
    }

    if (writeCount >= 450) await commit();
  }
  await commit();
}

async function queueMarketplaceMetricEvent(
  listingId: string,
  listing: ListingData,
  event: 'view' | 'impression' | 'click' | 'save',
  actorId?: string | null
) {
  if (!(await shouldRecordMarketplaceMetric(listingId, event, actorId))) return;

  const boosted = isBoostActive(listing) && Boolean(listing.boostCampaignId);
  if (event !== 'view' && !boosted) return;
  const entry = marketplaceMetricBuffer.get(listingId) ?? {
    listingId,
    boostCampaignId: boosted ? listing.boostCampaignId : null,
    views: 0,
    impressions: 0,
    clicks: 0,
    saves: 0,
    spent: 0,
  };
  if (boosted) entry.boostCampaignId = listing.boostCampaignId;
  if (event === 'view') entry.views += 1;
  if (event === 'impression') {
    entry.impressions += 1;
    entry.spent += 50;
  }
  if (event === 'click') {
    entry.clicks += 1;
    entry.spent += 300;
  }
  if (event === 'save') {
    entry.saves += 1;
    entry.spent += 150;
  }
  marketplaceMetricBuffer.set(listingId, entry);
  if (marketplaceMetricBuffer.size >= MARKETPLACE_METRIC_MAX_BUFFERED_LISTINGS) {
    void flushMarketplaceMetricBuffer().catch((error) =>
      console.error('Marketplace metric flush failed:', error)
    );
    return;
  }
  if (!marketplaceMetricFlushTimer) {
    marketplaceMetricFlushTimer = setTimeout(() => {
      void flushMarketplaceMetricBuffer().catch((error) =>
        console.error('Marketplace metric flush failed:', error)
      );
    }, MARKETPLACE_METRIC_FLUSH_MS);
  }
}
function sanitizeModerationResult(
  result: MarketplaceModerationResult
): MarketplaceModerationResult {
  const sanitized: MarketplaceModerationResult = {
    decision: result.decision,
    flags: Array.isArray(result.flags) ? result.flags.filter(Boolean) : [],
    provider: result.provider,
  };
  if (typeof result.reason === 'string' && result.reason.trim())
    sanitized.reason = result.reason.trim();
  if (typeof result.confidence === 'number' && Number.isFinite(result.confidence)) {
    sanitized.confidence = Math.min(1, Math.max(0, result.confidence));
  }
  return sanitized;
}

function getModerationFlagsFromListing(listing: ListingData) {
  return Array.from(
    new Set(
      [
        ...(Array.isArray(listing.moderationFlags) ? listing.moderationFlags : []),
        ...(Array.isArray(listing.moderationResult?.flags) ? listing.moderationResult.flags : []),
      ].filter(Boolean)
    )
  );
}

function isAiInfrastructureModerationFailure(listing: ListingData) {
  return getModerationFlagsFromListing(listing).some((flag) =>
    AI_INFRASTRUCTURE_MODERATION_FLAGS.has(flag)
  );
}

function isMarketplaceSpamOrErrorListing(listing: ListingData) {
  return (
    listing.status === 'rejected' ||
    (listing.status === 'pending' && isAiInfrastructureModerationFailure(listing))
  );
}

function isMarketplacePendingReviewListing(listing: ListingData) {
  return listing.status === 'pending' && !isMarketplaceSpamOrErrorListing(listing);
}

function hasMarketplaceBoostPromotion(listing: ListingData) {
  return Boolean(
    listing.boostEnabled &&
      listing.boostStatus &&
      !['none', 'cancelled', 'rejected'].includes(listing.boostStatus)
  );
}

function matchesMyListingsFilter(item: ListingItem, selectedFilter: string) {
  if (item.status === 'deleted') return false;
  if (selectedFilter === 'all') return !isMarketplaceSpamOrErrorListing(item);
  if (selectedFilter === 'pending') return isMarketplacePendingReviewListing(item);
  if (selectedFilter === 'error') return isMarketplaceSpamOrErrorListing(item);
  if (selectedFilter === 'sold') return item.status === 'sold';
  if (selectedFilter === 'rejected') return item.status === 'rejected';
  if (selectedFilter === 'boosted') return hasMarketplaceBoostPromotion(item);
  if (selectedFilter === 'boosting') return isBoostActive(item);
  return item.status === 'active';
}

function isDemoSeedListing(listing: ListingData) {
  return (listing.tags ?? []).some(
    (tag) => DEMO_SEED_TAGS.has(tag) || tag.startsWith('dummyjson-')
  );
}

function getStatusFromModerationResult(result: MarketplaceModerationResult): ListingStatus {
  if (result.decision === 'approved') return 'active';
  if (result.decision === 'rejected') return 'rejected';
  return 'pending';
}

async function updateListingAfterAiModeration(
  listingId: string,
  moderationResult: MarketplaceModerationResult
) {
  const db = getDb();
  const ref = db.collection('marketplace').doc(listingId);
  const current = await ref.get();
  if (!current.exists) return;
  const currentData = current.data() as ListingData;
  if (
    currentData.status !== 'pending' ||
    currentData.reviewedBy ||
    currentData.moderatedBy === 'admin'
  )
    return;
  const status = getStatusFromModerationResult(moderationResult);

  await ref.update({
    status,
    moderationMode: 'auto',
    moderationResult,
    moderationReason: moderationResult.reason ?? null,
    moderationFlags: moderationResult.flags,
    moderatedBy: 'ai',
    moderatedAt: new Date(),
    reviewedBy: null,
    reviewedAt: null,
    updatedAt: new Date(),
  });
  if (status === 'active') {
    await activateBoostIfEligible(listingId, { ...currentData, status });
  } else if (status === 'rejected') {
    await cancelBoostCampaign(listingId, currentData, 'rejected');
  }
  await invalidateMarketplaceListingCaches({ ...currentData, status });
}

async function runMarketplaceAiModerationInBackground(listingId: string, listing: ListingData) {
  try {
    const moderationResult = sanitizeModerationResult(
      await moderateMarketplaceListing({
        title: listing.title,
        description: listing.description,
        price: listing.price,
        category: listing.category,
        condition: listing.condition,
        location: listing.location,
        mediaUrls: Array.isArray(listing.mediaUrls) ? listing.mediaUrls : [],
      })
    );
    await updateListingAfterAiModeration(listingId, moderationResult);
  } catch (e) {
    console.error('Marketplace AI moderation background failed:', e);
    try {
      await updateListingAfterAiModeration(listingId, {
        decision: 'needs_review',
        reason: 'AI kiểm duyệt nền gặp lỗi, cần admin duyệt thủ công.',
        flags: ['ai_background_error'],
        provider: getMarketplaceModerationProviderConfig().provider,
      });
    } catch (updateError) {
      console.error('Marketplace AI moderation fallback update failed:', updateError);
    }
  }
}

function enqueueMarketplaceAiModeration(listingId: string, listing: ListingData) {
  const job = marketplaceAiModerationQueue
    .catch(() => undefined)
    .then(async () => {
      await wait(getMarketplaceAiModerationDelayMs());
      await runMarketplaceAiModerationInBackground(listingId, listing);
    });
  marketplaceAiModerationQueue = job.catch((error) => {
    console.error('Marketplace AI moderation queue failed:', error);
  });
}

async function getPublicListingsFallback(db: Firestore, category?: Category, cursor?: unknown) {
  try {
    let indexedQuery = db
      .collection('marketplace')
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(PAGE_SIZE);

    if (category) {
      indexedQuery = db
        .collection('marketplace')
        .where('status', '==', 'active')
        .where('category', '==', category)
        .orderBy('createdAt', 'desc')
        .limit(PAGE_SIZE);
    }

    const decodedCursor = decodePublicListingsCursor(cursor);
    if (decodedCursor) {
      const cursorDoc = await db.collection('marketplace').doc(decodedCursor.id).get();
      indexedQuery = cursorDoc.exists
        ? indexedQuery.startAfter(cursorDoc)
        : indexedQuery.startAfter(Timestamp.fromMillis(decodedCursor.createdAt));
    }

    const snap = await indexedQuery.get();
    const items = sortPublicListings(snap.docs.map(listingFromDoc));
    const nextCursor =
      snap.docs.length === PAGE_SIZE
        ? encodePublicListingsCursor(snap.docs[snap.docs.length - 1])
        : null;
    return { items, nextCursor };
  } catch {}

  const scanLimit = PAGE_SIZE * 3;
  const itemsWithDocs: Array<{ item: ListingItem; doc: QueryDocumentSnapshot<DocumentData> }> = [];
  let decodedCursor = decodePublicListingsCursor(cursor);
  let exhausted = false;

  while (itemsWithDocs.length < PAGE_SIZE && !exhausted) {
    let query = db
      .collection('marketplace')
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(scanLimit);

    if (decodedCursor) {
      query = query.startAfter(Timestamp.fromMillis(decodedCursor.createdAt), decodedCursor.id);
    }

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const item = listingFromDoc(doc);
      if (item.status !== 'active' || (category && item.category !== category)) continue;
      itemsWithDocs.push({ item, doc });
      if (itemsWithDocs.length === PAGE_SIZE) break;
    }

    const lastScannedDoc = snap.docs[snap.docs.length - 1];
    decodedCursor = {
      createdAt: getTimeValue(lastScannedDoc.get('createdAt')),
      id: lastScannedDoc.id,
    };
    exhausted = snap.docs.length < scanLimit;
  }

  const items = sortPublicListings(itemsWithDocs.map(({ item }) => item));
  const lastReturnedDoc = itemsWithDocs[itemsWithDocs.length - 1]?.doc;
  const nextCursor =
    itemsWithDocs.length === PAGE_SIZE && lastReturnedDoc
      ? encodePublicListingsCursor(lastReturnedDoc)
      : null;
  return { items, nextCursor };
}

function listingMatchesSearch(item: ListingItem, normalizedQuery: string, queryTokens: string[]) {
  const itemTokens = Array.isArray(item.searchTokens) ? item.searchTokens : [];
  return (
    item.titleNormalized?.includes(normalizedQuery) ||
    normalizeTitle(item.title ?? '').includes(normalizedQuery) ||
    normalizeTitle(item.description ?? '').includes(normalizedQuery) ||
    (queryTokens.length > 0 && queryTokens.every((token) => itemTokens.includes(token)))
  );
}

async function searchPublicListings(db: Firestore, raw: string, category?: Category) {
  const normalizedQuery = normalizeTitle(raw);
  const queryTokens = getMarketplaceSearchTokens(raw);
  const primaryToken = queryTokens[0];

  const legacyScan = async () => {
    let fallbackQuery = db
      .collection('marketplace')
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(LEGACY_SEARCH_SCAN_LIMIT);

    if (category) {
      fallbackQuery = db
        .collection('marketplace')
        .where('status', '==', 'active')
        .where('category', '==', category)
        .orderBy('createdAt', 'desc')
        .limit(LEGACY_SEARCH_SCAN_LIMIT);
    }

    const snap = await fallbackQuery.get();
    return sortPublicListings(
      snap.docs
        .map(listingFromDoc)
        .filter((item) => listingMatchesSearch(item, normalizedQuery, queryTokens))
    ).slice(0, PAGE_SIZE);
  };

  if (!primaryToken) return [];

  try {
    let query = db
      .collection('marketplace')
      .where('status', '==', 'active')
      .where('searchTokens', 'array-contains', primaryToken)
      .orderBy('createdAt', 'desc')
      .limit(SEARCH_QUERY_LIMIT);

    if (category) {
      query = db
        .collection('marketplace')
        .where('status', '==', 'active')
        .where('category', '==', category)
        .where('searchTokens', 'array-contains', primaryToken)
        .orderBy('createdAt', 'desc')
        .limit(SEARCH_QUERY_LIMIT);
    }

    const snap = await query.get();
    const items = sortPublicListings(
      snap.docs
        .map(listingFromDoc)
        .filter((item) => listingMatchesSearch(item, normalizedQuery, queryTokens))
    ).slice(0, PAGE_SIZE);
    return items.length > 0 ? items : legacyScan();
  } catch {
    return legacyScan();
  }
}

function getAdminUidSet() {
  return new Set(
    (process.env.MARKETPLACE_ADMIN_UIDS ?? process.env.ADMIN_UIDS ?? '')
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean)
  );
}

function getAdminEmailSet() {
  return new Set(
    (process.env.MARKETPLACE_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function isMarketplaceAdmin(db: Firestore, uid?: string) {
  if (!uid) return false;
  if (getAdminUidSet().has(uid)) return true;
  const userDoc = await db.collection('users').doc(uid).get();
  const user = userDoc.data();
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (email && getAdminEmailSet().has(email)) return true;
  return (
    user?.role === 'admin' ||
    user?.isAdmin === true ||
    (Array.isArray(user?.roles) && user.roles.includes('admin'))
  );
}

async function requireMarketplaceAdmin(req: AuthRequest, res: Response) {
  const allowed = await isMarketplaceAdmin(getDb(), req.uid);
  if (!allowed) {
    res.status(403).json({ error: 'Chỉ admin mới có quyền kiểm duyệt Marketplace' });
    return false;
  }
  return true;
}

async function getModerationSettings(db: Firestore) {
  const doc = await db
    .collection(MODERATION_SETTINGS_COLLECTION)
    .doc(MODERATION_SETTINGS_DOC)
    .get();
  const mode = doc.data()?.mode === 'manual' ? 'manual' : 'auto';
  const providerConfig = getMarketplaceModerationProviderConfig();
  return {
    mode: mode as MarketplaceModerationMode,
    priority: 'auto' as const,
    provider: providerConfig.provider,
    hasGeminiKey: providerConfig.hasGeminiKey,
    hasOpenAiKey: providerConfig.hasOpenAiKey,
    hasAiKey: providerConfig.hasAiKey,
    updatedAt: doc.data()?.updatedAt ?? null,
    updatedBy: doc.data()?.updatedBy ?? null,
  };
}

router.post('/boost-payments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const provider = normalizeBoostSandboxPaymentProvider(req.body?.provider);
    const amount = Math.round(Number(req.body?.amount) || 0);
    const title = String(req.body?.title ?? 'Surf Boost').trim() || 'Surf Boost';
    if (!Number.isFinite(amount) || amount < 1000) {
      res.status(400).json({ error: 'Số tiền thanh toán sandbox không hợp lệ' });
      return;
    }

    const db = getDb();
    const docRef = db.collection(BOOST_PAYMENT_SESSIONS_COLLECTION).doc();
    let orderId = createGatewayOrderId(provider);
    let paymentUrl = '';

    if (provider === 'vnpay') {
      paymentUrl = await createVnpayPaymentUrl(req, orderId, amount, title);
    } else if (provider === 'momo') {
      paymentUrl = await createMomoPaymentUrl(req, orderId, amount, title);
    } else {
      const zaloPayOrder = await createZaloPayPaymentUrl(req, orderId, amount, title, req.uid!);
      orderId = zaloPayOrder.gatewayOrderId;
      paymentUrl = zaloPayOrder.paymentUrl;
    }

    const session: BoostPaymentSessionData = {
      userId: req.uid!,
      provider,
      status: 'pending',
      orderId,
      amount,
      title,
      paymentUrl,
      clientReturnUrl: getClientReturnUrl(req, req.body?.clientReturnUrl),
      consumed: false,
      consumedByListingId: null,
      gatewayTransactionId: null,
      gatewayResponseCode: null,
      gatewayPayload: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      paidAt: null,
    };
    await docRef.set(session);
    res.status(201).json({
      paymentId: docRef.id,
      provider,
      orderId,
      amount,
      status: session.status,
      paymentUrl,
    });
  } catch (e) {
    res.status((e as Error & { statusCode?: number }).statusCode ?? 500).json({ error: (e as Error).message });
  }
});

router.get('/boost-payments/:paymentId/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const session = await getBoostPaymentSession(req.params.paymentId);
    if (!session || session.userId !== req.uid) {
      res.status(404).json({ error: 'Không tìm thấy giao dịch thanh toán sandbox' });
      return;
    }
    res.json({
      paymentId: session.id,
      provider: session.provider,
      orderId: session.orderId,
      amount: session.amount,
      status: session.status,
      consumed: session.consumed,
      paymentUrl: session.paymentUrl,
      gatewayResponseCode: session.gatewayResponseCode ?? null,
    });
  } catch (e) {
    res.status((e as Error & { statusCode?: number }).statusCode ?? 500).json({ error: (e as Error).message });
  }
});

router.get('/boost-payments/vnpay/return', async (req, res) => {
  try {
    const orderId = String(req.query.vnp_TxnRef ?? '');
    const valid = verifyVnpayQuery(req.query, getRequiredEnv('VNPAY_HASH_SECRET'));
    const paid =
      valid &&
      String(req.query.vnp_ResponseCode ?? '') === '00' &&
      String(req.query.vnp_TransactionStatus ?? '') === '00';
    const updated = await markBoostPaymentSession(orderId, {
      status: paid ? 'paid' : 'failed',
      paidAt: paid ? new Date() : null,
      gatewayTransactionId: String(req.query.vnp_TransactionNo ?? ''),
      gatewayResponseCode: String(req.query.vnp_ResponseCode ?? ''),
      gatewayPayload: toGatewayPayload(req.query),
    });
    if (!updated) {
      res.status(404).send('Không tìm thấy giao dịch Surf Boost.');
      return;
    }
    redirectPaymentResult(res, updated, paid ? 'success' : 'failed');
  } catch (e) {
    res.status(500).send((e as Error).message);
  }
});

router.get('/boost-payments/vnpay/ipn', async (req, res) => {
  try {
    const orderId = String(req.query.vnp_TxnRef ?? '');
    const valid = verifyVnpayQuery(req.query, getRequiredEnv('VNPAY_HASH_SECRET'));
    if (!valid) {
      res.json({ RspCode: '97', Message: 'Invalid Checksum' });
      return;
    }
    const session = await markBoostPaymentSession(orderId, {
      status:
        String(req.query.vnp_ResponseCode ?? '') === '00' &&
        String(req.query.vnp_TransactionStatus ?? '') === '00'
          ? 'paid'
          : 'failed',
      paidAt:
        String(req.query.vnp_ResponseCode ?? '') === '00' &&
        String(req.query.vnp_TransactionStatus ?? '') === '00'
          ? new Date()
          : null,
      gatewayTransactionId: String(req.query.vnp_TransactionNo ?? ''),
      gatewayResponseCode: String(req.query.vnp_ResponseCode ?? ''),
      gatewayPayload: toGatewayPayload(req.query),
    });
    if (!session) {
      res.json({ RspCode: '01', Message: 'Order not found' });
      return;
    }
    res.json({ RspCode: '00', Message: 'Confirm Success' });
  } catch (e) {
    res.json({ RspCode: '99', Message: (e as Error).message });
  }
});

router.get('/boost-payments/momo/return', async (req, res) => {
  try {
    const payload = req.query as Record<string, unknown>;
    const orderId = String(payload.orderId ?? '');
    const valid = verifyMomoResultPayload(payload);
    const paid = valid && String(payload.resultCode ?? '') === '0';
    const updated = await markBoostPaymentSession(orderId, {
      status: paid ? 'paid' : 'failed',
      paidAt: paid ? new Date() : null,
      gatewayTransactionId: String(payload.transId ?? ''),
      gatewayResponseCode: String(payload.resultCode ?? ''),
      gatewayPayload: toGatewayPayload(payload),
    });
    if (!updated) {
      res.status(404).send('Không tìm thấy giao dịch Surf Boost.');
      return;
    }
    redirectPaymentResult(res, updated, paid ? 'success' : 'failed');
  } catch (e) {
    res.status(500).send((e as Error).message);
  }
});

router.post('/boost-payments/momo/ipn', async (req, res) => {
  try {
    const payload = req.body as Record<string, unknown>;
    const valid = verifyMomoResultPayload(payload);
    if (valid) {
      const paid = String(payload.resultCode ?? '') === '0';
      await markBoostPaymentSession(String(payload.orderId ?? ''), {
        status: paid ? 'paid' : 'failed',
        paidAt: paid ? new Date() : null,
        gatewayTransactionId: String(payload.transId ?? ''),
        gatewayResponseCode: String(payload.resultCode ?? ''),
        gatewayPayload: toGatewayPayload(payload),
      });
    }
    res.json({ resultCode: valid ? 0 : 1, message: valid ? 'success' : 'invalid signature' });
  } catch (e) {
    res.status(500).json({ resultCode: 1, message: (e as Error).message });
  }
});

router.get('/boost-payments/zalopay/return', async (req, res) => {
  try {
    const payload = req.query as Record<string, unknown>;
    const valid = verifyZaloPayRedirectPayload(payload);
    const paid = valid && String(payload.status ?? '') === '1';
    const updated = await markBoostPaymentSession(String(payload.apptransid ?? ''), {
      status: paid ? 'paid' : 'failed',
      paidAt: paid ? new Date() : null,
      gatewayTransactionId: String(payload.zptransid ?? ''),
      gatewayResponseCode: String(payload.status ?? ''),
      gatewayPayload: toGatewayPayload(payload),
    });
    if (!updated) {
      res.status(404).send('Không tìm thấy giao dịch Surf Boost.');
      return;
    }
    redirectPaymentResult(res, updated, paid ? 'success' : 'failed');
  } catch (e) {
    res.status(500).send((e as Error).message);
  }
});

router.post('/boost-payments/zalopay/callback', async (req, res) => {
  try {
    const data = String(req.body?.data ?? '');
    const mac = String(req.body?.mac ?? '');
    const valid = verifyZaloPayCallbackPayload(data, mac);
    if (!valid) {
      res.json({ returncode: -1, returnmessage: 'invalid mac' });
      return;
    }
    const parsed = JSON.parse(data) as Record<string, unknown>;
    const orderId = String(parsed.apptransid ?? parsed.app_trans_id ?? '');
    await markBoostPaymentSession(orderId, {
      status: 'paid',
      paidAt: new Date(),
      gatewayTransactionId: String(parsed.zptransid ?? parsed.zp_trans_id ?? ''),
      gatewayResponseCode: '1',
      gatewayPayload: toGatewayPayload(parsed),
    });
    res.json({ returncode: 1, returnmessage: 'success' });
  } catch (e) {
    res.status(500).json({ returncode: 0, returnmessage: (e as Error).message });
  }
});

// ── POST /api/marketplace — Đăng tin bán ─────────────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const {
      title,
      description = '',
      price = 0,
      category = 'other',
      condition = 'good',
      mediaUrls = [],
      images = [],
      location = '',
      brand = '',
      productType = '',
      material = '',
      availability = 'in_stock',
      saleStatus = 'available',
      tags = [],
      sku = '',
      meetingPreferences = [],
      hideFromFriends = false,
      boostEnabled = false,
      boostPlan = null,
      boostPaymentProvider = null,
      boostPaymentId = null,
    } = req.body;

    if (!title?.trim()) {
      res.status(400).json({ error: 'Tiêu đề là bắt buộc' });
      return;
    }
    if (!VALID_CATEGORIES.includes(category)) {
      res.status(400).json({ error: 'Danh mục không hợp lệ' });
      return;
    }
    if (!VALID_CONDITIONS.includes(condition)) {
      res.status(400).json({ error: 'Tình trạng không hợp lệ' });
      return;
    }
    const priceValue = Number(price);
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      res.status(400).json({ error: 'Giá không hợp lệ' });
      return;
    }

    const userDoc = await db.collection('users').doc(req.uid!).get();
    const user = userDoc.data();

    const listingMediaUrls = normalizeMediaUrls(
      Array.isArray(mediaUrls) && mediaUrls.length > 0 ? mediaUrls : images
    );
    const listingTags = Array.isArray(tags)
      ? tags
          .map((tag) => String(tag).trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];
    const listingMeetingPreferences = Array.isArray(meetingPreferences)
      ? meetingPreferences
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];
    const normalizedListingTitle = normalizeTitle(title);
    await assertMarketplaceSellerEligibility(
      db,
      req.uid!,
      user ?? {},
      normalizedListingTitle,
      listingMediaUrls
    );
    const requestedBoostPlan = Boolean(boostEnabled) ? normalizeBoostPlan(boostPlan) : null;
    const listingBoostEnabled = Boolean(requestedBoostPlan?.dailyBudget);
    const sandboxPaymentProvider = listingBoostEnabled
      ? normalizeBoostSandboxPaymentProvider(boostPaymentProvider)
      : null;
    const boostTotals = requestedBoostPlan ? getBoostTotals(requestedBoostPlan) : null;
    const moderationSettings = await getModerationSettings(db);
    const moderationReason =
      moderationSettings.mode === 'manual'
        ? 'Admin đã bật chế độ kiểm duyệt thủ công.'
        : 'AI đang kiểm duyệt trong nền.';
    const moderationFlags =
      moderationSettings.mode === 'manual' ? ['manual_mode'] : ['ai_moderation_queued'];

    const docRef = db.collection('marketplace').doc();
    const boostCampaignRef = listingBoostEnabled
      ? db.collection(BOOST_CAMPAIGNS_COLLECTION).doc()
      : null;
    const paidBoostPayment =
      listingBoostEnabled && boostTotals
        ? await assertPaidBoostPaymentSession(
            boostPaymentId,
            req.uid!,
            sandboxPaymentProvider!,
            boostTotals.total
          )
        : null;
    const listing: ListingData = {
      sellerId: req.uid!,
      sellerDisplayName: user?.displayName ?? 'Ẩn danh',
      sellerPhotoURL: user?.photoURL ?? null,
      title: title.trim(),
      titleNormalized: normalizedListingTitle,
      searchTokens: getMarketplaceSearchTokens(
        title,
        description,
        category,
        brand,
        productType,
        material,
        location,
        listingTags.join(' ')
      ),
      description: description.trim(),
      price: priceValue,
      currency: 'VND',
      category: category as Category,
      condition: condition as Condition,
      mediaUrls: listingMediaUrls,
      location: location.trim(),
      brand: String(brand).trim(),
      productType: String(productType).trim(),
      material: String(material).trim(),
      availability: availability === 'single_item' ? 'single_item' : 'in_stock',
      saleStatus: saleStatus === 'pending' ? 'pending' : 'available',
      tags: listingTags,
      sku: String(sku).trim(),
      meetingPreferences: listingMeetingPreferences,
      hideFromFriends: Boolean(hideFromFriends),
      boostEnabled: listingBoostEnabled,
      boostPlan: requestedBoostPlan,
      boostStatus: listingBoostEnabled ? 'awaiting_moderation' : 'none',
      boostCampaignId: boostCampaignRef?.id ?? null,
      boostStartedAt: null,
      boostEndsAt: null,
      boostPaymentMode: listingBoostEnabled ? 'sandbox' : null,
      boostPaymentStatus: listingBoostEnabled ? 'paid' : 'none',
      boostPaymentProvider: sandboxPaymentProvider,
      boostBudgetTotal: boostTotals?.budgetTotal ?? 0,
      boostEstimatedTax: boostTotals?.estimatedTax ?? 0,
      boostTotal: boostTotals?.total ?? 0,
      boostMetrics: createBoostMetrics(),
      boostScore: 0,
      status: 'pending',
      savedBy: [],
      viewCount: 0,
      moderationMode: moderationSettings.mode,
      moderationResult: null,
      moderationReason,
      moderationFlags,
      moderatedBy: null,
      moderatedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const writes: Promise<unknown>[] = [docRef.set(listing)];
    if (boostCampaignRef && requestedBoostPlan && boostTotals) {
      const campaign: BoostCampaignData = {
        listingId: docRef.id,
        sellerId: req.uid!,
        status: 'awaiting_moderation',
        plan: requestedBoostPlan,
        paymentMode: 'sandbox',
        paymentStatus: 'paid',
        sandboxPaymentProvider,
        sandboxPaymentId: paidBoostPayment?.id ?? null,
        budgetTotal: boostTotals.budgetTotal,
        estimatedTax: boostTotals.estimatedTax,
        total: boostTotals.total,
        metrics: createBoostMetrics(),
        startsAt: null,
        endsAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      writes.push(boostCampaignRef.set(campaign));
    }
    if (paidBoostPayment) {
      writes.push(
        db.collection(BOOST_PAYMENT_SESSIONS_COLLECTION).doc(paidBoostPayment.id).update({
          consumed: true,
          consumedByListingId: docRef.id,
          updatedAt: new Date(),
        })
      );
    }
    await Promise.all(writes);
    await invalidateMarketplaceUserCache(req.uid);
    res.status(201).json({ id: docRef.id, ...listing });

    if (moderationSettings.mode === 'auto') {
      enqueueMarketplaceAiModeration(docRef.id, listing);
    }
  } catch (e) {
    const error = e as Error & {
      statusCode?: number;
      eligibility?: MarketplaceSellerEligibilityResult;
    };
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) console.error('Marketplace listing creation failed:', error);
    res.status(statusCode).json({
      error: error.message,
      ...(error.eligibility ? { eligibility: error.eligibility } : {}),
    });
  }
});

router.get('/categories', requireAuth, async (_req: AuthRequest, res) => {
  res.json({ items: MARKETPLACE_CATEGORIES });
});

router.get('/seller-eligibility', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const userDoc = await db.collection('users').doc(req.uid!).get();
    const eligibility = await getMarketplaceSellerEligibility(
      db,
      req.uid!,
      userDoc.data() ?? {}
    );
    res.json(eligibility);
  } catch (e) {
    console.error('Marketplace seller eligibility check failed:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /api/marketplace/my — Tin của tôi ────────────────────────────────────
// Phải đặt TRƯỚC /:id để tránh bị override
router.get('/my', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { cursor, status = 'active', limit } = req.query;
    const pageSize = Math.max(1, Math.min(50, Number(limit) || 10));
    const selectedFilter = typeof status === 'string' ? status : 'active';
    const cursorId = typeof cursor === 'string' ? cursor : '';
    const userCacheVersion = await getMarketplaceCacheVersion(`user:${req.uid}`);
    const cacheKey = getMarketplaceCacheKey('my', {
      schema: 2,
      v: userCacheVersion,
      uid: req.uid,
      cursor: cursorId,
      status: selectedFilter,
      limit: pageSize,
    });
    const cached = await getMarketplaceCache<MarketplaceMyResponse>(cacheKey);
    if (cached) {
      setMarketplaceCacheHeader(res, 'HIT');
      res.json(cached);
      return;
    }

    if (cursorId.trim()) {
      const scanLimit = Math.max(pageSize, Math.min(50, pageSize * 5));
      let pageQuery: Query<DocumentData> = db
        .collection('marketplace')
        .where('sellerId', '==', req.uid!)
        .orderBy('createdAt', 'desc')
        .limit(scanLimit);

      const cursorDoc = await db.collection('marketplace').doc(cursorId).get();
      if (cursorDoc.exists) pageQuery = pageQuery.startAfter(cursorDoc);

      try {
        const pageSnap = await pageQuery.get();
        const pageItems = pageSnap.docs
          .map(listingFromDoc)
          .filter((item) => matchesMyListingsFilter(item, selectedFilter))
          .slice(0, pageSize);
        const nextCursor =
          pageSnap.docs.length === scanLimit ? pageSnap.docs[pageSnap.docs.length - 1].id : null;
        const payload: MarketplaceMyResponse = { items: pageItems, nextCursor };
        await setMarketplaceCache(cacheKey, payload, MARKETPLACE_USER_CACHE_TTL_SECONDS);
        setMarketplaceCacheHeader(res, 'MISS');
        res.json(payload);
        return;
      } catch {}
    }

    const snap = await db
      .collection('marketplace')
      .where('sellerId', '==', req.uid!)
      .limit(200)
      .get();
    const ownerItems = snap.docs
      .map(listingFromDoc)
      .filter((item) => item.status !== 'deleted')
      .sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
    const normalItems = ownerItems.filter((item) => !isMarketplaceSpamOrErrorListing(item));
    const pendingReviewItems = ownerItems.filter(isMarketplacePendingReviewListing);
    const spamOrErrorItems = ownerItems.filter(isMarketplaceSpamOrErrorListing);
    const statusCounts = {
      all: normalItems.length,
      error: spamOrErrorItems.length,
      active: ownerItems.filter((item) => item.status === 'active').length,
      pending: pendingReviewItems.length,
      rejected: ownerItems.filter((item) => item.status === 'rejected').length,
      sold: ownerItems.filter((item) => item.status === 'sold').length,
      boosted: ownerItems.filter(hasMarketplaceBoostPromotion).length,
      boosting: ownerItems.filter(isBoostActive).length,
    };
    const summary = ownerItems.reduce(
      (acc, item) => ({
        views: acc.views + (item.viewCount ?? 0),
        saves: acc.saves + (item.savedBy?.length ?? 0),
        activeBoosts:
          acc.activeBoosts + (isBoostActive(item) ? 1 : 0),
        boostImpressions: acc.boostImpressions + (item.boostMetrics?.impressions ?? 0),
        boostSpent: acc.boostSpent + (item.boostMetrics?.spent ?? 0),
      }),
      { views: 0, saves: 0, activeBoosts: 0, boostImpressions: 0, boostSpent: 0 }
    );
    const allItems = ownerItems.filter((item) =>
      matchesMyListingsFilter(item, selectedFilter)
    );
    const cursorIndex = cursorId ? allItems.findIndex((item) => item.id === cursorId) : -1;
    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const endIndex = startIndex + pageSize;
    const pageItems = allItems.slice(startIndex, endIndex);
    const nextCursor =
      allItems.length > endIndex ? (pageItems[pageItems.length - 1]?.id ?? null) : null;

    const payload: MarketplaceMyResponse = {
      items: pageItems,
      nextCursor,
      counts: statusCounts,
      summary,
    };
    await setMarketplaceCache(cacheKey, payload, MARKETPLACE_USER_CACHE_TTL_SECONDS);
    setMarketplaceCacheHeader(res, 'MISS');
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /api/marketplace/saved — Tin đã lưu ──────────────────────────────────
router.get('/saved', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { cursor } = req.query;
    const cursorId = typeof cursor === 'string' ? cursor : '';
    const savedCacheVersion = await getMarketplaceCacheVersion(`saved:${req.uid}`);
    const cacheKey = getMarketplaceCacheKey('saved', {
      v: savedCacheVersion,
      uid: req.uid,
      cursor: cursorId,
    });
    const cached = await getMarketplaceCache<MarketplaceListResponse>(cacheKey);
    if (cached) {
      setMarketplaceCacheHeader(res, 'HIT');
      res.json(cached);
      return;
    }

    const loadFallback = async () => {
      const snap = await db
        .collection('marketplace')
        .where('savedBy', 'array-contains', req.uid!)
        .limit(PAGE_SIZE * 5)
        .get();
      const allItems = sortListingsByCreatedAt(
        snap.docs.map(listingFromDoc).filter((item) => item.status === 'active')
      );
      const cursorIndex = cursorId ? allItems.findIndex((item) => item.id === cursorId) : -1;
      const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      const items = allItems.slice(startIndex, startIndex + PAGE_SIZE);
      const nextCursor =
        allItems.length > startIndex + PAGE_SIZE ? (items[items.length - 1]?.id ?? null) : null;
      return { items, nextCursor };
    };

    let items: ListingItem[] = [];
    let nextCursor: string | null = null;
    try {
      let query = db
        .collection('marketplace')
        .where('savedBy', 'array-contains', req.uid!)
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(PAGE_SIZE);

      if (cursorId) {
        const cursorDoc = await db.collection('marketplace').doc(cursorId).get();
        if (cursorDoc.exists) query = query.startAfter(cursorDoc);
      }

      const snap = await query.get();
      items = sortListingsByCreatedAt(snap.docs.map(listingFromDoc));
      nextCursor = snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1].id : null;
    } catch {
      const fallback = await loadFallback();
      items = fallback.items;
      nextCursor = fallback.nextCursor;
    }

    const payload: MarketplaceListResponse = { items, nextCursor };
    await setMarketplaceCache(cacheKey, payload, MARKETPLACE_SAVED_CACHE_TTL_SECONDS);
    setMarketplaceCacheHeader(res, 'MISS');
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /api/marketplace/search — Tìm kiếm ───────────────────────────────────
router.get('/search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const raw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';

    if (!raw) {
      res.json({ items: [], nextCursor: null });
      return;
    }

    const validCategory =
      category && VALID_CATEGORIES.includes(category as Category)
        ? (category as Category)
        : undefined;
    const searchCacheVersion = await getMarketplaceCacheVersion('search');
    const cacheKey = getMarketplaceCacheKey('search', {
      v: searchCacheVersion,
      q: normalizeTitle(raw),
      category: validCategory ?? 'all',
    });
    const cached = await getMarketplaceCache<MarketplaceListResponse>(cacheKey);
    if (cached) {
      queueMarketplaceImpressions(cached.items, req.uid);
      setMarketplaceCacheHeader(res, 'HIT');
      res.json(cached);
      return;
    }

    const items = await searchPublicListings(db, raw, validCategory);
    queueMarketplaceImpressions(items, req.uid);
    const payload: MarketplaceListResponse = { items, nextCursor: null };
    await setMarketplaceCache(cacheKey, payload, MARKETPLACE_SEARCH_CACHE_TTL_SECONDS);
    setMarketplaceCacheHeader(res, 'MISS');
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /api/marketplace — Danh sách tin (cursor pagination) ──────────────────
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { cursor, category } = req.query;
    const rawSearch = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const validCategory =
      category && typeof category === 'string' && VALID_CATEGORIES.includes(category as Category)
        ? (category as Category)
        : undefined;
    const cursorId = typeof cursor === 'string' ? cursor : '';

    let query = db
      .collection('marketplace')
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(PAGE_SIZE);
    if (validCategory) {
      query = db
        .collection('marketplace')
        .where('status', '==', 'active')
        .where('category', '==', validCategory)
        .orderBy('createdAt', 'desc')
        .orderBy(FieldPath.documentId(), 'desc')
        .limit(PAGE_SIZE);
    }

    if (rawSearch) {
      const searchCacheVersion = await getMarketplaceCacheVersion('search');
      const cacheKey = getMarketplaceCacheKey('search', {
        v: searchCacheVersion,
        q: normalizeTitle(rawSearch),
        category: validCategory ?? 'all',
      });
      const cached = await getMarketplaceCache<MarketplaceListResponse>(cacheKey);
      if (cached) {
        queueMarketplaceImpressions(cached.items, req.uid);
        setMarketplaceCacheHeader(res, 'HIT');
        res.json(cached);
        return;
      }

      const items = await searchPublicListings(db, rawSearch, validCategory);
      queueMarketplaceImpressions(items, req.uid);
      const payload: MarketplaceListResponse = { items, nextCursor: null };
      await setMarketplaceCache(cacheKey, payload, MARKETPLACE_SEARCH_CACHE_TTL_SECONDS);
      setMarketplaceCacheHeader(res, 'MISS');
      res.json(payload);
      return;
    }

    const publicCacheVersion = await getMarketplaceCacheVersion('public');
    const cacheKey = getMarketplaceCacheKey('public-list', {
      v: publicCacheVersion,
      category: validCategory ?? 'all',
      cursor: cursorId,
    });
    const cached = await getMarketplaceCache<MarketplaceListResponse>(cacheKey);
    if (cached) {
      queueMarketplaceImpressions(cached.items, req.uid);
      setMarketplaceCacheHeader(res, 'HIT');
      res.json(cached);
      return;
    }

    let snap;
    try {
      const decodedCursor = decodePublicListingsCursor(cursor);
      if (decodedCursor) {
        query = query.startAfter(Timestamp.fromMillis(decodedCursor.createdAt), decodedCursor.id);
      }
      snap = await query.get();
    } catch {
      const fallback = await getPublicListingsFallback(db, validCategory, cursor);
      queueMarketplaceImpressions(fallback.items, req.uid);
      await setMarketplaceCache(cacheKey, fallback, MARKETPLACE_PUBLIC_CACHE_TTL_SECONDS);
      setMarketplaceCacheHeader(res, 'MISS');
      res.json(fallback);
      return;
    }
    const items = sortPublicListings(snap.docs.map(listingFromDoc));
    const nextCursor =
      snap.docs.length === PAGE_SIZE
        ? encodePublicListingsCursor(snap.docs[snap.docs.length - 1])
        : null;

    queueMarketplaceImpressions(items, req.uid);

    const payload: MarketplaceListResponse = { items, nextCursor };
    await setMarketplaceCache(cacheKey, payload, MARKETPLACE_PUBLIC_CACHE_TTL_SECONDS);
    setMarketplaceCacheHeader(res, 'MISS');
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/moderation/access', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const isAdmin = await isMarketplaceAdmin(db, req.uid);
    res.json({ isAdmin, settings: isAdmin ? await getModerationSettings(db) : null });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/moderation/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireMarketplaceAdmin(req, res))) return;
    const db = getDb();
    const settings = await getModerationSettings(db);
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/moderation/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireMarketplaceAdmin(req, res))) return;
    const db = getDb();
    const mode = req.body?.mode === 'manual' ? 'manual' : req.body?.mode === 'auto' ? 'auto' : null;
    if (!mode) {
      res.status(400).json({ error: 'Chế độ kiểm duyệt không hợp lệ' });
      return;
    }
    await db.collection(MODERATION_SETTINGS_COLLECTION).doc(MODERATION_SETTINGS_DOC).set(
      {
        mode,
        priority: 'auto',
        provider: getMarketplaceModerationProviderConfig().provider,
        updatedAt: new Date(),
        updatedBy: req.uid,
      },
      { merge: true }
    );
    res.json(await getModerationSettings(db));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/moderation/pending', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireMarketplaceAdmin(req, res))) return;
    const db = getDb();
    const rawStatus = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const status: ListingStatus =
      rawStatus === 'rejected' ? 'rejected' : rawStatus === 'active' ? 'active' : 'pending';
    const snap = await db
      .collection('marketplace')
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    res.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/moderation/bulk-approve-ai-failed', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireMarketplaceAdmin(req, res))) return;
    const db = getDb();
    const limit = Math.max(1, Math.min(100, Number(req.body?.limit) || 100));
    const demoOnly = req.body?.demoOnly !== false;
    const snap = await db
      .collection('marketplace')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    const now = new Date();
    const eligible = snap.docs
      .map((doc) => ({ doc, listing: doc.data() as ListingData }))
      .filter(({ listing }) => isAiInfrastructureModerationFailure(listing))
      .filter(({ listing }) => !demoOnly || isDemoSeedListing(listing));

    await Promise.all(
      eligible.map(async ({ doc, listing }) => {
        await doc.ref.update({
          status: 'active',
          moderatedBy: 'admin',
          moderatedAt: now,
          reviewedBy: req.uid,
          reviewedAt: now,
          moderationReason: demoOnly
            ? 'Admin duyệt nhanh demo do Gemini hết quota/rate limit.'
            : 'Admin duyệt nhanh do lỗi hạ tầng AI moderation.',
          updatedAt: now,
        });
        await activateBoostIfEligible(doc.id, { ...listing, status: 'active' });
      })
    );

    const updatedDocs = await Promise.all(eligible.map(({ doc }) => doc.ref.get()));
    await Promise.all(
      updatedDocs.map((doc) => invalidateMarketplaceListingCaches(doc.data() as ListingData))
    );
    res.json({
      updated: updatedDocs.length,
      demoOnly,
      items: updatedDocs.map((doc) => ({ id: doc.id, ...doc.data() })),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/moderation/:id/rerun-ai', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireMarketplaceAdmin(req, res))) return;
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }

    const listing = doc.data() as ListingData;
    const moderationResult = sanitizeModerationResult(
      await moderateMarketplaceListing({
        title: listing.title,
        description: listing.description,
        price: listing.price,
        category: listing.category,
        condition: listing.condition,
        location: listing.location,
        mediaUrls: Array.isArray(listing.mediaUrls) ? listing.mediaUrls : [],
      })
    );
    const status = getStatusFromModerationResult(moderationResult);

    await ref.update({
      status,
      moderationMode: 'auto',
      moderationResult,
      moderationReason: moderationResult.reason ?? null,
      moderationFlags: moderationResult.flags,
      moderatedBy: 'ai',
      moderatedAt: new Date(),
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: new Date(),
    });
    if (status === 'active') {
      await activateBoostIfEligible(req.params.id, { ...listing, status });
    } else if (status === 'rejected') {
      await cancelBoostCampaign(req.params.id, listing, 'rejected');
    }
    const updated = await ref.get();
    await invalidateMarketplaceListingCaches(updated.data() as ListingData);
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/moderation/:id/approve', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireMarketplaceAdmin(req, res))) return;
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }
    const listing = doc.data() as ListingData;
    await ref.update({
      status: 'active',
      moderatedBy: 'admin',
      moderatedAt: new Date(),
      reviewedBy: req.uid,
      reviewedAt: new Date(),
      moderationReason: req.body?.reason?.trim?.() || null,
      updatedAt: new Date(),
    });
    await activateBoostIfEligible(req.params.id, { ...listing, status: 'active' });
    const updated = await ref.get();
    await invalidateMarketplaceListingCaches(updated.data() as ListingData);
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/moderation/:id/reject', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireMarketplaceAdmin(req, res))) return;
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim()
        : 'Không phù hợp chính sách Marketplace';
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }
    const listing = doc.data() as ListingData;
    await ref.update({
      status: 'rejected',
      moderatedBy: 'admin',
      moderatedAt: new Date(),
      reviewedBy: req.uid,
      reviewedAt: new Date(),
      moderationReason: reason,
      moderationFlags: FieldValue.arrayUnion('admin_rejected'),
      updatedAt: new Date(),
    });
    await cancelBoostCampaign(req.params.id, listing, 'rejected');
    const updated = await ref.get();
    await invalidateMarketplaceListingCaches(updated.data() as ListingData);
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /api/marketplace/:id — Chi tiết tin ───────────────────────────────────
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const detailCacheVersion = await getMarketplaceCacheVersion('detail');
    const cacheKey = getMarketplaceCacheKey('detail', {
      v: detailCacheVersion,
      id: req.params.id,
    });
    const cached = await getMarketplaceCache<ListingItem>(cacheKey);
    if (cached?.status === 'active') {
      void queueMarketplaceMetricEvent(req.params.id, cached, 'view', req.uid);
      void queueMarketplaceMetricEvent(req.params.id, cached, 'click', req.uid);
      setMarketplaceCacheHeader(res, 'HIT');
      res.json(cached);
      return;
    }

    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }

    const listing = doc.data() as ListingData;
    const canViewPrivateListing =
      listing.sellerId === req.uid || (await isMarketplaceAdmin(db, req.uid));
    if (listing.status !== 'active' && !canViewPrivateListing) {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }

    if (listing.status === 'active') {
      void queueMarketplaceMetricEvent(req.params.id, listing, 'view', req.uid);
      void queueMarketplaceMetricEvent(req.params.id, listing, 'click', req.uid);
      const payload: ListingItem = { id: doc.id, ...listing };
      await setMarketplaceCache(cacheKey, payload, MARKETPLACE_DETAIL_CACHE_TTL_SECONDS);
      setMarketplaceCacheHeader(res, 'MISS');
      res.json(payload);
      return;
    }

    setMarketplaceCacheHeader(res, 'BYPASS');
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/boost', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }
    if (doc.data()?.sellerId !== req.uid) {
      res.status(403).json({ error: 'Không có quyền quảng bá tin này' });
      return;
    }

    const listing = doc.data() as ListingData;
    if (listing.status !== 'active') {
      res
        .status(400)
        .json({ error: 'Chỉ có thể quảng bá bài niêm yết đã được duyệt và đang hoạt động' });
      return;
    }
    if (isBoostActive(listing)) {
      res.status(409).json({ error: 'Bài niêm yết này đang được quảng bá' });
      return;
    }

    const requestedBoostPlan = normalizeBoostPlan(req.body?.boostPlan);
    if (!requestedBoostPlan?.dailyBudget) {
      res.status(400).json({ error: 'Gói quảng bá không hợp lệ' });
      return;
    }

    const boostTotals = getBoostTotals(requestedBoostPlan);
    const sandboxPaymentProvider = normalizeBoostSandboxPaymentProvider(
      req.body?.boostPaymentProvider ?? req.body?.sandboxPaymentProvider
    );
    const paidBoostPayment = await assertPaidBoostPaymentSession(
      req.body?.boostPaymentId,
      req.uid!,
      sandboxPaymentProvider,
      boostTotals.total
    );
    const now = new Date();
    const boostCampaignRef = db.collection(BOOST_CAMPAIGNS_COLLECTION).doc();
    const listingUpdate = {
      boostEnabled: true,
      boostPlan: requestedBoostPlan,
      boostStatus: 'awaiting_moderation' as BoostStatus,
      boostCampaignId: boostCampaignRef.id,
      boostStartedAt: null,
      boostEndsAt: null,
      boostPaymentMode: 'sandbox' as BoostPaymentMode,
      boostPaymentStatus: 'paid' as BoostPaymentStatus,
      boostPaymentProvider: sandboxPaymentProvider,
      boostBudgetTotal: boostTotals.budgetTotal,
      boostEstimatedTax: boostTotals.estimatedTax,
      boostTotal: boostTotals.total,
      boostMetrics: createBoostMetrics(),
      boostScore: 0,
      updatedAt: now,
    };
    const campaign: BoostCampaignData = {
      listingId: req.params.id,
      sellerId: req.uid!,
      status: 'awaiting_moderation',
      plan: requestedBoostPlan,
      paymentMode: 'sandbox',
      paymentStatus: 'paid',
      sandboxPaymentProvider,
      sandboxPaymentId: paidBoostPayment.id,
      budgetTotal: boostTotals.budgetTotal,
      estimatedTax: boostTotals.estimatedTax,
      total: boostTotals.total,
      metrics: createBoostMetrics(),
      startsAt: null,
      endsAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await Promise.all([
      ref.update(listingUpdate),
      boostCampaignRef.set(campaign),
      db.collection(BOOST_PAYMENT_SESSIONS_COLLECTION).doc(paidBoostPayment.id).update({
        consumed: true,
        consumedByListingId: req.params.id,
        updatedAt: now,
      }),
    ]);
    await activateBoostIfEligible(req.params.id, { ...listing, ...listingUpdate });
    const updated = await ref.get();
    await invalidateMarketplaceListingCaches(updated.data() as ListingData);
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/:id/boost/pause', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }
    if (doc.data()?.sellerId !== req.uid) {
      res.status(403).json({ error: 'Không có quyền ngưng quảng bá tin này' });
      return;
    }

    const listing = doc.data() as ListingData;
    if (!isBoostActive(listing)) {
      res.status(400).json({ error: 'Chỉ có thể ngưng chiến dịch đang quảng bá' });
      return;
    }
    if (!listing.boostCampaignId) {
      res.status(400).json({ error: 'Không tìm thấy chiến dịch quảng bá' });
      return;
    }

    await pauseBoostCampaign(req.params.id, listing);
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status((e as Error & { statusCode?: number }).statusCode ?? 500).json({ error: (e as Error).message });
  }
});

router.patch('/:id/boost/resume', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }
    if (doc.data()?.sellerId !== req.uid) {
      res.status(403).json({ error: 'Không có quyền bật lại quảng bá tin này' });
      return;
    }

    const listing = doc.data() as ListingData;
    if (listing.status !== 'active') {
      res.status(400).json({ error: 'Chỉ có thể bật lại quảng bá cho tin đang hoạt động' });
      return;
    }
    if (listing.boostStatus !== 'paused' || !listing.boostEnabled) {
      res.status(400).json({ error: 'Chiến dịch quảng bá chưa ở trạng thái tạm ngưng' });
      return;
    }
    if (!listing.boostCampaignId || !listing.boostPlan) {
      res.status(400).json({ error: 'Không tìm thấy chiến dịch quảng bá' });
      return;
    }

    const resumeDeadline = getBoostResumeDeadline(listing);
    if (!resumeDeadline || resumeDeadline <= Date.now()) {
      res.status(400).json({ error: 'Chiến dịch quảng bá đã hết hạn nên không thể bật lại' });
      return;
    }

    await resumeBoostCampaign(req.params.id, listing);
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status((e as Error & { statusCode?: number }).statusCode ?? 500).json({ error: (e as Error).message });
  }
});

router.patch('/:id/sell', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }
    if (doc.data()?.sellerId !== req.uid) {
      res.status(403).json({ error: 'Không có quyền chỉnh sửa' });
      return;
    }

    const listing = doc.data() as ListingData;
    if (listing.status !== 'active') {
      res.status(400).json({ error: 'Chỉ có thể đánh dấu đã bán với tin đang hoạt động' });
      return;
    }

    await ref.update({ status: 'sold', saleStatus: 'available', updatedAt: new Date() });
    await cancelBoostCampaign(req.params.id, listing, 'completed');
    const updated = await ref.get();
    await invalidateMarketplaceListingCaches(updated.data() as ListingData);
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/report', requireAuth, async (req: AuthRequest, res) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      res.status(400).json({ error: 'Vui lòng nhập lý do báo cáo' });
      return;
    }

    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }

    const listing = doc.data() as ListingData;
    if (listing.sellerId === req.uid) {
      res.status(400).json({ error: 'Không thể báo cáo bài niêm yết của chính bạn' });
      return;
    }

    const reportRef = db.collection('marketplace_reports').doc();
    await reportRef.set({
      listingId: req.params.id,
      reporterId: req.uid,
      sellerId: listing.sellerId,
      reason,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    res.status(201).json({ reportId: reportRef.id });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:id/conversations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }

    const listing = doc.data() as ListingData;
    if (listing.sellerId !== req.uid) {
      res.status(403).json({ error: 'Không có quyền xem tin nhắn của bài niêm yết này' });
      return;
    }

    const items = await listMarketplaceConversationsForListing(req.uid!, req.params.id, 50);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/contact', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status !== 'active') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }

    const listing = doc.data() as ListingData;
    if (listing.sellerId === req.uid) {
      res.status(400).json({ error: 'Không thể nhắn tin cho chính bạn' });
      return;
    }

    const conversationResult = await createOrGetMarketplaceConversation(
      req.uid!,
      listing.sellerId,
      getMarketplaceConversationContext(req.params.id, listing, req.uid!)
    );
    if (!conversationResult.ok) {
      if (conversationResult.reason === 'invalid_peer') {
        res.status(400).json({ error: 'Người bán không hợp lệ' });
        return;
      }
      if (conversationResult.reason === 'peer_not_found') {
        res.status(404).json({ error: 'Không tìm thấy người bán' });
        return;
      }
      res.status(403).json({ error: 'Blocked users cannot interact', code: 'USER_BLOCKED' });
      return;
    }

    const messageText = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!messageText) {
      res.status(conversationResult.created ? 201 : 200).json({
        created: conversationResult.created,
        item: toApiConversation(conversationResult.item),
      });
      return;
    }

    const messageResult = await sendTextMessage({
      conversationId: conversationResult.item.id,
      senderId: req.uid!,
      text: messageText,
    });
    if (!messageResult.ok) {
      if (messageResult.reason === 'invalid_text') {
        res.status(400).json({ error: 'Message text is invalid' });
        return;
      }
      if (messageResult.reason === 'not_found') {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      if (messageResult.reason === 'forbidden') {
        res.status(403).json({ error: 'You are not a member of this conversation' });
        return;
      }
      res.status(403).json({ error: 'Blocked users cannot interact', code: 'USER_BLOCKED' });
      return;
    }

    const payload = toRealtimeMessagePayload(messageResult.item);
    const muteSettingsByUser = await conversationRepository.getMuteSettingsByUser(conversationResult.item.id);
    const mutedBy = Object.entries(muteSettingsByUser)
      .filter(([, settings]) => settings.muteMessages)
      .map(([userId]) => userId);
    emitMessageNewToTargets(
      [req.uid!, ...messageResult.recipientIds],
      conversationResult.item.id,
      { ...payload, mutedBy }
    );
    const recipientCounts = await Promise.all(
      messageResult.recipientIds.map(async (uid) => ({
        uid,
        count: await getUnreadConversationCount(uid),
      }))
    );
    recipientCounts.forEach(({ uid, count }) => emitMessageUnreadCount(uid, count));
    emitMessageUnreadCount(req.uid!, await getUnreadConversationCount(req.uid!));

    res.status(201).json({
      created: conversationResult.created,
      item: toApiConversation(conversationResult.item),
      message: toApiMessage(messageResult.item),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── PATCH /api/marketplace/:id — Sửa tin ─────────────────────────────────────
router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }
    if (doc.data()?.sellerId !== req.uid) {
      res.status(403).json({ error: 'Không có quyền chỉnh sửa' });
      return;
    }

    const currentListing = doc.data() as ListingData;
    const {
      title,
      description,
      price,
      category,
      condition,
      mediaUrls,
      images,
      location,
      status,
      saleStatus,
      brand,
      productType,
      material,
      availability,
      tags,
      sku,
      meetingPreferences,
      hideFromFriends,
    } = req.body;
    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (title !== undefined) {
      update.title = title.trim();
      update.titleNormalized = normalizeTitle(title);
    }
    if (description !== undefined) update.description = description.trim();
    if (price !== undefined) update.price = Number(price);
    if (category !== undefined && VALID_CATEGORIES.includes(category)) update.category = category;
    if (condition !== undefined && VALID_CONDITIONS.includes(condition))
      update.condition = condition;
    if (mediaUrls !== undefined || images !== undefined)
      update.mediaUrls = normalizeMediaUrls(mediaUrls ?? images);
    if (location !== undefined) update.location = location.trim();
    if (brand !== undefined) update.brand = String(brand).trim();
    if (productType !== undefined) update.productType = String(productType).trim();
    if (material !== undefined) update.material = String(material).trim();
    if (availability !== undefined) update.availability = availability === 'single_item' ? 'single_item' : 'in_stock';
    if (tags !== undefined) {
      update.tags = Array.isArray(tags)
        ? tags
            .map((tag) => String(tag).trim())
            .filter(Boolean)
            .slice(0, 20)
        : [];
    }
    if (sku !== undefined) update.sku = String(sku).trim();
    if (meetingPreferences !== undefined) {
      update.meetingPreferences = Array.isArray(meetingPreferences)
        ? meetingPreferences
            .map((item) => String(item).trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];
    }
    if (hideFromFriends !== undefined) update.hideFromFriends = Boolean(hideFromFriends);
    if (
      title !== undefined ||
      description !== undefined ||
      category !== undefined ||
      location !== undefined ||
      brand !== undefined ||
      productType !== undefined ||
      material !== undefined ||
      tags !== undefined
    ) {
      update.searchTokens = getMarketplaceSearchTokens(
        update.title ?? currentListing.title,
        update.description ?? currentListing.description,
        update.category ?? currentListing.category,
        update.brand ?? currentListing.brand,
        update.productType ?? currentListing.productType,
        update.material ?? currentListing.material,
        update.location ?? currentListing.location,
        Array.isArray(update.tags) ? update.tags.join(' ') : (currentListing.tags ?? []).join(' ')
      );
    }
    if (status === 'sold' && currentListing.status === 'active') {
      update.status = status;
      update.saleStatus = 'available';
    }
    if (status === 'active' && currentListing.status === 'sold') {
      update.status = status;
      update.saleStatus = 'available';
    }
    if (
      saleStatus !== undefined &&
      currentListing.status === 'active' &&
      (saleStatus === 'available' || saleStatus === 'pending')
    ) {
      update.saleStatus = saleStatus;
    }

    await ref.update(update);
    if (update.status === 'sold') {
      await cancelBoostCampaign(req.params.id, currentListing, 'completed');
    }
    const updated = await ref.get();
    await invalidateMarketplaceListingCaches(updated.data() as ListingData);
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── DELETE /api/marketplace/:id — Xóa mềm ────────────────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }
    if (doc.data()?.sellerId !== req.uid) {
      res.status(403).json({ error: 'Không có quyền xóa' });
      return;
    }

    const listing = doc.data() as ListingData;
    await ref.update({ status: 'deleted', updatedAt: new Date() });
    await cancelBoostCampaign(req.params.id, listing, 'cancelled');
    await invalidateMarketplaceListingCaches({ ...listing, status: 'deleted' });
    await deleteMarketplaceImages(listing.mediaUrls ?? []);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── POST /api/marketplace/:id/save — Lưu / bỏ lưu ───────────────────────────
router.post('/:id/save', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status !== 'active') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }

    const savedBy: string[] = doc.data()?.savedBy ?? [];
    const isSaved = savedBy.includes(req.uid!);
    const saved = !isSaved;

    if (isSaved) {
      await ref.update({ savedBy: FieldValue.arrayRemove(req.uid!) });
    } else {
      await ref.update({ savedBy: FieldValue.arrayUnion(req.uid!) });
      void queueMarketplaceMetricEvent(req.params.id, doc.data() as ListingData, 'save', req.uid);
    }
    const updated = await ref.get();
    await Promise.all([
      invalidateMarketplaceSavedCache(req.uid),
      invalidateMarketplaceListingCaches(updated.data() as ListingData),
    ]);
    res.json({ saved, item: { id: updated.id, ...updated.data() } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
