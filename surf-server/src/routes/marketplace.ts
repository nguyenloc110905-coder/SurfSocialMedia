import { createHash } from 'crypto';
import { Router, type Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { FieldValue, type DocumentData, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { moderateMarketplaceListing, type MarketplaceModerationResult } from '../services/aiModeration.js';
import {
  createOrGetDmConversation,
  getUnreadConversationCount,
  sendTextMessage,
  toApiConversation,
  toApiMessage,
  toRealtimeMessagePayload,
} from '../services/conversations.js';
import { emitMessageNew, emitMessageUnreadCount } from '../realtime/emitters/message.emitter.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Bỏ dấu tiếng Việt & chuyển thường để full-text search */
function normalizeTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getMarketplaceAiModerationDelayMs() {
  const configured = Number(process.env.MARKETPLACE_AI_MODERATION_DELAY_MS ?? 1500);
  return Number.isFinite(configured) ? Math.max(0, configured) : 1500;
}

const VALID_CATEGORIES = ['electronics', 'clothing', 'vehicles', 'property', 'home', 'sports', 'other'] as const;
const VALID_CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;
const MARKETPLACE_IMAGE_LIMIT = 5;
const PAGE_SIZE = 20;
const MODERATION_SETTINGS_COLLECTION = 'app_settings';
const MODERATION_SETTINGS_DOC = 'marketplace_moderation';
const BOOST_CAMPAIGNS_COLLECTION = 'marketplace_boost_campaigns';
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BOOST_PLACEMENTS = ['surf_feed', 'surf_market', 'surf_chat', 'surf_discovery'];
const AI_INFRASTRUCTURE_MODERATION_FLAGS = new Set([
  'missing_gemini_key',
  'invalid_gemini_key',
  'gemini_quota_exceeded',
  'gemini_model_unavailable',
  'gemini_unavailable',
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

type Category = typeof VALID_CATEGORIES[number];
type Condition = typeof VALID_CONDITIONS[number];
type ListingStatus = 'pending' | 'active' | 'rejected' | 'sold' | 'deleted';
type MarketplaceModerationMode = 'auto' | 'manual';
type ListingAvailability = 'in_stock' | 'single_item';
type SellerSaleStatus = 'available' | 'pending';
type BoostStatus = 'none' | 'awaiting_moderation' | 'active' | 'completed' | 'cancelled' | 'rejected';
type BoostPaymentMode = 'sandbox' | 'live';
type BoostPaymentStatus = 'none' | 'sandbox_authorized' | 'sandbox_voided' | 'paid' | 'refunded';

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

interface ListingData {
  sellerId: string;
  sellerDisplayName: string;
  sellerPhotoURL: string | null;
  title: string;
  titleNormalized: string;
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

interface BoostCampaignData {
  listingId: string;
  sellerId: string;
  status: BoostStatus;
  plan: BoostPlan;
  paymentMode: BoostPaymentMode;
  paymentStatus: BoostPaymentStatus;
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

function listingFromDoc(doc: QueryDocumentSnapshot<DocumentData>): ListingItem {
  return { id: doc.id, ...(doc.data() as ListingData) };
}

function normalizeMediaUrls(input: unknown) {
  return Array.isArray(input)
    ? input
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, MARKETPLACE_IMAGE_LIMIT)
    : [];
}

function getCloudinaryPublicId(url: string) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('res.cloudinary.com')) return null;
    const marker = '/image/upload/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const uploadPath = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    const parts = uploadPath.split('/').filter(Boolean);
    const versionIndex = parts.findIndex((part) => /^v\d+$/.test(part));
    const publicIdParts = versionIndex >= 0 ? parts.slice(versionIndex + 1) : parts;
    if (publicIdParts.length === 0) return null;
    const last = publicIdParts[publicIdParts.length - 1];
    publicIdParts[publicIdParts.length - 1] = last.replace(/\.[^.]+$/, '');
    return publicIdParts.join('/');
  } catch {
    return null;
  }
}

async function deleteCloudinaryImage(publicId: string) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? process.env.VITE_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY ?? process.env.VITE_CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHash('sha1')
    .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp,
    api_key: apiKey,
    signature,
  });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: 'POST',
    body,
  });
  if (!response.ok) {
    throw new Error(`Cloudinary destroy failed: ${response.status}`);
  }
}

