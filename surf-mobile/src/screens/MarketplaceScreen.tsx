import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import {
  useMarketplaceStore,
  type BoostSandboxPaymentProvider,
  type Category,
  type Listing,
  type MarketplaceModerationMode,
  type MarketplaceModerationSettings,
  type MyListingsFilter,
} from '@/stores/marketplaceStore';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { useLanguage, useT, type I18nKey } from '@/lib/i18n';

export type MarketTab = 'all' | 'saved' | 'seller';
type MarketNavigation = Pick<
  NativeStackNavigationProp<RootStackParamList, 'Marketplace'>,
  'navigate' | 'goBack' | 'canGoBack'
>;

type Props = {
  navigation: MarketNavigation;
  initialTab?: MarketTab;
  resetSignal?: number;
  scrollTopSignal?: number;
  safeTop?: boolean;
  showHeader?: boolean;
  showBackButton?: boolean;
  onScrollPositionChange?: (atTop: boolean) => void;
};

type SellerSection = 'dashboard' | 'listings' | 'notifications' | 'insights' | 'profile' | 'moderation';
type PaymentSession = {
  paymentId: string;
  provider: BoostSandboxPaymentProvider;
  orderId: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  paymentUrl: string;
  consumed?: boolean;
};

type SellerMessagesTab = 'messages' | 'comments' | 'insights';

type MarketplaceConversationItem = {
  id: string;
  type: 'dm' | 'group';
  title?: string;
  marketplace?: {
    kind: 'marketplace';
    listingId: string;
    title: string;
    imageUrl: string | null;
    price: number;
    currency?: 'VND';
    location: string;
    status?: string;
    saleStatus?: string | null;
    sellerId: string;
    sellerDisplayName?: string;
    sellerPhotoURL?: string | null;
  };
  peer: { uid: string; name: string; avatarUrl: string | null } | null;
  members?: { uid: string; name: string; avatarUrl: string | null }[];
  memberCount?: number;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  muted?: boolean;
};

const DARK = {
  bg: '#0f172a',
  card: '#111827',
  card2: '#1e293b',
  border: '#263449',
  text: '#e2e8f0',
  subtext: '#94a3b8',
  muted: '#64748b',
  accent: '#0ea5e9',
  accent2: '#06b6d4',
  green: '#22c55e',
  yellow: '#f59e0b',
  red: '#ef4444',
  purple: '#a855f7',
  input: '#172033',
  placeholder: '#64748b',
  pill: '#1e3a5f',
  overlay: 'rgba(0,0,0,0.58)',
};

const LIGHT = {
  bg: '#f8fafc',
  card: '#ffffff',
  card2: '#f1f5f9',
  border: '#e2e8f0',
  text: '#0f172a',
  subtext: '#475569',
  muted: '#64748b',
  accent: '#0284c7',
  accent2: '#0891b2',
  green: '#16a34a',
  yellow: '#d97706',
  red: '#dc2626',
  purple: '#7c3aed',
  input: '#ffffff',
  placeholder: '#94a3b8',
  pill: '#e0f2fe',
  overlay: 'rgba(15,23,42,0.42)',
};

const CATEGORIES: { key: Category; labelKey: I18nKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', labelKey: 'market_category_all', icon: 'grid-outline' },
  { key: 'electronics', labelKey: 'market_category_electronics', icon: 'phone-portrait-outline' },
  { key: 'clothing', labelKey: 'market_category_clothing', icon: 'shirt-outline' },
  { key: 'vehicles', labelKey: 'market_category_vehicles', icon: 'car-outline' },
  { key: 'property', labelKey: 'market_category_property', icon: 'business-outline' },
  { key: 'home', labelKey: 'market_category_home', icon: 'home-outline' },
  { key: 'sports', labelKey: 'market_category_sports', icon: 'football-outline' },
  { key: 'other', labelKey: 'market_category_other', icon: 'ellipsis-horizontal-outline' },
];

const CONDITION_LABEL_KEYS: Record<string, I18nKey> = {
  new: 'market_condition_new',
  like_new: 'market_condition_like_new',
  good: 'market_condition_good',
  fair: 'market_condition_fair',
};

const MY_FILTERS: { key: MyListingsFilter; label: string; countKey: keyof ListingCounts }[] = [
  { key: 'all', label: 'Tất cả', countKey: 'all' },
  { key: 'pending', label: 'Chờ duyệt', countKey: 'pending' },
  { key: 'active', label: 'Đang bán', countKey: 'active' },
  { key: 'error', label: 'Spam/Lỗi', countKey: 'error' },
];

const SELLER_SECTIONS: { key: Exclude<SellerSection, 'moderation'>; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'dashboard', label: 'Bảng điều khiển', icon: 'speedometer-outline' },
  { key: 'listings', label: 'Bài niêm yết', icon: 'list-outline' },
  { key: 'notifications', label: 'Thông báo', icon: 'notifications-outline' },
  { key: 'insights', label: 'Thông tin chi tiết', icon: 'analytics-outline' },
  { key: 'profile', label: 'Trang bán hàng', icon: 'person-circle-outline' },
];

const ADMIN_SELLER_SECTION: { key: 'moderation'; label: string; icon: keyof typeof Ionicons.glyphMap } = {
  key: 'moderation',
  label: 'Kiểm duyệt',
  icon: 'shield-checkmark-outline',
};

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

const BOOST_BUDGET_OPTIONS = [
  {
    id: 'starter',
    name: 'Gói Khởi động',
    dailyBudget: 30000,
    reach: '500 - 900',
    durationDays: 3,
    placements: ['surf_market', 'surf_discovery'],
    badge: 'Tiết kiệm',
  },
  {
    id: 'standard',
    name: 'Gói Tiêu chuẩn',
    dailyBudget: 60000,
    reach: '1.000 - 1.800',
    durationDays: 5,
    placements: ['surf_feed', 'surf_market', 'surf_discovery'],
    badge: 'Khuyên dùng',
  },
  {
    id: 'accelerate',
    name: 'Gói Tăng tốc',
    dailyBudget: 90000,
    reach: '1.800 - 3.200',
    durationDays: 7,
    placements: ['surf_feed', 'surf_market', 'surf_chat', 'surf_discovery'],
    badge: 'Bán nhanh',
  },
  {
    id: 'premium',
    name: 'Gói Nổi bật',
    dailyBudget: 140000,
    reach: '3.200 - 5.500',
    durationDays: 10,
    placements: ['surf_feed', 'surf_market', 'surf_chat', 'surf_discovery', 'seller_profile'],
    badge: 'Phủ rộng',
  },
] as const;

const BOOST_PAYMENT_METHODS: { key: BoostSandboxPaymentProvider; label: string; short: string }[] = [
  { key: 'zalopay', label: 'ZaloPay Sandbox', short: 'ZLP' },
  { key: 'vnpay', label: 'VNPAY Sandbox', short: 'VNPAY' },
  { key: 'momo', label: 'MoMo Sandbox', short: 'MoMo' },
];

const BOOST_PLACEMENT_LABELS: Record<string, string> = {
  surf_feed: 'Surf Feed',
  surf_market: 'Surf Market',
  surf_chat: 'Surf Chat',
  surf_discovery: 'Khám phá',
  seller_profile: 'Trang bán hàng',
};

const BOOST_DAY_MS = 24 * 60 * 60 * 1000;
const { width: SW } = Dimensions.get('window');
const GRID_GAP = 10;
const GRID_PADDING = 12;
const CARD_W = Math.floor((SW - GRID_PADDING * 2 - GRID_GAP) / 2);

type ListingCounts = {
  all: number;
  error: number;
  active: number;
  pending: number;
  rejected: number;
  sold: number;
};

function formatPrice(price: number, language: string, t: ReturnType<typeof useT>): string {
  if (price === 0) return t('free');
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  return `${price.toLocaleString(locale)} ₫`;
}

function getTimeValue(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value === 'object') {
    const raw = value as { _seconds?: number; seconds?: number; toDate?: () => Date };
    if (typeof raw.toDate === 'function') return raw.toDate().getTime();
    const seconds = typeof raw._seconds === 'number' ? raw._seconds : raw.seconds;
    return typeof seconds === 'number' ? seconds * 1000 : 0;
  }
  return 0;
}