async function deleteMarketplaceImages(mediaUrls: string[]) {
  const publicIds = mediaUrls.map(getCloudinaryPublicId).filter((value): value is string => Boolean(value));
  await Promise.allSettled(publicIds.map(deleteCloudinaryImage));
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

function isBoostActive(listing: ListingData): boolean {
  if (!listing.boostEnabled || listing.boostStatus !== 'active') return false;
  const endsAt = getTimeValue(listing.boostEndsAt);
  return !endsAt || endsAt > Date.now();
}

function getListingRank(item: ListingItem): number {
  return (isBoostActive(item) ? 1_000_000_000 + (item.boostScore ?? 0) : 0) + getTimeValue(item.createdAt);
}

function sortPublicListings(items: ListingItem[]): ListingItem[] {
  return [...items].sort((a, b) => getListingRank(b) - getListingRank(a));
}

function normalizeBoostPlan(input: unknown): BoostPlan | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as { dailyBudget?: unknown; durationDays?: unknown; placements?: unknown };
  const dailyBudget = Math.max(0, Math.min(1_000_000, Number(raw.dailyBudget) || 0));
  const durationDays = Math.max(1, Math.min(30, Number(raw.durationDays) || 3));
  const placements = Array.isArray(raw.placements)
    ? raw.placements.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
    : [];

  return {
    dailyBudget,
    durationDays,
    placements: placements.length > 0 ? placements : DEFAULT_BOOST_PLACEMENTS,
  };
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
}

async function cancelBoostCampaign(listingId: string, listing: ListingData, status: Extract<BoostStatus, 'cancelled' | 'rejected' | 'completed'>) {
  if (!listing.boostCampaignId) return;
  const db = getDb();
  const now = new Date();
  await Promise.all([
    db.collection('marketplace').doc(listingId).update({
      boostStatus: status,
      boostPaymentStatus: listing.boostPaymentStatus === 'sandbox_authorized' ? 'sandbox_voided' : listing.boostPaymentStatus ?? 'none',
      boostScore: 0,
      updatedAt: now,
    }),
    db.collection(BOOST_CAMPAIGNS_COLLECTION).doc(listing.boostCampaignId).update({
      status,
      paymentStatus: listing.boostPaymentStatus === 'sandbox_authorized' ? 'sandbox_voided' : listing.boostPaymentStatus ?? 'none',
      updatedAt: now,
    }),
  ]);
}

async function trackBoostEvent(listingId: string, listing: ListingData, event: 'impression' | 'click' | 'save') {
  if (!isBoostActive(listing) || !listing.boostCampaignId) return;
  const db = getDb();
  const metricKey = event === 'impression' ? 'impressions' : event === 'click' ? 'clicks' : 'saves';
  const listingMetricsKey = 'boostMetrics.' + metricKey;
  const campaignMetricsKey = 'metrics.' + metricKey;
  const cost = event === 'impression' ? 50 : event === 'click' ? 300 : 150;
  await Promise.all([
    db.collection('marketplace').doc(listingId).update({
      [listingMetricsKey]: FieldValue.increment(1),
      'boostMetrics.spent': FieldValue.increment(cost),
      updatedAt: new Date(),
    }),
    db.collection(BOOST_CAMPAIGNS_COLLECTION).doc(listing.boostCampaignId).update({
      [campaignMetricsKey]: FieldValue.increment(1),
      'metrics.spent': FieldValue.increment(cost),
      updatedAt: new Date(),
    }),
  ]);
}
function sanitizeModerationResult(result: MarketplaceModerationResult): MarketplaceModerationResult {
  const sanitized: MarketplaceModerationResult = {
    decision: result.decision,
    flags: Array.isArray(result.flags) ? result.flags.filter(Boolean) : [],
    provider: result.provider,
  };
  if (typeof result.reason === 'string' && result.reason.trim()) sanitized.reason = result.reason.trim();
  if (typeof result.confidence === 'number' && Number.isFinite(result.confidence)) {
    sanitized.confidence = Math.min(1, Math.max(0, result.confidence));
  }
  return sanitized;
}

function getModerationFlagsFromListing(listing: ListingData) {
  return Array.from(new Set([
    ...(Array.isArray(listing.moderationFlags) ? listing.moderationFlags : []),
    ...(Array.isArray(listing.moderationResult?.flags) ? listing.moderationResult.flags : []),
  ].filter(Boolean)));
}

function isAiInfrastructureModerationFailure(listing: ListingData) {
  return getModerationFlagsFromListing(listing).some((flag) => AI_INFRASTRUCTURE_MODERATION_FLAGS.has(flag));
}

function isDemoSeedListing(listing: ListingData) {
  return (listing.tags ?? []).some((tag) => DEMO_SEED_TAGS.has(tag) || tag.startsWith('dummyjson-'));
}

function getStatusFromModerationResult(result: MarketplaceModerationResult): ListingStatus {
  if (result.decision === 'approved') return 'active';
  if (result.decision === 'rejected') return 'rejected';
  return 'pending';
}

async function updateListingAfterAiModeration(listingId: string, moderationResult: MarketplaceModerationResult) {
  const db = getDb();
  const ref = db.collection('marketplace').doc(listingId);
  const current = await ref.get();
  if (!current.exists) return;
  const currentData = current.data() as ListingData;
  if (currentData.status !== 'pending' || currentData.reviewedBy || currentData.moderatedBy === 'admin') return;
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
}