function formatListingDate(value: unknown) {
  const time = getTimeValue(value);
  if (!time) return 'Không rõ ngày';
  const date = new Date(time);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `Hôm nay ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatConversationTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function getModerationFlags(listing: Listing) {
  return [
    ...(Array.isArray(listing.moderationFlags) ? listing.moderationFlags : []),
    ...(Array.isArray(listing.moderationResult?.flags) ? listing.moderationResult.flags : []),
  ].filter(Boolean);
}

function isAiInfrastructureModerationIssue(listing: Listing) {
  return getModerationFlags(listing).some((flag) => AI_INFRASTRUCTURE_MODERATION_FLAGS.has(flag));
}

function isDemoSeedListing(listing: Listing) {
  return (listing.tags ?? []).some(
    (tag) =>
      tag === 'surf-demo-seed' ||
      tag === 'public-ecommerce-seed' ||
      tag === 'dummyjson' ||
      tag.startsWith('dummyjson-')
  );
}

function getModerationSourceLabel(listing: Listing) {
  if (listing.moderatedBy === 'ai') return 'AI';
  if (listing.moderatedBy === 'admin') return 'Admin';
  if (listing.moderationMode === 'manual') return 'Manual';
  if (listing.moderationMode === 'auto') return 'Auto';
  return 'Chờ duyệt';
}

function getModerationDecisionLabel(listing: Listing) {
  const decision = listing.moderationResult?.decision;
  if (decision === 'approved') return 'AI duyệt';
  if (decision === 'rejected') return 'AI từ chối';
  if (decision === 'needs_review') return 'Cần review';
  if (listing.status === 'rejected') return 'Từ chối';
  if (listing.status === 'active') return 'Đã duyệt';
  return '';
}

function getModerationConfidenceLabel(listing: Listing) {
  const confidence = listing.moderationResult?.confidence;
  if (typeof confidence !== 'number') return '';
  return `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`;
}

function getBoostDeadline(listing: Listing) {
  const endsAt = getTimeValue(listing.boostEndsAt);
  if (endsAt) return endsAt;
  const startedAt = getTimeValue(listing.boostStartedAt);
  const durationDays = listing.boostPlan?.durationDays ?? 0;
  return startedAt && durationDays > 0 ? startedAt + durationDays * BOOST_DAY_MS : 0;
}

function isBoostActive(listing: Listing) {
  const deadline = getBoostDeadline(listing);
  return Boolean(listing.boostEnabled && listing.boostStatus === 'active' && (!deadline || deadline > Date.now()));
}

function canResumeBoost(listing: Listing) {
  const deadline = getBoostDeadline(listing);
  return Boolean(listing.status === 'active' && listing.boostEnabled && listing.boostStatus === 'paused' && deadline > Date.now());
}

function getBoostRemainingText(listing: Listing) {
  const deadline = getBoostDeadline(listing);
  if (!deadline) return 'Không rõ hạn';
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return 'Đã hết hạn';
  const hours = Math.ceil(remainingMs / (60 * 60 * 1000));
  return hours < 24 ? `Còn ${hours} giờ` : `Còn ${Math.ceil(hours / 24)} ngày`;
}

function getBoostStatusText(listing: Listing) {
  if (!listing.boostEnabled) return 'Chưa quảng bá';
  if (listing.boostStatus === 'active') return isBoostActive(listing) ? `Đang Boost · ${getBoostRemainingText(listing)}` : 'Boost đã hết hạn';
  if (listing.boostStatus === 'paused') return `Đã ngưng Boost · ${getBoostRemainingText(listing)}`;
  if (listing.boostStatus === 'awaiting_moderation') return 'Boost chờ duyệt';
  if (listing.boostStatus === 'completed') return 'Boost đã hoàn tất';
  if (listing.boostStatus === 'cancelled') return 'Boost đã hủy';
  if (listing.boostStatus === 'rejected') return 'Boost bị từ chối';
  return 'Đã bật Boost';
}

function getBoostActionLabel(listing: Listing) {
  if (isBoostActive(listing)) return 'Ngưng Boost';
  if (canResumeBoost(listing)) return 'Bật lại Boost';
  return listing.boostEnabled ? 'Boost lại' : 'Boost tin';
}

function getListingStatusText(listing: Listing) {
  if (listing.status === 'pending') return 'Đang chờ duyệt';
  if (listing.status === 'rejected') return 'Bị từ chối';
  if (listing.status === 'sold') return 'Hết hàng';
  if (listing.saleStatus === 'pending') return 'Đang chờ giao dịch';
  return 'Còn hàng';
}

function getListingStatusColor(listing: Listing, C: typeof DARK) {
  if (listing.status === 'active' && listing.saleStatus !== 'pending') return C.green;
  if (listing.status === 'pending' || listing.saleStatus === 'pending') return C.yellow;
  if (listing.status === 'rejected' || listing.status === 'sold') return C.red;
  return C.muted;
}

function getBoostTotal(plan: (typeof BOOST_BUDGET_OPTIONS)[number]) {
  const budgetTotal = plan.dailyBudget * plan.durationDays;
  const estimatedTax = Math.round(budgetTotal * 0.1);
  return budgetTotal + estimatedTax;
}

function matchesLocalSearch(item: Listing, query: string, category: Category) {
  if (category !== 'all' && item.category !== category) return false;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    item.title,
    item.description,
    item.location,
    item.brand,
    item.productType,
    item.material,
    ...(item.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

function SkeletonCard({ C }: { C: typeof DARK }) {
  const opacity = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 760, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.42, duration: 760, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View style={[s.card, { backgroundColor: C.card, borderColor: C.border, opacity, width: CARD_W }]}>
      <View style={[s.cardImg, { backgroundColor: C.border }]} />
      <View style={{ padding: 10, gap: 7 }}>
        <View style={[s.skeletonLine, { backgroundColor: C.border, width: '70%' }]} />
        <View style={[s.skeletonLine, { backgroundColor: C.border, width: '92%', height: 11 }]} />
        <View style={[s.skeletonLine, { backgroundColor: C.border, width: '58%', height: 9 }]} />
      </View>
    </Animated.View>
  );
}

function ListingCard({
  item,
  C,
  onPress,
  userId,
  onSave,
  t,
  language,
}: {
  item: Listing;
  C: typeof DARK;
  onPress: () => void;
  userId?: string;
  onSave: (id: string) => Promise<void>;
  t: ReturnType<typeof useT>;
  language: string;
}) {
  const isSaved = item.savedBy?.includes(userId ?? '');
  const isOwner = item.sellerId === userId;
  const imageUri = item.mediaUrls?.[0];
  const statusColor = getListingStatusColor(item, C);

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: C.card, borderColor: C.border, width: CARD_W }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={[s.cardImg, { backgroundColor: C.card2 }]}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={s.imageFallback}>
            <Ionicons name="image-outline" size={34} color={C.muted} />
          </View>
        )}
        <View style={s.cardTopBadges}>
          {isBoostActive(item) && (
            <View style={[s.tinyBadge, { backgroundColor: C.purple }]}>
              <Ionicons name="flash" size={10} color="#fff" />
              <Text style={s.tinyBadgeText}>Boost</Text>
            </View>
          )}
          {item.status !== 'active' || item.saleStatus === 'pending' ? (
            <View style={[s.tinyBadge, { backgroundColor: statusColor }]}>
              <Text style={s.tinyBadgeText}>{getListingStatusText(item)}</Text>
            </View>
          ) : null}
        </View>
        {!isOwner && (
          <TouchableOpacity
            style={s.saveFab}
            onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              void onSave(item.id);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={17} color={isSaved ? C.accent2 : '#fff'} />
          </TouchableOpacity>
        )}
      </View>
      <View style={s.cardBody}>
        <Text style={[s.price, { color: item.price === 0 ? C.green : C.accent }]} numberOfLines={1}>
          {formatPrice(item.price, language, t)}
        </Text>
        <Text style={[s.cardTitle, { color: C.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={s.cardMetaRow}>
          <Ionicons name="location-outline" size={11} color={C.muted} />
          <Text style={[s.locText, { color: C.muted }]} numberOfLines={1}>
            {item.location || 'Toàn quốc'}
          </Text>
        </View>
        <View style={s.cardMetaRow}>
          <Ionicons name="eye-outline" size={11} color={C.muted} />
          <Text style={[s.locText, { color: C.muted }]} numberOfLines={1}>
            {item.viewCount ?? 0} lượt xem
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function MetricCard({
  label,
  value,
  C,
  icon,
}: {
  label: string;
  value: string | number;
  C: typeof DARK;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[s.metricCard, { backgroundColor: C.card, borderColor: C.border }]}>
      <Ionicons name={icon} size={17} color={C.accent} />
      <Text style={[s.metricValue, { color: C.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[s.metricLabel, { color: C.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function ModerationTrace({ listing, C }: { listing: Listing; C: typeof DARK }) {
  const shouldShow =
    listing.status === 'pending' ||
    listing.status === 'rejected' ||
    Boolean(listing.moderatedBy || listing.moderationMode || listing.moderationReason || listing.moderationResult);
  if (!shouldShow) return null;

  const flags = getModerationFlags(listing);
  const sourceLabel = getModerationSourceLabel(listing);
  const decisionLabel = getModerationDecisionLabel(listing);
  const confidenceLabel = getModerationConfidenceLabel(listing);
  const sourceColor =
    listing.moderatedBy === 'ai'
      ? C.accent
      : listing.moderatedBy === 'admin'
        ? C.green
        : C.yellow;

  return (
    <View style={[s.moderationTrace, { backgroundColor: C.card2, borderColor: C.border }]}>
      <View style={s.inlineBadges}>
        <View style={[s.statusBadge, { backgroundColor: `${sourceColor}22` }]}>
          <Text style={[s.statusBadgeText, { color: sourceColor }]}>{sourceLabel}</Text>
        </View>
        {decisionLabel ? (
          <View style={[s.statusBadge, { backgroundColor: `${C.muted}22` }]}>
            <Text style={[s.statusBadgeText, { color: C.subtext }]}>{decisionLabel}</Text>
          </View>
        ) : null}
        {confidenceLabel ? (
          <View style={[s.statusBadge, { backgroundColor: `${C.muted}22` }]}>
            <Text style={[s.statusBadgeText, { color: C.subtext }]}>Tin cậy {confidenceLabel}</Text>
          </View>
        ) : null}
      </View>
      {listing.moderationReason ? (
        <Text style={[s.moderationTraceText, { color: C.subtext }]} numberOfLines={2}>
          Lý do: {listing.moderationReason}
        </Text>
      ) : null}
      {flags.length > 0 ? (
        <Text style={[s.moderationTraceText, { color: C.muted }]} numberOfLines={2}>
          Flags: {flags.join(', ')}
        </Text>
      ) : null}
    </View>
  );
}

function AdminModerationPanel({
  C,
  language,
  t,
  settings,
  queue,
  loading,
  error,
  actionId,
  bulkApproving,
  onModeChange,
  onReload,
  onBulkApprove,
  onRerun,
  onApprove,
  onReject,
  onPressListing,
}: {
  C: typeof DARK;
  language: string;
  t: ReturnType<typeof useT>;
  settings: MarketplaceModerationSettings | null;
  queue: Listing[];
  loading: boolean;
  error: string;
  actionId: string | null;
  bulkApproving: boolean;
  onModeChange: (mode: MarketplaceModerationMode) => void;
  onReload: () => void;
  onBulkApprove: () => void;
  onRerun: (listing: Listing) => void;
  onApprove: (listing: Listing) => void;
  onReject: (listing: Listing) => void;
  onPressListing: (listing: Listing) => void;
}) {
  const aiQueue = queue.filter(isAiInfrastructureModerationIssue);
  const demoAiQueue = aiQueue.filter(isDemoSeedListing);

  return (
    <View style={[s.adminPanel, { backgroundColor: C.card2, borderColor: C.border }]}>
      <View style={s.adminTop}>
        <View style={{ flex: 1 }}>
          <Text style={[s.adminKicker, { color: C.accent }]}>Admin moderation</Text>
          <Text style={[s.adminTitle, { color: C.text }]}>Kiểm duyệt Surf Market</Text>
          <Text style={[s.adminSub, { color: C.subtext }]}>Duyệt tin mới, chạy lại AI hoặc chuyển Auto/Manual.</Text>
        </View>
        <TouchableOpacity style={[s.iconBtn, { borderColor: C.border, backgroundColor: C.card }]} onPress={onReload}>
          <Ionicons name="refresh-outline" size={19} color={C.text} />
        </TouchableOpacity>
      </View>

      <View style={[s.modeSwitch, { backgroundColor: C.card, borderColor: C.border }]}>
        {(['auto', 'manual'] as MarketplaceModerationMode[]).map((mode) => {
          const active = (settings?.mode ?? 'auto') === mode;
          return (
            <TouchableOpacity
              key={mode}
              style={[s.modeBtn, { backgroundColor: active ? C.accent : 'transparent' }]}
              onPress={() => onModeChange(mode)}
            >
              <Text style={[s.modeBtnText, { color: active ? '#fff' : C.text }]}>
                {mode === 'auto' ? 'Tự động' : 'Thủ công'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.metricsGrid}>
        <MetricCard C={C} icon="shield-checkmark-outline" label="Chờ duyệt" value={queue.length} />
        <MetricCard C={C} icon="hardware-chip-outline" label="AI provider" value={settings?.provider === 'openai' ? 'OpenAI' : 'Gemini'} />
        <MetricCard C={C} icon="key-outline" label="AI key" value={settings?.hasAiKey ? 'Đã có' : 'Thiếu'} />
        <MetricCard C={C} icon="warning-outline" label="Kẹt AI" value={aiQueue.length} />
      </View>

      {demoAiQueue.length > 0 ? (
        <TouchableOpacity
          style={[s.warningBox, { backgroundColor: `${C.yellow}1f`, borderColor: `${C.yellow}66` }]}
          onPress={onBulkApprove}
          disabled={bulkApproving || loading}
        >
          <Ionicons name="flash-outline" size={18} color={C.yellow} />
          <Text style={[s.warningText, { color: C.text }]}>
            {bulkApproving ? 'Đang duyệt nhanh...' : `Duyệt nhanh ${demoAiQueue.length} bài demo bị kẹt AI`}
          </Text>
        </TouchableOpacity>
      ) : null}

      {error ? (
        <View style={[s.errorBox, { backgroundColor: `${C.red}16`, borderColor: `${C.red}55` }]}>
          <Text style={[s.errorText, { color: C.red }]}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={[s.adminEmpty, { borderColor: C.border }]}>
          <ActivityIndicator color={C.accent} />
          <Text style={[s.adminEmptyText, { color: C.subtext }]}>Đang tải hàng chờ...</Text>
        </View>
      ) : queue.length === 0 ? (
        <View style={[s.adminEmpty, { borderColor: C.border }]}>
          <Ionicons name="checkmark-done-outline" size={28} color={C.green} />
          <Text style={[s.adminEmptyText, { color: C.subtext }]}>Không có tin nào đang chờ duyệt.</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {queue.map((item) => {
            const busy = actionId === item.id;
            return (
              <View key={item.id} style={[s.moderationRow, { backgroundColor: C.card, borderColor: C.border }]}>
                <TouchableOpacity style={[s.moderationImage, { backgroundColor: C.card2 }]} onPress={() => onPressListing(item)}>
                  {item.mediaUrls?.[0] ? (
                    <Image source={{ uri: item.mediaUrls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <Ionicons name="image-outline" size={24} color={C.muted} />
                  )}
                </TouchableOpacity>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={2}>{item.title}</Text>
                  <Text style={[s.rowPrice, { color: C.accent }]}>{formatPrice(item.price, language, t)}</Text>
                  <Text style={[s.moderationTraceText, { color: C.subtext }]} numberOfLines={2}>
                    {item.description || item.location || 'Không có mô tả'}
                  </Text>
                  <ModerationTrace listing={item} C={C} />
                  <View style={s.moderationActions}>
                    <TouchableOpacity
                      style={[s.smallActionBtn, { backgroundColor: C.accent, opacity: busy ? 0.55 : 1 }]}
                      disabled={busy}
                      onPress={() => onRerun(item)}
                    >
                      <Text style={s.smallActionText}>{busy ? 'Đang chạy' : 'Chạy AI'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.smallActionBtn, { backgroundColor: C.green, opacity: busy ? 0.55 : 1 }]}
                      disabled={busy}
                      onPress={() => onApprove(item)}
                    >
                      <Text style={s.smallActionText}>Duyệt</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.smallActionBtn, { backgroundColor: C.red, opacity: busy ? 0.55 : 1 }]}
                      disabled={busy}
                      onPress={() => onReject(item)}
                    >
                      <Text style={s.smallActionText}>Từ chối</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function SellerListingRow({
  item,
  C,
  language,
  t,
  actionLoading,
  onPress,
  onEdit,
  onMessages,
  onShare,
  onMarkSold,
  onMarkAvailable,
  onBoost,
  onDelete,
  onMore,
}: {
  item: Listing;
  C: typeof DARK;
  language: string;
  t: ReturnType<typeof useT>;
  actionLoading: boolean;
  onPress: () => void;
  onEdit: () => void;
  onMessages: () => void;
  onShare: () => void;
  onMarkSold: () => void;
  onMarkAvailable: () => void;
  onBoost: () => void;
  onDelete: () => void;
  onMore: () => void;
}) {
  const statusColor = getListingStatusColor(item, C);
  const imageUri = item.mediaUrls?.[0];
  const disablePrimary = actionLoading || (item.status !== 'active' && item.status !== 'sold');
  const isSalePending = item.status === 'active' && item.saleStatus === 'pending';
  const shouldMarkAvailable = item.status === 'sold' || isSalePending;

  return (
    <TouchableOpacity
      style={[s.sellerRow, { backgroundColor: C.card, borderColor: C.border }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={[s.rowImage, { backgroundColor: C.card2 }]}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={25} color={C.muted} />
        )}
      </View>
      <View style={s.sellerRowBody}>
        <View style={s.rowTitleLine}>
          <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <TouchableOpacity
            style={[s.iconAction, { backgroundColor: `${C.accent}1f` }]}
            onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              onEdit();
            }}
          >
            <Ionicons name="create-outline" size={16} color={C.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.iconAction, { backgroundColor: `${C.red}1f` }]}
            onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Ionicons name="trash-outline" size={16} color={C.red} />
          </TouchableOpacity>
        </View>
        <Text style={[s.rowPrice, { color: C.accent }]} numberOfLines={1}>
          {formatPrice(item.price, language, t)}
        </Text>
        <View style={s.inlineBadges}>
          <View style={[s.statusBadge, { backgroundColor: `${statusColor}22` }]}>
            <Text style={[s.statusBadgeText, { color: statusColor }]}>{getListingStatusText(item)}</Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: `${C.purple}22` }]}>
            <Text style={[s.statusBadgeText, { color: C.purple }]}>{getBoostStatusText(item)}</Text>
          </View>
        </View>
        {item.moderationReason ? (
          <Text style={[s.moderationReason, { color: C.subtext }]} numberOfLines={2}>
            {item.moderationReason}
          </Text>
        ) : null}
        <View style={s.rowStats}>
          <Text style={[s.rowStatText, { color: C.muted }]}>{item.viewCount ?? 0} lượt xem</Text>
          <Text style={[s.rowStatText, { color: C.muted }]}>{item.savedBy?.length ?? 0} lưu</Text>
          <Text style={[s.rowStatText, { color: C.muted }]}>{formatListingDate(item.createdAt)}</Text>
        </View>
        <View style={s.sellerActions}>
          <TouchableOpacity
            style={[s.rowActionBtn, { backgroundColor: C.accent, opacity: disablePrimary ? 0.55 : 1 }]}
            disabled={disablePrimary}
            onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              if (shouldMarkAvailable) onMarkAvailable();
              else onMarkSold();
            }}
          >
            <Ionicons name={shouldMarkAvailable ? 'play-circle-outline' : 'checkmark-circle-outline'} size={15} color="#fff" />
            <Text style={s.rowActionText}>
              {item.status === 'sold' ? 'Còn hàng' : isSalePending ? 'Có sẵn' : 'Hết hàng'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.rowActionBtn, { backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, opacity: item.status !== 'active' || actionLoading ? 0.55 : 1 }]}
            disabled={item.status !== 'active' || actionLoading}
            onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              onBoost();
            }}
          >
            <Ionicons name="flash-outline" size={15} color={C.text} />
            <Text style={[s.rowActionText, { color: C.text }]}>{getBoostActionLabel(item)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.rowActionBtn, { backgroundColor: C.card2, borderWidth: 1, borderColor: C.border }]}
            onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              onMessages();
            }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={15} color={C.text} />
            <Text style={[s.rowActionText, { color: C.text }]}>Hộp thư</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.rowActionBtn, { backgroundColor: C.card2, borderWidth: 1, borderColor: C.border }]}
            onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              onShare();
            }}
          >
            <Ionicons name="share-social-outline" size={15} color={C.text} />
            <Text style={[s.rowActionText, { color: C.text }]}>Chia sẻ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.rowActionBtn, { backgroundColor: C.card2, borderWidth: 1, borderColor: C.border }]}
            onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              onMore();
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={17} color={C.text} />
            <Text style={[s.rowActionText, { color: C.text }]}>Khác</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function SellerListingGridCard({
  item,
  C,
  language,
  t,
  actionLoading,
  onPress,
  onEdit,
  onMessages,
  onShare,
  onMarkSold,
  onMarkAvailable,
  onBoost,
  onDelete,
  onMore,
}: {
  item: Listing;
  C: typeof DARK;
  language: string;
  t: ReturnType<typeof useT>;
  actionLoading: boolean;
  onPress: () => void;
  onEdit: () => void;
  onMessages: () => void;
  onShare: () => void;
  onMarkSold: () => void;
  onMarkAvailable: () => void;
  onBoost: () => void;
  onDelete: () => void;
  onMore: () => void;
}) {
  const statusColor = getListingStatusColor(item, C);
  const imageUri = item.mediaUrls?.[0];
  const disablePrimary = actionLoading || (item.status !== 'active' && item.status !== 'sold');
  const isSalePending = item.status === 'active' && item.saleStatus === 'pending';
  const shouldMarkAvailable = item.status === 'sold' || isSalePending;

  return (
    <TouchableOpacity
      style={[s.sellerGridCard, { backgroundColor: C.card, borderColor: C.border, width: CARD_W }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={[s.cardImg, { backgroundColor: C.card2 }]}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={s.imageFallback}>
            <Ionicons name="image-outline" size={32} color={C.muted} />
          </View>
        )}
        <View style={s.cardTopBadges}>
          <View style={[s.tinyBadge, { backgroundColor: statusColor }]}>
            <Text style={s.tinyBadgeText}>{getListingStatusText(item)}</Text>
          </View>
          {isBoostActive(item) ? (
            <View style={[s.tinyBadge, { backgroundColor: C.purple }]}>
              <Ionicons name="flash" size={10} color="#fff" />
              <Text style={s.tinyBadgeText}>Boost</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={s.cardBody}>
        <Text style={[s.price, { color: C.accent }]} numberOfLines={1}>{formatPrice(item.price, language, t)}</Text>
        <Text style={[s.cardTitle, { color: C.text }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[s.locText, { color: C.muted }]} numberOfLines={1}>{item.viewCount ?? 0} xem · {item.savedBy?.length ?? 0} lưu</Text>
        <Text style={[s.locText, { color: C.muted }]} numberOfLines={1}>{formatListingDate(item.createdAt)}</Text>
        <View style={s.sellerGridActions}>
          <TouchableOpacity style={[s.gridIconBtn, { backgroundColor: `${C.accent}1f` }]} onPress={(event) => { event.stopPropagation(); onEdit(); }}>
            <Ionicons name="create-outline" size={15} color={C.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.gridIconBtn, { backgroundColor: C.card2, borderColor: C.border, borderWidth: 1 }]} onPress={(event) => { event.stopPropagation(); onMessages(); }}>
            <Ionicons name="chatbubble-ellipses-outline" size={15} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.gridIconBtn, { backgroundColor: C.card2, borderColor: C.border, borderWidth: 1, opacity: item.status !== 'active' || actionLoading ? 0.55 : 1 }]}
            disabled={item.status !== 'active' || actionLoading}
            onPress={(event) => { event.stopPropagation(); onBoost(); }}
          >
            <Ionicons name="flash-outline" size={15} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.gridIconBtn, { backgroundColor: C.accent, opacity: disablePrimary ? 0.55 : 1 }]}
            disabled={disablePrimary}
            onPress={(event) => {
              event.stopPropagation();
              if (shouldMarkAvailable) onMarkAvailable();
              else onMarkSold();
            }}
          >
            <Ionicons name={shouldMarkAvailable ? 'play-circle-outline' : 'checkmark-circle-outline'} size={15} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[s.gridIconBtn, { backgroundColor: C.card2, borderColor: C.border, borderWidth: 1 }]} onPress={(event) => { event.stopPropagation(); onShare(); }}>
            <Ionicons name="share-social-outline" size={15} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.gridIconBtn, { backgroundColor: `${C.red}1f` }]} onPress={(event) => { event.stopPropagation(); onDelete(); }}>
            <Ionicons name="trash-outline" size={15} color={C.red} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.gridIconBtn, { backgroundColor: C.card2, borderColor: C.border, borderWidth: 1 }]} onPress={(event) => { event.stopPropagation(); onMore(); }}>
            <Ionicons name="ellipsis-horizontal" size={16} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState({
  C,
  title,
  subtitle,
  icon,
  actionLabel,
  onAction,
}: {
  C: typeof DARK;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={52} color={C.muted} />
      <Text style={[s.emptyTitle, { color: C.text }]}>{title}</Text>
      <Text style={[s.emptySub, { color: C.subtext }]}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity style={[s.retryBtn, { backgroundColor: C.accent }]} onPress={onAction}>
          <Text style={s.retryText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function MarketplaceScreen({
  navigation,
  initialTab = 'all',
  resetSignal = 0,
  scrollTopSignal = 0,
  safeTop = true,
  showHeader = true,
  showBackButton = true,
  onScrollPositionChange,
}: Props) {
  const t = useT();
  const language = useLanguage();
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const user = useAuthStore((state) => state.user);
  const listRef = useRef<FlatList<Listing>>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAtTopRef = useRef(true);

  const {
    listings,
    loading,
    refreshing,
    error,
    nextCursor,
    activeCategory,
    searchQuery,
    searchResults,
    searching,
    myListings,
    myListingsLoading,
    myListingsLoadingMore,
    myListingsNextCursor,
    myListingsFilter,
    myListingsCounts,
    myListingsSummary,
    savedListings,
    savedLoading,
    fetchListings,
    setCategory,
    search,
    setSearchQuery,
    fetchMyListings,
    fetchSavedListings,
    toggleSave,
    updateListing,
    deleteListing,
    markAsSold,
    boostListing,
    pauseBoost,
    resumeBoost,
    fetchModerationAccess,
    fetchPendingModerationListings,
    setModerationMode,
    bulkApproveAiFailedListings,
    rerunAiModeration,
    approveListing,
    rejectListing,
  } = useMarketplaceStore();

  const [activeTab, setActiveTab] = useState<MarketTab>(initialTab);
  const [sellerSection, setSellerSection] = useState<SellerSection>('listings');
  const [sellerInsightRange, setSellerInsightRange] = useState<'7' | '14' | '30'>('7');
  const [sellerListingView, setSellerListingView] = useState<'list' | 'grid'>('list');
  const [searchFocused, setSearchFocused] = useState(false);
  const [sellerSearch, setSellerSearch] = useState('');
  const [listingActionId, setListingActionId] = useState<string | null>(null);
  const [boostTarget, setBoostTarget] = useState<Listing | null>(null);
  const [selectedBoostPlanId, setSelectedBoostPlanId] = useState<(typeof BOOST_BUDGET_OPTIONS)[number]['id']>('starter');
  const [boostPaymentProvider, setBoostPaymentProvider] = useState<BoostSandboxPaymentProvider>('zalopay');
  const [pendingPayment, setPendingPayment] = useState<PaymentSession | null>(null);
  const [boostSubmitting, setBoostSubmitting] = useState(false);
  const [paymentLaunching, setPaymentLaunching] = useState(false);
  const [messagesListing, setMessagesListing] = useState<Listing | null>(null);
  const [actionsListing, setActionsListing] = useState<Listing | null>(null);
  const [sellerMessagesTab, setSellerMessagesTab] = useState<SellerMessagesTab>('messages');
  const [sellerListingConversations, setSellerListingConversations] = useState<MarketplaceConversationItem[]>([]);
  const [sellerListingConversationsLoading, setSellerListingConversationsLoading] = useState(false);
  const [sellerListingConversationsError, setSellerListingConversationsError] = useState('');
  const [isMarketplaceAdmin, setIsMarketplaceAdmin] = useState(false);
  const [moderationSettings, setModerationSettings] = useState<MarketplaceModerationSettings | null>(null);
  const [moderationQueue, setModerationQueue] = useState<Listing[]>([]);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationError, setModerationError] = useState('');
  const [moderationActionId, setModerationActionId] = useState<string | null>(null);
  const [moderationBulkApproving, setModerationBulkApproving] = useState(false);

  const selectedBoostPlan = useMemo(
    () => BOOST_BUDGET_OPTIONS.find((plan) => plan.id === selectedBoostPlanId) ?? BOOST_BUDGET_OPTIONS[0],
    [selectedBoostPlanId]
  );

  const reloadModerationQueue = useCallback(async () => {
    setModerationLoading(true);
    setModerationError('');
    try {
      const items = await fetchPendingModerationListings('pending');
      setModerationQueue(items);
    } catch (err) {
      setModerationError((err as Error).message || 'Không thể tải hàng chờ kiểm duyệt');
    } finally {
      setModerationLoading(false);
    }
  }, [fetchPendingModerationListings]);

  useEffect(() => {
    fetchListings(true);
  }, [fetchListings]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!user?.uid) {
      setIsMarketplaceAdmin(false);
      setModerationSettings(null);
      setModerationQueue([]);
      return () => {
        cancelled = true;
      };
    }

    fetchModerationAccess()
      .then((access) => {
        if (cancelled) return;
        setIsMarketplaceAdmin(Boolean(access.isAdmin));
        setModerationSettings(access.settings);
      })
      .catch(() => {
        if (cancelled) return;
        setIsMarketplaceAdmin(false);
        setModerationSettings(null);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchModerationAccess, user?.uid]);

  useEffect(() => {
    if (activeTab === 'saved') {
      void fetchSavedListings();
    } else if (activeTab === 'seller') {
      void fetchMyListings(true, myListingsFilter);
    }
  }, [activeTab, fetchMyListings, fetchSavedListings, myListingsFilter]);

  useEffect(() => {
    if (!isMarketplaceAdmin && sellerSection === 'moderation') {
      setSellerSection('listings');
    }
  }, [isMarketplaceAdmin, sellerSection]);

  useEffect(() => {
    if (activeTab === 'seller' && isMarketplaceAdmin && sellerSection === 'moderation') {
      void reloadModerationQueue();
    }
  }, [activeTab, isMarketplaceAdmin, reloadModerationQueue, sellerSection]);

  useEffect(() => {
    if (!messagesListing) {
      setSellerListingConversations([]);
      setSellerListingConversationsError('');
      return;
    }

    let cancelled = false;
    const loadSellerListingConversations = async () => {
      setSellerListingConversationsLoading(true);
      setSellerListingConversationsError('');
      try {
        const data = await api.get<{ items: MarketplaceConversationItem[] }>(
          `/api/marketplace/${encodeURIComponent(messagesListing.id)}/conversations`
        );
        if (!cancelled) setSellerListingConversations(data.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setSellerListingConversations([]);
          setSellerListingConversationsError((err as Error).message || 'Không thể tải tin nhắn');
        }
      } finally {
        if (!cancelled) setSellerListingConversationsLoading(false);
      }
    };

    void loadSellerListingConversations();
    return () => {
      cancelled = true;
    };
  }, [messagesListing]);

  useEffect(() => {
    if (!resetSignal) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    if (activeTab === 'all') void fetchListings(true);
    if (activeTab === 'saved') void fetchSavedListings();
    if (activeTab === 'seller') void fetchMyListings(true, myListingsFilter);
  }, [activeTab, fetchListings, fetchMyListings, fetchSavedListings, myListingsFilter, resetSignal]);

  useEffect(() => {
    if (!scrollTopSignal) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [scrollTopSignal]);

  const visibleAllListings = searchQuery.trim() ? searchResults : listings;
  const visibleSavedListings = useMemo(
    () => savedListings.filter((item) => matchesLocalSearch(item, searchQuery, activeCategory)),
    [activeCategory, savedListings, searchQuery]
  );
  const visibleSellerListings = useMemo(
    () => myListings.filter((item) => matchesLocalSearch(item, sellerSearch, 'all')),
    [myListings, sellerSearch]
  );
  const visibleSellerSections = useMemo(
    () => (isMarketplaceAdmin ? [...SELLER_SECTIONS, ADMIN_SELLER_SECTION] : SELLER_SECTIONS),
    [isMarketplaceAdmin]
  );
  const sellerShowsList = activeTab === 'seller' && sellerSection === 'listings';
  const sellerDisplayName = user?.displayName || user?.email || 'Người bán Surf';
  const sellerPhotoUrl = user?.photoURL ?? null;
  const sellerInitial = sellerDisplayName.trim().charAt(0).toUpperCase() || 'S';
  const isAllSearchMode = activeTab === 'all' && !!searchQuery.trim();
  const contentLoading =
    activeTab === 'all'
      ? isAllSearchMode
        ? searching
        : loading
      : activeTab === 'saved'
        ? savedLoading
        : sellerShowsList && myListingsLoading;
  const displayedListings =
    activeTab === 'seller'
      ? sellerShowsList
        ? visibleSellerListings
        : []
      : activeTab === 'saved'
        ? visibleSavedListings
        : visibleAllListings;

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const atTop = event.nativeEvent.contentOffset.y <= 8;
    if (atTop !== lastAtTopRef.current) {
      lastAtTopRef.current = atTop;
      onScrollPositionChange?.(atTop);
    }
  }, [onScrollPositionChange]);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (activeTab === 'all' && query.trim()) void search(query);
      if (!query.trim()) void search('');
    }, 340);
  }, [activeTab, search, setSearchQuery]);

  const handleTabChange = useCallback((tab: MarketTab) => {
    setActiveTab(tab);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    if (tab !== 'all') setSearchFocused(false);
  }, []);

  const refreshCurrent = useCallback(() => {
    if (activeTab === 'all') return searchQuery.trim() ? search(searchQuery) : fetchListings(true);
    if (activeTab === 'saved') return fetchSavedListings();
    if (isMarketplaceAdmin && sellerSection === 'moderation') void reloadModerationQueue();
    return fetchMyListings(true, myListingsFilter);
  }, [
    activeTab,
    fetchListings,
    fetchMyListings,
    fetchSavedListings,
    isMarketplaceAdmin,
    myListingsFilter,
    reloadModerationQueue,
    search,
    searchQuery,
    sellerSection,
  ]);

  const handleEndReached = useCallback(() => {
    if (activeTab === 'all' && !searchQuery.trim() && !loading && nextCursor) void fetchListings(false);
    if (sellerShowsList && !myListingsLoadingMore && !myListingsLoading && myListingsNextCursor) {
      void fetchMyListings(false, myListingsFilter);
    }
  }, [
    activeTab,
    fetchListings,
    fetchMyListings,
    loading,
    myListingsFilter,
    myListingsLoading,
    myListingsLoadingMore,
    myListingsNextCursor,
    nextCursor,
    searchQuery,
    sellerShowsList,
  ]);

  const handleSave = useCallback(async (id: string) => {
    try {
      await toggleSave(id);
    } catch (err) {
      Alert.alert(t('error'), (err as Error).message || t('listing_update_error'));
    }
  }, [t, toggleSave]);

  const withListingAction = useCallback(async (id: string, action: () => Promise<unknown>) => {
    setListingActionId(id);
    try {
      await action();
    } catch (err) {
      Alert.alert(t('error'), (err as Error).message || t('listing_update_error'));
    } finally {
      setListingActionId(null);
    }
  }, [t]);

  const confirmDelete = useCallback((listing: Listing) => {
    setActionsListing(null);
    Alert.alert('Xóa bài niêm yết', `Xóa "${listing.title}" khỏi Surf Market?`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void withListingAction(listing.id, () => deleteListing(listing.id));
        },
      },
    ]);
  }, [deleteListing, t, withListingAction]);

  const handleMarkAvailable = useCallback((listing: Listing) => {
    setActionsListing(null);
    void withListingAction(listing.id, () =>
      updateListing(listing.id, listing.status === 'sold' ? { status: 'active' } : { saleStatus: 'available' })
    );
  }, [updateListing, withListingAction]);

  const handleMarkSold = useCallback((listing: Listing) => {
    setActionsListing(null);
    Alert.alert('Đánh dấu hết hàng', `Tin "${listing.title}" sẽ không còn hiện ở Market công khai.`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: 'Hết hàng',
        onPress: () => {
          void withListingAction(listing.id, () => markAsSold(listing.id));
        },
      },
    ]);
  }, [markAsSold, t, withListingAction]);

  const handleMarkPending = useCallback((listing: Listing) => {
    if (listing.status !== 'active' || listing.saleStatus === 'pending') return;
    setActionsListing(null);
    void withListingAction(listing.id, () => updateListing(listing.id, { saleStatus: 'pending' }));
  }, [updateListing, withListingAction]);

  const handleShareSellerListing = useCallback(async (listing: Listing) => {
    setActionsListing(null);
    const webBase = (process.env.EXPO_PUBLIC_WEB_URL || 'https://surf-7ce71.web.app').replace(/\/+$/, '');
    const url = `${webBase}/feed/market/${listing.id}`;
    try {
      await Share.share({
        title: listing.title,
        message: `${listing.title} - ${formatPrice(listing.price, language, t)}\n${url}`,
        url,
      });
    } catch {
      Alert.alert(t('error'), 'Không thể chia sẻ bài niêm yết');
    }
  }, [language, t]);

  const openBoostModal = useCallback((listing: Listing) => {
    setActionsListing(null);
    if (isBoostActive(listing)) {
      void withListingAction(listing.id, () => pauseBoost(listing.id));
      return;
    }
    if (canResumeBoost(listing)) {
      void withListingAction(listing.id, () => resumeBoost(listing.id));
      return;
    }
    setBoostTarget(listing);
    setPendingPayment(null);
    setSelectedBoostPlanId('starter');
    setBoostPaymentProvider('zalopay');
  }, [pauseBoost, resumeBoost, withListingAction]);

  const closeBoostModal = useCallback(() => {
    if (boostSubmitting || paymentLaunching) return;
    setBoostTarget(null);
    setPendingPayment(null);
  }, [boostSubmitting, paymentLaunching]);

  const launchBoostPayment = useCallback(async () => {
    if (!boostTarget) return;
    setPaymentLaunching(true);
    try {
      const total = getBoostTotal(selectedBoostPlan);
      const session = await api.post<PaymentSession>('/api/marketplace/boost-payments', {
        provider: boostPaymentProvider,
        amount: total,
        title: `Surf Boost - ${boostTarget.title}`,
      });
      setPendingPayment(session);
      await WebBrowser.openBrowserAsync(session.paymentUrl);
    } catch (err) {
      Alert.alert('Không mở được thanh toán', (err as Error).message || 'Vui lòng thử lại.');
    } finally {
      setPaymentLaunching(false);
    }
  }, [boostPaymentProvider, boostTarget, selectedBoostPlan]);

  const completeBoostPayment = useCallback(async () => {
    if (!boostTarget || !pendingPayment) return;
    setBoostSubmitting(true);
    try {
      const status = await api.get<PaymentSession>(`/api/marketplace/boost-payments/${pendingPayment.paymentId}/status`);
      if (status.status !== 'paid') {
        Alert.alert('Chưa xác nhận thanh toán', 'Giao dịch sandbox chưa chuyển sang trạng thái paid. Hoàn tất thanh toán rồi bấm kiểm tra lại.');
        return;
      }
      await boostListing(boostTarget.id, {
        boostPlan: {
          dailyBudget: selectedBoostPlan.dailyBudget,
          durationDays: selectedBoostPlan.durationDays,
          placements: [...selectedBoostPlan.placements],
        },
        boostPaymentProvider,
        boostPaymentId: status.paymentId,
      });
      setBoostTarget(null);
      setPendingPayment(null);
      Alert.alert('Đã gửi Boost', 'Chiến dịch Boost đang chờ kiểm duyệt để chạy.');
    } catch (err) {
      Alert.alert('Không chạy được Boost', (err as Error).message || 'Vui lòng thử lại.');
    } finally {
      setBoostSubmitting(false);
    }
  }, [boostListing, boostPaymentProvider, boostTarget, pendingPayment, selectedBoostPlan]);

  const openSellerMessages = useCallback((listing: Listing) => {
    setActionsListing(null);
    setMessagesListing(listing);
    setSellerMessagesTab('messages');
  }, []);

  const closeSellerMessages = useCallback(() => {
    setMessagesListing(null);
  }, []);

  const openSellerConversation = useCallback((conversation: MarketplaceConversationItem) => {
    if (!messagesListing) return;
    const peer = conversation.peer;
    const marketplace = conversation.marketplace ?? {
      kind: 'marketplace' as const,
      listingId: messagesListing.id,
      title: messagesListing.title,
      imageUrl: messagesListing.mediaUrls?.[0] ?? null,
      price: messagesListing.price,
      currency: messagesListing.currency,
      location: messagesListing.location,
      sellerId: messagesListing.sellerId,
    };

    setMessagesListing(null);
    navigation.navigate('Chat', {
      conversationId: conversation.id,
      title: peer?.name ?? marketplace.title,
      peerUid: peer?.uid ?? null,
      peerName: peer?.name ?? null,
      peerAvatar: peer?.avatarUrl ?? null,
      muted: Boolean(conversation.muted),
      members: conversation.members ?? (peer ? [peer] : []),
      memberCount: conversation.memberCount,
      conversationType: 'marketplace',
      marketplaceTitle: marketplace.title,
      marketplace: {
        listingId: marketplace.listingId,
        title: marketplace.title,
        imageUrl: marketplace.imageUrl,
        price: marketplace.price,
        location: marketplace.location,
        sellerId: marketplace.sellerId,
      },
    });
  }, [messagesListing, navigation]);

  const handleToggleModerationMode = useCallback(async (mode: MarketplaceModerationMode) => {
    setModerationError('');
    try {
      const settings = await setModerationMode(mode);
      setModerationSettings(settings);
    } catch (err) {
      setModerationError((err as Error).message || 'Không thể đổi chế độ kiểm duyệt');
    }
  }, [setModerationMode]);

  const handleApproveModeration = useCallback((listing: Listing) => {
    setModerationActionId(listing.id);
    setModerationError('');
    approveListing(listing.id, 'Admin đã duyệt Surf Market')
      .then(() => {
        setModerationQueue((items) => items.filter((item) => item.id !== listing.id));
        void fetchListings(true);
        void fetchMyListings(true, myListingsFilter);
      })
      .catch((err) => {
        setModerationError((err as Error).message || 'Không thể duyệt tin đăng');
      })
      .finally(() => setModerationActionId(null));
  }, [approveListing, fetchListings, fetchMyListings, myListingsFilter]);

  const handleRejectModeration = useCallback((listing: Listing) => {
    Alert.alert('Từ chối tin đăng', `Từ chối "${listing.title}" khỏi Surf Market?`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: 'Từ chối',
        style: 'destructive',
        onPress: () => {
          setModerationActionId(listing.id);
          setModerationError('');
          rejectListing(listing.id, 'Không phù hợp chính sách Surf Market')
            .then(() => {
              setModerationQueue((items) => items.filter((item) => item.id !== listing.id));
              void fetchMyListings(true, myListingsFilter);
            })
            .catch((err) => {
              setModerationError((err as Error).message || 'Không thể từ chối tin đăng');
            })
            .finally(() => setModerationActionId(null));
        },
      },
    ]);
  }, [myListingsFilter, fetchMyListings, rejectListing, t]);

  const handleRerunAiModeration = useCallback((listing: Listing) => {
    setModerationActionId(listing.id);
    setModerationError('');
    rerunAiModeration(listing.id)
      .then((updated) => {
        if (updated.status === 'pending') {
          setModerationQueue((items) => items.map((item) => (item.id === listing.id ? updated : item)));
        } else {
          setModerationQueue((items) => items.filter((item) => item.id !== listing.id));
          if (updated.status === 'active') void fetchListings(true);
        }
        void fetchMyListings(true, myListingsFilter);
      })
      .catch((err) => {
        setModerationError((err as Error).message || 'Không thể chạy lại AI kiểm duyệt');
      })
      .finally(() => setModerationActionId(null));
  }, [fetchListings, fetchMyListings, myListingsFilter, rerunAiModeration]);

  const handleBulkApproveAiFailed = useCallback(() => {
    if (moderationBulkApproving) return;
    Alert.alert('Duyệt nhanh demo', 'Duyệt nhanh các bài demo bị kẹt do AI lỗi/quota?', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: 'Duyệt nhanh',
        onPress: async () => {
          setModerationBulkApproving(true);
          setModerationError('');
          try {
            const result = await bulkApproveAiFailedListings(true);
            await Promise.all([fetchMyListings(true, myListingsFilter), reloadModerationQueue()]);
            Alert.alert(
              'Hoàn tất',
              result.updated > 0
                ? `Đã duyệt ${result.updated} bài demo bị kẹt AI.`
                : 'Không có bài demo nào đủ điều kiện duyệt nhanh.'
            );
          } catch (err) {
            setModerationError((err as Error).message || 'Không thể duyệt nhanh bài bị kẹt AI');
          } finally {
            setModerationBulkApproving(false);
          }
        },
      },
    ]);
  }, [
    bulkApproveAiFailedListings,
    fetchMyListings,
    moderationBulkApproving,
    myListingsFilter,
    reloadModerationQueue,
    t,
  ]);

  const Header = (
    <>
      {showHeader && (
        <View style={[s.header, { borderBottomColor: C.border, backgroundColor: C.bg }]}>
          {showBackButton && navigation.canGoBack() ? (
            <TouchableOpacity style={[s.iconBtn, { borderColor: C.border, backgroundColor: C.card }]} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color={C.text} />
            </TouchableOpacity>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: C.text }]}>Surf Market</Text>
            <Text style={[s.headerSub, { color: C.subtext }]} numberOfLines={1}>
              Mua bán, lưu tin, quản lý người bán
            </Text>
          </View>
          <TouchableOpacity
            style={[s.iconBtn, { borderColor: C.border, backgroundColor: C.card }]}
            onPress={() => navigation.navigate('CreateListing')}
          >
            <Ionicons name="add" size={22} color={C.text} />
          </TouchableOpacity>
        </View>
      )}

      <View style={[s.searchWrap, { backgroundColor: C.bg }]}>
        <View style={[s.searchBar, { backgroundColor: C.input, borderColor: searchFocused ? C.accent : C.border }]}>
          <Ionicons name="search-outline" size={17} color={C.subtext} />
          <TextInput
            style={[s.searchInput, { color: C.text }]}
            placeholder={activeTab === 'seller' ? 'Tìm trong tin của tôi...' : t('market_search_placeholder')}
            placeholderTextColor={C.placeholder}
            value={activeTab === 'seller' ? sellerSearch : searchQuery}
            onChangeText={activeTab === 'seller' ? setSellerSearch : handleSearchChange}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
          />
          {(activeTab === 'seller' ? sellerSearch : searchQuery).length > 0 && (
            <TouchableOpacity
              onPress={() => {
                if (activeTab === 'seller') setSellerSearch('');
                else {
                  setSearchQuery('');
                  void search('');
                }
              }}
            >
              <Ionicons name="close-circle" size={18} color={C.subtext} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={[s.tabs, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
        {[
          { key: 'all' as const, label: 'Tất cả', icon: 'grid-outline' as const },
          { key: 'saved' as const, label: 'Đã lưu', icon: 'bookmark-outline' as const },
          { key: 'seller' as const, label: 'Người bán', icon: 'storefront-outline' as const },
        ].map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[s.tabBtn, { backgroundColor: active ? C.accent : 'transparent' }]}
              onPress={() => handleTabChange(tab.key)}
            >
              <Ionicons name={tab.icon} size={15} color={active ? '#fff' : C.subtext} />
              <Text style={[s.tabText, { color: active ? '#fff' : C.text }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab !== 'seller' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.pills}
          style={{ flexGrow: 0, backgroundColor: C.bg }}
        >
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[s.pill, { backgroundColor: active ? C.accent : C.pill, borderColor: active ? C.accent : 'transparent' }]}
                onPress={() => {
                  if (activeTab !== 'all') {
                    setCategory(cat.key);
                  } else {
                    void setCategory(cat.key);
                  }
                }}
              >
                <Ionicons name={cat.icon} size={14} color={active ? '#fff' : C.text} />
                <Text style={[s.pillLabel, { color: active ? '#fff' : C.text }]}>{t(cat.labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </>
  );

  const SellerHeader = (
    <View style={{ paddingHorizontal: 12, paddingTop: 12, gap: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sellerSectionTabs}>
        {visibleSellerSections.map((section) => {
          const active = sellerSection === section.key;
          return (
            <TouchableOpacity
              key={section.key}
              style={[s.sellerSectionChip, { backgroundColor: active ? C.accent : C.card, borderColor: active ? C.accent : C.border }]}
              onPress={() => setSellerSection(section.key)}
            >
              <Ionicons name={section.icon} size={15} color={active ? '#fff' : C.subtext} />
              <Text style={[s.sellerSectionText, { color: active ? '#fff' : C.text }]}>{section.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {sellerSection === 'dashboard' ? (
        <View style={[s.sellerDashboard, { backgroundColor: C.card2, borderColor: C.border }]}>
          <View style={s.dashboardTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.dashboardTitle, { color: C.text }]}>Bảng điều khiển người bán</Text>
              <Text style={[s.dashboardSub, { color: C.subtext }]}>Tin, kiểm duyệt, Boost và hiệu quả bán hàng</Text>
            </View>
            <TouchableOpacity style={[s.dashboardPostBtn, { backgroundColor: C.accent }]} onPress={() => navigation.navigate('CreateListing')}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.dashboardPostText}>Đăng tin</Text>
            </TouchableOpacity>
          </View>
          <View style={s.metricsGrid}>
            <MetricCard C={C} icon="eye-outline" label="Lượt xem" value={myListingsSummary.views} />
            <MetricCard C={C} icon="bookmark-outline" label="Lượt lưu" value={myListingsSummary.saves} />
            <MetricCard C={C} icon="flash-outline" label="Boost đang chạy" value={myListingsSummary.activeBoosts} />
            <MetricCard C={C} icon="trending-up-outline" label="Impressions" value={myListingsSummary.boostImpressions} />
          </View>
          <View style={s.metricsGrid}>
            <MetricCard C={C} icon="storefront-outline" label="Đang bán" value={myListingsCounts.active} />
            <MetricCard C={C} icon="bag-check-outline" label="Đã bán" value={myListingsCounts.sold} />
            <MetricCard C={C} icon="time-outline" label="Chờ duyệt" value={myListingsCounts.pending} />
            <MetricCard C={C} icon="warning-outline" label="Cần xử lý" value={myListingsCounts.error} />
          </View>
          <TouchableOpacity style={[s.sectionActionBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={() => setSellerSection('listings')}>
            <Text style={[s.sectionActionText, { color: C.text }]}>Xem bài niêm yết của bạn</Text>
            <Ionicons name="chevron-forward" size={18} color={C.subtext} />
          </TouchableOpacity>
        </View>
      ) : null}

      {sellerSection === 'listings' ? (
        <View style={[s.sellerPanel, { backgroundColor: C.card2, borderColor: C.border }]}>
          <View style={s.dashboardTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sellerPanelTitle, { color: C.text }]}>Bài niêm yết của bạn</Text>
              <Text style={[s.sellerPanelSub, { color: C.subtext }]}>Quản lý trạng thái, Boost, hộp thư và lượt xem từng tin.</Text>
            </View>
            <TouchableOpacity style={[s.dashboardPostBtn, { backgroundColor: C.accent }]} onPress={() => navigation.navigate('CreateListing')}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.dashboardPostText}>Đăng tin</Text>
            </TouchableOpacity>
          </View>
          <View style={[s.viewSwitch, { backgroundColor: C.card, borderColor: C.border }]}>
            {[
              { key: 'list' as const, icon: 'list-outline' as const, label: 'List' },
              { key: 'grid' as const, icon: 'grid-outline' as const, label: 'Grid' },
            ].map((view) => {
              const active = sellerListingView === view.key;
              return (
                <TouchableOpacity
                  key={view.key}
                  style={[s.viewSwitchBtn, { backgroundColor: active ? C.accent : 'transparent' }]}
                  onPress={() => setSellerListingView(view.key)}
                >
                  <Ionicons name={view.icon} size={15} color={active ? '#fff' : C.text} />
                  <Text style={[s.viewSwitchText, { color: active ? '#fff' : C.text }]}>{view.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MY_FILTERS.map((filter) => {
              const active = myListingsFilter === filter.key;
              return (
                <TouchableOpacity
                  key={filter.key}
                  style={[s.filterChip, { backgroundColor: active ? C.accent : C.card, borderColor: active ? C.accent : C.border }]}
                  onPress={() => fetchMyListings(true, filter.key)}
                >
                  <Text style={[s.filterChipText, { color: active ? '#fff' : C.text }]}>
                    {filter.label} · {myListingsCounts[filter.countKey] ?? 0}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {sellerSection === 'notifications' ? (
        <View style={[s.sellerPanel, { backgroundColor: C.card2, borderColor: C.border }]}>
          <View style={[s.adminEmpty, { borderColor: C.border }]}>
            <Ionicons name="notifications-outline" size={34} color={C.muted} />
            <Text style={[s.emptyTitle, { color: C.text }]}>Bạn đã xem hết rồi</Text>
            <Text style={[s.adminEmptyText, { color: C.subtext }]}>Thông báo về bài niêm yết, tin nhắn và kiểm duyệt Surf Market sẽ xuất hiện tại đây.</Text>
          </View>
        </View>
      ) : null}

      {sellerSection === 'insights' ? (
        <View style={[s.sellerPanel, { backgroundColor: C.card2, borderColor: C.border }]}>
          <View style={s.dashboardTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sellerPanelTitle, { color: C.text }]}>Thông tin chi tiết trên Surf Market</Text>
              <Text style={[s.sellerPanelSub, { color: C.subtext }]}>Tổng hợp hiệu quả từ các bài niêm yết và chiến dịch Boost.</Text>
            </View>
            <View style={[s.rangeSwitch, { backgroundColor: C.card, borderColor: C.border }]}>
              {(['7', '14', '30'] as const).map((range) => {
                const active = sellerInsightRange === range;
                return (
                  <TouchableOpacity
                    key={range}
                    style={[s.rangeBtn, { backgroundColor: active ? C.accent : 'transparent' }]}
                    onPress={() => setSellerInsightRange(range)}
                  >
                    <Text style={[s.rangeBtnText, { color: active ? '#fff' : C.text }]}>{range}d</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={s.metricsGrid}>
            <MetricCard C={C} icon="eye-outline" label="Lượt click" value={myListingsSummary.views} />
            <MetricCard C={C} icon="bookmark-outline" label="Lượt lưu" value={myListingsSummary.saves} />
            <MetricCard C={C} icon="share-social-outline" label="Lượt chia sẻ" value={0} />
            <MetricCard C={C} icon="people-outline" label="Người theo dõi" value={0} />
            <MetricCard C={C} icon="flash-outline" label="Boost active" value={myListingsSummary.activeBoosts} />
            <MetricCard C={C} icon="trending-up-outline" label="Boost impressions" value={myListingsSummary.boostImpressions} />
            <MetricCard C={C} icon="cash-outline" label="Boost spent" value={formatPrice(myListingsSummary.boostSpent, language, t)} />
            <MetricCard C={C} icon="storefront-outline" label="Tổng tin" value={myListingsCounts.all} />
          </View>
        </View>
      ) : null}

      {sellerSection === 'profile' ? (
        <View style={[s.sellerProfilePanel, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={[s.profileCover, { backgroundColor: C.card2 }]} />
          <View style={[s.profileAvatarLarge, { backgroundColor: C.card, borderColor: C.card }]}>
            {sellerPhotoUrl ? (
              <Image source={{ uri: sellerPhotoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <Text style={[s.profileInitial, { color: C.text }]}>{sellerInitial}</Text>
            )}
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 42 }}>
            <Text style={[s.profileName, { color: C.text }]}>{sellerDisplayName}</Text>
            <Text style={[s.sellerPanelSub, { color: C.subtext }]}>Đã tham gia Surf Market</Text>
            <Text style={[s.sellerPanelSub, { color: C.subtext }]}>{myListingsCounts.active} bài niêm yết đang hoạt động</Text>
            <View style={[s.profileNote, { backgroundColor: C.card2 }]}>
              <Text style={[s.profileNoteText, { color: C.subtext }]}>Quyền riêng tư Surf Market kiểm soát những gì người mua nhìn thấy trên trang bán hàng của bạn.</Text>
            </View>
            <View style={[s.profileDivider, { borderTopColor: C.border }]}>
              <Text style={[s.sellerPanelTitle, { color: C.text }]}>Xếp hạng người bán</Text>
              <View style={s.starRow}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <Ionicons key={index} name="star-outline" size={18} color={C.accent} />
                ))}
              </View>
              <Text style={[s.sellerPanelSub, { color: C.subtext }]}>Không có xếp hạng</Text>
            </View>
          </View>
        </View>
      ) : null}

      {sellerSection === 'moderation' && isMarketplaceAdmin ? (
        <AdminModerationPanel
          C={C}
          language={language}
          t={t}
          settings={moderationSettings}
          queue={moderationQueue}
          loading={moderationLoading}
          error={moderationError}
          actionId={moderationActionId}
          bulkApproving={moderationBulkApproving}
          onModeChange={handleToggleModerationMode}
          onReload={() => void reloadModerationQueue()}
          onBulkApprove={handleBulkApproveAiFailed}
          onRerun={handleRerunAiModeration}
          onApprove={handleApproveModeration}
          onReject={handleRejectModeration}
          onPressListing={(listing) => navigation.navigate('MarketplaceDetail', { listingId: listing.id })}
        />
      ) : null}
    </View>
  );

  const renderSellerActionsModal = () => {
    const listing = actionsListing;
    if (!listing) return null;

    const actionLoading = listingActionId === listing.id;
    const isSalePending = listing.status === 'active' && listing.saleStatus === 'pending';
    const isSold = listing.status === 'sold';
    const canMarkSold = listing.status === 'active' && !isSalePending;
    const canUseBoost = listing.status === 'active';
    const statusText = isSold ? 'Đánh dấu là còn hàng' : isSalePending ? 'Đánh dấu là có sẵn' : 'Đánh dấu là hết hàng';
    const statusIcon: keyof typeof Ionicons.glyphMap = isSold || isSalePending ? 'play-circle-outline' : 'checkmark-circle-outline';

    const ActionRow = ({
      label,
      subtitle,
      icon,
      color,
      disabled,
      destructive,
      onPress,
    }: {
      label: string;
      subtitle?: string;
      icon: keyof typeof Ionicons.glyphMap;
      color?: string;
      disabled?: boolean;
      destructive?: boolean;
      onPress: () => void;
    }) => (
      <TouchableOpacity
        style={[
          s.actionsMenuBtn,
          { backgroundColor: C.card2, borderColor: C.border, opacity: disabled ? 0.48 : 1 },
          destructive ? { backgroundColor: `${C.red}14`, borderColor: `${C.red}44` } : null,
        ]}
        disabled={disabled}
        onPress={onPress}
      >
        <View style={[s.actionsMenuIcon, { backgroundColor: `${color ?? C.text}18` }]}>
          <Ionicons name={icon} size={19} color={color ?? C.text} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.actionsMenuText, { color: color ?? C.text }]} numberOfLines={1}>{label}</Text>
          {subtitle ? (
            <Text style={[s.actionsMenuSub, { color: C.subtext }]} numberOfLines={2}>{subtitle}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );

    return (
      <Modal visible={!!listing} transparent animationType="slide" onRequestClose={() => setActionsListing(null)}>
        <Pressable style={[s.modalBackdrop, { backgroundColor: C.overlay }]} onPress={() => setActionsListing(null)}>
          <Pressable style={[s.actionsSheet, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.sheetHeader}>
              <View style={[s.actionsListingImage, { backgroundColor: C.card2 }]}>
                {listing.mediaUrls?.[0] ? (
                  <Image source={{ uri: listing.mediaUrls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <Ionicons name="image-outline" size={23} color={C.muted} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.sheetTitle, { color: C.text }]} numberOfLines={1}>Tác vụ bài niêm yết</Text>
                <Text style={[s.sheetSub, { color: C.subtext }]} numberOfLines={2}>{listing.title}</Text>
              </View>
              <TouchableOpacity style={[s.iconBtn, { borderColor: C.border }]} onPress={() => setActionsListing(null)}>
                <Ionicons name="close" size={20} color={C.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.actionsMenu} showsVerticalScrollIndicator={false}>
              {canMarkSold ? (
                <ActionRow
                  label={statusText}
                  subtitle="Ẩn tin khỏi Market công khai khi món đã hết."
                  icon={statusIcon}
                  color={C.accent}
                  disabled={actionLoading}
                  onPress={() => handleMarkSold(listing)}
                />
              ) : isSold || isSalePending ? (
                <ActionRow
                  label={statusText}
                  subtitle={isSold ? 'Đưa tin bán lại trên Surf Market.' : 'Gỡ trạng thái đang chờ giao dịch.'}
                  icon={statusIcon}
                  color={C.accent}
                  disabled={actionLoading}
                  onPress={() => handleMarkAvailable(listing)}
                />
              ) : null}

              {listing.status === 'active' && !isSalePending ? (
                <ActionRow
                  label="Đánh dấu là đang chờ"
                  subtitle="Giữ tin ở trạng thái chờ giao dịch như trên web."
                  icon="time-outline"
                  color={C.yellow}
                  disabled={actionLoading}
                  onPress={() => handleMarkPending(listing)}
                />
              ) : null}

              <ActionRow
                label={getBoostActionLabel(listing)}
                subtitle={isBoostActive(listing) ? 'Tạm ngưng quảng bá đang chạy.' : canResumeBoost(listing) ? `Bật lại trong thời hạn còn lại: ${getBoostRemainingText(listing)}.` : 'Chọn gói Boost và thanh toán sandbox.'}
                icon={isBoostActive(listing) ? 'pause-circle-outline' : 'flash-outline'}
                color={C.purple}
                disabled={!canUseBoost || actionLoading}
                onPress={() => openBoostModal(listing)}
              />
              <ActionRow
                label="Chia sẻ"
                subtitle="Gửi link bài niêm yết Surf Market."
                icon="share-social-outline"
                onPress={() => void handleShareSellerListing(listing)}
              />
              <ActionRow
                label="Xem bài niêm yết"
                subtitle="Mở màn hình chi tiết như người mua nhìn thấy."
                icon="open-outline"
                onPress={() => {
                  setActionsListing(null);
                  navigation.navigate('MarketplaceDetail', { listingId: listing.id });
                }}
              />
              <ActionRow
                label="Chỉnh sửa bài niêm yết"
                subtitle="Sửa tiêu đề, ảnh, giá, mô tả và field nâng cao."
                icon="create-outline"
                color={C.accent}
                onPress={() => {
                  setActionsListing(null);
                  navigation.navigate('CreateListing', { listingId: listing.id });
                }}
              />
              <ActionRow
                label="Xóa bài niêm yết"
                subtitle="Gỡ tin này khỏi seller center."
                icon="trash-outline"
                color={C.red}
                destructive
                onPress={() => confirmDelete(listing)}
              />
              <ActionRow
                label="Xem tin nhắn"
                subtitle="Mở hộp thư, bình luận và insight của riêng tin này."
                icon="chatbubble-ellipses-outline"
                onPress={() => openSellerMessages(listing)}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderBoostModal = () => (
    <Modal visible={!!boostTarget} transparent animationType="slide" onRequestClose={closeBoostModal}>
      <Pressable style={[s.modalBackdrop, { backgroundColor: C.overlay }]} onPress={closeBoostModal}>
        <Pressable style={[s.boostSheet, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={s.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: C.text }]}>Boost bài niêm yết</Text>
              <Text style={[s.sheetSub, { color: C.subtext }]} numberOfLines={1}>{boostTarget?.title}</Text>
            </View>
            <TouchableOpacity style={[s.iconBtn, { borderColor: C.border }]} onPress={closeBoostModal}>
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {boostTarget ? (
              <View style={[s.boostAdPreview, { backgroundColor: C.card2, borderColor: C.border }]}>
                <View style={s.boostAdHeader}>
                  <View style={[s.avatarCircle, { backgroundColor: C.card, borderColor: C.border }]}>
                    {boostTarget.sellerPhotoURL ? (
                      <Image source={{ uri: boostTarget.sellerPhotoURL }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <Text style={[s.avatarInitial, { color: C.text }]}>
                        {(boostTarget.sellerDisplayName || 'S').charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.boostAdSeller, { color: C.text }]} numberOfLines={1}>{boostTarget.sellerDisplayName || 'Người bán'} đang quảng bá một mặt hàng.</Text>
                    <Text style={[s.boostAdMeta, { color: C.subtext }]}>Surf Market Sponsored</Text>
                  </View>
                </View>
                <View style={[s.boostAdImage, { backgroundColor: C.card }]}>
                  {boostTarget.mediaUrls?.[0] ? (
                    <Image source={{ uri: boostTarget.mediaUrls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <Ionicons name="image-outline" size={30} color={C.muted} />
                  )}
                </View>
                <View style={{ gap: 2 }}>
                  <Text style={[s.boostAdTitle, { color: C.text }]} numberOfLines={2}>{boostTarget.title}</Text>
                  <Text style={[s.boostAdPrice, { color: C.accent }]}>{formatPrice(boostTarget.price, language, t)}</Text>
                </View>
              </View>
            ) : null}

            {BOOST_BUDGET_OPTIONS.map((plan) => {
              const active = selectedBoostPlanId === plan.id;
              const total = getBoostTotal(plan);
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[s.boostPlan, { borderColor: active ? C.accent : C.border, backgroundColor: active ? `${C.accent}18` : C.card2 }]}
                  onPress={() => {
                    setSelectedBoostPlanId(plan.id);
                    setPendingPayment(null);
                  }}
                >
                  <View style={s.boostPlanTop}>
                    <Text style={[s.boostPlanName, { color: C.text }]}>{plan.name}</Text>
                    <View style={[s.statusBadge, { backgroundColor: `${C.accent}22` }]}>
                      <Text style={[s.statusBadgeText, { color: C.accent }]}>{plan.badge}</Text>
                    </View>
                  </View>
                  <Text style={[s.boostPlanPrice, { color: C.accent }]}>
                    {formatPrice(total, language, t)} · {plan.durationDays} ngày
                  </Text>
                  <Text style={[s.boostPlanSub, { color: C.subtext }]}>Dự kiến tiếp cận {plan.reach} người</Text>
                  <Text style={[s.boostPlanSub, { color: C.muted }]}>
                    {plan.placements.map((item) => BOOST_PLACEMENT_LABELS[item] ?? item).join(' · ')}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <Text style={[s.sectionCaption, { color: C.text }]}>Cổng thanh toán sandbox</Text>
            <View style={s.paymentGrid}>
              {BOOST_PAYMENT_METHODS.map((method) => {
                const active = boostPaymentProvider === method.key;
                return (
                  <TouchableOpacity
                    key={method.key}
                    style={[s.paymentMethod, { backgroundColor: active ? C.accent : C.card2, borderColor: active ? C.accent : C.border }]}
                    onPress={() => {
                      setBoostPaymentProvider(method.key);
                      setPendingPayment(null);
                    }}
                  >
                    <Text style={[s.paymentShort, { color: active ? '#fff' : C.text }]}>{method.short}</Text>
                    <Text style={[s.paymentLabel, { color: active ? '#e0f2fe' : C.subtext }]}>{method.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {pendingPayment ? (
              <View style={[s.pendingPayment, { borderColor: C.border, backgroundColor: C.card2 }]}>
                <Text style={[s.pendingTitle, { color: C.text }]}>Đã tạo giao dịch {pendingPayment.orderId}</Text>
                <Text style={[s.pendingText, { color: C.subtext }]}>
                  Nếu đã thanh toán ở sandbox, bấm kiểm tra để chạy Boost.
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={[s.sheetActions, { borderTopColor: C.border }]}>
            <TouchableOpacity style={[s.secondarySheetBtn, { borderColor: C.border }]} onPress={closeBoostModal} disabled={boostSubmitting || paymentLaunching}>
              <Text style={[s.secondarySheetText, { color: C.text }]}>Hủy</Text>
            </TouchableOpacity>
            {pendingPayment ? (
              <TouchableOpacity style={[s.primarySheetBtn, { backgroundColor: C.accent }]} onPress={completeBoostPayment} disabled={boostSubmitting}>
                {boostSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primarySheetText}>Kiểm tra & chạy</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[s.primarySheetBtn, { backgroundColor: C.accent }]} onPress={launchBoostPayment} disabled={paymentLaunching}>
                {paymentLaunching ? <ActivityIndicator color="#fff" /> : <Text style={s.primarySheetText}>Mở thanh toán</Text>}
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderSellerMessagesModal = () => {
    const listing = messagesListing;
    return (
      <Modal visible={!!listing} transparent animationType="slide" onRequestClose={closeSellerMessages}>
        <Pressable style={[s.modalBackdrop, { backgroundColor: C.overlay }]} onPress={closeSellerMessages}>
          <Pressable style={[s.messagesSheet, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[s.sheetTitle, { color: C.text }]}>Hộp thư bài niêm yết</Text>
                <Text style={[s.sheetSub, { color: C.subtext }]} numberOfLines={1}>{listing?.title}</Text>
              </View>
              <TouchableOpacity style={[s.iconBtn, { borderColor: C.border }]} onPress={closeSellerMessages}>
                <Ionicons name="close" size={20} color={C.text} />
              </TouchableOpacity>
            </View>

            {listing ? (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <View style={[s.messagesListingCard, { backgroundColor: C.card2, borderColor: C.border }]}>
                  <View style={[s.messagesListingImage, { backgroundColor: C.card }]}>
                    {listing.mediaUrls?.[0] ? (
                      <Image source={{ uri: listing.mediaUrls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <Ionicons name="image-outline" size={24} color={C.muted} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={2}>{listing.title}</Text>
                    <Text style={[s.rowPrice, { color: C.accent }]}>{formatPrice(listing.price, language, t)}</Text>
                    <Text style={[s.rowStatText, { color: C.subtext }]} numberOfLines={1}>
                      {getListingStatusText(listing)} · {listing.location || 'Toàn quốc'}
                    </Text>
                    <Text style={[s.rowStatText, { color: C.muted }]}>{formatListingDate(listing.createdAt)}</Text>
                  </View>
                </View>

                <View style={s.messagesQuickActions}>
                  <TouchableOpacity
                    style={[s.messagesQuickBtn, { backgroundColor: C.accent }]}
                    onPress={() => {
                      closeSellerMessages();
                      navigation.navigate('MarketplaceDetail', { listingId: listing.id });
                    }}
                  >
                    <Ionicons name="open-outline" size={15} color="#fff" />
                    <Text style={s.rowActionText}>Chi tiết</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.messagesQuickBtn, { backgroundColor: C.card2, borderColor: C.border, borderWidth: 1 }]}
                    onPress={() => {
                      if (listing.status === 'sold' || listing.saleStatus === 'pending') handleMarkAvailable(listing);
                      else handleMarkSold(listing);
                    }}
                  >
                    <Ionicons name="checkmark-circle-outline" size={15} color={C.text} />
                    <Text style={[s.rowActionText, { color: C.text }]}>
                      {listing.status === 'sold' || listing.saleStatus === 'pending' ? 'Còn hàng' : 'Hết hàng'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.messagesQuickBtn, { backgroundColor: C.card2, borderColor: C.border, borderWidth: 1 }]}
                    onPress={() => {
                      closeSellerMessages();
                      openBoostModal(listing);
                    }}
                    disabled={listing.status !== 'active'}
                  >
                    <Ionicons name="flash-outline" size={15} color={listing.status === 'active' ? C.text : C.muted} />
                    <Text style={[s.rowActionText, { color: listing.status === 'active' ? C.text : C.muted }]}>
                      {getBoostActionLabel(listing)}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[s.messagesTabs, { borderBottomColor: C.border }]}>
                  {[
                    { key: 'messages' as const, label: 'Tin nhắn' },
                    { key: 'comments' as const, label: 'Bình luận' },
                    { key: 'insights' as const, label: 'Insight' },
                  ].map((tab) => {
                    const active = sellerMessagesTab === tab.key;
                    return (
                      <TouchableOpacity key={tab.key} style={[s.messagesTabBtn, active ? { borderBottomColor: C.accent } : null]} onPress={() => setSellerMessagesTab(tab.key)}>
                        <Text style={[s.messagesTabText, { color: active ? C.accent : C.subtext }]}>{tab.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {sellerMessagesTab === 'messages' ? (
                  sellerListingConversationsLoading ? (
                    <View style={[s.adminEmpty, { borderColor: C.border }]}>
                      <ActivityIndicator color={C.accent} />
                      <Text style={[s.adminEmptyText, { color: C.subtext }]}>Đang tải tin nhắn...</Text>
                    </View>
                  ) : sellerListingConversationsError ? (
                    <View style={[s.errorBox, { backgroundColor: `${C.red}16`, borderColor: `${C.red}55` }]}>
                      <Text style={[s.errorText, { color: C.red }]}>{sellerListingConversationsError}</Text>
                    </View>
                  ) : sellerListingConversations.length === 0 ? (
                    <View style={[s.adminEmpty, { borderColor: C.border }]}>
                      <Ionicons name="chatbubble-ellipses-outline" size={28} color={C.muted} />
                      <Text style={[s.adminEmptyText, { color: C.subtext }]}>Chưa có tin nhắn cho bài niêm yết này.</Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {sellerListingConversations.map((conversation) => (
                        <TouchableOpacity
                          key={conversation.id}
                          style={[s.conversationRow, { backgroundColor: C.card2, borderColor: C.border }]}
                          onPress={() => openSellerConversation(conversation)}
                        >
                          <View style={[s.avatarCircle, { backgroundColor: C.card, borderColor: C.border }]}>
                            {conversation.peer?.avatarUrl ? (
                              <Image source={{ uri: conversation.peer.avatarUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                            ) : (
                              <Text style={[s.avatarInitial, { color: C.text }]}>
                                {(conversation.peer?.name ?? 'N').charAt(0).toUpperCase()}
                              </Text>
                            )}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={s.conversationTopLine}>
                              <Text style={[s.conversationName, { color: C.text }]} numberOfLines={1}>
                                {conversation.peer?.name ?? 'Người mua'}
                              </Text>
                              {conversation.unreadCount > 0 ? (
                                <View style={[s.unreadBadge, { backgroundColor: C.accent }]}>
                                  <Text style={s.unreadBadgeText}>{conversation.unreadCount}</Text>
                                </View>
                              ) : null}
                              <Text style={[s.conversationTime, { color: C.muted }]}>
                                {formatConversationTime(conversation.lastMessageAt)}
                              </Text>
                            </View>
                            <Text style={[s.conversationPreview, { color: C.subtext }]} numberOfLines={2}>
                              {conversation.lastMessagePreview || `Đã hỏi về ${listing.title}`}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )
                ) : sellerMessagesTab === 'comments' ? (
                  <View style={[s.adminEmpty, { borderColor: C.border }]}>
                    <Ionicons name="chatbox-outline" size={28} color={C.muted} />
                    <Text style={[s.adminEmptyText, { color: C.subtext }]}>Chưa có bình luận cho bài niêm yết này.</Text>
                  </View>
                ) : (
                  <View style={s.metricsGrid}>
                    <MetricCard C={C} icon="eye-outline" label="Lượt click" value={listing.viewCount ?? 0} />
                    <MetricCard C={C} icon="bookmark-outline" label="Lượt lưu" value={listing.savedBy?.length ?? 0} />
                    <MetricCard C={C} icon="flash-outline" label="Boost views" value={listing.boostMetrics?.impressions ?? 0} />
                    <MetricCard C={C} icon="cash-outline" label="Đã chi" value={formatPrice(listing.boostMetrics?.spent ?? 0, language, t)} />
                  </View>
                )}
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const listEmpty = activeTab === 'seller' && !sellerShowsList ? null : contentLoading ? null : activeTab === 'all' && error ? (
    <EmptyState
      C={C}
      icon="warning-outline"
      title={t('market_load_error')}
      subtitle={error}
      actionLabel={t('retry')}
      onAction={() => void refreshCurrent()}
    />
  ) : activeTab === 'saved' ? (
    <EmptyState C={C} icon="bookmark-outline" title="Chưa lưu tin nào" subtitle="Những món bạn lưu trên web cũng sẽ xuất hiện ở đây." />
  ) : activeTab === 'seller' ? (
    <EmptyState
      C={C}
      icon="storefront-outline"
      title={sellerSearch ? 'Không tìm thấy tin phù hợp' : 'Bạn chưa có tin đăng nào'}
      subtitle={sellerSearch ? 'Thử từ khóa khác trong tin của bạn.' : 'Đăng tin đầu tiên để bắt đầu bán trên Surf Market.'}
      actionLabel={sellerSearch ? undefined : 'Đăng tin ngay'}
      onAction={sellerSearch ? undefined : () => navigation.navigate('CreateListing')}
    />
  ) : (
    <EmptyState
      C={C}
      icon="storefront-outline"
      title={searchQuery.trim() ? t('market_no_results') : t('market_empty')}
      subtitle={searchQuery.trim() ? t('market_no_results_sub') : t('market_empty_sub')}
      actionLabel={searchQuery.trim() ? undefined : 'Đăng tin'}
      onAction={searchQuery.trim() ? undefined : () => navigation.navigate('CreateListing')}
    />
  );

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={safeTop ? ['top'] : []}>
      {contentLoading && displayedListings.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing || savedLoading || myListingsLoading} onRefresh={() => void refreshCurrent()} tintColor={C.accent} colors={[C.accent]} />}
        >
          {Header}
          {activeTab === 'seller' && SellerHeader}
          <View style={s.skeletonGrid}>
            {Array.from({ length: 6 }).map((_, index) => <SkeletonCard key={index} C={C} />)}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          ref={listRef}
          key={`market-${activeTab}-${sellerListingView}`}
          data={displayedListings}
          keyExtractor={(item) => item.id}
          numColumns={sellerShowsList && sellerListingView === 'grid' ? 2 : activeTab === 'seller' ? 1 : 2}
          ListHeaderComponent={<>{Header}{activeTab === 'seller' && SellerHeader}</>}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={[
            activeTab === 'seller' ? s.sellerListContent : s.gridContent,
            displayedListings.length === 0 ? { flexGrow: 1 } : null,
          ]}
          columnWrapperStyle={sellerShowsList && sellerListingView === 'grid' ? s.gridRow : activeTab === 'seller' ? undefined : s.gridRow}
          renderItem={({ item }) =>
            activeTab === 'seller' && sellerListingView === 'grid' ? (
              <SellerListingGridCard
                item={item}
                C={C}
                language={language}
                t={t}
                actionLoading={listingActionId === item.id}
                onPress={() => navigation.navigate('MarketplaceDetail', { listingId: item.id })}
                onEdit={() => navigation.navigate('CreateListing', { listingId: item.id })}
                onMessages={() => openSellerMessages(item)}
                onShare={() => void handleShareSellerListing(item)}
                onMarkSold={() => handleMarkSold(item)}
                onMarkAvailable={() => handleMarkAvailable(item)}
                onBoost={() => openBoostModal(item)}
                onDelete={() => confirmDelete(item)}
                onMore={() => setActionsListing(item)}
              />
            ) : activeTab === 'seller' ? (
              <SellerListingRow
                item={item}
                C={C}
                language={language}
                t={t}
                actionLoading={listingActionId === item.id}
                onPress={() => navigation.navigate('MarketplaceDetail', { listingId: item.id })}
                onEdit={() => navigation.navigate('CreateListing', { listingId: item.id })}
                onMessages={() => openSellerMessages(item)}
                onShare={() => void handleShareSellerListing(item)}
                onMarkSold={() => handleMarkSold(item)}
                onMarkAvailable={() => handleMarkAvailable(item)}
                onBoost={() => openBoostModal(item)}
                onDelete={() => confirmDelete(item)}
                onMore={() => setActionsListing(item)}
              />
            ) : (
              <ListingCard
                item={item}
                C={C}
                onPress={() => navigation.navigate('MarketplaceDetail', { listingId: item.id })}
                userId={user?.uid}
                onSave={handleSave}
                t={t}
                language={language}
              />
            )
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing || savedLoading || myListingsLoading}
              onRefresh={() => void refreshCurrent()}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            (activeTab === 'all' && loading && displayedListings.length > 0) ||
            (sellerShowsList && myListingsLoadingMore)
              ? <ActivityIndicator color={C.accent} style={{ paddingVertical: 18 }} />
              : null
          }
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        />
      )}

      <TouchableOpacity style={[s.fab, { backgroundColor: C.accent }]} onPress={() => navigation.navigate('CreateListing')} activeOpacity={0.86}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
      {renderSellerActionsModal()}
      {renderBoostModal()}
      {renderSellerMessagesModal()}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: '900', letterSpacing: 0 },
  headerSub: { marginTop: 1, fontSize: 11, fontWeight: '700' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  searchBar: {
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  tabs: {
    minHeight: 47,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    minHeight: 34,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabText: { fontSize: 12, fontWeight: '900' },
  pills: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  pill: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    gap: 5,
  },
  pillLabel: { fontSize: 12, fontWeight: '800' },
  gridContent: { paddingBottom: 112 },
  gridRow: { gap: GRID_GAP, paddingHorizontal: GRID_PADDING, marginBottom: GRID_GAP },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    paddingTop: 12,
    gap: GRID_GAP,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardImg: { width: '100%', height: CARD_W, overflow: 'hidden' },
  imageFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardTopBadges: { position: 'absolute', top: 8, left: 8, right: 46, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tinyBadge: { minHeight: 21, borderRadius: 11, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 3 },
  tinyBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  saveFab: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  cardBody: { padding: 10, gap: 4 },
  price: { fontSize: 15, fontWeight: '900' },
  cardTitle: { minHeight: 38, fontSize: 13, fontWeight: '800', lineHeight: 18 },
  cardMetaRow: { minHeight: 15, flexDirection: 'row', alignItems: 'center', gap: 3 },
  locText: { flex: 1, fontSize: 10.5, fontWeight: '700' },
  skeletonLine: { height: 12, borderRadius: 6 },
  sellerListContent: { paddingBottom: 112 },
  sellerSectionTabs: { gap: 8, paddingBottom: 2 },
  sellerSectionChip: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sellerSectionText: { fontSize: 12, fontWeight: '900' },
  sellerDashboard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 12 },
  dashboardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dashboardTitle: { fontSize: 17, fontWeight: '900' },
  dashboardSub: { marginTop: 2, fontSize: 11, fontWeight: '700' },
  dashboardPostBtn: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dashboardPostText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricCard: { width: '48.5%', borderRadius: 12, borderWidth: 1, padding: 10, gap: 4 },
  metricValue: { fontSize: 16, fontWeight: '900' },
  metricLabel: { fontSize: 10.5, fontWeight: '800' },
  sellerPanel: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 12 },
  sellerPanelTitle: { fontSize: 16, fontWeight: '900' },
  sellerPanelSub: { marginTop: 2, fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
  sectionActionBtn: {
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionActionText: { fontSize: 13, fontWeight: '900' },
  rangeSwitch: { minHeight: 34, borderRadius: 12, borderWidth: 1, flexDirection: 'row', padding: 3, gap: 3 },
  rangeBtn: { minWidth: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  rangeBtnText: { fontSize: 11.5, fontWeight: '900' },
  viewSwitch: { minHeight: 38, borderRadius: 13, borderWidth: 1, flexDirection: 'row', padding: 3, gap: 3 },
  viewSwitchBtn: { flex: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  viewSwitchText: { fontSize: 12, fontWeight: '900' },
  sellerProfilePanel: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  profileCover: { height: 92 },
  profileAvatarLarge: {
    position: 'absolute',
    top: 46,
    left: 16,
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: { fontSize: 34, fontWeight: '900' },
  profileName: { fontSize: 22, fontWeight: '900' },
  profileNote: { marginTop: 14, borderRadius: 13, padding: 12 },
  profileNoteText: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  profileDivider: { marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  starRow: { flexDirection: 'row', gap: 4, marginTop: 8, marginBottom: 4 },
  filterChip: { minHeight: 32, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  filterChipText: { fontSize: 12, fontWeight: '900' },
  adminPanel: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 12 },
  adminTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  adminKicker: { fontSize: 10.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0 },
  adminTitle: { marginTop: 1, fontSize: 17, fontWeight: '900' },
  adminSub: { marginTop: 2, fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
  modeSwitch: { minHeight: 38, borderRadius: 13, borderWidth: 1, flexDirection: 'row', padding: 3, gap: 3 },
  modeBtn: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modeBtnText: { fontSize: 12, fontWeight: '900' },
  warningBox: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  warningText: { flex: 1, fontSize: 12, fontWeight: '900', lineHeight: 16 },
  errorBox: { borderWidth: 1, borderRadius: 13, padding: 10 },
  errorText: { fontSize: 12, fontWeight: '800', lineHeight: 17 },
  adminEmpty: { minHeight: 94, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14 },
  adminEmptyText: { fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 17 },
  moderationTrace: { borderWidth: 1, borderRadius: 12, padding: 9, gap: 6 },
  moderationTraceText: { fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
  moderationRow: { borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: 'row', gap: 10 },
  moderationImage: { width: 76, height: 76, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  moderationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 3 },
  smallActionBtn: { minHeight: 31, borderRadius: 10, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  smallActionText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  sellerGridCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sellerGridActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  gridIconBtn: { width: 36, minHeight: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sellerRow: {
    marginHorizontal: 12,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    gap: 10,
  },
  rowImage: { width: 86, height: 86, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  sellerRowBody: { flex: 1, minWidth: 0, gap: 4 },
  rowTitleLine: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '900', lineHeight: 18 },
  iconAction: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowPrice: { fontSize: 14, fontWeight: '900' },
  inlineBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  statusBadgeText: { fontSize: 10.5, fontWeight: '900' },
  moderationReason: { fontSize: 11, fontWeight: '700', lineHeight: 15 },
  rowStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowStatText: { fontSize: 10.5, fontWeight: '700' },
  sellerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 3 },
  rowActionBtn: {
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 86,
    minHeight: 34,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
  },
  rowActionText: { color: '#fff', fontSize: 11.5, fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30, paddingTop: 52 },
  emptyTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptySub: { fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 19 },
  retryBtn: { minHeight: 38, borderRadius: 19, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  boostSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  sheetTitle: { fontSize: 19, fontWeight: '900' },
  sheetSub: { marginTop: 2, fontSize: 12, fontWeight: '700' },
  actionsSheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  actionsListingImage: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  actionsMenu: { paddingHorizontal: 14, paddingBottom: 18, gap: 8 },
  actionsMenuBtn: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionsMenuIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionsMenuText: { fontSize: 13.5, fontWeight: '900' },
  actionsMenuSub: { marginTop: 2, fontSize: 11.5, fontWeight: '700', lineHeight: 15 },
  boostPlan: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 5 },
  boostAdPreview: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  boostAdHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boostAdSeller: { fontSize: 12.5, fontWeight: '900' },
  boostAdMeta: { marginTop: 1, fontSize: 10.5, fontWeight: '700' },
  boostAdImage: { minHeight: 168, borderRadius: 13, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  boostAdTitle: { fontSize: 14, fontWeight: '900', lineHeight: 19 },
  boostAdPrice: { fontSize: 13, fontWeight: '900' },
  boostPlanTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  boostPlanName: { flex: 1, fontSize: 15, fontWeight: '900' },
  boostPlanPrice: { fontSize: 13, fontWeight: '900' },
  boostPlanSub: { fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
  sectionCaption: { fontSize: 13, fontWeight: '900', marginTop: 2 },
  paymentGrid: { flexDirection: 'row', gap: 8 },
  paymentMethod: { flex: 1, borderWidth: 1, borderRadius: 13, padding: 10, minHeight: 66, justifyContent: 'center', gap: 4 },
  paymentShort: { fontSize: 12, fontWeight: '900' },
  paymentLabel: { fontSize: 10.5, fontWeight: '700', lineHeight: 14 },
  pendingPayment: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 4 },
  pendingTitle: { fontSize: 13, fontWeight: '900' },
  pendingText: { fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
  sheetActions: { borderTopWidth: 1, flexDirection: 'row', gap: 10, padding: 14 },
  secondarySheetBtn: { flex: 1, minHeight: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primarySheetBtn: { flex: 1.35, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  secondarySheetText: { fontSize: 14, fontWeight: '900' },
  primarySheetText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  messagesSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  messagesListingCard: { borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: 'row', gap: 10 },
  messagesListingImage: { width: 76, height: 76, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  messagesQuickActions: { flexDirection: 'row', gap: 8 },
  messagesQuickBtn: { flex: 1, minHeight: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 8 },
  messagesTabs: { minHeight: 38, flexDirection: 'row', borderBottomWidth: 1 },
  messagesTabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  messagesTabText: { fontSize: 12, fontWeight: '900' },
  conversationRow: { minHeight: 68, borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarCircle: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 15, fontWeight: '900' },
  conversationTopLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  conversationName: { flex: 1, fontSize: 13, fontWeight: '900' },
  unreadBadge: { minWidth: 19, height: 19, borderRadius: 9.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  conversationTime: { fontSize: 10.5, fontWeight: '700' },
  conversationPreview: { marginTop: 2, fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
});