async function runMarketplaceAiModerationInBackground(listingId: string, listing: ListingData) {
  try {
    const moderationResult = sanitizeModerationResult(await moderateMarketplaceListing({
      title: listing.title,
      description: listing.description,
      price: listing.price,
      category: listing.category,
      condition: listing.condition,
      location: listing.location,
      mediaUrls: Array.isArray(listing.mediaUrls) ? listing.mediaUrls : [],
    }));
    await updateListingAfterAiModeration(listingId, moderationResult);
  } catch (e) {
    console.error('Marketplace AI moderation background failed:', e);
    try {
      await updateListingAfterAiModeration(listingId, {
        decision: 'needs_review',
        reason: 'AI kiểm duyệt nền gặp lỗi, cần admin duyệt thủ công.',
        flags: ['ai_background_error'],
        provider: 'gemini',
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

async function getPublicListingsFallback(db: Firestore, category?: Category) {
  const snap = await db.collection('marketplace').limit(200).get();
  const items = sortPublicListings(snap.docs
    .map(listingFromDoc)
    .filter((item) => item.status === 'active' && (!category || item.category === category)))
    .slice(0, PAGE_SIZE);
  return { items, nextCursor: null };
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
  return user?.role === 'admin' || user?.isAdmin === true || (Array.isArray(user?.roles) && user.roles.includes('admin'));
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
  const doc = await db.collection(MODERATION_SETTINGS_COLLECTION).doc(MODERATION_SETTINGS_DOC).get();
  const mode = doc.data()?.mode === 'manual' ? 'manual' : 'auto';
  return {
    mode: mode as MarketplaceModerationMode,
    priority: 'auto' as const,
    provider: 'gemini' as const,
    hasGeminiKey: Boolean((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim()),
    updatedAt: doc.data()?.updatedAt ?? null,
    updatedBy: doc.data()?.updatedBy ?? null,
  };
}

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

    const listingMediaUrls = normalizeMediaUrls(Array.isArray(mediaUrls) && mediaUrls.length > 0 ? mediaUrls : images);
    const listingTags = Array.isArray(tags)
      ? tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
      : [];
    const listingMeetingPreferences = Array.isArray(meetingPreferences)
      ? meetingPreferences.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
      : [];
    const requestedBoostPlan = Boolean(boostEnabled) ? normalizeBoostPlan(boostPlan) : null;
    const listingBoostEnabled = Boolean(requestedBoostPlan?.dailyBudget);
    const boostTotals = requestedBoostPlan ? getBoostTotals(requestedBoostPlan) : null;
    const moderationSettings = await getModerationSettings(db);
    const moderationReason =
      moderationSettings.mode === 'manual'
        ? 'Admin đã bật chế độ kiểm duyệt thủ công.'
        : 'AI đang kiểm duyệt trong nền.';
    const moderationFlags = moderationSettings.mode === 'manual' ? ['manual_mode'] : ['ai_moderation_queued'];

    const docRef = db.collection('marketplace').doc();
    const boostCampaignRef = listingBoostEnabled ? db.collection(BOOST_CAMPAIGNS_COLLECTION).doc() : null;
    const listing: ListingData = {
      sellerId: req.uid!,
      sellerDisplayName: user?.displayName ?? 'Ẩn danh',
      sellerPhotoURL: user?.photoURL ?? null,
      title: title.trim(),
      titleNormalized: normalizeTitle(title),
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
      boostPaymentStatus: listingBoostEnabled ? 'sandbox_authorized' : 'none',
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
        paymentStatus: 'sandbox_authorized',
        sandboxPaymentId: `sandbox_${docRef.id}_${Date.now()}`,
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
    await Promise.all(writes);
    res.status(201).json({ id: docRef.id, ...listing });

    if (moderationSettings.mode === 'auto') {
      enqueueMarketplaceAiModeration(docRef.id, listing);
    }
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/categories', requireAuth, async (_req: AuthRequest, res) => {
  res.json({ items: MARKETPLACE_CATEGORIES });
});

// ── GET /api/marketplace/my — Tin của tôi ────────────────────────────────────
// Phải đặt TRƯỚC /:id để tránh bị override
router.get('/my', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { cursor, status = 'active', limit } = req.query;
    const pageSize = Math.max(1, Math.min(50, Number(limit) || 10));
    const selectedStatuses: ListingStatus[] =
      status === 'all'
        ? ['pending', 'active', 'rejected', 'sold']
        : status === 'error'
          ? ['pending', 'rejected']
          : [status === 'sold' ? 'sold' : status === 'pending' ? 'pending' : status === 'rejected' ? 'rejected' : 'active'];

    const snap = await db
      .collection('marketplace')
      .where('sellerId', '==', req.uid!)
      .limit(200)
      .get();
    const ownerItems = snap.docs
      .map(listingFromDoc)
      .filter((item) => item.status !== 'deleted')
      .sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
    const statusCounts = {
      all: ownerItems.length,
      error: ownerItems.filter((item) => item.status === 'pending' || item.status === 'rejected').length,
      active: ownerItems.filter((item) => item.status === 'active').length,
      pending: ownerItems.filter((item) => item.status === 'pending').length,
      rejected: ownerItems.filter((item) => item.status === 'rejected').length,
      sold: ownerItems.filter((item) => item.status === 'sold').length,
    };
    const summary = ownerItems.reduce(
      (acc, item) => ({
        views: acc.views + (item.viewCount ?? 0),
        saves: acc.saves + (item.savedBy?.length ?? 0),
        activeBoosts: acc.activeBoosts + (item.boostEnabled && item.boostStatus === 'active' ? 1 : 0),
        boostImpressions: acc.boostImpressions + (item.boostMetrics?.impressions ?? 0),
        boostSpent: acc.boostSpent + (item.boostMetrics?.spent ?? 0),
      }),
      { views: 0, saves: 0, activeBoosts: 0, boostImpressions: 0, boostSpent: 0 }
    );
    const allItems = ownerItems.filter((item) => selectedStatuses.includes(item.status));
    const cursorIndex = typeof cursor === 'string' ? allItems.findIndex((item) => item.id === cursor) : -1;
    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const endIndex = startIndex + pageSize;
    const pageItems = allItems.slice(startIndex, endIndex);
    const nextCursor = allItems.length > endIndex ? pageItems[pageItems.length - 1]?.id ?? null : null;

    res.json({ items: pageItems, nextCursor, counts: statusCounts, summary });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /api/marketplace/saved — Tin đã lưu ──────────────────────────────────
router.get('/saved', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { cursor } = req.query;

    // savedBy array-contains + status filter cần composite index
    let query = db
      .collection('marketplace')
      .where('savedBy', 'array-contains', req.uid!)
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(PAGE_SIZE);

    if (cursor && typeof cursor === 'string') {
      const cursorDoc = await db.collection('marketplace').doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const snap = await query.get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1].id : null;

    res.json({ items, nextCursor });
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

    const normQ = normalizeTitle(raw);

    let baseQuery = db
      .collection('marketplace')
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(200);

    if (category && VALID_CATEGORIES.includes(category as Category)) {
      baseQuery = db
        .collection('marketplace')
        .where('status', '==', 'active')
        .where('category', '==', category)
        .orderBy('createdAt', 'desc')
        .limit(200);
    }

    const snap = await baseQuery.get();
    const items = sortPublicListings(snap.docs
      .map((d) => ({ id: d.id, ...d.data() as ListingData }))
      .filter((item) => item.titleNormalized?.includes(normQ) || normalizeTitle(item.description ?? '').includes(normQ)))
      .slice(0, PAGE_SIZE);

    void Promise.all(items.map((item) => trackBoostEvent(item.id, item, 'impression'))).catch(() => {});
    res.json({ items, nextCursor: null });
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

    let query = db
      .collection('marketplace')
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(200);
    if (validCategory) {
      query = db
        .collection('marketplace')
        .where('status', '==', 'active')
        .where('category', '==', validCategory)
        .orderBy('createdAt', 'desc')
        .limit(200);
    }

    if (rawSearch) {
      const normQ = normalizeTitle(rawSearch);
      const snap = await query.get();
      const items = sortPublicListings(snap.docs
        .map(listingFromDoc)
        .filter((item) => item.titleNormalized?.includes(normQ) || normalizeTitle(item.description ?? '').includes(normQ)))
        .slice(0, PAGE_SIZE);
      void Promise.all(items.map((item) => trackBoostEvent(item.id, item, 'impression'))).catch(() => {});
      res.json({ items, nextCursor: null });
      return;
    }

    let snap;
    try {
      snap = await query.get();
    } catch {
      const fallback = await getPublicListingsFallback(db, validCategory);
      res.json(fallback);
      return;
    }
    const sortedItems = sortPublicListings(snap.docs.map(listingFromDoc));
    const cursorIndex = typeof cursor === 'string' ? sortedItems.findIndex((item) => item.id === cursor) : -1;
    const items = sortedItems.slice(cursorIndex >= 0 ? cursorIndex + 1 : 0, cursorIndex >= 0 ? cursorIndex + 1 + PAGE_SIZE : PAGE_SIZE);
    const nextCursor = items.length === PAGE_SIZE ? items[items.length - 1].id : null;

    void Promise.all(items.map((item) => trackBoostEvent(item.id, item, 'impression'))).catch(() => {});

    res.json({ items, nextCursor });
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
        provider: 'gemini',
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
    const status: ListingStatus = rawStatus === 'rejected' ? 'rejected' : rawStatus === 'active' ? 'active' : 'pending';
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

    await Promise.all(eligible.map(async ({ doc, listing }) => {
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
    }));

    const updatedDocs = await Promise.all(eligible.map(({ doc }) => doc.ref.get()));
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
    const moderationResult = sanitizeModerationResult(await moderateMarketplaceListing({
      title: listing.title,
      description: listing.description,
      price: listing.price,
      category: listing.category,
      condition: listing.condition,
      location: listing.location,
      mediaUrls: Array.isArray(listing.mediaUrls) ? listing.mediaUrls : [],
    }));
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
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/moderation/:id/reject', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireMarketplaceAdmin(req, res))) return;
    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : 'Không phù hợp chính sách Marketplace';
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
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /api/marketplace/:id — Chi tiết tin ───────────────────────────────────
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }

    const listing = doc.data() as ListingData;
    const canViewPrivateListing = listing.sellerId === req.uid || (await isMarketplaceAdmin(db, req.uid));
    if (listing.status !== 'active' && !canViewPrivateListing) {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }

    if (listing.status === 'active') {
      ref.update({ viewCount: FieldValue.increment(1) }).catch(() => {});
      trackBoostEvent(req.params.id, listing, 'click').catch(() => {});
    }

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
      res.status(400).json({ error: 'Chỉ có thể quảng bá bài niêm yết đã được duyệt và đang hoạt động' });
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
      boostPaymentStatus: 'sandbox_authorized' as BoostPaymentStatus,
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
      paymentStatus: 'sandbox_authorized',
      sandboxPaymentId: `sandbox_${req.params.id}_${Date.now()}`,
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
    ]);
    await activateBoostIfEligible(req.params.id, { ...listing, ...listingUpdate });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
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

    const conversationResult = await createOrGetDmConversation(req.uid!, listing.sellerId);
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
    messageResult.recipientIds.forEach((uid) => emitMessageNew(uid, payload));
    emitMessageNew(req.uid!, payload);
    const recipientCounts = await Promise.all(
      messageResult.recipientIds.map(async (uid) => ({ uid, count: await getUnreadConversationCount(uid) }))
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
    const { title, description, price, category, condition, mediaUrls, images, location, status, saleStatus, brand, productType, material } = req.body;
    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (title !== undefined) {
      update.title = title.trim();
      update.titleNormalized = normalizeTitle(title);
    }
    if (description !== undefined) update.description = description.trim();
    if (price !== undefined) update.price = Number(price);
    if (category !== undefined && VALID_CATEGORIES.includes(category)) update.category = category;
    if (condition !== undefined && VALID_CONDITIONS.includes(condition)) update.condition = condition;
    if (mediaUrls !== undefined || images !== undefined) update.mediaUrls = normalizeMediaUrls(mediaUrls ?? images);
    if (location !== undefined) update.location = location.trim();
    if (brand !== undefined) update.brand = String(brand).trim();
    if (productType !== undefined) update.productType = String(productType).trim();
    if (material !== undefined) update.material = String(material).trim();
    if (status === 'sold' && currentListing.status === 'active') {
      update.status = status;
      update.saleStatus = 'available';
    }
    if (status === 'active' && currentListing.status === 'sold') {
      update.status = status;
      update.saleStatus = 'available';
    }
    if (saleStatus !== undefined && currentListing.status === 'active' && (saleStatus === 'available' || saleStatus === 'pending')) {
      update.saleStatus = saleStatus;
    }

    await ref.update(update);
    if (update.status === 'sold') {
      await cancelBoostCampaign(req.params.id, currentListing, 'completed');
    }
    const updated = await ref.get();
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

    if (isSaved) {
      await ref.update({ savedBy: FieldValue.arrayRemove(req.uid!) });
      res.json({ saved: false });
    } else {
      await ref.update({ savedBy: FieldValue.arrayUnion(req.uid!) });
      trackBoostEvent(req.params.id, doc.data() as ListingData, 'save').catch(() => {});
      res.json({ saved: true });
    }
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
