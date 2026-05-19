import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Circle, MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  useMarketplaceStore,
  type Listing,
  type Category,
  type Condition,
  type ListingAvailability,
  type MarketplaceModerationMode,
  type MarketplaceModerationSettings,
  type MyListingsFilter,
} from '../stores/marketplaceStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import Avatar from '../components/ui/Avatar';
import PresenceBadge from '../components/ui/PresenceBadge';
import MiniChatPanel from '../components/layout/MiniChatPanel';
import { api } from '../lib/api';
import { uploadImage } from '../lib/cloudinary';
import { usePresenceStore } from '../stores/presenceStore';

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'all', label: 'Tất cả', icon: 'M4 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h4V6zm8 0V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2h8z' },
  { key: 'electronics', label: 'Điện tử', icon: 'M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z' },
  { key: 'clothing', label: 'Thời trang', icon: 'M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z' },
  { key: 'vehicles', label: 'Xe cộ', icon: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9l-3.3-1.1c-.2-.1-.3-.2-.4-.3l-2.4-4c-.3-.5-1-.7-1.5-.7h-3.8c-.5 0-1.2.2-1.5.7l-2.4 4c-.1.1-.2.2-.4.3l-3.3 1.1c-.8.2-1.5 1-1.5 1.9v3c0 .6.4 1 1 1h2' },
  { key: 'property', label: 'Bất động sản', icon: 'M3 21V9l9-7 9 7v12h-6v-7H9v7H3zm8-2h2v-5h-2v5z' },
  { key: 'home', label: 'Gia dụng', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11l2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6' },
  { key: 'sports', label: 'Thể thao', icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z' },
  { key: 'other', label: 'Khác', icon: 'M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0' },
];

const REPORT_CATEGORIES = [
  { key: 'spam', label: 'Spam hoặc lừa đảo' },
  { key: 'hate', label: 'Ngôn từ thù ghét hoặc quấy rối' },
  { key: 'violence', label: 'Ảnh khỏa thân hoặc bạo lực' },
  { key: 'fake_news', label: 'Thông tin sai lệch' },
  { key: 'illegal', label: 'Bán hàng trái phép' },
  { key: 'copyright', label: 'Vi phạm bản quyền (IP)' },
  { key: 'other', label: 'Lý do khác' },
];

const CONDITION_LABELS: Record<Condition, string> = {
  new: 'Mới',
  like_new: 'Như mới',
  good: 'Tốt',
  fair: 'Khá',
};

const CREATE_CONDITION_LABELS: Record<Condition, string> = {
  new: 'Mới',
  like_new: 'Đã qua sử dụng - Như mới',
  good: 'Đã qua sử dụng - Tốt',
  fair: 'Đã qua sử dụng - Khá',
};

const AVAILABILITY_LABELS: Record<ListingAvailability, string> = {
  in_stock: 'Niêm yết là Còn hàng',
  single_item: 'Niêm yết là một mặt hàng',
};

const MEETING_OPTIONS = [
  { key: 'public_meetup', label: 'Gặp mặt ở nơi công cộng', helper: 'Chọn địa điểm đông người, an toàn.' },
  { key: 'door_pickup', label: 'Người mua tới lấy', helper: 'Người mua nhận hàng tại nơi của bạn.' },
  { key: 'door_dropoff', label: 'Để hàng trước cửa', helper: 'Bạn để hàng trước cửa nhà người mua.' },
] as const;

const BOOST_BUDGET_OPTIONS = [
  { dailyBudget: 30000, reach: '0 - 991', durationDays: 3 },
  { dailyBudget: 60000, reach: '0 - 1.077', durationDays: 3 },
  { dailyBudget: 80000, reach: '0 - 1.133', durationDays: 3 },
  { dailyBudget: 110000, reach: '0 - 1.216', durationDays: 3 },
  { dailyBudget: 140000, reach: '0 - 1.298', durationDays: 3 },
] as const;

const SANDBOX_PAYMENT_TEST_CARDS = [
  {
    label: 'Thanh toán thành công',
    status: 'Success',
    helper: 'Dùng card này để hoàn tất sandbox.',
    name: 'Surf Sandbox Buyer',
    number: '4242 4242 4242 4242',
    expiry: '12/34',
    cvv: '123',
    succeeds: true,
    failureMessage: '',
  },
  {
    label: 'Thẻ bị từ chối',
    status: 'Declined',
    helper: 'Dùng để test thông báo lỗi thanh toán.',
    name: 'Surf Declined Buyer',
    number: '4000 0000 0000 0002',
    expiry: '12/34',
    cvv: '123',
    succeeds: false,
    failureMessage: 'Thẻ sandbox này bị từ chối. Hãy dùng thẻ thành công 4242 4242 4242 4242.',
  },
] as const;

type CreateStep = 'listing' | 'boost';
type PaymentStep = 'method' | 'card';
type PaymentMethod = 'card' | 'visa' | 'momo' | 'vnpay';
type MarketplaceConversationContext = {
  kind: 'marketplace';
  listingId: string;
  buyerId: string;
  sellerId: string;
  title: string;
  price: number;
  currency: 'VND';
  imageUrl: string | null;
  location: string;
  status: string;
  saleStatus?: string | null;
  sellerDisplayName: string;
  sellerPhotoURL: string | null;
};
type MarketplaceConversationItem = {
  id: string;
  type: 'dm' | 'group';
  title?: string;
  marketplace?: MarketplaceConversationContext;
  peer: { uid: string; name: string; avatarUrl: string | null } | null;
  members?: { uid: string; name: string; avatarUrl: string | null }[];
  memberCount?: number;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};
const MY_LISTING_FILTERS: { key: MyListingsFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'active', label: 'Hoạt động' },
  { key: 'error', label: 'Spam/Lỗi' },
];
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
type SellerMessagesTab = 'messages' | 'comments' | 'insights';

interface NewListingDraft {
  title: string;
  description: string;
  price: string;
  category: Exclude<Category, 'all'>;
  condition: Condition;
  location: string;
  mediaUrls: string[];
  brand: string;
  productType: string;
  material: string;
  availability: ListingAvailability;
  tags: string;
  sku: string;
  meetingPreferences: string[];
  hideFromFriends: boolean;
  boostEnabled: boolean;
}

const DEFAULT_NEW_LISTING: NewListingDraft = {
  title: '',
  description: '',
  price: '',
  category: 'other',
  condition: 'good',
  location: '',
  mediaUrls: [],
  brand: '',
  productType: '',
  material: '',
  availability: 'in_stock',
  tags: '',
  sku: '',
  meetingPreferences: ['public_meetup'],
  hideFromFriends: false,
  boostEnabled: false,
};

type SellerSection = 'listings' | 'dashboard' | 'notifications' | 'insights' | 'profile' | 'moderation';

const SELLER_SECTIONS: { key: SellerSection; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Bảng điều khiển của người bán', icon: 'M3 13h8V3H3v10zm10 8h8V3h-8v18zM3 21h8v-6H3v6z' },
  { key: 'listings', label: 'Bài niêm yết của bạn', icon: 'M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z' },
  { key: 'notifications', label: 'Thông báo', icon: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0' },
  { key: 'insights', label: 'Thông tin chi tiết', icon: 'M4 19V9m5 10V5m5 14v-7m5 7V3' },
  { key: 'profile', label: 'Trang bán hàng Surf', icon: 'M5.121 17.804A8 8 0 1118.88 17.8M15 11a3 3 0 11-6 0 3 3 0 016 0z' },
];

const ADMIN_SELLER_SECTION = {
  key: 'moderation' as const,
  label: 'Kiểm duyệt Surf Market',
  icon: 'M9 12l2 2 4-4m5-6v6c0 5-3.5 9.7-8 11-4.5-1.3-8-6-8-11V4l8-2 8 2z',
};

function formatPrice(price: number) {
  if (price === 0) return 'Miễn phí';
  return price.toLocaleString('vi-VN') + ' ₫';
}

function normalizeSandboxCardNumber(value: string) {
  return value.replace(/\D/g, '');
}

function getSandboxCardValidationError(card: { name: string; number: string; expiry: string; cvv: string }) {
  if (!card.name.trim()) return 'Nhập tên trên thẻ sandbox để tiếp tục.';
  const testCard = SANDBOX_PAYMENT_TEST_CARDS.find((item) => normalizeSandboxCardNumber(item.number) === normalizeSandboxCardNumber(card.number));
  if (!testCard) return 'Số thẻ sandbox không hợp lệ. Dùng thẻ test trong khung Dữ liệu test sandbox.';
  if (!testCard.succeeds) return testCard.failureMessage;
  if (card.expiry.trim() !== testCard.expiry || card.cvv.trim() !== testCard.cvv) {
    return `Với thẻ ${testCard.number}, hạn dùng phải là ${testCard.expiry} và CVV là ${testCard.cvv}.`;
  }
  return '';
}

function getListingTimeValue(value: unknown): number {
  if (!value) return 0;
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

function formatSellerListingDate(value: unknown) {
  const time = getListingTimeValue(value);
  if (!time) return 'Không rõ ngày';
  const date = new Date(time);
  const now = new Date();
  const timeText = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `Hôm nay lúc ${timeText}`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatConversationTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function getSellerListingStatusText(listing: Listing) {
  if (listing.status === 'pending') return 'Đang chờ duyệt';
  if (listing.status === 'rejected') return 'Bị từ chối';
  if (listing.status === 'sold') return 'Hết hàng';
  if (listing.saleStatus === 'pending') return 'Đang chờ';
  return 'Còn hàng';
}

function isListingBoostActive(listing: Listing) {
  return listing.boostEnabled && listing.boostStatus === 'active';
}

function getBoostStatusText(listing: Listing) {
  if (!listing.boostEnabled) return 'Chưa quảng bá';
  if (listing.boostStatus === 'active') return 'Đang quảng bá';
  if (listing.boostStatus === 'awaiting_moderation') return 'Chờ duyệt để chạy Boost';
  if (listing.boostStatus === 'completed') return 'Boost đã hoàn tất';
  if (listing.boostStatus === 'cancelled') return 'Boost đã hủy';
  if (listing.boostStatus === 'rejected') return 'Boost bị từ chối';
  return 'Đã bật Boost sandbox';
}

function needsSellerAttention(listing: Listing) {
  return listing.status === 'pending' || listing.status === 'rejected';
}

function getSellerAttentionText(listing: Listing) {
  if (listing.status === 'rejected') return listing.moderationReason || 'Bài niêm yết này cần chỉnh sửa trước khi hiển thị lại.';
  if (isAiInfrastructureModerationIssue(listing)) return 'AI đang lỗi/quota, tin cần admin duyệt hoặc thử lại sau.';
  if (listing.moderationResult?.decision === 'needs_review') return listing.moderationReason || 'AI cần admin xem lại bài niêm yết này.';
  return 'Bài niêm yết đang chờ kiểm duyệt trước khi hiển thị công khai.';
}

function getSellerAiTipText(listing: Listing) {
  const title = listing.title.trim();
  const description = listing.description.trim();
  const words = title.split(/\s+/).filter(Boolean);
  const hasSpecificDetail = /\d|usb-c|type-c|iphone|ipad|macbook|samsung|xiaomi|anker|baseus|sony|logitech|fullbox|bảo hành|chính hãng|like new|mới/i.test(title);
  if (words.length < 5 || !hasSpecificDetail) return 'Gợi ý AI: Thêm thương hiệu, model hoặc điểm nổi bật vào tiêu đề';
  if (!description || description.length < 50) return 'Gợi ý AI: Bổ sung mô tả chi tiết để tăng độ tin cậy';
  if (!listing.mediaUrls?.length) return 'Gợi ý AI: Thêm ảnh thật để người mua dễ quyết định hơn';
  return 'Gợi ý AI: Thêm thông tin bảo hành hoặc cách giao nhận';
}

const BRAND_KEYWORDS = [
  'baseus',
  'anker',
  'apple',
  'samsung',
  'sony',
  'xiaomi',
  'huawei',
  'asus',
  'lenovo',
  'msi',
  'dell',
  'hp',
  'acer',
  'logitech',
  'razer',
  'jbl',
  'lg',
  'oppo',
  'vivo',
  'realme',
  'canon',
  'nikon',
];

const MAP_ZOOM = 14;
const LOCATION_CIRCLE_RADIUS_METERS = 1500;
const DEFAULT_MAP_CENTER: [number, number] = [10.8231, 106.6297];

function getBrandFromTitle(title: string) {
  const lower = title.toLowerCase();
  const found = BRAND_KEYWORDS.find((brand) => lower.includes(brand));
  if (!found) return 'Khác';
  return found.charAt(0).toUpperCase() + found.slice(1);
}

type MapCenter = [number, number];

type LocationSuggestion = {
  id: string;
  label: string;
  subtitle: string;
  center: MapCenter;
  displayName: string;
};

type NominatimSearchResult = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
  type?: string;
  address?: Record<string, string | undefined>;
};

const DEFAULT_LOCATION_SUGGESTIONS: LocationSuggestion[] = [
  {
    id: 'default-ho-chi-minh-city',
    label: 'Thành phố Hồ Chí Minh',
    subtitle: 'Tỉnh/Thành phố',
    center: DEFAULT_MAP_CENTER,
    displayName: 'Thành phố Hồ Chí Minh, Việt Nam',
  },
  {
    id: 'default-quan-1',
    label: 'Quận 1, Hồ Chí Minh City',
    subtitle: 'Quận 1, Hồ Chí Minh City',
    center: [10.7769, 106.7009],
    displayName: 'Quận 1, Thành phố Hồ Chí Minh, Việt Nam',
  },
  {
    id: 'default-binh-thanh',
    label: 'Bình Thạnh, Hồ Chí Minh City',
    subtitle: 'Bình Thạnh, Hồ Chí Minh City',
    center: [10.8017, 106.7108],
    displayName: 'Bình Thạnh, Thành phố Hồ Chí Minh, Việt Nam',
  },
  {
    id: 'default-hoc-mon',
    label: 'Hóc Môn, Hồ Chí Minh City',
    subtitle: 'Hóc Môn, Hồ Chí Minh City',
    center: [10.8833, 106.5903],
    displayName: 'Hóc Môn, Thành phố Hồ Chí Minh, Việt Nam',
  },
  {
    id: 'default-thu-duc',
    label: 'Thủ Đức, Hồ Chí Minh City',
    subtitle: 'Thủ Đức, Hồ Chí Minh City',
    center: [10.8494, 106.7537],
    displayName: 'Thủ Đức, Thành phố Hồ Chí Minh, Việt Nam',
  },
  {
    id: 'default-ha-noi',
    label: 'Hà Nội',
    subtitle: 'Tỉnh/Thành phố',
    center: [21.0278, 105.8342],
    displayName: 'Hà Nội, Việt Nam',
  },
];

function normalizeLocationText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function toLocationSuggestion(place: NominatimSearchResult, index: number): LocationSuggestion | null {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  const displayName = place.display_name ?? '';
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !displayName) return null;
  const address = place.address ?? {};
  const baseName =
    place.name ||
    address.amenity ||
    address.tourism ||
    address.leisure ||
    address.road ||
    address.neighbourhood ||
    displayName.split(',')[0]?.trim() ||
    'Vị trí';
  const district = address.suburb || address.city_district || address.district || address.county || '';
  const city = address.city || address.town || address.municipality || address.state || '';
  const labelParts = [baseName, district, city].filter(Boolean);
  const uniqueLabelParts = labelParts.filter((value, partIndex, arr) => arr.indexOf(value) === partIndex);
  const label = uniqueLabelParts.length > 0 ? uniqueLabelParts.join(', ') : displayName.split(',').slice(0, 3).join(', ');
  const subtitle = displayName.split(',').slice(1, 4).map((part) => part.trim()).filter(Boolean).join(', ') || place.type || 'Địa điểm';
  return {
    id: String(place.place_id ?? `${place.osm_type ?? 'place'}-${place.osm_id ?? index}`),
    label,
    subtitle,
    center: [lat, lon],
    displayName,
  };
}

function mergeLocationSuggestions(apiSuggestions: LocationSuggestion[], query: string) {
  const normalizedQuery = normalizeLocationText(query);
  const matchingDefaults = DEFAULT_LOCATION_SUGGESTIONS.filter((suggestion) => {
    const haystack = normalizeLocationText(`${suggestion.label} ${suggestion.subtitle} ${suggestion.displayName}`);
    return !normalizedQuery || haystack.includes(normalizedQuery);
  });
  const suggestions = [...apiSuggestions, ...matchingDefaults, ...DEFAULT_LOCATION_SUGGESTIONS];
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = normalizeLocationText(`${suggestion.label}-${suggestion.displayName}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function matchesLocationSuggestion(value: string, suggestion: LocationSuggestion | null) {
  if (!suggestion) return false;
  const normalizedValue = normalizeLocationText(value);
  return (
    normalizedValue === normalizeLocationText(suggestion.label) ||
    normalizedValue === normalizeLocationText(suggestion.displayName)
  );
}

function findExactLocationSuggestion(value: string, suggestions: LocationSuggestion[]) {
  return suggestions.find((suggestion) => matchesLocationSuggestion(value, suggestion)) ?? null;
}

const MeterCircle = Circle as ComponentType<{
  center: MapCenter;
  radius: number;
  pathOptions: {
    color: string;
    fillColor: string;
    fillOpacity: number;
    weight: number;
  };
}>;

function MapCenterUpdater({ center, zoom }: { center: MapCenter; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: false });
    setTimeout(() => map.invalidateSize(), 0);
  }, [center, zoom, map]);
  return null;
}

function FixedRadiusCircle({ center }: { center: MapCenter }) {
  return (
    <MeterCircle
      center={center}
      radius={LOCATION_CIRCLE_RADIUS_METERS}
      pathOptions={{
        color: '#38bdf8',
        fillColor: '#38bdf8',
        fillOpacity: 0.25,
        weight: 2,
      }}
    />
  );
}

function LocationMap({
  center,
  zoom,
  interactive,
}: {
  center: MapCenter;
  zoom: number;
  interactive: boolean;
}) {
  const mapClassName = interactive ? 'h-full w-full' : 'h-full w-full pointer-events-none';
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className={mapClassName}
      zoomControl={interactive}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <FixedRadiusCircle center={center} />
      <MapCenterUpdater center={center} zoom={zoom} />
    </MapContainer>
  );
}

function getModerationSourceLabel(listing: Listing) {
  if (listing.moderatedBy === 'ai') return 'AI đã kiểm tra';
  if (listing.moderatedBy === 'admin') return 'Admin đã kiểm duyệt';
  if (listing.moderationMode === 'manual') return 'Chờ admin duyệt thủ công';
  if (listing.moderationMode === 'auto') return 'Đang chờ AI';
  return 'Chưa có dữ liệu kiểm duyệt';
}

function getModerationDecisionLabel(listing: Listing) {
  const decision = listing.moderationResult?.decision;
  if (decision === 'approved') return 'AI: đã duyệt';
  if (decision === 'rejected') return 'AI: từ chối';
  if (decision === 'needs_review') return 'AI: cần admin xem lại';
  if (listing.status === 'pending') return 'Đang chờ duyệt';
  if (listing.status === 'rejected') return 'Bị từ chối';
  return null;
}

function getModerationConfidenceLabel(listing: Listing) {
  const confidence = listing.moderationResult?.confidence;
  if (typeof confidence !== 'number') return null;
  return `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`;
}

function getModerationFlags(listing: Listing) {
  return (listing.moderationFlags ?? listing.moderationResult?.flags ?? []).filter(Boolean);
}

function isAiInfrastructureModerationIssue(listing: Listing) {
  return getModerationFlags(listing).some((flag) => AI_INFRASTRUCTURE_MODERATION_FLAGS.has(flag));
}

function isDemoSeedListing(listing: Listing) {
  return (listing.tags ?? []).some((tag) => tag === 'surf-demo-seed' || tag === 'public-ecommerce-seed' || tag === 'dummyjson' || tag.startsWith('dummyjson-'));
}

function ModerationTrace({ listing, compact = false }: { listing: Listing; compact?: boolean }) {
  const shouldShow =
    listing.status === 'pending' ||
    listing.status === 'rejected' ||
    Boolean(listing.moderatedBy || listing.moderationMode || listing.moderationReason || listing.moderationResult);
  if (!shouldShow) return null;

  const sourceLabel = getModerationSourceLabel(listing);
  const decisionLabel = getModerationDecisionLabel(listing);
  const confidenceLabel = getModerationConfidenceLabel(listing);
  const flags = getModerationFlags(listing);
  const sourceClassName =
    listing.moderatedBy === 'ai'
      ? 'bg-sky-500/15 text-sky-300'
      : listing.moderatedBy === 'admin'
        ? 'bg-emerald-500/15 text-emerald-300'
        : 'bg-amber-500/15 text-amber-300';

  return (
    <div className={`mt-3 rounded-xl border border-white/[0.08] bg-[#0f141b]/80 ${compact ? 'px-3 py-2' : 'p-3'}`}>
      <div className="flex flex-wrap gap-2">
        <span className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${sourceClassName}`}>{sourceLabel}</span>
        {decisionLabel && (
          <span className="rounded-lg bg-white/[0.08] px-2.5 py-1 text-[11px] font-black text-slate-300">{decisionLabel}</span>
        )}
        {confidenceLabel && (
          <span className="rounded-lg bg-white/[0.08] px-2.5 py-1 text-[11px] font-black text-slate-300">Tin cậy {confidenceLabel}</span>
        )}
      </div>
      {listing.moderationReason && (
        <div className="mt-2 text-xs font-bold text-slate-400">
          Lý do: <span className="text-slate-200">{listing.moderationReason}</span>
        </div>
      )}
      {flags.length > 0 && (
        <div className="mt-1 text-xs font-bold text-slate-500">Flags: {flags.join(', ')}</div>
      )}
    </div>
  );
}

export default function MarketPage() {
  const {
    listings,
    loading,
    nextCursor,
    activeCategory,
    searchQuery,
    searchResults,
    isSearchMode,
    myListings,
    myListingsLoading,
    myListingsLoadingMore,
    myListingsNextCursor,
    myListingsFilter,
    myListingsCounts,
    myListingsSummary,
    savedListings,
    savedLoading,
    detailListing,
    detailLoading,
    fetchListings,
    fetchMyListings,
    fetchSavedListings,
    setCategory,
    search,
    setSearchQuery,
    fetchDetail,
    clearDetail,
    toggleSave,
    createListing,
    boostListing,
    updateListing,
    deleteListing,
    markAsSold,
    reportListing,
    fetchModerationAccess,
    setModerationMode,
    fetchPendingModerationListings,
    bulkApproveAiFailedListings,
    rerunAiModeration,
    approveListing,
    rejectListing,
  } = useMarketplaceStore();
  const navigate = useNavigate();
  const { listingId: routeListingId } = useParams<{ listingId?: string }>();
  const isRouteDetailView = Boolean(routeListingId);
  const currentUser = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const currentUserId = currentUser?.uid;
  const setPresenceOnline = usePresenceStore((state) => state.setOnline);
  const setPresenceKnownOffline = usePresenceStore((state) => state.setKnownOffline);

  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const isRouteSelectedListing = Boolean(routeListingId && selectedListing?.id === routeListingId);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'saved'>('all');
  const [sellerSection, setSellerSection] = useState<SellerSection>('listings');
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isSellerProfileOpen, setIsSellerProfileOpen] = useState(false);
  const [sellerListingSearch, setSellerListingSearch] = useState('');
  const [createImageUploading, setCreateImageUploading] = useState(false);
  const [createImageError, setCreateImageError] = useState('');
  const [mapCenter, setMapCenter] = useState<MapCenter>(DEFAULT_MAP_CENTER);
  const [createMapCenter, setCreateMapCenter] = useState<MapCenter>(DEFAULT_MAP_CENTER);
  const [createLocationSuggestions, setCreateLocationSuggestions] = useState<LocationSuggestion[]>(
    DEFAULT_LOCATION_SUGGESTIONS.slice(0, 5)
  );
  const [createLocationLoading, setCreateLocationLoading] = useState(false);
  const [isCreateLocationFocused, setIsCreateLocationFocused] = useState(false);
  const [isCreateMapOpen, setIsCreateMapOpen] = useState(false);
  const [selectedCreateLocation, setSelectedCreateLocation] = useState<LocationSuggestion | null>(null);
  const [createLocationError, setCreateLocationError] = useState('');
  const [myListingSearch, setMyListingSearch] = useState('');
  const [sellerListingView, setSellerListingView] = useState<'list' | 'grid'>('list');
  const [openListingMenuId, setOpenListingMenuId] = useState<string | null>(null);
  const [listingActionId, setListingActionId] = useState<string | null>(null);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [editDraft, setEditDraft] = useState<NewListingDraft>(DEFAULT_NEW_LISTING);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [messagesListing, setMessagesListing] = useState<Listing | null>(null);
  const [sellerListingConversations, setSellerListingConversations] = useState<MarketplaceConversationItem[]>([]);
  const [sellerListingConversationsLoading, setSellerListingConversationsLoading] = useState(false);
  const [sellerListingConversationsError, setSellerListingConversationsError] = useState('');
  const [activeSellerConversation, setActiveSellerConversation] = useState<MarketplaceConversationItem | null>(null);
  const [sellerMessagesTab, setSellerMessagesTab] = useState<SellerMessagesTab>('messages');
  const [sellerInsightRange, setSellerInsightRange] = useState<'7' | '14' | '30'>('7');
  const [isMarketplaceAdmin, setIsMarketplaceAdmin] = useState(false);
  const [moderationSettings, setModerationSettings] = useState<MarketplaceModerationSettings | null>(null);
  const [moderationQueue, setModerationQueue] = useState<Listing[]>([]);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationError, setModerationError] = useState('');
  const [moderationActionId, setModerationActionId] = useState<string | null>(null);
  const [moderationBulkApproving, setModerationBulkApproving] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>('listing');
  const [isCreateDetailsOpen, setIsCreateDetailsOpen] = useState(false);
  const [boostDailyBudget, setBoostDailyBudget] = useState<number>(BOOST_BUDGET_OPTIONS[0].dailyBudget);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState<PaymentStep>('method');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [paymentError, setPaymentError] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [boostingListing, setBoostingListing] = useState<Listing | null>(null);
  const [isBoostPaymentModalOpen, setIsBoostPaymentModalOpen] = useState(false);
  const [boostPaymentStep, setBoostPaymentStep] = useState<PaymentStep>('method');
  const [boostPaymentMethod, setBoostPaymentMethod] = useState<PaymentMethod>('card');
  const [boostPaymentError, setBoostPaymentError] = useState('');
  const [boostSubmitting, setBoostSubmitting] = useState(false);
  const [sellerMessageDraft, setSellerMessageDraft] = useState('Mặt hàng này còn chứ?');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [marketToast, setMarketToast] = useState('');
  const [billingCard, setBillingCard] = useState({
    name: '',
    number: '',
    expiry: '',
    cvv: '',
  });
  const applySandboxTestCard = (card: (typeof SANDBOX_PAYMENT_TEST_CARDS)[number]) => {
    setBillingCard({
      name: card.name,
      number: card.number,
      expiry: card.expiry,
      cvv: card.cvv,
    });
  };
  const renderSandboxTestCards = () => (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black text-sky-100">Dữ liệu test sandbox</div>
          <div className="mt-1 text-[11px] font-medium text-slate-400">Nhấn Điền để tự nhập nhanh vào form thanh toán.</div>
        </div>
        <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black text-emerald-300">Không trừ tiền thật</span>
      </div>
      <div className="mt-3 space-y-2">
        {SANDBOX_PAYMENT_TEST_CARDS.map((card) => (
          <div key={card.number} className="rounded-lg border border-white/[0.08] bg-[#18191a] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-white">{card.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${card.succeeds ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>{card.status}</span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-slate-300">{card.number}</div>
                <div className="mt-1 text-[11px] text-slate-400">Tên: {card.name} · HSD: {card.expiry} · CVV: {card.cvv}</div>
                <div className="mt-1 text-[11px] text-slate-500">{card.helper}</div>
              </div>
              <button type="button" onClick={() => applySandboxTestCard(card)} className="shrink-0 rounded-md bg-[#2d88ff] px-3 py-1.5 text-xs font-black text-white hover:bg-[#1877f2]">
                Điền
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  const geoCache = useRef(new Map<string, MapCenter>());
  const listingsLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const myListingsLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const myListingsFetchKeyRef = useRef('');

  // New Listing Form State
  const [newListing, setNewListing] = useState<NewListingDraft>(DEFAULT_NEW_LISTING);

  useEffect(() => {
    fetchListings(true);
  }, [fetchListings]);

  useEffect(() => {
    if (!routeListingId) {
      clearDetail();
      return;
    }
    void fetchDetail(routeListingId);
    return () => {
      clearDetail();
    };
  }, [clearDetail, fetchDetail, routeListingId]);

  useEffect(() => {
    if (!isRouteDetailView) return;
    if (!detailListing) return;
    setSelectedListing(detailListing);
    setActiveMediaIndex(0);
    setIsMapOpen(false);
    setIsSellerProfileOpen(false);
    setSellerListingSearch('');
    setIsDetailModalOpen(false);
  }, [detailListing, isRouteDetailView]);

  useEffect(() => {
    const sellerId = selectedListing?.sellerId;
    if (!sellerId || sellerId === currentUserId) return;

    let cancelled = false;
    api
      .get<{ uid: string; online: boolean; lastSeen: number | null }>(`/api/presence/users/${sellerId}`)
      .then((res) => {
        if (cancelled || res.uid !== sellerId) return;
        if (res.online) {
          setPresenceOnline(sellerId);
          return;
        }
        setPresenceKnownOffline(sellerId, res.lastSeen);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentUserId, selectedListing?.sellerId, setPresenceKnownOffline, setPresenceOnline]);

  useEffect(() => {
    if (activeTab !== 'all' || isSearchMode || !nextCursor) return;
    const target = listingsLoadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void fetchListings(false);
        }
      },
      { root: null, rootMargin: '420px 0px', threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [activeTab, fetchListings, isSearchMode, nextCursor]);

  useEffect(() => {
    if (activeTab === 'my') {
      const fetchKey = `${activeTab}:${myListingsFilter}`;
      if (myListingsFetchKeyRef.current === fetchKey) return;
      myListingsFetchKeyRef.current = fetchKey;
      fetchMyListings(true, myListingsFilter);
      return;
    }
    myListingsFetchKeyRef.current = '';
    if (activeTab === 'saved') {
      fetchSavedListings();
    }
  }, [activeTab, fetchMyListings, fetchSavedListings, myListingsFilter]);

  useEffect(() => {
    if (!messagesListing) {
      setSellerListingConversations([]);
      setSellerListingConversationsError('');
      setActiveSellerConversation(null);
      return;
    }

    let cancelled = false;
    const loadSellerListingConversations = async () => {
      setSellerListingConversationsLoading(true);
      setSellerListingConversationsError('');
      try {
        const data = await api.get<{ items: MarketplaceConversationItem[] }>(
          `/api/marketplace/${messagesListing.id}/conversations`
        );
        if (cancelled) return;
        setSellerListingConversations(data.items ?? []);
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
    if (activeTab !== 'my' || sellerSection !== 'listings' || !myListingsNextCursor) return;
    const target = myListingsLoadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void fetchMyListings(false, myListingsFilter);
        }
      },
      { root: null, rootMargin: '320px 0px', threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [activeTab, fetchMyListings, myListingsFilter, myListingsNextCursor, sellerSection]);

  useEffect(() => {
    if (!currentUserId) {
      setIsMarketplaceAdmin(false);
      setModerationSettings(null);
      setModerationQueue([]);
      return;
    }
    let cancelled = false;
    fetchModerationAccess()
      .then((access) => {
        if (cancelled) return;
        setIsMarketplaceAdmin(access.isAdmin);
        setModerationSettings(access.settings);
      })
      .catch(() => {
        if (!cancelled) {
          setIsMarketplaceAdmin(false);
          setModerationSettings(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, fetchModerationAccess]);

  useEffect(() => {
    if (!isMarketplaceAdmin || sellerSection !== 'moderation') return;
    let cancelled = false;
    setModerationLoading(true);
    setModerationError('');
    fetchPendingModerationListings('pending')
      .then((items) => {
        if (!cancelled) setModerationQueue(items);
      })
      .catch((err) => {
        if (!cancelled) setModerationError((err as Error).message || 'Không thể tải hàng chờ kiểm duyệt');
      })
      .finally(() => {
        if (!cancelled) setModerationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPendingModerationListings, isMarketplaceAdmin, sellerSection]);

  useEffect(() => {
    if (!isMarketplaceAdmin && sellerSection === 'moderation') {
      setSellerSection('listings');
    }
  }, [isMarketplaceAdmin, sellerSection]);

  useEffect(() => {
    const location = selectedListing?.location?.trim();
    if (!location || location.toLowerCase() === 'toàn quốc' || location.toLowerCase() === 'toan quoc') {
      setMapCenter(DEFAULT_MAP_CENTER);
      return;
    }
    const cached = geoCache.current.get(location);
    if (cached) {
      setMapCenter(cached);
      return;
    }
    const controller = new AbortController();
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`;
    let cancelled = false;
    fetch(url, { signal: controller.signal, headers: { 'Accept-Language': 'vi' } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data) || !data[0]) {
          setMapCenter(DEFAULT_MAP_CENTER);
          return;
        }
        const next: MapCenter = [Number(data[0].lat), Number(data[0].lon)];
        geoCache.current.set(location, next);
        setMapCenter(next);
      })
      .catch(() => {
        if (!cancelled) setMapCenter(DEFAULT_MAP_CENTER);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedListing?.location]);

  useEffect(() => {
    if (!isDetailModalOpen && !isRouteDetailView) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isSellerProfileOpen) {
        setIsSellerProfileOpen(false);
        return;
      }
      if (isMapOpen) {
        setIsMapOpen(false);
        return;
      }
      handleCloseDetail();
    };
    document.addEventListener('keydown', onEscape);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = originalOverflow;
    };
  }, [isDetailModalOpen, isMapOpen, isRouteDetailView, isSellerProfileOpen]);

  useEffect(() => {
    if (!isCreateModalOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isPaymentModalOpen) {
        setIsPaymentModalOpen(false);
        return;
      }
      if (isCreateMapOpen) {
        setIsCreateMapOpen(false);
        return;
      }
      setIsCreateModalOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = originalOverflow;
    };
  }, [isCreateMapOpen, isCreateModalOpen, isPaymentModalOpen]);

  useEffect(() => {
    if (!isCreateModalOpen) return;
    const location = newListing.location.trim();
    setSelectedCreateLocation((current) => (matchesLocationSuggestion(location, current) ? current : null));
    if (!location) {
      setCreateLocationSuggestions(DEFAULT_LOCATION_SUGGESTIONS.slice(0, 5));
      setCreateLocationLoading(false);
      setCreateMapCenter(DEFAULT_MAP_CENTER);
      return;
    }
    const fallbackSuggestions = mergeLocationSuggestions([], location);
    const fallbackExactSuggestion = findExactLocationSuggestion(location, fallbackSuggestions);
    setCreateLocationSuggestions(fallbackSuggestions);
    if (fallbackExactSuggestion) {
      setSelectedCreateLocation(fallbackExactSuggestion);
      setCreateMapCenter(fallbackExactSuggestion.center);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCreateLocationLoading(true);
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(location)}&limit=5`;
      fetch(url, { signal: controller.signal, headers: { 'Accept-Language': 'vi' } })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          const apiSuggestions = Array.isArray(data)
            ? data.map((place, index) => toLocationSuggestion(place, index)).filter(Boolean) as LocationSuggestion[]
            : [];
          const nextSuggestions = mergeLocationSuggestions(apiSuggestions, location);
          const exactSuggestion = findExactLocationSuggestion(location, nextSuggestions);
          setCreateLocationSuggestions(nextSuggestions);
          if (exactSuggestion) {
            setSelectedCreateLocation(exactSuggestion);
            setCreateMapCenter(exactSuggestion.center);
          }
        })
        .catch(() => setCreateLocationSuggestions(mergeLocationSuggestions([], location)))
        .finally(() => setCreateLocationLoading(false));
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isCreateModalOpen, newListing.location]);

  const handleSelectMainTab = (tab: 'all' | 'my' | 'saved') => {
    setActiveTab(tab);
    if (tab === 'all') {
      setCategory('all');
      return;
    }
    if (tab === 'my') {
      setSellerSection('listings');
    }
  };

  const handleSelectSellerSection = (section: SellerSection) => {
    setActiveTab('my');
    setSellerSection(section);
  };

  const reloadModerationQueue = async () => {
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
  };

  const handleToggleModerationMode = async (mode: MarketplaceModerationMode) => {
    setModerationError('');
    try {
      const settings = await setModerationMode(mode);
      setModerationSettings(settings);
    } catch (err) {
      setModerationError((err as Error).message || 'Không thể đổi chế độ kiểm duyệt');
    }
  };

  const handleApproveModeration = async (listingId: string) => {
    setModerationActionId(listingId);
    setModerationError('');
    try {
      await approveListing(listingId, 'Admin đã duyệt Surf Market');
      setModerationQueue((items) => items.filter((item) => item.id !== listingId));
      fetchListings(true);
    } catch (err) {
      setModerationError((err as Error).message || 'Không thể duyệt tin đăng');
    } finally {
      setModerationActionId(null);
    }
  };

  const handleBulkApproveAiFailedDemoListings = async () => {
    if (moderationBulkApproving) return;
    const confirmed = window.confirm('Duyệt nhanh các bài demo bị kẹt do AI lỗi/quota?');
    if (!confirmed) return;
    setModerationBulkApproving(true);
    setModerationError('');
    try {
      const result = await bulkApproveAiFailedListings(true);
      await Promise.all([
        fetchMyListings(true, myListingsFilter),
        reloadModerationQueue(),
      ]);
      showMarketToast(result.updated > 0 ? `Đã duyệt ${result.updated} bài demo bị kẹt AI.` : 'Không có bài demo nào đủ điều kiện duyệt nhanh.');
    } catch (err) {
      const message = (err as Error).message || 'Không thể duyệt nhanh bài bị kẹt AI';
      setModerationError(message);
      showMarketToast(message);
    } finally {
      setModerationBulkApproving(false);
    }
  };

  const handleRerunAiModeration = async (listingId: string) => {
    setModerationActionId(listingId);
    setModerationError('');
    try {
      const updated = await rerunAiModeration(listingId);
      if (updated.status === 'pending') {
        setModerationQueue((items) => items.map((item) => (item.id === listingId ? updated : item)));
      } else {
        setModerationQueue((items) => items.filter((item) => item.id !== listingId));
        if (updated.status === 'active') fetchListings(true);
      }
    } catch (err) {
      setModerationError((err as Error).message || 'Không thể chạy lại AI kiểm duyệt');
    } finally {
      setModerationActionId(null);
    }
  };

  const handleRejectModeration = async (listingId: string) => {
    const reason = window.prompt('Lý do từ chối tin đăng?', 'Không phù hợp chính sách Surf Market');
    if (!reason) return;
    setModerationActionId(listingId);
    setModerationError('');
    try {
      await rejectListing(listingId, reason);
      setModerationQueue((items) => items.filter((item) => item.id !== listingId));
    } catch (err) {
      setModerationError((err as Error).message || 'Không thể từ chối tin đăng');
    } finally {
      setModerationActionId(null);
    }
  };

  const syncLocalListing = (updated: Listing) => {
    setSelectedListing((current) => current?.id === updated.id ? updated : current);
    setEditingListing((current) => current?.id === updated.id ? updated : current);
    setMessagesListing((current) => current?.id === updated.id ? updated : current);
  };

  const handleMarkSellerListingSold = async (listing: Listing) => {
    setOpenListingMenuId(null);
    setListingActionId(listing.id);
    try {
      await markAsSold(listing.id);
    } catch (err) {
      window.alert((err as Error).message || 'Không thể đánh dấu là hết hàng');
    } finally {
      setListingActionId(null);
    }
  };

  const handleMarkSellerListingAvailable = async (listing: Listing) => {
    setOpenListingMenuId(null);
    setListingActionId(listing.id);
    try {
      const updated = await updateListing(
        listing.id,
        listing.status === 'sold' ? { status: 'active' } : { saleStatus: 'available' }
      );
      syncLocalListing(updated);
    } catch (err) {
      window.alert((err as Error).message || 'Không thể đánh dấu là còn hàng');
    } finally {
      setListingActionId(null);
    }
  };

  const handleMarkSellerListingPending = async (listing: Listing) => {
    setOpenListingMenuId(null);
    if (listing.status !== 'active') return;
    setListingActionId(listing.id);
    try {
      const updated = await updateListing(listing.id, { saleStatus: 'pending' });
      syncLocalListing(updated);
    } catch (err) {
      window.alert((err as Error).message || 'Không thể đánh dấu là đang chờ');
    } finally {
      setListingActionId(null);
    }
  };

  const openEditSellerListing = (listing: Listing) => {
    setOpenListingMenuId(null);
    setEditingListing(listing);
    setEditDraft({
      ...DEFAULT_NEW_LISTING,
      title: listing.title,
      description: listing.description,
      price: String(listing.price),
      category: listing.category,
      condition: listing.condition,
      location: listing.location,
      mediaUrls: listing.mediaUrls ?? [],
      brand: listing.brand ?? '',
      productType: listing.productType ?? '',
      material: listing.material ?? '',
      availability: listing.availability ?? 'in_stock',
      tags: listing.tags?.join(', ') ?? '',
      sku: listing.sku ?? '',
      meetingPreferences: listing.meetingPreferences?.length ? listing.meetingPreferences : ['public_meetup'],
      hideFromFriends: Boolean(listing.hideFromFriends),
      boostEnabled: Boolean(listing.boostEnabled),
    });
  };

  const closeEditSellerListing = () => {
    setEditingListing(null);
    setEditSubmitting(false);
  };

  const handleEditSellerListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingListing || editSubmitting) return;
    if (!editDraft.title.trim()) {
      window.alert('Tiêu đề là bắt buộc');
      return;
    }
    setEditSubmitting(true);
    try {
      const updated = await updateListing(editingListing.id, {
        title: editDraft.title.trim(),
        description: editDraft.description.trim(),
        price: Number(editDraft.price.replace(/[^\d]/g, '')) || 0,
        category: editDraft.category,
        condition: editDraft.condition,
        mediaUrls: editDraft.mediaUrls,
        location: editDraft.location.trim(),
        brand: editDraft.brand.trim(),
        productType: editDraft.productType.trim(),
        material: editDraft.material.trim(),
      });
      syncLocalListing(updated);
      closeEditSellerListing();
    } catch (err) {
      window.alert((err as Error).message || 'Không thể cập nhật bài niêm yết');
    } finally {
      setEditSubmitting(false);
    }
  };

  const openSellerMessages = (listing: Listing) => {
    setOpenListingMenuId(null);
    setMessagesListing(listing);
    setSellerMessagesTab('messages');
    setSellerInsightRange('7');
    setActiveSellerConversation(null);
  };

  const handleDeleteSellerListing = async (listingId: string) => {
    if (!window.confirm('Xóa bài niêm yết này?')) return;
    setOpenListingMenuId(null);
    try {
      await deleteListing(listingId);
      setMessagesListing((current) => current?.id === listingId ? null : current);
      setEditingListing((current) => current?.id === listingId ? null : current);
      setSelectedListing((current) => current?.id === listingId ? null : current);
    } catch (err) {
      window.alert((err as Error).message || 'Không thể xóa bài niêm yết');
    }
  };

  const handleShareSellerListing = async (listing: Listing) => {
    const url = `${window.location.origin}/feed/market/${listing.id}`;
    setOpenListingMenuId(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: listing.title, text: listing.description || listing.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      window.alert('Đã sao chép liên kết Surf Market');
    } catch {
      window.alert('Không thể chia sẻ bài niêm yết');
    }
  };

  const showMarketToast = (message: string) => {
    setMarketToast(message);
    window.setTimeout(() => {
      setMarketToast((current) => (current === message ? '' : current));
    }, 2600);
  };

  const handleContactSeller = async (listing: Listing, message?: string) => {
    if (contactSubmitting) return;
    if (listing.sellerId === currentUserId) {
      showMarketToast('Đây là bài niêm yết của bạn.');
      return;
    }

    const text =
      (message ?? sellerMessageDraft).trim() ||
      `Xin chào, tôi quan tâm đến "${listing.title}". Mặt hàng này còn chứ?`;
    setContactSubmitting(true);
    try {
      const response = await api.post<{ item: { id: string } }>(`/api/marketplace/${listing.id}/contact`, {
        message: text,
      });
      setSellerMessageDraft('');
      showMarketToast('Đã gửi tin nhắn cho người bán.');
      navigate('/feed/waves', { state: { conversationId: response.item.id } });
    } catch (err) {
      window.alert((err as Error).message || 'Không thể liên hệ người bán');
    } finally {
      setContactSubmitting(false);
    }
  };

  const handleReportSelectedListing = (listing: Listing) => {
    setIsReportModalOpen(true);
    setReportCategory('');
    setReportDetails('');
  };

  const submitReportListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListing || reportSubmitting || !reportCategory) return;

    setReportSubmitting(true);
    try {
      const catLabel = REPORT_CATEGORIES.find((c) => c.key === reportCategory)?.label || reportCategory;
      const reasonText = reportDetails.trim() ? `${catLabel} - ${reportDetails.trim()}` : catLabel;
      await reportListing(selectedListing.id, reasonText);
      showMarketToast('Đã gửi báo cáo bài niêm yết.');
      setIsReportModalOpen(false);
    } catch (err) {
      window.alert((err as Error).message || 'Không thể gửi báo cáo');
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveTab('all');
    search(searchQuery);
  };

  const handleCreateImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const remainingSlots = Math.max(0, 5 - newListing.mediaUrls.length);
    const selectedFiles = files.slice(0, remainingSlots);
    if (selectedFiles.length === 0) {
      setCreateImageError('Tối đa 5 ảnh cho mỗi mặt hàng');
      return;
    }
    setCreateImageUploading(true);
    setCreateImageError('');
    try {
      const uploadedUrls = await Promise.all(
        selectedFiles.map((file) => uploadImage(file, { folder: 'surf/marketplace' }))
      );
      setNewListing((current) => ({
        ...current,
        mediaUrls: [...current.mediaUrls, ...uploadedUrls].slice(0, 5),
      }));
    } catch {
      setCreateImageError('Không thể tải ảnh lên. Vui lòng thử lại.');
    } finally {
      setCreateImageUploading(false);
    }
  };

  const removeCreateImage = (url: string) => {
    setNewListing((current) => ({
      ...current,
      mediaUrls: current.mediaUrls.filter((item) => item !== url),
    }));
  };

  const handleCreateLocationChange = (value: string) => {
    setNewListing((current) => ({ ...current, location: value }));
    setCreateLocationError('');
    setIsCreateLocationFocused(true);
  };

  const handleSelectCreateLocation = (suggestion: LocationSuggestion) => {
    setNewListing((current) => ({ ...current, location: suggestion.label }));
    setSelectedCreateLocation(suggestion);
    setCreateMapCenter(suggestion.center);
    geoCache.current.set(suggestion.label, suggestion.center);
    geoCache.current.set(suggestion.displayName, suggestion.center);
    setCreateLocationSuggestions(mergeLocationSuggestions([suggestion], suggestion.label));
    setCreateLocationError('');
    setIsCreateLocationFocused(false);
  };

  const closeCreateListingModal = () => {
    setIsCreateMapOpen(false);
    setIsPaymentModalOpen(false);
    setPaymentStep('method');
    setPaymentError('');
    setCreateStep('listing');
    setIsCreateModalOpen(false);
  };

  const resetCreateListingFlow = () => {
    setNewListing(DEFAULT_NEW_LISTING);
    setSelectedCreateLocation(null);
    setCreateLocationSuggestions(DEFAULT_LOCATION_SUGGESTIONS.slice(0, 5));
    setCreateMapCenter(DEFAULT_MAP_CENTER);
    setCreateLocationError('');
    setCreateImageError('');
    setCreateStep('listing');
    setIsCreateDetailsOpen(false);
    setBoostDailyBudget(BOOST_BUDGET_OPTIONS[0].dailyBudget);
    setIsPaymentModalOpen(false);
    setPaymentStep('method');
    setPaymentError('');
    setBillingCard({ name: '', number: '', expiry: '', cvv: '' });
  };

  const toggleMeetingPreference = (key: string) => {
    setNewListing((current) => ({
      ...current,
      meetingPreferences: current.meetingPreferences.includes(key)
        ? current.meetingPreferences.filter((item) => item !== key)
        : [...current.meetingPreferences, key],
    }));
  };

  const submitCreateListing = async (withBoost: boolean) => {
    if (!matchesLocationSuggestion(newListing.location.trim(), selectedCreateLocation)) {
      setCreateLocationError('Vui lòng chọn một địa chỉ hợp lệ trong danh sách gợi ý.');
      setIsCreateLocationFocused(true);
      return;
    }
    setCreateSubmitting(true);
    try {
      await createListing({
        title: newListing.title.trim(),
        description: newListing.description.trim(),
        price: Number(newListing.price.replace(/[^\d]/g, '')) || 0,
        category: newListing.category,
        condition: newListing.condition,
        mediaUrls: newListing.mediaUrls,
        location: newListing.location.trim(),
        brand: newListing.brand.trim(),
        productType: newListing.productType.trim(),
        material: newListing.material.trim(),
        availability: newListing.availability,
        tags: newListing.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
        sku: newListing.sku.trim(),
        meetingPreferences: newListing.meetingPreferences,
        hideFromFriends: newListing.hideFromFriends,
        boostEnabled: withBoost,
        boostPlan: withBoost
          ? {
              dailyBudget: boostDailyBudget,
              durationDays: 3,
              placements: ['surf_feed', 'surf_market', 'surf_chat', 'surf_discovery'],
            }
          : null,
      });
      closeCreateListingModal();
      setActiveTab('my');
      resetCreateListingFlow();
    } catch (err) {
      alert('Lỗi khi tạo tin đăng');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createImageUploading || createSubmitting) return;
    if (newListing.boostEnabled && createStep === 'listing') {
      if (!matchesLocationSuggestion(newListing.location.trim(), selectedCreateLocation)) {
        setCreateLocationError('Vui lòng chọn một địa chỉ hợp lệ trong danh sách gợi ý.');
        setIsCreateLocationFocused(true);
        return;
      }
      setCreateStep('boost');
      return;
    }
    if (newListing.boostEnabled && createStep === 'boost') {
      setIsPaymentModalOpen(true);
      setPaymentStep('method');
      setPaymentError('');
      return;
    }
    await submitCreateListing(false);
  };

  const handleContinuePayment = () => {
    setPaymentError('');
    if (paymentStep === 'method') {
      setPaymentStep('card');
      return;
    }
    const sandboxError = getSandboxCardValidationError(billingCard);
    if (sandboxError) {
      setPaymentError(sandboxError);
      return;
    }
    void submitCreateListing(true);
  };

  const openBoostSellerListing = (listing: Listing) => {
    setBoostingListing(listing);
    setBoostDailyBudget(listing.boostPlan?.dailyBudget ?? BOOST_BUDGET_OPTIONS[0].dailyBudget);
    setIsBoostPaymentModalOpen(false);
    setBoostPaymentStep('method');
    setBoostPaymentMethod('card');
    setBoostPaymentError('');
    setBillingCard({ name: '', number: '', expiry: '', cvv: '' });
  };

  const closeBoostSellerListing = () => {
    if (boostSubmitting) return;
    setBoostingListing(null);
    setIsBoostPaymentModalOpen(false);
    setBoostPaymentStep('method');
    setBoostPaymentError('');
  };

  const submitBoostSellerListing = async () => {
    if (!boostingListing || boostSubmitting) return;
    setBoostSubmitting(true);
    setBoostPaymentError('');
    try {
      await boostListing(boostingListing.id, {
        boostPlan: {
          dailyBudget: boostDailyBudget,
          durationDays: selectedBoostOption.durationDays,
          placements: ['surf_feed', 'surf_market', 'surf_chat', 'surf_discovery'],
        },
      });
      setBoostingListing(null);
      setIsBoostPaymentModalOpen(false);
      setSellerSection('dashboard');
      setActiveTab('my');
    } catch (err) {
      setBoostPaymentError((err as Error).message || 'Không thể kích hoạt Surf Boost sandbox lúc này.');
    } finally {
      setBoostSubmitting(false);
    }
  };

  const handleContinueBoostPayment = () => {
    setBoostPaymentError('');
    if (boostPaymentStep === 'method') {
      setBoostPaymentStep('card');
      return;
    }
    const sandboxError = getSandboxCardValidationError(billingCard);
    if (sandboxError) {
      setBoostPaymentError(sandboxError);
      return;
    }
    void submitBoostSellerListing();
  };

  const handleCloseDetail = () => {
    setIsDetailModalOpen(false);
    setSelectedListing(null);
    setIsMapOpen(false);
    setIsSellerProfileOpen(false);
    setSellerListingSearch('');
    if (isRouteDetailView) {
      clearDetail();
      navigate('/feed/market');
    }
  };

  const openDetail = (listing: Listing) => {
    setSelectedListing(listing);
    setActiveMediaIndex(0);
    setIsMapOpen(false);
    setIsSellerProfileOpen(false);
    setSellerListingSearch('');
    setIsDetailModalOpen(true);
  };

  const openSellerProfile = () => {
    setIsMapOpen(false);
    setSellerListingSearch('');
    setIsSellerProfileOpen(true);
  };

  const isSaved = (listing: Listing | null | undefined) => listing?.savedBy?.includes(currentUserId ?? 'me') ?? false;
  const setLocalSaved = (listing: Listing, saved: boolean): Listing => {
    const userId = currentUserId ?? 'me';
    const savedBy = listing.savedBy ?? [];
    return {
      ...listing,
      savedBy: saved
        ? Array.from(new Set([...savedBy, userId]))
        : savedBy.filter((uid) => uid !== userId),
    };
  };
  const handleToggleSave = async (listing: Listing) => {
    try {
      const saved = await toggleSave(listing.id);
      setSelectedListing((current) => current?.id === listing.id ? setLocalSaved(current, saved) : current);
    } catch {
      alert('Không thể cập nhật tin đã lưu');
    }
  };

  const displayedListings =
    activeTab === 'my'
      ? myListings
      : activeTab === 'saved'
        ? savedListings
        : isSearchMode
          ? searchResults
          : listings;
  const currentLoading =
    activeTab === 'my'
      ? myListingsLoading
      : activeTab === 'saved'
        ? savedLoading
        : loading;
  const activeCategoryLabel = CATEGORIES.find((cat) => cat.key === activeCategory)?.label ?? 'Tất cả';
  const activeTabLabel = activeTab === 'all' ? 'Khám phá' : activeTab === 'my' ? 'Đang bán' : 'Đã lưu';
  const visibleSellerSections = isMarketplaceAdmin ? [...SELLER_SECTIONS, ADMIN_SELLER_SECTION] : SELLER_SECTIONS;
  const sellerSectionLabel = visibleSellerSections.find((section) => section.key === sellerSection)?.label ?? 'Bài niêm yết của bạn';
  const marketDescription =
    activeTab === 'my'
      ? 'Quản lý những mặt hàng bạn đang đăng bán.'
      : activeTab === 'saved'
        ? 'Những món bạn đã lưu để xem lại sau.'
        : 'Khám phá đồ công nghệ, thời trang, xe cộ và nhiều món hời quanh bạn.';
  const visibleListingCount = displayedListings.length;
  const sellerDisplayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Người bán';
  const sellerInitial = sellerDisplayName.trim().charAt(0).toUpperCase() || 'S';
  const sellerPhotoUrl = currentUser?.photoURL ?? '';
  const activeMyListings = myListings.filter((listing) => listing.status === 'active');
  const activeMyListingsCount = myListingsCounts.active;
  const soldMyListingsCount = myListingsCounts.sold;
  const pendingMyListingsCount = myListingsCounts.pending;
  const spamOrErrorMyListingsCount = myListingsCounts.error;
  const myListingSearchTerm = myListingSearch.trim().toLowerCase();
  const filteredMyListings = myListings.filter((listing) => {
    if (!myListingSearchTerm) return true;
    return [listing.title, listing.description, listing.location]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(myListingSearchTerm));
  });
  const aiInfrastructureMyListings = filteredMyListings.filter(isAiInfrastructureModerationIssue);
  const demoAiInfrastructureMyListings = aiInfrastructureMyListings.filter(isDemoSeedListing);
  const aiInfrastructureModerationQueue = moderationQueue.filter(isAiInfrastructureModerationIssue);
  const demoAiInfrastructureModerationQueue = aiInfrastructureModerationQueue.filter(isDemoSeedListing);
  const visibleMyListingRows = filteredMyListings;
  const myListingFilterLabel = MY_LISTING_FILTERS.find((filter) => filter.key === myListingsFilter)?.label ?? 'Tất cả';
  const myListingListTitle =
    myListingsFilter === 'error'
      ? 'Spam/Lỗi'
      : myListingsFilter === 'pending'
        ? 'Bài đang chờ kiểm duyệt'
      : myListingsFilter === 'active'
        ? 'Bài niêm yết hoạt động'
        : 'Tất cả bài niêm yết';
  const myListingViews = myListingsSummary.views;
  const myListingSaves = myListingsSummary.saves;
  const myActiveBoostCount = myListingsSummary.activeBoosts;
  const myBoostImpressions = myListingsSummary.boostImpressions;
  const myBoostSpent = myListingsSummary.boostSpent;
  const latestMyListing = myListings[0];
  const createPreviewImage = newListing.mediaUrls[0];
  const createPreviewTitle = newListing.title.trim() || 'Tiêu đề mặt hàng';
  const createPreviewPrice = Number(newListing.price.replace(/[^\d]/g, '')) || 0;
  const createPreviewLocation = newListing.location.trim() || 'Vị trí niêm yết';
  const createPreviewDescription = newListing.description.trim() || 'Mô tả của người bán sẽ hiển thị tại đây.';
  const createSellerName = currentUser?.displayName || currentUser?.email || 'Người bán';
  const boostPreviewImage = boostingListing?.mediaUrls?.[0] ?? '';
  const boostPreviewTitle = boostingListing?.title ?? createPreviewTitle;
  const boostPreviewPrice = boostingListing?.price ?? createPreviewPrice;
  const boostPreviewSellerName = currentUser?.displayName || boostingListing?.sellerDisplayName || 'Người bán';
  const canShowCreatePreviewMap = matchesLocationSuggestion(newListing.location.trim(), selectedCreateLocation);
  const createCategoryLabel = CATEGORIES.find((c) => c.key === newListing.category)?.label ?? 'Khác';
  const selectedBoostOption = BOOST_BUDGET_OPTIONS.find((option) => option.dailyBudget === boostDailyBudget) ?? BOOST_BUDGET_OPTIONS[0];
  const boostSubtotal = boostDailyBudget * selectedBoostOption.durationDays;
  const boostEstimatedTax = Math.round(boostSubtotal * 0.1);
  const boostTotal = boostSubtotal + boostEstimatedTax;
  const detailMediaUrls = selectedListing?.mediaUrls ?? [];
  const activeMediaUrl = detailMediaUrls[activeMediaIndex] ?? detailMediaUrls[0];
  const detailLocation = selectedListing?.location || 'Toàn quốc';
  const detailStatusLabel =
    selectedListing?.status === 'sold'
      ? 'Đã bán'
      : selectedListing?.status === 'deleted'
        ? 'Đã xóa'
        : selectedListing?.status === 'pending'
          ? 'Đang chờ duyệt'
          : selectedListing?.status === 'rejected'
            ? 'Bị từ chối'
            : 'Còn hàng';
  const detailCategoryLabel = selectedListing ? (CATEGORIES.find((c) => c.key === selectedListing.category)?.label ?? 'Khác') : 'Khác';
  const detailBrand = selectedListing ? getBrandFromTitle(selectedListing.title) : 'Khác';
  const detailIsOwner = Boolean(selectedListing && selectedListing.sellerId === currentUserId);
  const detailRecommendationListings = selectedListing
    ? Array.from(
        new Map(
          [...listings, ...searchResults, ...savedListings, ...myListings]
            .filter((listing) => listing.id !== selectedListing.id && listing.status === 'active')
            .filter((listing) => listing.category === selectedListing.category || listing.sellerId === selectedListing.sellerId)
            .map((listing) => [listing.id, listing] as const)
        ).values()
      ).slice(0, 8)
    : [];
  const sellerName = selectedListing?.sellerDisplayName || 'Người bán';
  const sellerShortName = sellerName.trim().split(/\s+/).pop() || sellerName;
  const sellerKnownListings = selectedListing
    ? Array.from(
        new Map(
          [...listings, ...searchResults, ...myListings, ...savedListings, selectedListing]
            .filter((listing) => listing.sellerId === selectedListing.sellerId && listing.status !== 'deleted')
            .map((listing) => [listing.id, listing] as const)
        ).values()
      )
    : [];
  const sellerActiveListings = sellerKnownListings.filter((listing) => listing.status === 'active');
  const sellerProfileListings = sellerActiveListings.length > 0 ? sellerActiveListings : sellerKnownListings;
  const sellerFilteredListings = sellerProfileListings.filter((listing) =>
    listing.title.toLowerCase().includes(sellerListingSearch.trim().toLowerCase())
  );
  const sellerCoverUrl =
    selectedListing?.mediaUrls?.[0] ??
    sellerProfileListings.find((listing) => listing.mediaUrls?.[0])?.mediaUrls?.[0] ??
    '';
  const renderSellerListingRow = (item: Listing, attention = false) => {
    const statusText = getSellerListingStatusText(item);
    const boostStatusText = getBoostStatusText(item);
    const clickCount = item.viewCount ?? 0;
    const isAttention = attention || needsSellerAttention(item);
    const decisionLabel = getModerationDecisionLabel(item);
    const sourceLabel = getModerationSourceLabel(item);
    const isSold = item.status === 'sold';
    const isSalePending = item.status === 'active' && item.saleStatus === 'pending';
    const isActionLoading = listingActionId === item.id;
    const boostIsActive = isListingBoostActive(item);
    const isAiSystemAttention = isAttention && isAiInfrastructureModerationIssue(item);

    return (
      <div key={item.id} className="relative rounded-lg bg-[#202327] p-2 shadow-sm shadow-black/10 transition hover:bg-[#24282d]">
        <div className="flex gap-3">
          <button type="button" onClick={() => openDetail(item)} className="h-[78px] w-[78px] shrink-0 overflow-hidden rounded-md bg-[#15171b]">
            {item.mediaUrls?.[0] ? (
              <img src={item.mediaUrls[0]} alt={item.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-600">
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => openDetail(item)} className="block w-full text-left">
              <div className={`flex items-center gap-1 text-xs font-black ${isAiSystemAttention ? 'text-amber-300' : isAttention ? 'text-red-400' : 'text-[#2d9bf0]'}`}>
                {isAttention && (
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white ${isAiSystemAttention ? 'bg-amber-500' : 'bg-red-500'}`}>!</span>
                )}
                <span className="truncate">{isAttention ? getSellerAttentionText(item) : getSellerAiTipText(item)}</span>
              </div>
              <div className="mt-1 truncate text-[15px] font-black leading-tight text-white">{item.title}</div>
              <div className="mt-0.5 text-sm font-black text-white">{formatPrice(item.price)}</div>
              <div className="mt-0.5 text-xs font-medium text-slate-400">
                <span className={isSold ? 'font-black text-red-400' : isSalePending ? 'font-black text-amber-300' : ''}>{statusText}</span> · Ngày niêm yết: {formatSellerListingDate(item.createdAt)}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-400">
                <span>Được niêm yết trên Surf Market · {clickCount} lượt click vào bài niêm yết</span>
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-500/40 text-[10px] font-black text-slate-200">i</span>
              </div>
              {item.boostEnabled && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-black">
                  <span className={`rounded-full px-2 py-0.5 ${boostIsActive ? 'bg-amber-400/15 text-amber-200' : 'bg-[#2d9bf0]/15 text-[#8bc8ff]'}`}>
                    {boostStatusText}
                  </span>
                  {item.boostPaymentMode === 'sandbox' && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">Sandbox</span>
                  )}
                  <span className="text-slate-500">{item.boostMetrics?.impressions ?? 0} impressions · {item.boostMetrics?.clicks ?? 0} clicks</span>
                </div>
              )}
              {isAttention && (
                <div className="mt-1 truncate text-[11px] font-bold text-slate-400">
                  {sourceLabel}{decisionLabel ? ` · ${decisionLabel}` : ''}{item.moderationFlags?.length ? ` · ${item.moderationFlags.join(', ')}` : ''}
                </div>
              )}
            </button>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {isSold ? (
                <button
                  type="button"
                  disabled={isActionLoading}
                  onClick={() => handleMarkSellerListingAvailable(item)}
                  className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-[#1877f2] px-3 text-xs font-black text-white transition hover:bg-[#2d88ff] disabled:cursor-not-allowed disabled:bg-[#2d333a] disabled:text-slate-500 sm:flex-none"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Đánh dấu là còn hàng
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={item.status !== 'active' || isActionLoading}
                    onClick={() => handleMarkSellerListingSold(item)}
                    className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-[#1877f2] px-3 text-xs font-black text-white transition hover:bg-[#2d88ff] disabled:cursor-not-allowed disabled:bg-[#2d333a] disabled:text-slate-500 sm:flex-none"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Đánh dấu là hết hàng
                  </button>
                  {isSalePending ? (
                    <button type="button" disabled={isActionLoading} onClick={() => handleMarkSellerListingAvailable(item)} className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-[#3a3d42] px-3 text-xs font-black text-white transition hover:bg-[#4a4e55] disabled:cursor-not-allowed disabled:bg-[#2d333a] disabled:text-slate-500 sm:flex-none">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M14.752 11.168l-5.197-3.027A1 1 0 008 9.006v5.988a1 1 0 001.555.832l5.197-2.961a1 1 0 000-1.697z" />
                      </svg>
                      Đánh dấu là có sẵn
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={item.status !== 'active' || isListingBoostActive(item)}
                      onClick={() => openBoostSellerListing(item)}
                      className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-[#3a3d42] px-3 text-xs font-black text-white transition hover:bg-[#4a4e55] disabled:cursor-not-allowed disabled:bg-[#2d333a] disabled:text-slate-500 sm:flex-none"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      {isListingBoostActive(item) ? 'Đang quảng bá' : 'Quảng bá bài niêm yết'}
                    </button>
                  )}
                </>
              )}
              <button type="button" onClick={() => handleShareSellerListing(item)} className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-[#3a3d42] px-3 text-xs font-black text-white transition hover:bg-[#4a4e55] sm:flex-none">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4m0 0L8 6m4-4v14" />
                </svg>
                Chia sẻ
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenListingMenuId((current) => (current === item.id ? null : item.id))}
                  className="inline-flex h-7 w-9 items-center justify-center rounded-md bg-[#3a3d42] text-white transition hover:bg-[#4a4e55]"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm4 2a2 2 0 100-4 2 2 0 000 4z" />
                  </svg>
                </button>
                {openListingMenuId === item.id && (
                  <div className="absolute right-0 top-9 z-20 w-64 overflow-hidden rounded-lg border border-white/[0.08] bg-[#24272c] p-1 shadow-xl shadow-black/40">
                    {item.status === 'active' && item.saleStatus !== 'pending' && (
                      <button type="button" onClick={() => handleMarkSellerListingPending(item)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/[0.08]">
                        <span className="text-base leading-none">✓</span>
                        Đánh dấu là đang chờ
                      </button>
                    )}
                    {item.status === 'active' && item.saleStatus === 'pending' && (
                      <button type="button" onClick={() => handleMarkSellerListingAvailable(item)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/[0.08]">
                        <span className="text-base leading-none">▶</span>
                        Đánh dấu là có sẵn
                      </button>
                    )}
                    {item.status === 'sold' && (
                      <button type="button" onClick={() => handleMarkSellerListingAvailable(item)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/[0.08]">
                        <span className="text-base leading-none">✓</span>
                        Đánh dấu là còn hàng
                      </button>
                    )}
                    <button type="button" onClick={() => { setOpenListingMenuId(null); openDetail(item); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/[0.08]">
                      <span className="text-base leading-none">▣</span>
                      Xem bài niêm yết
                    </button>
                    <button type="button" onClick={() => openEditSellerListing(item)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/[0.08]">
                      <span className="text-base leading-none">✎</span>
                      Chỉnh sửa bài niêm yết
                    </button>
                    <button type="button" onClick={() => handleDeleteSellerListing(item.id)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/[0.08]">
                      <span className="text-base leading-none">⌫</span>
                      Xóa bài niêm yết
                    </button>
                    <button type="button" onClick={() => openSellerMessages(item)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold text-white hover:bg-white/[0.08]">
                      <span className="text-base leading-none">☏</span>
                      Xem tin nhắn
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const isMarketDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div className={`market-theme ${isMarketDark ? 'market-theme-dark' : 'market-theme-light'} flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-[#0b0f14] font-sans text-slate-100`}>
      {marketToast && (
        <div className="fixed right-4 top-20 z-[10000] rounded-2xl border border-surf-primary/30 bg-[#10161e] px-4 py-3 text-sm font-black text-white shadow-2xl shadow-black/40">
          {marketToast}
        </div>
      )}
      {/* --- Market Sub-Header --- */}
      <div className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#0b0f14]/90 px-4 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3">
          <div className="flex min-w-0 items-center gap-2 pr-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surf-primary text-white shadow-lg shadow-surf-primary/20">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div className="hidden leading-tight sm:block">
              <h1 className="text-sm font-black text-white">Surf Market</h1>
              <p className="text-[10px] font-semibold text-slate-500">{visibleListingCount} mặt hàng</p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="relative min-w-0 flex-1">
            <input
              type="text"
              placeholder="Tìm kiếm trên Surf Market"
              className="h-10 w-full rounded-xl border border-white/[0.08] bg-[#11161d] pl-10 pr-4 text-sm font-medium text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-surf-primary/60 focus:bg-[#151b24]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <svg className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </form>

          <button
            type="button"
            onClick={() => setTheme(isMarketDark ? 'light' : 'dark')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#11161d] text-slate-300 transition hover:border-surf-primary/50 hover:text-surf-secondary active:scale-95"
            aria-label={isMarketDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          >
            {isMarketDark ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36l-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0l-1.42-1.42M7.06 7.06L5.64 5.64M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-surf-secondary hover:text-white active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Đăng bán</span>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-white/[0.08] bg-[#0d1117] px-3 py-4 lg:block">
          {/* Categories & Search Row */}
          <div className="space-y-1">
            {(['all', 'my', 'saved'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => handleSelectMainTab(tab)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-bold transition ${
                  activeTab === tab
                    ? 'bg-[#1b222d] text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <span>{tab === 'all' ? 'Khám phá' : tab === 'my' ? 'Đang bán' : 'Đã lưu'}</span>
                {activeTab === tab && <span className="h-1.5 w-1.5 rounded-full bg-surf-secondary" />}
              </button>
            ))}
          </div>

          <div className="my-4 h-px bg-white/[0.08]" />

          {activeTab === 'my' ? (
            <div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-surf-primary px-3 py-2 text-xs font-black text-white transition hover:bg-surf-secondary"
              >
                <span>+</span>
                Tạo bài niêm yết mới
              </button>
              <div className="space-y-1">
                {visibleSellerSections.map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => handleSelectSellerSection(section.key)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold transition ${
                      sellerSection === section.key
                        ? 'bg-[#26303b] text-white'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      sellerSection === section.key ? 'bg-surf-primary text-white' : 'bg-white/[0.08] text-slate-400'
                    }`}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={section.icon} />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{section.label}</span>
                  </button>
                ))}
              </div>
              {sellerSection === 'listings' && (
                <div className="mt-4 space-y-3">
                  <button className="w-full rounded-lg bg-white/[0.08] px-3 py-2 text-xs font-black text-slate-200">
                    Quản lý bài niêm yết
                  </button>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-400">
                      <span>Bộ lọc</span>
                      <button type="button" onClick={() => setMyListingSearch('')} className="text-surf-secondary">Xóa</button>
                    </div>
                    <div className="space-y-2 text-xs font-semibold text-slate-500">
                      <div className="flex items-center justify-between">
                        <span>Sắp xếp theo</span>
                        <span>⌄</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Trạng thái</span>
                        <span>⌄</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div>
                <div className="mb-2 px-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">Danh mục</div>
                <div className="space-y-1">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => { setActiveTab('all'); setCategory(cat.key); }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold transition ${
                        activeCategory === cat.key
                          ? 'bg-surf-primary/15 text-surf-secondary'
                          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                      }`}
                    >
                      <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cat.icon} />
                      </svg>
                      <span className="truncate">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/[0.08] bg-[#121821] p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-surf-secondary">Surf safe</div>
                <p className="mt-2 text-sm font-bold leading-snug text-white">Mua bán gọn hơn, ít rối hơn.</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{marketDescription}</p>
              </div>
            </>
          )}
        </aside>

      {/* --- Listings Content --- */}
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 scrollbar-hide sm:px-6">
          <div className="mx-auto max-w-[1380px]">
            <div className="mb-4 rounded-2xl border border-surf-primary/30 bg-[#10161e] px-4 py-4 shadow-lg shadow-black/20 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-surf-secondary">{activeTabLabel}</div>
                  <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                    {activeTab === 'my'
                      ? sellerSectionLabel
                      : activeCategoryLabel === 'Tất cả'
                        ? 'Khám phá Surf Market'
                        : activeCategoryLabel}
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
                    {activeTab === 'my' ? 'Theo dõi bài niêm yết, thông báo, hiệu quả bán hàng và gian hàng Surf của bạn.' : marketDescription}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-white/[0.08] bg-[#151b24] px-3 py-1.5 text-xs font-bold text-slate-300">
                    {currentLoading ? 'Đang tải...' : activeTab === 'my' ? `${activeMyListingsCount} đang bán` : `${visibleListingCount} items`}
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-[#151b24] px-3 py-1.5 text-xs font-bold text-slate-300">
                    {activeTab === 'my' ? `${soldMyListingsCount} đã bán` : activeCategoryLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide lg:hidden">
              {(['all', 'my', 'saved'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleSelectMainTab(tab)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${
                    activeTab === tab
                      ? 'border-surf-primary bg-surf-primary text-white'
                      : 'border-white/[0.08] bg-[#121821] text-slate-400'
                  }`}
                >
                  {tab === 'all' ? 'Khám phá' : tab === 'my' ? 'Đang bán' : 'Đã lưu'}
                </button>
              ))}
              {activeTab === 'my'
                ? visibleSellerSections.map((section) => (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => handleSelectSellerSection(section.key)}
                      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${
                        sellerSection === section.key
                          ? 'border-surf-primary bg-surf-primary/15 text-surf-secondary'
                          : 'border-white/[0.08] bg-[#121821] text-slate-400'
                      }`}
                    >
                      {section.label}
                    </button>
                  ))
                : CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => { setActiveTab('all'); setCategory(cat.key); }}
                      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${
                        activeCategory === cat.key
                          ? 'border-surf-primary bg-surf-primary/15 text-surf-secondary'
                          : 'border-white/[0.08] bg-[#121821] text-slate-400'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
            </div>

            {activeTab === 'my' ? (
              <div className="space-y-4">
                {sellerSection === 'dashboard' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-4">
                      <h3 className="mb-3 text-sm font-black text-white">Tổng quan</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-4">
                          <div className="text-2xl font-black text-white">0</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Đoạn chat cần trả lời</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-4">
                          <div className="text-2xl font-black text-white">0</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Xếp hạng người bán</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-black text-white">Bài niêm yết của bạn</h3>
                        <button type="button" onClick={() => setIsCreateModalOpen(true)} className="rounded-lg bg-surf-primary px-3 py-1.5 text-xs font-black text-white">
                          Tạo bài mới
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{activeMyListingsCount}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Đang hoạt động</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{soldMyListingsCount}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Đã bán / hết hàng</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{pendingMyListingsCount}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Đang chờ duyệt</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{spamOrErrorMyListingsCount}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Spam/Lỗi</div>
                        </div>
                      </div>
                      {latestMyListing && (
                        <button type="button" onClick={() => openDetail(latestMyListing)} className="mt-4 flex w-full gap-3 rounded-xl bg-[#10161e] p-3 text-left transition hover:bg-[#1b222d]">
                          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[#0f141b]">
                            {latestMyListing.mediaUrls?.[0] && <img src={latestMyListing.mediaUrls[0]} alt={latestMyListing.title} className="h-full w-full object-cover" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-black text-white">{latestMyListing.title}</div>
                            <div className="mt-1 text-sm font-black text-slate-200">{formatPrice(latestMyListing.price)}</div>
                            <div className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">{latestMyListing.description || latestMyListing.location}</div>
                          </div>
                        </button>
                      )}
                    </div>

                    <div className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-4">
                      <h3 className="mb-3 text-sm font-black text-white">Thông tin chi tiết trên Surf Market</h3>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{myListingViews}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Lượt click vào bài niêm yết</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{myListingSaves}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Lượt lưu bài niêm yết</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{myActiveBoostCount}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Boost đang chạy</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{myBoostImpressions}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Impressions từ Boost · {formatPrice(myBoostSpent)} sandbox</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {sellerSection === 'listings' && (
                  <div className="mx-auto max-w-[760px] space-y-4">
                    <div className="flex items-center gap-3 rounded-lg bg-[#202327] px-3 py-2">
                      <h3 className="min-w-0 flex-1 truncate text-base font-black text-white">Bài niêm yết của bạn</h3>
                      <div className="relative hidden min-w-0 flex-1 sm:block">
                        <input
                          value={myListingSearch}
                          onChange={(e) => setMyListingSearch(e.target.value)}
                          placeholder="Tìm kiếm bài niêm yết"
                          className="h-8 w-full rounded-full border border-transparent bg-[#3a3d42] pl-8 pr-3 text-xs font-semibold text-white outline-none placeholder:text-slate-400 focus:border-[#2d9bf0]"
                        />
                        <svg className="absolute left-3 top-2 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <div className="flex rounded-md bg-[#303338] p-0.5">
                        <button
                          type="button"
                          onClick={() => setSellerListingView('list')}
                          className={`flex h-8 w-8 items-center justify-center rounded-md ${sellerListingView === 'list' ? 'bg-[#1877f2] text-white' : 'text-slate-300 hover:bg-white/[0.08]'}`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSellerListingView('grid')}
                          className={`flex h-8 w-8 items-center justify-center rounded-md ${sellerListingView === 'grid' ? 'bg-[#1877f2] text-white' : 'text-slate-300 hover:bg-white/[0.08]'}`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="relative sm:hidden">
                      <input
                        value={myListingSearch}
                        onChange={(e) => setMyListingSearch(e.target.value)}
                        placeholder="Tìm kiếm bài niêm yết"
                        className="h-9 w-full rounded-full border border-white/[0.08] bg-[#202327] pl-9 pr-3 text-xs font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#2d9bf0]"
                      />
                      <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {MY_LISTING_FILTERS.map((filter) => (
                        <button
                          key={filter.key}
                          type="button"
                          onClick={() => {
                            myListingsFetchKeyRef.current = `${activeTab}:${filter.key}`;
                            fetchMyListings(true, filter.key);
                          }}
                          className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                            myListingsFilter === filter.key
                              ? 'border-[#2d9bf0] bg-[#2d9bf0] text-white'
                              : 'border-white/[0.08] bg-[#202327] text-slate-400 hover:bg-white/[0.06] hover:text-white'
                          }`}
                        >
                          {filter.label} · {myListingsCounts[filter.key]}
                        </button>
                      ))}
                    </div>

                    {myListingsLoading ? (
                      <div className="rounded-lg bg-[#202327] p-4 text-sm font-bold text-slate-400">Đang tải bài niêm yết...</div>
                    ) : filteredMyListings.length > 0 ? (
                      <>
                        {aiInfrastructureMyListings.length > 0 && (
                          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-black text-amber-100">AI đang lỗi/quota</p>
                                <p className="mt-1 text-xs font-bold text-amber-100/70">
                                  Đây là lỗi hạ tầng AI, không phải sản phẩm bị vi phạm. {demoAiInfrastructureMyListings.length} bài demo đang tải trong trang này có thể duyệt nhanh.
                                </p>
                              </div>
                              {isMarketplaceAdmin && demoAiInfrastructureMyListings.length > 0 && (
                                <button
                                  type="button"
                                  onClick={handleBulkApproveAiFailedDemoListings}
                                  disabled={moderationBulkApproving}
                                  className="shrink-0 rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-[#211600] transition hover:bg-amber-300 disabled:opacity-60"
                                >
                                  {moderationBulkApproving ? 'Đang duyệt...' : 'Duyệt nhanh demo'}
                                </button>
                              )}
                              {!isMarketplaceAdmin && demoAiInfrastructureMyListings.length > 0 && (
                                <span className="shrink-0 rounded-lg border border-amber-300/30 bg-black/20 px-3 py-2 text-xs font-black text-amber-100">
                                  Cần quyền admin để duyệt nhanh
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        <section className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-black text-white">{myListingListTitle}</h4>
                            <span className="text-xs font-bold text-slate-500">{filteredMyListings.length} đã tải</span>
                          </div>
                          {visibleMyListingRows.length > 0 ? (
                            <div className={sellerListingView === 'grid' ? 'grid gap-2 lg:grid-cols-2' : 'space-y-2'}>
                              {visibleMyListingRows.map((item) => renderSellerListingRow(item, myListingsFilter !== 'active' && needsSellerAttention(item)))}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-white/[0.1] bg-[#202327] p-6 text-center text-sm font-bold text-slate-400">
                              Không có bài niêm yết trong mục {myListingFilterLabel.toLowerCase()}.
                            </div>
                          )}
                        </section>
                        <div ref={myListingsLoadMoreRef} className="min-h-6">
                          {myListingsLoadingMore && (
                            <div className="rounded-lg bg-[#202327] p-4 text-center text-sm font-bold text-slate-400">
                              Đang tải thêm bài niêm yết...
                            </div>
                          )}
                          {!myListingsLoadingMore && myListingsNextCursor && (
                            <button
                              type="button"
                              onClick={() => fetchMyListings(false, myListingsFilter)}
                              className="w-full rounded-lg border border-white/[0.08] bg-[#202327] px-4 py-3 text-sm font-black text-white transition hover:bg-[#2a2d33]"
                            >
                              Tải thêm 10 bài
                            </button>
                          )}
                          {!myListingsNextCursor && filteredMyListings.length >= 10 && (
                            <div className="py-2 text-center text-xs font-bold text-slate-500">
                              Đã tải hết mục {myListingFilterLabel.toLowerCase()}.
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed border-white/[0.12] bg-[#202327] p-10 text-center">
                        <p className="text-base font-black text-white">Không có bài niêm yết trong mục {myListingFilterLabel.toLowerCase()}</p>
                        <p className="mt-1 text-sm font-medium text-slate-500">Đổi bộ lọc hoặc tạo bài mới để tiếp tục bán trên Surf Market.</p>
                        <button type="button" onClick={() => setIsCreateModalOpen(true)} className="mt-4 rounded-lg bg-[#1877f2] px-4 py-2 text-sm font-black text-white">Tạo bài niêm yết mới</button>
                      </div>
                    )}
                  </div>
                )}

                {sellerSection === 'moderation' && isMarketplaceAdmin && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-surf-secondary">Admin moderation</div>
                          <h3 className="mt-1 text-xl font-black text-white">Kiểm duyệt Surf Market</h3>
                          <p className="mt-1 text-sm font-medium text-slate-500">
                            Auto dùng AI duyệt trước. Manual sẽ đưa toàn bộ tin mới vào hàng chờ admin.
                          </p>
                        </div>
                        <div className="flex rounded-xl border border-white/[0.08] bg-[#0f141b] p-1">
                          {(['auto', 'manual'] as MarketplaceModerationMode[]).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => handleToggleModerationMode(mode)}
                              className={`rounded-lg px-4 py-2 text-xs font-black transition ${
                                (moderationSettings?.mode ?? 'auto') === mode
                                  ? 'bg-surf-primary text-white'
                                  : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                              }`}
                            >
                              {mode === 'auto' ? 'Tự động' : 'Thủ công'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-white/[0.08] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{moderationQueue.length}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Đang chờ duyệt</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.08] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{moderationSettings?.mode === 'manual' ? 'Manual' : 'Auto'}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Chế độ hiện tại</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.08] bg-[#10161e] p-3">
                          <div className={`text-xl font-black ${moderationSettings?.hasAiKey ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {moderationSettings?.hasAiKey ? 'Đã có key' : 'Thiếu key'}
                          </div>
                          <div className="mt-1 text-xs font-bold text-slate-400">AI provider: {moderationSettings?.provider === 'openai' ? 'OpenAI' : 'Gemini'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-4">
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-base font-black text-white">Hàng chờ kiểm duyệt</h3>
                          <p className="mt-1 text-xs font-medium text-slate-500">Approve để public, reject để trả về trạng thái bị từ chối.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {demoAiInfrastructureModerationQueue.length > 0 && (
                            <button
                              type="button"
                              onClick={handleBulkApproveAiFailedDemoListings}
                              disabled={moderationBulkApproving || moderationLoading}
                              className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-black text-[#211600] transition hover:bg-amber-300 disabled:opacity-60"
                            >
                              {moderationBulkApproving ? 'Đang duyệt...' : `Duyệt ${demoAiInfrastructureModerationQueue.length} demo bị kẹt AI`}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={reloadModerationQueue}
                            disabled={moderationLoading}
                            className="rounded-xl bg-white/[0.08] px-4 py-2 text-xs font-black text-slate-200 transition hover:bg-white/[0.12] disabled:opacity-60"
                          >
                            {moderationLoading ? 'Đang tải...' : 'Tải lại'}
                          </button>
                        </div>
                      </div>
                      {aiInfrastructureModerationQueue.length > 0 && (
                        <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm font-bold text-amber-100">
                          {aiInfrastructureModerationQueue.length} tin đang kẹt do AI/quota. Có thể chờ quota hồi rồi chạy lại AI, hoặc admin duyệt nhanh demo đáng tin.
                        </div>
                      )}
                      {moderationError && (
                        <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300">
                          {moderationError}
                        </div>
                      )}
                      {moderationLoading ? (
                        <div className="rounded-2xl border border-white/[0.08] bg-[#10161e] p-4 text-sm font-bold text-slate-400">Đang tải hàng chờ...</div>
                      ) : moderationQueue.length > 0 ? (
                        <div className="grid gap-3">
                          {moderationQueue.map((item) => (
                            <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#10161e] p-3 md:flex-row">
                              <button type="button" onClick={() => openDetail(item)} className="h-28 w-full shrink-0 overflow-hidden rounded-xl bg-[#0f141b] md:w-36">
                                {item.mediaUrls?.[0] ? (
                                  <img src={item.mediaUrls[0]} alt={item.title} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-600">Không có ảnh</div>
                                )}
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-base font-black text-white">{item.title}</div>
                                <div className="mt-1 text-sm font-black text-slate-200">{formatPrice(item.price)}</div>
                                <div className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">{item.description || item.location || 'Không có mô tả'}</div>
                                <ModerationTrace listing={item} />
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={moderationActionId === item.id}
                                    onClick={() => handleRerunAiModeration(item.id)}
                                    className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-black text-white transition hover:bg-sky-400 disabled:opacity-60"
                                  >
                                    {moderationActionId === item.id ? 'Đang chạy...' : 'Chạy lại AI'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={moderationActionId === item.id}
                                    onClick={() => handleApproveModeration(item.id)}
                                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-black text-white transition hover:bg-emerald-400 disabled:opacity-60"
                                  >
                                    Duyệt
                                  </button>
                                  <button
                                    type="button"
                                    disabled={moderationActionId === item.id}
                                    onClick={() => handleRejectModeration(item.id)}
                                    className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-black text-white transition hover:bg-red-400 disabled:opacity-60"
                                  >
                                    Từ chối
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/[0.12] bg-[#10161e] p-8 text-center">
                          <p className="text-base font-black text-white">Không có tin nào đang chờ duyệt</p>
                          <p className="mt-1 text-sm font-medium text-slate-500">Tin mới cần review sẽ xuất hiện tại đây.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {sellerSection === 'notifications' && (
                  <div className="flex min-h-[420px] flex-col rounded-2xl border border-white/[0.08] bg-[#151a22]">
                    <div className="border-b border-white/[0.08] px-4 py-3 text-base font-black text-white">Thông báo</div>
                    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.08] text-slate-400">
                        <svg className="h-9 w-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12h6m-6 4h6M8 4h8l4 4v12H4V4h4z" />
                        </svg>
                      </div>
                      <p className="text-base font-black text-white">Bạn đã xem hết rồi</p>
                      <p className="mt-1 text-sm font-medium text-slate-500">Chúng tôi sẽ cho bạn biết khi có thông báo mới.</p>
                    </div>
                  </div>
                )}

                {sellerSection === 'insights' && (
                  <div className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-base font-black text-white">Thông tin chi tiết trên Surf Market</h3>
                      <span className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-black text-slate-300">7 ngày qua</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-4">
                        <div className="text-2xl font-black text-white">{myListingViews}</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">Lượt click vào bài niêm yết</div>
                      </div>
                      <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-4">
                        <div className="text-2xl font-black text-white">{myListingSaves}</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">Lượt lưu bài niêm yết</div>
                      </div>
                      <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-4">
                        <div className="text-2xl font-black text-white">0</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">Lượt chia sẻ bài niêm yết</div>
                      </div>
                      <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-4">
                        <div className="text-2xl font-black text-white">0</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">Người theo dõi trên Surf Market</div>
                      </div>
                    </div>
                  </div>
                )}

                {sellerSection === 'profile' && (
                  <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#151a22]">
                    <div className="relative h-28 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950">
                      <div className="absolute -bottom-12 left-5 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-[#151a22] bg-slate-200 text-4xl font-black text-slate-500">
                        {sellerPhotoUrl ? <img src={sellerPhotoUrl} alt={sellerDisplayName} className="h-full w-full object-cover" /> : sellerInitial}
                      </div>
                    </div>
                    <div className="px-5 pb-5 pt-14">
                      <h3 className="text-2xl font-black text-white">{sellerDisplayName}</h3>
                      <p className="mt-1 text-sm font-medium text-slate-500">Đã tham gia Surf Market</p>
                      <p className="mt-1 text-sm font-medium text-slate-500">{myListings.length} bài niêm yết đang hoạt động</p>
                      <div className="mt-5 rounded-xl bg-[#10161e] p-4">
                        <p className="text-xs font-semibold leading-relaxed text-slate-400">Cách bạn cài đặt quyền riêng tư trên Surf Market sẽ kiểm soát những gì mọi người có thể xem trên trang cá nhân người bán của bạn.</p>
                      </div>
                      <div className="mt-5 border-t border-white/[0.08] pt-4">
                        <div className="text-sm font-black text-white">Xếp hạng người bán</div>
                        <div className="mt-2 flex gap-1 text-surf-secondary">
                          {Array.from({ length: 5 }).map((_, index) => (
                            <span key={index}>☆</span>
                          ))}
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-500">Không có xếp hạng</p>
                      </div>
                      <div className="mt-5 border-t border-white/[0.08] pt-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-white">Bài niêm yết của {sellerDisplayName}</div>
                            <div className="mt-1 text-xs font-medium text-slate-500">Các mặt hàng bạn đang bán trên Surf Market.</div>
                          </div>
                          <button type="button" onClick={() => setSellerSection('listings')} className="shrink-0 rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-black text-slate-300">Xem tất cả</button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {activeMyListings.slice(0, 4).map((item) => (
                            <button key={item.id} type="button" onClick={() => openDetail(item)} className="overflow-hidden rounded-xl bg-[#10161e] text-left transition hover:bg-[#1b222d]">
                              <div className="aspect-[4/3] bg-[#0f141b]">
                                {item.mediaUrls?.[0] && <img src={item.mediaUrls[0]} alt={item.title} className="h-full w-full object-cover" />}
                              </div>
                              <div className="p-3">
                                <div className="text-sm font-black text-white">{formatPrice(item.price)}</div>
                                <div className="mt-1 line-clamp-2 text-xs font-bold text-slate-300">{item.title}</div>
                                <div className="mt-1 text-[11px] font-medium text-slate-500">{item.location || 'Toàn quốc'}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {currentLoading && displayedListings.length === 0 ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-3">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="h-8 w-8 animate-pulse rounded-full bg-slate-800" />
                      <div className="h-3 w-24 animate-pulse rounded-full bg-slate-800" />
                    </div>
                    <div className="mb-3 h-4 w-4/5 animate-pulse rounded-full bg-slate-800" />
                    <div className="mb-4 h-4 w-1/2 animate-pulse rounded-full bg-slate-800" />
                    <div className="aspect-[16/10] animate-pulse rounded-xl bg-slate-800" />
                  </div>
                ))
              ) : displayedListings.length > 0 ? (
                displayedListings.map((item) => {
                  const isBoosted = isListingBoostActive(item);
                  return (
                  <article
                    key={item.id}
                    onClick={() => openDetail(item)}
                    className={`group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-[#151a22] transition hover:-translate-y-0.5 hover:bg-[#171e28] ${isBoosted ? 'border-amber-300/30 shadow-lg shadow-amber-500/10 hover:border-amber-300/60' : 'border-white/[0.08] hover:border-surf-primary/40'}`}
                  >
                    <div className="p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#202733] text-xs font-black text-surf-secondary ring-1 ring-white/[0.08]">
                            {item.sellerPhotoURL ? (
                              <img src={item.sellerPhotoURL} alt={item.sellerDisplayName || 'Người bán'} className="h-full w-full object-cover" />
                            ) : (
                              (item.sellerDisplayName || 'S').charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-xs font-bold text-slate-300">{item.sellerDisplayName || 'Người bán'}</div>
                            <div className="truncate text-[11px] font-medium text-slate-600">
                              {isBoosted ? 'Được tài trợ · ' : ''}{CATEGORIES.find((cat) => cat.key === item.category)?.label ?? 'Khác'}
                            </div>
                          </div>
                        </div>

                        {/* Save Button */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleSave(item); }}
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
                            isSaved(item)
                              ? 'border-surf-primary bg-surf-primary text-white'
                              : 'border-white/[0.08] bg-white/[0.03] text-slate-500 hover:text-white'
                          }`}
                        >
                          <svg className="h-4 w-4" fill={isSaved(item) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                        </button>
                      </div>

                      <h3 className="line-clamp-2 min-h-[2.8rem] text-base font-black leading-snug text-white transition group-hover:text-surf-secondary">{item.title}</h3>

                      {/* Price Tag Overlay */}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-lg font-black text-white">{formatPrice(item.price)}</div>
                        <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          {CONDITION_LABELS[item.condition]}
                        </span>
                      </div>

                      <div className="mt-3 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <svg className="h-3.5 w-3.5 shrink-0 text-surf-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        <span className="truncate">{item.location || 'Toàn quốc'}</span>
                      </div>
                    </div>

                    <div className="px-3 pb-3">
                      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-[#0f141b]">
                        {isBoosted && (
                          <div className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#241600] shadow-lg shadow-black/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#241600]" />
                            Được tài trợ
                          </div>
                        )}
                        {item.mediaUrls?.[0] ? (
                          <img src={item.mediaUrls[0]} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-700">
                            <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between border-t border-white/[0.08] px-4 py-3 text-xs font-semibold text-slate-500">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          {item.viewCount ?? 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                          {item.savedBy?.length ?? 0}
                        </span>
                      </div>
                      <span className="text-slate-600">Xem chi tiết</span>
                    </div>
                  </article>
                  );
                })
              ) : (
                <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-[#121821] px-6 py-24 text-center">
                  <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#151a22] text-surf-secondary">
                    <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <p className="mb-2 text-xl font-black tracking-tight text-white">Chưa có mặt hàng phù hợp</p>
                  <p className="max-w-md text-sm font-medium text-slate-500">
                    {activeTab === 'saved'
                      ? 'Bạn chưa lưu tin đăng nào.'
                      : 'Thử thay đổi danh mục hoặc từ khóa tìm kiếm để khám phá thêm nhiều món hời khác.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setActiveTab('all'); setCategory('all'); }}
                    className="mt-6 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-surf-secondary hover:text-white"
                  >
                    Trở về tất cả
                  </button>
                </div>
              )}
            </div>
            {activeTab === 'all' && !isSearchMode && displayedListings.length > 0 && (
              <div ref={listingsLoadMoreRef} className="mt-5">
                {loading && (
                  <div className="rounded-xl border border-white/[0.08] bg-[#151a22] px-4 py-3 text-center text-sm font-bold text-slate-400">
                    Đang tải thêm mặt hàng...
                  </div>
                )}
                {!loading && nextCursor && (
                  <button
                    type="button"
                    onClick={() => fetchListings(false)}
                    className="w-full rounded-xl border border-white/[0.08] bg-[#151a22] px-4 py-3 text-sm font-black text-white transition hover:border-surf-primary/40 hover:bg-[#1b222d]"
                  >
                    Tải thêm 20 mặt hàng
                  </button>
                )}
                {!loading && !nextCursor && displayedListings.length >= 20 && (
                  <div className="py-2 text-center text-xs font-bold text-slate-500">
                    Đã tải hết mặt hàng trong mục này.
                  </div>
                )}
              </div>
            )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Create Listing Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex bg-surf-dark text-white">
          {createStep === 'listing' ? (
            <>
              <aside className="flex h-full w-full max-w-[390px] flex-col border-r border-white/[0.08] bg-[#18191a]">
                <div className="flex items-center gap-3 border-b border-white/[0.08] px-3 py-3">
                  <button
                    type="button"
                    onClick={closeCreateListingModal}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white transition hover:bg-white/[0.12]"
                    aria-label="Đóng"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
                    </svg>
                  </button>
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-surf-primary to-surf-secondary text-white shadow-lg shadow-surf-primary/30">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-slate-400">Surf Market Studio</div>
                    <h2 className="text-xl font-black leading-tight text-white">Mặt hàng cần bán</h2>
                  </div>
                  <button type="button" className="text-xs font-black text-[#2d88ff] hover:underline">
                    Lưu bản nháp
                  </button>
                </div>

                <form onSubmit={handleCreateListing} className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                    <div className="flex items-center gap-3 pb-3">
                      <Avatar src={currentUser?.photoURL} name={createSellerName} size="md" />
                      <div>
                        <div className="text-sm font-black text-white">{createSellerName}</div>
                        <div className="text-xs font-semibold text-slate-400">Niêm yết Surf Market · Công khai</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="mb-2 text-xs font-semibold text-slate-300">Ảnh · {newListing.mediaUrls.length}/5 · Bạn có thể thêm đến 5 ảnh.</div>
                        <div className="grid grid-cols-3 gap-2">
                          {newListing.mediaUrls.map((url) => (
                            <div key={url} className="relative aspect-square overflow-hidden rounded-lg bg-[#242526]">
                              <img src={url} alt="" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeCreateImage(url)}
                                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                                aria-label="Xóa ảnh"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          {newListing.mediaUrls.length < 5 && (
                            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-lg bg-[#3a3b3c] text-xs font-bold text-slate-200 transition hover:bg-[#4a4b4d]">
                              <input type="file" accept="image/*" multiple className="hidden" onChange={handleCreateImageUpload} disabled={createImageUploading} />
                              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                              </svg>
                              {createImageUploading ? 'Đang tải...' : 'Thêm ảnh'}
                            </label>
                          )}
                        </div>
                        {createImageError && <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">{createImageError}</div>}
                      </div>

                      <div className="flex items-center justify-between rounded-lg bg-[#242526] p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3a3b3c]">▣</span>
                          Tải trực tiếp ảnh lên từ điện thoại
                        </div>
                        <button type="button" className="rounded-md bg-[#3a3b3c] px-3 py-1.5 text-xs font-black text-white">Dùng thử</button>
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-black text-white">Bắt buộc</div>
                        <p className="mb-3 text-xs font-medium text-slate-400">Hãy mô tả rõ nhất có thể</p>
                        <div className="space-y-2">
                          <input required value={newListing.title} onChange={(e) => setNewListing({ ...newListing, title: e.target.value })} placeholder="Tiêu đề" className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#2d88ff]" />
                          <div className="relative">
                            <input required value={newListing.price} onChange={(e) => setNewListing({ ...newListing, price: e.target.value })} placeholder="Giá" inputMode="numeric" className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 pr-9 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#2d88ff]" />
                            <span className="absolute right-3 top-3 text-xs font-black text-slate-400">₫</span>
                          </div>
                          <select value={newListing.category} onChange={(e) => setNewListing({ ...newListing, category: e.target.value as Exclude<Category, 'all'> })} className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]">
                            {CATEGORIES.filter((c) => c.key !== 'all').map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                          <select value={newListing.condition} onChange={(e) => setNewListing({ ...newListing, condition: e.target.value as Condition })} className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]">
                            {Object.entries(CREATE_CONDITION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="border-t border-white/[0.08] pt-3">
                        <button type="button" onClick={() => setIsCreateDetailsOpen((value) => !value)} className="flex w-full items-center justify-between text-left">
                          <div>
                            <div className="text-sm font-black text-white">Xem thêm chi tiết</div>
                            <div className="mt-1 text-xs font-medium text-slate-500">Bổ sung chi tiết sẽ thu hút thêm sự quan tâm.</div>
                          </div>
                          <span className="text-slate-400">{isCreateDetailsOpen ? '⌃' : '⌄'}</span>
                        </button>
                        {isCreateDetailsOpen && (
                          <div className="mt-3 space-y-2">
                            <input value={newListing.brand} onChange={(e) => setNewListing({ ...newListing, brand: e.target.value })} placeholder="Thương hiệu" className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#2d88ff]" />
                            <input value={newListing.productType} onChange={(e) => setNewListing({ ...newListing, productType: e.target.value })} placeholder="Loại máy từ dây / loại sản phẩm" className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#2d88ff]" />
                            <textarea value={newListing.material} onChange={(e) => setNewListing({ ...newListing, material: e.target.value })} placeholder="Mô tả" className="h-20 w-full resize-none rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#2d88ff]" />
                            <select value={newListing.availability} onChange={(e) => setNewListing({ ...newListing, availability: e.target.value as ListingAvailability })} className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]">
                              {Object.entries(AVAILABILITY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </select>
                            <input value={newListing.tags} onChange={(e) => setNewListing({ ...newListing, tags: e.target.value })} placeholder="Thẻ sản phẩm, cách nhau bằng dấu phẩy" className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#2d88ff]" />
                            <input value={newListing.sku} onChange={(e) => setNewListing({ ...newListing, sku: e.target.value })} placeholder="SKU" className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#2d88ff]" />
                          </div>
                        )}
                      </div>

                      <div className="relative">
                        <div className="relative">
                          <svg className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          <input required type="text" value={newListing.location} onFocus={() => setIsCreateLocationFocused(true)} onBlur={() => window.setTimeout(() => setIsCreateLocationFocused(false), 150)} onChange={(e) => handleCreateLocationChange(e.target.value)} placeholder="Vị trí" className={`w-full rounded-lg border bg-[#242526] px-3 py-3 pl-10 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-[#2d88ff] ${createLocationError ? 'border-red-400' : 'border-[#3e4042]'}`} />
                        </div>
                        {createLocationError && <div className="mt-2 text-xs font-semibold text-red-300">{createLocationError}</div>}
                        {isCreateLocationFocused && (
                          <div className="absolute left-0 right-0 top-[52px] z-30 overflow-hidden rounded-xl border border-[#3e4042] bg-[#242526] shadow-2xl">
                            <div className="border-b border-white/[0.08] px-3 py-2 text-[11px] font-bold text-[#2d88ff]">{createLocationLoading ? 'Đang tìm địa chỉ...' : 'Chọn một địa chỉ trong danh sách'}</div>
                            {createLocationSuggestions.map((suggestion) => (
                              <button key={suggestion.id} type="button" onMouseDown={(e) => { e.preventDefault(); handleSelectCreateLocation(suggestion); }} className="flex w-full gap-3 px-3 py-3 text-left transition hover:bg-white/[0.06]">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[#2d88ff]">⌖</div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-black text-white">{suggestion.label}</div>
                                  <div className="mt-0.5 line-clamp-2 text-xs font-medium text-slate-400">{suggestion.subtitle}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-black text-white">Tùy chọn gặp mặt</div>
                        <p className="mb-2 text-xs font-medium text-slate-400">Người mua sẽ nhìn thấy lựa chọn của bạn trên bài niêm yết.</p>
                        <div className="space-y-2">
                          {MEETING_OPTIONS.map((option) => (
                            <label key={option.key} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition hover:bg-white/[0.04]">
                              <input type="checkbox" checked={newListing.meetingPreferences.includes(option.key)} onChange={() => toggleMeetingPreference(option.key)} className="mt-1 h-4 w-4 accent-[#2d88ff]" />
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-black text-slate-200">{option.label}</span>
                                <span className="mt-0.5 block text-[11px] font-medium text-slate-500">{option.helper}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <label className="flex cursor-pointer items-start justify-between gap-3 border-t border-white/[0.08] pt-3">
                        <span>
                          <span className="block text-sm font-black text-white">Quảng bá bài niêm yết sau khi đăng</span>
                          <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">Thêm bước chạy quảng cáo để tăng lượt xem sau khi tạo listing.</span>
                        </span>
                        <input type="checkbox" checked={newListing.boostEnabled} onChange={(e) => setNewListing({ ...newListing, boostEnabled: e.target.checked })} className="mt-1 h-5 w-5 accent-[#2d88ff]" />
                      </label>

                      <label className="flex cursor-pointer items-start justify-between gap-3 border-t border-white/[0.08] pt-3">
                        <span>
                          <span className="block text-sm font-black text-white">Ẩn với bạn bè</span>
                          <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">Ẩn bài niêm yết với bạn bè của bạn trên Surf.</span>
                        </span>
                        <input type="checkbox" checked={newListing.hideFromFriends} onChange={(e) => setNewListing({ ...newListing, hideFromFriends: e.target.checked })} className="mt-1 h-5 w-5 accent-[#2d88ff]" />
                      </label>
                    </div>
                  </div>

                  <div className="border-t border-white/[0.08] p-3">
                    <div className="mb-3 h-1 rounded-full bg-white/[0.08]">
                      <div className="h-full w-1/2 rounded-full bg-[#2d88ff]" />
                    </div>
                    <button type="submit" disabled={createImageUploading || createSubmitting} className="w-full rounded-lg bg-[#2d88ff] py-3 text-sm font-black text-white transition hover:bg-[#1877f2] disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-slate-500">
                      {createImageUploading ? 'Đang tải ảnh...' : createSubmitting ? 'Đang đăng...' : newListing.boostEnabled ? 'Tiếp' : 'Đăng'}
                    </button>
                  </div>
                </form>
              </aside>

              <main className="hidden min-w-0 flex-1 items-center justify-center overflow-y-auto p-8 lg:flex">
                <div className="w-full max-w-5xl rounded-xl border border-white/[0.08] bg-[#242526] p-4 shadow-2xl">
                  <div className="mb-3 text-sm font-black text-white">Xem trước</div>
                  <div className="grid overflow-hidden rounded-lg border border-white/[0.08] bg-[#18191a] lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
                    <div className="flex min-h-[520px] items-center justify-center bg-[#b0b3b8]/25">
                      {createPreviewImage ? (
                        <img src={createPreviewImage} alt={createPreviewTitle} className="max-h-[620px] w-full object-contain" />
                      ) : (
                        <div className="flex h-full min-h-[520px] w-full flex-col items-center justify-center bg-[#3a3b3c] text-slate-300">
                          <svg className="mb-4 h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm font-bold">Thêm ảnh để xem trước</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-4 border-l border-white/[0.08] p-5">
                      <div>
                        <h3 className="text-2xl font-black leading-tight text-white">{createPreviewTitle}</h3>
                        <div className="mt-1 text-lg font-black text-slate-100">{formatPrice(createPreviewPrice)}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-400">Đã niêm yết vài giây trước tại {createPreviewLocation}</div>
                      </div>

                      <div className="border-t border-white/[0.08] pt-4">
                        <div className="text-sm font-black text-white">Chi tiết</div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                          <div><div className="text-slate-500">Tình trạng</div><div className="mt-1 font-bold text-slate-200">{CREATE_CONDITION_LABELS[newListing.condition]}</div></div>
                          <div><div className="text-slate-500">Hạng mục</div><div className="mt-1 font-bold text-slate-200">{createCategoryLabel}</div></div>
                          {newListing.brand.trim() && <div><div className="text-slate-500">Thương hiệu</div><div className="mt-1 font-bold text-slate-200">{newListing.brand.trim()}</div></div>}
                          {newListing.productType.trim() && <div><div className="text-slate-500">Loại máy từ dây</div><div className="mt-1 font-bold text-slate-200">{newListing.productType.trim()}</div></div>}
                        </div>
                        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-300">{createPreviewDescription}</p>
                      </div>

                  {canShowCreatePreviewMap ? (
                    <div className="isolate overflow-hidden rounded-lg border border-surf-primary/20 bg-slate-900/40">
                      <button
                        type="button"
                        onClick={() => setIsCreateMapOpen(true)}
                        className="w-full text-left transition hover:bg-surf-primary/5"
                      >
                        <div className="relative z-0 h-36 bg-slate-900">
                          <LocationMap center={createMapCenter} zoom={MAP_ZOOM} interactive={false} />
                          <div className="absolute inset-0 bg-black/20 pointer-events-none" />
                          <div className="absolute right-3 top-3 rounded-full bg-surf-primary/90 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                            Map
                          </div>
                        </div>
                        <div className="px-3 py-2 text-xs text-slate-300">
                          <div className="font-black text-slate-100">{createPreviewLocation}</div>
                          <div className="text-[11px] text-surf-secondary">Nhấn để xem bản đồ · Đây chỉ là vị trí gần đúng</div>
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-surf-primary/20 bg-surf-primary/[0.04] px-4 py-5 text-center text-xs font-semibold text-slate-500">
                      Chọn một địa chỉ hợp lệ để hiển thị bản đồ.
                    </div>
                  )}

                  <div className="border-t border-slate-700/70 pt-4">
                    <div className="text-sm font-black text-white">
                      Thông tin về người bán <span className="font-medium text-slate-400">Chi tiết về người bán</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Avatar
                        src={currentUser?.photoURL}
                        name={createSellerName}
                        size="lg"
                        className="ring-2 ring-surf-primary/20"
                      />
                      <div>
                        <div className="text-sm font-black text-white">{createSellerName}</div>
                        <div className="text-xs text-slate-400">Người bán trên Surf Market</div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled
                    className="w-full rounded-lg bg-slate-900/70 py-3 text-sm font-black text-slate-500"
                  >
                    Nhắn tin
                  </button>
                </div>
              </div>
            </div>
              </main>
              {isCreateMapOpen && canShowCreatePreviewMap && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
                  <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" aria-hidden onClick={() => setIsCreateMapOpen(false)} />
                  <div className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-surf-primary/20 bg-surf-card shadow-2xl shadow-surf-primary/10">
                    <div className="flex items-center justify-between border-b border-slate-700/70 px-4 py-3">
                      <div>
                        <div className="text-sm font-bold text-white">Vị trí niêm yết</div>
                        <div className="mt-0.5 text-xs text-slate-400">{createPreviewLocation}</div>
                      </div>
                      <button type="button" onClick={() => setIsCreateMapOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-white transition hover:bg-surf-primary/20" aria-label="Đóng">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                      </button>
                    </div>
                    <div className="h-[min(64vh,520px)] min-h-[320px] bg-slate-900">
                      <LocationMap center={createMapCenter} zoom={MAP_ZOOM} interactive={true} />
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleCreateListing} className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#18191a]">
              <div className="border-b border-white/[0.08] bg-[#18191a] px-6 py-4">
                <div className="mx-auto flex max-w-6xl items-center gap-3">
                  <button type="button" onClick={() => setCreateStep('listing')} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white hover:bg-white/[0.12]" aria-label="Quay lại">
                    ←
                  </button>
                  <div>
                    <div className="text-[11px] font-medium text-slate-400">Surf Market Studio</div>
                    <h2 className="text-xl font-black text-white">Quảng cáo bài niêm yết trên Surf Market</h2>
                  </div>
                </div>
              </div>
              <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
                <div className="space-y-4">
                  <section className="rounded-xl bg-[#242526] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-black text-white">Ngân sách hằng ngày</h3>
                      <span className="text-xs font-black text-slate-500">ⓘ</span>
                    </div>
                    <div className="space-y-2">
                      {BOOST_BUDGET_OPTIONS.map((option) => (
                        <label key={option.dailyBudget} className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition ${boostDailyBudget === option.dailyBudget ? 'border-[#2d88ff] bg-[#2d88ff]/10' : 'border-white/[0.06] bg-[#18191a] hover:bg-white/[0.04]'}`}>
                          <span>
                            <span className="block text-xl font-black text-[#2d88ff]">{formatPrice(option.dailyBudget)}</span>
                            <span className="mt-1 block text-xs font-medium text-slate-400">Lượt hiển thị ước tính {option.reach}</span>
                            <span className="mt-0.5 block text-xs font-medium text-slate-400">Chiến dịch chạy trong {option.durationDays} ngày</span>
                          </span>
                          <input type="radio" name="boostBudget" checked={boostDailyBudget === option.dailyBudget} onChange={() => setBoostDailyBudget(option.dailyBudget)} className="h-4 w-4 accent-[#2d88ff]" />
                        </label>
                      ))}
                    </div>
                    <button type="button" className="mt-3 w-full text-right text-xs font-black text-slate-400 hover:text-[#2d88ff]">Chọn ngân sách & khoảng thời gian tuỳ chỉnh ›</button>
                  </section>

                  <section className="rounded-xl bg-[#242526] p-4">
                    <div className="mb-3 text-sm font-black text-white">Kênh hiển thị</div>
                    <div className="flex items-start justify-between gap-4 border-t border-white/[0.08] pt-4">
                      <div>
                        <div className="text-sm font-black text-white">Vị trí quảng cáo</div>
                        <div className="mt-2 text-xs font-black text-emerald-400">Khuyên dùng</div>
                        <div className="mt-1 text-xs font-black text-white">Gói hiển thị Surf Boost</div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-400">Cho phép niêm yết xuất hiện ở Surf Feed, Surf Market, Surf Chat và khu Khám phá để tiếp cận nhiều người mua hơn.</p>
                      </div>
                      <input type="checkbox" checked readOnly className="mt-1 h-5 w-5 accent-[#2d88ff]" />
                    </div>
                  </section>

                  <section className="rounded-xl bg-[#242526] p-4">
                    <div className="text-sm font-black text-white">Hiển thị trong Thư viện quảng cáo</div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">Quảng cáo và thông tin chi tiết sẽ hiển thị trong Thư viện quảng cáo.</p>
                  </section>

                  <section className="rounded-xl bg-[#242526] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-black text-white">Phương thức thanh toán</div>
                        <p className="mt-1 text-xs text-slate-400">Bạn có thể nhấn Đăng để thêm hoặc chọn phương thức thanh toán.</p>
                      </div>
                      <button type="button" onClick={() => { setIsPaymentModalOpen(true); setPaymentStep('method'); setPaymentError(''); }} className="rounded-md bg-white/[0.08] px-3 py-1.5 text-xs font-black text-white">Thêm</button>
                    </div>
                    <div className="flex gap-1 text-lg">💳 🟦 🟥 🟨 🟪</div>
                  </section>
                </div>

                <div className="space-y-4">
                  <section className="rounded-xl bg-[#242526] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-black text-white">Xem trước quảng cáo</h3>
                      <button type="button" className="text-xs font-black text-[#2d88ff]">Tất cả bản xem trước</button>
                    </div>
                    <div className="mx-auto max-w-[280px] overflow-hidden rounded-2xl border border-white/[0.08] bg-white text-slate-900 shadow-xl">
                      <div className="flex items-center gap-2 bg-gradient-to-r from-sky-50 to-cyan-50 px-3 py-2">
                        <Avatar src={currentUser?.photoURL} name={createSellerName} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold">{createSellerName} đang quảng bá một mặt hàng.</div>
                          <div className="text-[10px] text-sky-600">Surf Boost · Hiển thị mở rộng</div>
                        </div>
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700">Surf</span>
                      </div>
                      <div className="px-3 pb-2 pt-2 text-xs text-slate-600">Khám phá mặt hàng này trên Surf Market.</div>
                      <div className="aspect-[4/3] bg-slate-100">{createPreviewImage && <img src={createPreviewImage} alt={createPreviewTitle} className="h-full w-full object-cover" />}</div>
                      <div className="px-3 py-2">
                        <div className="text-xs font-bold">{createPreviewTitle}</div>
                        <div className="text-xs">{formatPrice(createPreviewPrice)}</div>
                      </div>
                      <div className="flex border-t px-3 py-2 text-[11px] font-bold text-slate-500"><span className="flex-1 text-center">♡ Quan tâm</span><span className="flex-1 text-center">↗ Gửi bạn bè</span></div>
                    </div>
                  </section>

                  <section className="rounded-xl bg-[#242526] p-4">
                    <h3 className="text-sm font-black text-white">Tóm tắt thông tin thanh toán</h3>
                    <p className="mt-1 text-xs text-slate-400">Quảng cáo của bạn sẽ chạy trong {selectedBoostOption.durationDays} ngày.</p>
                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex justify-between"><span>Tổng ngân sách</span><span>{formatPrice(boostSubtotal)} (VND)</span></div>
                      <div className="flex justify-between"><span>VAT ước tính</span><span>{formatPrice(boostEstimatedTax)} (VND)</span></div>
                      <div className="flex justify-between border-t border-white/[0.08] pt-2 font-black"><span>Tổng tiền</span><span>{formatPrice(boostTotal)} (VND)</span></div>
                    </div>
                  </section>
                </div>
              </div>
              <div className="sticky bottom-0 border-t border-white/[0.08] bg-[#18191a] px-6 py-3">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
                  <div className="text-[11px] font-medium text-slate-400">Bằng cách nhấp vào Đăng, bạn xác nhận sẽ tuân thủ điều khoản quảng cáo.</div>
                  <button type="submit" className="rounded-lg bg-[#2d88ff] px-8 py-2.5 text-sm font-black text-white hover:bg-[#1877f2]">Đăng</button>
                </div>
              </div>
            </form>
          )}
          {isPaymentModalOpen && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/70" aria-hidden onClick={() => setIsPaymentModalOpen(false)} />
              <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-[#242526] text-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
                  <button type="button" onClick={() => paymentStep === 'card' ? setPaymentStep('method') : setIsPaymentModalOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08]">←</button>
                  <h3 className="text-sm font-black">{paymentStep === 'method' ? 'Thêm thông tin thanh toán' : 'Thẻ tín dụng hoặc thẻ ghi nợ'}</h3>
                  <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08]">×</button>
                </div>
                <div className="space-y-4 p-4">
                  {paymentError && <div className="rounded-lg bg-red-500/15 px-3 py-3 text-sm font-bold text-red-300">● {paymentError}</div>}
                  {paymentStep === 'method' ? (
                    <>
                      <div>
                        <div className="text-sm font-black text-white">Thông tin thuế và thông tin doanh nghiệp</div>
                        <div className="mt-1 text-xs text-slate-400">Không bắt buộc · Thêm mã số thuế hoặc địa chỉ</div>
                      </div>
                      <div className="border-t border-white/[0.08] pt-3">
                        <div className="mb-2 text-sm font-black text-white">Chọn phương thức thanh toán</div>
                        {[
                          { key: 'card' as const, label: 'Thẻ tín dụng/thẻ ghi nợ 💳' },
                          { key: 'visa' as const, label: 'VietQR 🏦' },
                          { key: 'momo' as const, label: 'Ví điện tử MoMo 🟪' },
                          { key: 'vnpay' as const, label: 'VNPAY 🟦' },
                        ].map((method) => (
                          <label key={method.key} className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                            <span className="text-sm font-semibold text-slate-200">{method.label}</span>
                            <input type="radio" checked={paymentMethod === method.key} onChange={() => setPaymentMethod(method.key)} className="h-4 w-4 accent-[#2d88ff]" />
                          </label>
                        ))}
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-300">
                        <input type="checkbox" className="h-4 w-4 accent-[#2d88ff]" />
                        Tôi có một khoản tín dụng quảng cáo còn nhận.
                      </label>
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="mb-2 text-sm font-black text-white">Thông tin thẻ</div>
                        <div className="space-y-2">
                          <input value={billingCard.name} onChange={(e) => setBillingCard({ ...billingCard, name: e.target.value })} placeholder="Tên trên thẻ" className="w-full rounded-lg border border-[#3e4042] bg-[#18191a] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
                          <input value={billingCard.number} onChange={(e) => setBillingCard({ ...billingCard, number: e.target.value })} placeholder="Số thẻ" inputMode="numeric" className="w-full rounded-lg border border-[#3e4042] bg-[#18191a] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
                          <div className="grid grid-cols-2 gap-2">
                            <input value={billingCard.expiry} onChange={(e) => setBillingCard({ ...billingCard, expiry: e.target.value })} placeholder="MM/YY" className="rounded-lg border border-[#3e4042] bg-[#18191a] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
                            <input value={billingCard.cvv} onChange={(e) => setBillingCard({ ...billingCard, cvv: e.target.value })} placeholder="CVV" className="rounded-lg border border-[#3e4042] bg-[#18191a] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
                          </div>
                        </div>
                      </div>
                      {renderSandboxTestCards()}
                      <p className="text-center text-[11px] font-medium text-slate-500">Phương thức thanh toán của bạn được lưu trữ an toàn.</p>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-3">
                  <button type="button" onClick={() => submitCreateListing(false)} className="text-xs font-black text-slate-300 hover:text-white">Đăng không quảng bá</button>
                  <button type="button" onClick={handleContinuePayment} className="rounded-lg bg-[#2d88ff] px-5 py-2 text-sm font-black text-white hover:bg-[#1877f2]">
                    {paymentStep === 'method' ? 'Tiếp' : 'Lưu'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {boostingListing && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-[#18191a] text-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setIsBoostPaymentModalOpen(true);
              setBoostPaymentStep('method');
              setBoostPaymentError('');
            }}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#18191a]"
          >
            <div className="border-b border-white/[0.08] bg-[#18191a] px-6 py-4">
              <div className="mx-auto flex max-w-6xl items-center gap-3">
                <button type="button" onClick={closeBoostSellerListing} disabled={boostSubmitting} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white hover:bg-white/[0.12] disabled:opacity-50" aria-label="Quay lại">
                  ←
                </button>
                <div>
                  <div className="text-[11px] font-medium text-slate-400">Surf Market Studio</div>
                  <h2 className="text-xl font-black text-white">Quảng cáo bài niêm yết trên Surf Market</h2>
                </div>
              </div>
            </div>
            <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
              <div className="space-y-4">
                <section className="rounded-xl bg-[#242526] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black text-white">Ngân sách hằng ngày</h3>
                    <span className="text-xs font-black text-slate-500">ⓘ</span>
                  </div>
                  <div className="space-y-2">
                    {BOOST_BUDGET_OPTIONS.map((option) => (
                      <label key={option.dailyBudget} className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition ${boostDailyBudget === option.dailyBudget ? 'border-[#2d88ff] bg-[#2d88ff]/10' : 'border-white/[0.06] bg-[#18191a] hover:bg-white/[0.04]'}`}>
                        <span>
                          <span className="block text-xl font-black text-[#2d88ff]">{formatPrice(option.dailyBudget)}</span>
                          <span className="mt-1 block text-xs font-medium text-slate-400">Lượt hiển thị ước tính {option.reach}</span>
                          <span className="mt-0.5 block text-xs font-medium text-slate-400">Chiến dịch chạy trong {option.durationDays} ngày</span>
                        </span>
                        <input type="radio" name="existingBoostBudget" checked={boostDailyBudget === option.dailyBudget} onChange={() => setBoostDailyBudget(option.dailyBudget)} className="h-4 w-4 accent-[#2d88ff]" />
                      </label>
                    ))}
                  </div>
                  <button type="button" className="mt-3 w-full text-right text-xs font-black text-slate-400 hover:text-[#2d88ff]">Chọn ngân sách & khoảng thời gian tuỳ chỉnh ›</button>
                </section>

                <section className="rounded-xl bg-[#242526] p-4">
                  <div className="mb-3 text-sm font-black text-white">Kênh hiển thị</div>
                  <div className="flex items-start justify-between gap-4 border-t border-white/[0.08] pt-4">
                    <div>
                      <div className="text-sm font-black text-white">Vị trí quảng cáo</div>
                      <div className="mt-2 text-xs font-black text-emerald-400">Khuyên dùng</div>
                      <div className="mt-1 text-xs font-black text-white">Gói hiển thị Surf Boost</div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-400">Cho phép niêm yết xuất hiện ở Surf Feed, Surf Market, Surf Chat và khu Khám phá để tiếp cận nhiều người mua hơn.</p>
                    </div>
                    <input type="checkbox" checked readOnly className="mt-1 h-5 w-5 accent-[#2d88ff]" />
                  </div>
                </section>

                <section className="rounded-xl bg-[#242526] p-4">
                  <div className="text-sm font-black text-white">Hiển thị trong Thư viện quảng cáo</div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">Quảng cáo và thông tin chi tiết sẽ hiển thị trong Thư viện quảng cáo.</p>
                </section>

                <section className="rounded-xl bg-[#242526] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-black text-white">Phương thức thanh toán</div>
                      <p className="mt-1 text-xs text-slate-400">Bạn có thể nhấn Quảng bá để thêm hoặc chọn phương thức thanh toán sandbox.</p>
                    </div>
                    <button type="button" onClick={() => { setIsBoostPaymentModalOpen(true); setBoostPaymentStep('method'); setBoostPaymentError(''); }} className="rounded-md bg-white/[0.08] px-3 py-1.5 text-xs font-black text-white">Thêm</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 text-lg">💳 🟦 🟥 🟨 🟪</div>
                    <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black text-emerald-300">Sandbox</span>
                  </div>
                </section>
              </div>

              <div className="space-y-4">
                <section className="rounded-xl bg-[#242526] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black text-white">Xem trước quảng cáo</h3>
                    <button type="button" className="text-xs font-black text-[#2d88ff]">Tất cả bản xem trước</button>
                  </div>
                  <div className="mx-auto max-w-[280px] overflow-hidden rounded-2xl border border-white/[0.08] bg-white text-slate-900 shadow-xl">
                    <div className="flex items-center gap-2 bg-gradient-to-r from-sky-50 to-cyan-50 px-3 py-2">
                      <Avatar src={currentUser?.photoURL} name={boostPreviewSellerName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold">{boostPreviewSellerName} đang quảng bá một mặt hàng.</div>
                        <div className="text-[10px] text-sky-600">Surf Boost · Hiển thị mở rộng</div>
                      </div>
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700">Surf</span>
                    </div>
                    <div className="px-3 pb-2 pt-2 text-xs text-slate-600">Khám phá mặt hàng này trên Surf Market.</div>
                    <div className="aspect-[4/3] bg-slate-100">{boostPreviewImage && <img src={boostPreviewImage} alt={boostPreviewTitle} className="h-full w-full object-cover" />}</div>
                    <div className="px-3 py-2">
                      <div className="text-xs font-bold">{boostPreviewTitle}</div>
                      <div className="text-xs">{formatPrice(boostPreviewPrice)}</div>
                    </div>
                    <div className="flex border-t px-3 py-2 text-[11px] font-bold text-slate-500"><span className="flex-1 text-center">♡ Quan tâm</span><span className="flex-1 text-center">↗ Gửi bạn bè</span></div>
                  </div>
                </section>

                <section className="rounded-xl bg-[#242526] p-4">
                  <h3 className="text-sm font-black text-white">Tóm tắt thông tin thanh toán</h3>
                  <p className="mt-1 text-xs text-slate-400">Quảng cáo của bạn sẽ chạy trong {selectedBoostOption.durationDays} ngày ở chế độ sandbox.</p>
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between"><span>Tổng ngân sách</span><span>{formatPrice(boostSubtotal)} (VND)</span></div>
                    <div className="flex justify-between"><span>VAT ước tính</span><span>{formatPrice(boostEstimatedTax)} (VND)</span></div>
                    <div className="flex justify-between border-t border-white/[0.08] pt-2 font-black"><span>Tổng tiền sandbox</span><span>{formatPrice(boostTotal)} (VND)</span></div>
                  </div>
                </section>
              </div>
            </div>
            <div className="sticky bottom-0 border-t border-white/[0.08] bg-[#18191a] px-6 py-3">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
                <div className="text-[11px] font-medium text-slate-400">Bằng cách nhấp vào Quảng bá, bạn xác nhận sẽ chạy Surf Boost ở chế độ sandbox và không bị trừ tiền thật.</div>
                <button type="submit" disabled={boostSubmitting} className="rounded-lg bg-[#2d88ff] px-8 py-2.5 text-sm font-black text-white hover:bg-[#1877f2] disabled:bg-white/20 disabled:text-slate-500">
                  {boostSubmitting ? 'Đang kích hoạt...' : 'Quảng bá'}
                </button>
              </div>
            </div>
          </form>

          {isBoostPaymentModalOpen && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/70" aria-hidden onClick={() => setIsBoostPaymentModalOpen(false)} />
              <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-[#242526] text-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
                  <button type="button" onClick={() => boostPaymentStep === 'card' ? setBoostPaymentStep('method') : setIsBoostPaymentModalOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08]">←</button>
                  <h3 className="text-sm font-black">{boostPaymentStep === 'method' ? 'Thêm thông tin thanh toán' : 'Thẻ tín dụng hoặc thẻ ghi nợ'}</h3>
                  <button type="button" onClick={() => setIsBoostPaymentModalOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08]">×</button>
                </div>
                <div className="space-y-4 p-4">
                  {boostPaymentError && <div className="rounded-lg bg-red-500/15 px-3 py-3 text-sm font-bold text-red-300">● {boostPaymentError}</div>}
                  {boostPaymentStep === 'method' ? (
                    <>
                      <div>
                        <div className="text-sm font-black text-white">Thông tin thuế và thông tin doanh nghiệp</div>
                        <div className="mt-1 text-xs text-slate-400">Không bắt buộc · Sandbox không phát sinh giao dịch thật</div>
                      </div>
                      <div className="border-t border-white/[0.08] pt-3">
                        <div className="mb-2 text-sm font-black text-white">Chọn phương thức thanh toán</div>
                        {[
                          { key: 'card' as const, label: 'Thẻ tín dụng/thẻ ghi nợ 💳' },
                          { key: 'visa' as const, label: 'VietQR 🏦' },
                          { key: 'momo' as const, label: 'Ví điện tử MoMo 🟪' },
                          { key: 'vnpay' as const, label: 'VNPAY 🟦' },
                        ].map((method) => (
                          <label key={method.key} className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                            <span className="text-sm font-semibold text-slate-200">{method.label}</span>
                            <input type="radio" checked={boostPaymentMethod === method.key} onChange={() => setBoostPaymentMethod(method.key)} className="h-4 w-4 accent-[#2d88ff]" />
                          </label>
                        ))}
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-300">
                        <input type="checkbox" className="h-4 w-4 accent-[#2d88ff]" />
                        Tôi có một khoản tín dụng quảng cáo còn nhận.
                      </label>
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="mb-2 text-sm font-black text-white">Thông tin thẻ</div>
                        <div className="space-y-2">
                          <input value={billingCard.name} onChange={(e) => setBillingCard({ ...billingCard, name: e.target.value })} placeholder="Tên trên thẻ" className="w-full rounded-lg border border-[#3e4042] bg-[#18191a] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
                          <input value={billingCard.number} onChange={(e) => setBillingCard({ ...billingCard, number: e.target.value })} placeholder="Số thẻ" inputMode="numeric" className="w-full rounded-lg border border-[#3e4042] bg-[#18191a] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
                          <div className="grid grid-cols-2 gap-2">
                            <input value={billingCard.expiry} onChange={(e) => setBillingCard({ ...billingCard, expiry: e.target.value })} placeholder="MM/YY" className="rounded-lg border border-[#3e4042] bg-[#18191a] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
                            <input value={billingCard.cvv} onChange={(e) => setBillingCard({ ...billingCard, cvv: e.target.value })} placeholder="CVV" className="rounded-lg border border-[#3e4042] bg-[#18191a] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
                          </div>
                        </div>
                      </div>
                      {renderSandboxTestCards()}
                      <p className="text-center text-[11px] font-medium text-slate-500">Phương thức thanh toán được mô phỏng ở chế độ sandbox.</p>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-3">
                  <button type="button" onClick={closeBoostSellerListing} disabled={boostSubmitting} className="text-xs font-black text-slate-300 hover:text-white disabled:opacity-50">Để sau</button>
                  <button type="button" onClick={handleContinueBoostPayment} disabled={boostSubmitting} className="rounded-lg bg-[#2d88ff] px-5 py-2 text-sm font-black text-white hover:bg-[#1877f2] disabled:bg-white/20 disabled:text-slate-500">
                    {boostSubmitting ? 'Đang kích hoạt...' : boostPaymentStep === 'method' ? 'Tiếp' : 'Lưu'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {editingListing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 text-white">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Đóng" onClick={closeEditSellerListing} />
          <form onSubmit={handleEditSellerListing} className="relative z-10 flex max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-xl border border-white/[0.08] bg-[#18191a] shadow-2xl">
            <aside className="w-full max-w-[330px] overflow-y-auto border-r border-white/[0.08] bg-[#18191a] p-4">
              <div className="mb-4 flex items-center gap-3">
                <button type="button" onClick={closeEditSellerListing} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3a3b3c] text-lg font-black text-white">×</button>
                <div>
                  <div className="text-[11px] text-slate-400">Surf Market Studio</div>
                  <h2 className="text-xl font-black text-white">Chỉnh sửa bài niêm yết</h2>
                </div>
              </div>
              <div className="mb-4 flex items-center gap-2 text-xs font-bold text-slate-300">
                <Avatar src={currentUser?.photoURL} name={currentUser?.displayName || editingListing.sellerDisplayName} size="sm" />
                <span>{currentUser?.displayName || editingListing.sellerDisplayName}</span>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2">
                {editDraft.mediaUrls.slice(0, 4).map((url) => (
                  <div key={url} className="relative aspect-square overflow-hidden rounded-lg bg-[#242526]">
                    <img src={url} alt="Ảnh niêm yết" className="h-full w-full object-cover" />
                    <button type="button" onClick={() => setEditDraft((current) => ({ ...current, mediaUrls: current.mediaUrls.filter((item) => item !== url) }))} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-black text-white">×</button>
                  </div>
                ))}
                <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-white/[0.16] bg-[#242526] text-xs font-black text-slate-400">Thêm ảnh</div>
              </div>
              <div className="space-y-2">
                <input value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} placeholder="Tiêu đề" className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
                <input value={editDraft.price} onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })} placeholder="Giá" className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
                <select value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value as Exclude<Category, 'all'> })} className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]">
                  {CATEGORIES.filter((category) => category.key !== 'all').map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
                </select>
                <select value={editDraft.condition} onChange={(e) => setEditDraft({ ...editDraft, condition: e.target.value as Condition })} className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]">
                  {Object.entries(CREATE_CONDITION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                <input value={editDraft.location} onChange={(e) => setEditDraft({ ...editDraft, location: e.target.value })} placeholder="Vị trí" className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
                <textarea value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} placeholder="Mô tả" rows={4} className="w-full resize-none rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
                <input value={editDraft.brand} onChange={(e) => setEditDraft({ ...editDraft, brand: e.target.value })} placeholder="Thương hiệu" className="w-full rounded-lg border border-[#3e4042] bg-[#242526] px-3 py-3 text-sm font-semibold text-white outline-none focus:border-[#2d88ff]" />
              </div>
              <button type="submit" disabled={editSubmitting} className="mt-4 w-full rounded-lg bg-[#2d88ff] py-2.5 text-sm font-black text-white transition hover:bg-[#1877f2] disabled:bg-white/20 disabled:text-slate-500">
                {editSubmitting ? 'Đang cập nhật...' : 'Cập nhật'}
              </button>
            </aside>
            <main className="hidden flex-1 items-center justify-center p-8 lg:flex">
              <div className="w-full max-w-xl rounded-xl border border-white/[0.08] bg-[#242526] p-3">
                <div className="mb-2 text-xs font-black text-white">Xem trước</div>
                <div className="grid overflow-hidden rounded-lg bg-[#18191a] md:grid-cols-[1.1fr_0.9fr]">
                  <div className="flex min-h-[420px] items-center justify-center bg-[#b0b3b8]/35">
                    {editDraft.mediaUrls[0] ? <img src={editDraft.mediaUrls[0]} alt={editDraft.title} className="max-h-[520px] w-full object-contain" /> : <span className="text-sm font-bold text-slate-400">Chưa có ảnh</span>}
                  </div>
                  <div className="space-y-4 p-4">
                    <div>
                      <h3 className="text-xl font-black text-white">{editDraft.title || 'Tiêu đề'}</h3>
                      <div className="mt-1 text-sm font-black text-slate-100">{formatPrice(Number(editDraft.price.replace(/[^d]/g, '')) || 0)}</div>
                      <div className="mt-1 text-[11px] text-slate-400">Đã niêm yết vài giây trước tại {editDraft.location || 'Vị trí'}</div>
                    </div>
                    <div className="border-t border-white/[0.08] pt-3 text-xs">
                      <div className="mb-2 text-sm font-black text-white">Chi tiết</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><div className="text-slate-500">Tình trạng</div><div className="mt-1 font-bold text-slate-200">{CREATE_CONDITION_LABELS[editDraft.condition]}</div></div>
                        <div><div className="text-slate-500">Thương hiệu</div><div className="mt-1 font-bold text-slate-200">{editDraft.brand || 'Khác'}</div></div>
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm text-slate-300">{editDraft.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            </main>
          </form>
        </div>
      )}

      {messagesListing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 text-white">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Đóng" onClick={() => { setMessagesListing(null); setActiveSellerConversation(null); }} />
          <div className="relative z-10 grid max-h-[88vh] w-full max-w-[820px] overflow-hidden rounded-lg border border-white/[0.08] bg-[#242526] shadow-2xl md:grid-cols-[230px_1fr]">
            <button type="button" onClick={() => { setMessagesListing(null); setActiveSellerConversation(null); }} className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-lg font-black text-slate-300 hover:bg-white/[0.14]">×</button>
            <aside className="overflow-y-auto border-r border-white/[0.08] p-3">
              <div className="rounded-lg bg-[#303134] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-slate-100">Cải thiện phần mô tả</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Hãy mô tả chi tiết hơn để mọi người muốn thêm thông tin.</p>
                  </div>
                  <span className="text-slate-400">×</span>
                </div>
                <button type="button" onClick={() => openEditSellerListing(messagesListing)} className="mt-3 w-full rounded-md bg-[#2d88ff] py-1.5 text-xs font-black text-white">Chỉnh sửa phần mô tả</button>
              </div>
              <div className="mt-3 flex gap-2">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-[#18191a]">
                  {messagesListing.mediaUrls?.[0] && <img src={messagesListing.mediaUrls[0]} alt={messagesListing.title} className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 text-xs">
                  <div className="truncate font-black text-white">{messagesListing.title}</div>
                  <div className="mt-0.5 font-bold text-slate-200">{formatPrice(messagesListing.price)}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">{getSellerListingStatusText(messagesListing)} · {messagesListing.location}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">Thời gian đăng: {formatSellerListingDate(messagesListing.createdAt)}</div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {messagesListing.status === 'sold' ? (
                  <button type="button" onClick={() => handleMarkSellerListingAvailable(messagesListing)} className="w-full rounded-md bg-[#2d88ff] py-2 text-xs font-black text-white">✓ Đánh dấu là còn hàng</button>
                ) : messagesListing.saleStatus === 'pending' ? (
                  <button type="button" onClick={() => handleMarkSellerListingAvailable(messagesListing)} className="w-full rounded-md bg-[#2d88ff] py-2 text-xs font-black text-white">✓ Đánh dấu là có sẵn</button>
                ) : (
                  <button type="button" onClick={() => handleMarkSellerListingSold(messagesListing)} disabled={messagesListing.status !== 'active'} className="w-full rounded-md bg-[#2d88ff] py-2 text-xs font-black text-white disabled:bg-white/10 disabled:text-slate-500">✓ Đánh dấu là hết hàng</button>
                )}
                <button type="button" className="w-full rounded-md bg-[#3a3b3c] py-2 text-xs font-black text-white">↗ Quảng bá bài niêm yết</button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-3 text-center text-[11px] font-black text-slate-200">
                <button type="button" onClick={() => openEditSellerListing(messagesListing)} className="rounded-lg p-2 hover:bg-white/[0.06]"><div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#4a4b4d]">✎</div>Chỉnh sửa bài niêm yết</button>
                <button type="button" onClick={() => handleDeleteSellerListing(messagesListing.id)} className="rounded-lg p-2 hover:bg-white/[0.06]"><div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#4a4b4d]">⌫</div>Xóa bài niêm yết</button>
                <button type="button" className="rounded-lg p-2 hover:bg-white/[0.06]"><div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#4a4b4d]">…</div>Xem thêm</button>
              </div>
              <div className="mt-3 border-t border-white/[0.08] pt-3 text-xs">
                <div className="font-black text-slate-200">Đã niêm yết ở 1 nơi</div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400"><span>▣ Surf Market</span><span>{messagesListing.viewCount ?? 0} lượt click vào bài niêm yết</span></div>
              </div>
            </aside>
            <section className="min-h-[360px] overflow-y-auto p-4">
              <h3 className="text-center text-sm font-black text-white">Bài niêm yết của bạn</h3>
              <div className="mt-4 flex gap-5 border-b border-white/[0.08] text-xs font-black">
                <button type="button" onClick={() => setSellerMessagesTab('messages')} className={sellerMessagesTab === 'messages' ? 'border-b-2 border-[#2d88ff] px-1 pb-2 text-[#2d88ff]' : 'px-1 pb-2 text-slate-400'}>Tin nhắn</button>
                <button type="button" onClick={() => setSellerMessagesTab('comments')} className={sellerMessagesTab === 'comments' ? 'border-b-2 border-[#2d88ff] px-1 pb-2 text-[#2d88ff]' : 'px-1 pb-2 text-slate-400'}>Bình luận</button>
                <button type="button" onClick={() => setSellerMessagesTab('insights')} className={sellerMessagesTab === 'insights' ? 'border-b-2 border-[#2d88ff] px-1 pb-2 text-[#2d88ff]' : 'px-1 pb-2 text-slate-400'}>Thông tin chi tiết</button>
              </div>
              {sellerMessagesTab === 'messages' && (
                <div className="mt-4">
                  {sellerListingConversationsLoading ? (
                    <div className="flex h-56 items-center justify-center text-xs font-semibold text-slate-400">Đang tải tin nhắn...</div>
                  ) : sellerListingConversationsError ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">{sellerListingConversationsError}</div>
                  ) : sellerListingConversations.length === 0 ? (
                    <div className="flex h-56 flex-col items-center justify-center text-center text-xs font-semibold text-slate-400">
                      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.08] text-2xl">☏</div>
                      <div>Chưa có tin nhắn cho bài niêm yết này</div>
                      <div className="mt-1 max-w-xs font-medium text-slate-500">Khi người mua nhấn Gửi trong trang chi tiết sản phẩm, hội thoại sẽ xuất hiện tại đây.</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sellerListingConversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => setActiveSellerConversation(conversation)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
                        >
                          <Avatar src={conversation.peer?.avatarUrl} name={conversation.peer?.name ?? 'Người mua'} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-black text-white">{conversation.peer?.name ?? 'Người mua'}</div>
                              {conversation.unreadCount > 0 && (
                                <span className="rounded-full bg-[#2d88ff] px-1.5 py-0.5 text-[10px] font-black text-white">{conversation.unreadCount}</span>
                              )}
                              <div className="ml-auto shrink-0 text-[11px] font-bold text-slate-500">{formatConversationTime(conversation.lastMessageAt)}</div>
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-xs font-medium text-slate-400">
                              {conversation.lastMessagePreview || `Đã hỏi về ${messagesListing.title}`}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {sellerMessagesTab === 'comments' && <div className="flex h-56 items-center justify-center text-xs font-semibold text-slate-400">Chưa có bình luận cho bài niêm yết này</div>}
              {sellerMessagesTab === 'insights' && (
                <div className="mt-5 max-w-sm text-sm text-slate-200">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-black text-white">Thông tin chi tiết trên Surf Market</div>
                    </div>
                    <select value={sellerInsightRange} onChange={(e) => setSellerInsightRange(e.target.value as '7' | '14' | '30')} className="rounded-md border border-[#3e4042] bg-[#3a3b3c] px-2 py-1 text-xs font-bold text-white outline-none">
                      <option value="7">7 ngày qua</option>
                      <option value="14">14 ngày qua</option>
                      <option value="30">30 ngày qua</option>
                    </select>
                  </div>
                  <div className="space-y-4 text-xs">
                    <div className="flex gap-3"><span className="text-lg">◎</span><div><div className="font-black text-white">{messagesListing.viewCount ?? 0} lượt click vào bài niêm yết</div><div className="text-slate-500">Số lần mọi người xem trang chi tiết của bài niêm yết của bạn.</div></div></div>
                    <div className="flex gap-3"><span className="text-lg">♡</span><div><div className="font-black text-white">0 lượt lưu bài niêm yết</div><div className="text-slate-500">Lượt lưu bài niêm yết Surf Market của bạn.</div></div></div>
                    <div className="flex gap-3"><span className="text-lg">↗</span><div><div className="font-black text-white">0 lượt chia sẻ bài niêm yết</div><div className="text-slate-500">Lượt chia sẻ bài niêm yết trên Surf Market của bạn.</div></div></div>
                  </div>
                </div>
              )}
            </section>
          </div>
          {activeSellerConversation && (
            <div className="fixed bottom-5 right-5 z-[70]">
              <MiniChatPanel
                compact
                initialConversationId={activeSellerConversation.id}
                initialConversation={activeSellerConversation}
                onClose={() => setActiveSellerConversation(null)}
              />
            </div>
          )}
        </div>
      )}

      {isRouteDetailView && (detailLoading || !selectedListing || !isRouteSelectedListing) && (
        <div className="market-detail-view fixed inset-0 z-50 flex items-center justify-center text-white">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-surf-primary border-t-transparent" />
            <div className="text-sm font-bold text-slate-300">Đang tải chi tiết sản phẩm...</div>
          </div>
        </div>
      )}

      {!isRouteDetailView && isDetailModalOpen && selectedListing && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-hidden
            onClick={handleCloseDetail}
          />
          <div className="relative z-10 flex h-full w-full items-center justify-center p-3 sm:p-6">
            <div className="relative flex h-full max-h-[92vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 text-white shadow-2xl lg:flex-row">
              <button
                type="button"
                onClick={handleCloseDetail}
                className="absolute left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60"
                aria-label="Đóng"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>

              <div className="relative flex h-[55vh] flex-1 items-center justify-center bg-black lg:h-full">
                {activeMediaUrl ? (
                  <>
                    <div
                      className="absolute inset-0 opacity-30 blur-2xl"
                      style={{
                        backgroundImage: `url(${activeMediaUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                    <img
                      src={activeMediaUrl}
                      alt={selectedListing.title}
                      className="relative z-10 max-h-full max-w-full object-contain"
                    />
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-400">
                    <svg className="h-20 w-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}

                {detailMediaUrls.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 z-10 flex max-w-[92%] -translate-x-1/2 gap-2 overflow-x-auto rounded-2xl bg-black/40 px-3 py-2 backdrop-blur">
                    {detailMediaUrls.map((url, i) => (
                      <button
                        key={`${url}-${i}`}
                        type="button"
                        onClick={() => setActiveMediaIndex(i)}
                        className={`h-12 w-12 shrink-0 overflow-hidden rounded-xl border ${
                          i === activeMediaIndex ? 'border-white' : 'border-white/20 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <aside className="w-full overflow-y-auto border-t border-white/10 bg-slate-950/95 p-5 lg:w-[380px] lg:border-l lg:border-t-0">
                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Chi tiết sản phẩm</div>
                    <h2 className="mt-3 text-2xl font-black leading-tight text-white">{selectedListing.title}</h2>
                    <p className="mt-1 text-xl font-black text-surf-secondary">{formatPrice(selectedListing.price)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400">
                      <span>{detailStatusLabel}</span>
                      <span>·</span>
                      <span>{detailLocation}</span>
                      <span>·</span>
                      <span>{selectedListing.viewCount ?? 0} lượt xem</span>
                    </div>
                  </div>

                  {detailIsOwner ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <button
                          type="button"
                          onClick={() => openEditSellerListing(selectedListing)}
                          className="rounded-xl bg-white/10 px-4 py-2.5 text-xs font-black text-white transition hover:bg-white/15"
                        >
                          ✎ Chỉnh sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareSellerListing(selectedListing)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-slate-200 transition hover:bg-white/15"
                          aria-label="Chia sẻ"
                        >
                          ↗
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => selectedListing.status === 'sold' || selectedListing.saleStatus === 'pending'
                          ? handleMarkSellerListingAvailable(selectedListing)
                          : handleMarkSellerListingSold(selectedListing)}
                        disabled={selectedListing.status !== 'active' && selectedListing.status !== 'sold'}
                        className="w-full rounded-xl bg-surf-primary px-4 py-3 text-sm font-black text-white transition hover:bg-surf-secondary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {selectedListing.status === 'sold' || selectedListing.saleStatus === 'pending' ? 'Đánh dấu là có sẵn' : 'Đánh dấu là hết hàng'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openBoostSellerListing(selectedListing)}
                        className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
                      >
                        Quảng bá bài niêm yết
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => handleContactSeller(selectedListing)}
                        disabled={contactSubmitting}
                        className="w-full rounded-xl bg-surf-primary px-4 py-3 text-sm font-black text-white transition hover:bg-surf-secondary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {contactSubmitting ? 'Đang gửi...' : 'Nhắn tin cho người bán'}
                      </button>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleSave(selectedListing)}
                          className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                            isSaved(selectedListing) ? 'bg-surf-primary/20 text-surf-secondary' : 'bg-white/10 text-white hover:bg-white/15'
                          }`}
                        >
                          {isSaved(selectedListing) ? 'Đã lưu' : 'Lưu'}
                        </button>
                        <button type="button" onClick={() => handleShareSellerListing(selectedListing)} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white transition hover:bg-white/15">
                          Chia sẻ
                        </button>
                        <button type="button" onClick={() => handleReportSelectedListing(selectedListing)} disabled={reportSubmitting} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white transition hover:bg-white/15 disabled:opacity-50">
                          Báo cáo
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={openSellerProfile}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-surf-primary/40 hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Thông tin người bán</div>
                      <span className="text-[11px] font-bold text-surf-secondary">Chi tiết về người bán</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="relative shrink-0">
                        <Avatar src={selectedListing.sellerPhotoURL} name={selectedListing.sellerDisplayName} size="lg" className="ring-2 ring-white/20" />
                        <PresenceBadge uid={selectedListing.sellerId} size="lg" className="border-slate-950" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-white">{selectedListing.sellerDisplayName}</div>
                        <PresenceBadge uid={selectedListing.sellerId} variant="label" className="mt-1 border-white/10 !bg-white/5 !text-slate-300" />
                      </div>
                      <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-slate-200">Xem trang</span>
                    </div>
                  </button>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Chi tiết</div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400">Tình trạng</span>
                        <span className="font-semibold text-slate-100">{CONDITION_LABELS[selectedListing.condition]}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400">Thương hiệu</span>
                        <span className="font-semibold text-slate-100">{detailBrand}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400">Danh mục</span>
                        <span className="font-semibold text-slate-100">{detailCategoryLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400">Vị trí</span>
                        <span className="font-semibold text-slate-100">{detailLocation}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Mô tả</div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                      {selectedListing.description || 'Không có mô tả chi tiết cho sản phẩm này.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsMapOpen(true)}
                    className="w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left transition hover:bg-white/10"
                  >
                    <div className="relative aspect-[16/9] bg-slate-900">
                      <LocationMap center={mapCenter} zoom={MAP_ZOOM} interactive={false} />
                      <div className="pointer-events-none absolute inset-0 bg-black/20" />
                      <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">Map</div>
                    </div>
                    <div className="px-4 py-3 text-xs text-slate-300">
                      <div className="font-semibold text-slate-100">{detailLocation}</div>
                      <div className="text-[11px] text-slate-400">Đây chỉ là vị trí gần đúng</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate(`/feed/market/${selectedListing.id}`)}
                    className="w-full rounded-2xl border border-surf-primary/30 bg-surf-primary/10 px-4 py-3 text-sm font-black text-surf-secondary transition hover:bg-surf-primary/15"
                  >
                    Mở trang chi tiết toàn màn hình
                  </button>
                </div>
              </aside>
            </div>
          </div>
          {isMapOpen && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/70" aria-hidden onClick={() => setIsMapOpen(false)} />
              <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="text-sm font-bold text-white">Vị trí niêm yết</div>
                  <button type="button" onClick={() => setIsMapOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Đóng">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                </div>
                <div className="aspect-[4/3] bg-slate-900">
                  <LocationMap center={mapCenter} zoom={MAP_ZOOM} interactive={true} />
                </div>
              </div>
            </div>
          )}
          {isSellerProfileOpen && (
            <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" aria-hidden onClick={() => setIsSellerProfileOpen(false)} />
              <div className="market-seller-profile-modal relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#242526] text-white shadow-2xl">
                <div className="market-seller-profile-hero relative shrink-0 overflow-hidden border-b border-white/10 px-5 pb-5 pt-5">
                  {sellerCoverUrl ? <img src={sellerCoverUrl} alt="" className="market-seller-profile-cover-art pointer-events-none absolute inset-0 h-full w-full object-cover" /> : <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-surf-primary/10 via-transparent to-purple-500/10" />}
                  <button type="button" onClick={() => setIsSellerProfileOpen(false)} className="market-detail-icon-button absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border bg-white/80 text-slate-700 transition hover:bg-white" aria-label="Đóng">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                  <div className="relative z-10 flex flex-col gap-4 pr-12 sm:flex-row sm:items-end">
                    <Avatar src={selectedListing.sellerPhotoURL} name={sellerName} size="2xl" className="market-seller-profile-avatar h-24 w-24 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 inline-flex rounded-full bg-surf-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-surf-secondary">Trang bán hàng</div>
                      <h3 className="truncate text-3xl font-black leading-tight text-white">{sellerName}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <PresenceBadge uid={selectedListing.sellerId} variant="label" className="border-white/[0.08] !bg-white/[0.12] !font-bold !text-slate-300" />
                        <span className="rounded-full bg-surf-primary/10 px-3 py-1 text-[11px] font-black text-surf-secondary">{sellerProfileListings.length} bài đang bán</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="overflow-y-auto px-5 py-5">
                  <div className="market-seller-profile-card rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-white">Bài niêm yết của {sellerShortName}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">Các mặt hàng đang hoạt động trên Surf Market.</div>
                      </div>
                      <span className="rounded-full bg-surf-primary/10 px-3 py-1 text-[11px] font-black text-surf-secondary">{sellerFilteredListings.length} kết quả</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {sellerFilteredListings.map((listing) => (
                        <button
                          key={listing.id}
                          type="button"
                          onClick={() => {
                            setSelectedListing(listing);
                            setActiveMediaIndex(0);
                            setIsSellerProfileOpen(false);
                          }}
                          className="market-seller-listing-card overflow-hidden rounded-2xl border bg-white/5 text-left transition hover:bg-white/10"
                        >
                          <div className="aspect-[4/3] bg-slate-800">
                            {listing.mediaUrls?.[0] ? <img src={listing.mediaUrls[0]} alt={listing.title} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-600">Surf</div>}
                          </div>
                          <div className="p-3">
                            <div className="text-sm font-black text-white">{formatPrice(listing.price)}</div>
                            <div className="mt-1 line-clamp-2 text-xs font-semibold text-slate-200">{listing.title}</div>
                            <div className="mt-1 truncate text-[11px] text-slate-400">{listing.location || 'Toàn quốc'}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {isRouteDetailView && isRouteSelectedListing && selectedListing && (
        <div className="market-detail-view fixed inset-0 z-50 text-white">
          <div className="h-full overflow-y-auto lg:overflow-hidden">
            <div className="market-detail-grid min-h-full lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[250px_minmax(0,1fr)_390px]">
              <aside className="market-detail-left-rail market-detail-sidebar hidden min-h-0 border-r border-white/[0.08] bg-[#111820] lg:flex lg:flex-col">
                <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-4">
                  <button
                    type="button"
                    onClick={handleCloseDetail}
                    className="market-detail-icon-button flex h-9 w-9 items-center justify-center rounded-full border bg-white/[0.08] text-slate-200 transition hover:bg-white/[0.14]"
                    aria-label="Đóng"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surf-primary text-white shadow-lg shadow-surf-primary/20">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-lg font-black text-white">Surf Market</div>
                    <div className="truncate text-[11px] font-semibold text-slate-500">Chi tiết bài niêm yết</div>
                  </div>
                </div>
                <div className="px-4 py-3">
                  <label className="relative block">
                    <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm kiếm trên Surf Market"
                      className="market-detail-input w-full rounded-full border border-white/[0.08] bg-white/[0.08] py-2 pl-9 pr-3 text-xs font-semibold text-white placeholder:text-slate-500 outline-none focus:border-surf-primary/60"
                    />
                  </label>
                </div>
                <div className="px-4 pb-3">
                  <button
                    type="button"
                    onClick={openSellerProfile}
                    className="market-detail-card w-full overflow-hidden rounded-2xl border border-surf-primary/20 bg-gradient-to-br from-surf-primary/15 to-white/[0.04] p-3 text-left transition hover:border-surf-primary/45"
                  >
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-surf-secondary">Đang xem</div>
                    <div className="mt-2 line-clamp-2 text-sm font-black leading-snug text-white">{selectedListing.title}</div>
                    <div className="mt-1 text-sm font-black text-surf-secondary">{formatPrice(selectedListing.price)}</div>
                    <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-slate-400">
                      <Avatar src={selectedListing.sellerPhotoURL} name={sellerName} size="xs" />
                      <span className="min-w-0 truncate">{sellerName}</span>
                    </div>
                  </button>
                </div>
                <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
                  {[
                    {
                      label: 'Khám phá Market',
                      helper: 'Tất cả mặt hàng',
                      path: 'M4 6h16M4 12h16M4 18h7',
                      active: activeTab === 'all',
                      action: () => { handleCloseDetail(); setActiveTab('all'); },
                    },
                    {
                      label: 'Thông báo',
                      helper: 'Cập nhật người bán',
                      path: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0',
                      active: sellerSection === 'notifications',
                      action: () => { handleCloseDetail(); setActiveTab('my'); setSellerSection('notifications'); },
                    },
                    {
                      label: 'Hộp thư',
                      helper: detailIsOwner ? 'Tin nhắn bài này' : 'Nhắn với người bán',
                      path: 'M8 10h8M8 14h5m8-2a9 9 0 11-3.4-7.03L21 4l-.97 3.4A8.96 8.96 0 0121 12z',
                      active: false,
                      action: () => { if (detailIsOwner) openSellerMessages(selectedListing); else navigate('/feed/waves'); },
                    },
                    {
                      label: 'Đã lưu',
                      helper: 'Món bạn quan tâm',
                      path: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z',
                      active: activeTab === 'saved',
                      action: () => { handleCloseDetail(); setActiveTab('saved'); },
                    },
                    {
                      label: 'Đang bán',
                      helper: 'Quản lý bài niêm yết',
                      path: 'M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z',
                      active: activeTab === 'my' && sellerSection === 'listings',
                      action: () => { handleCloseDetail(); setActiveTab('my'); setSellerSection('listings'); },
                    },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.action}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        item.active ? 'bg-surf-primary/15 text-surf-secondary' : 'text-slate-200 hover:bg-white/[0.08]'
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        item.active ? 'bg-surf-primary/20' : 'bg-white/[0.08]'
                      }`}>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.3} d={item.path} />
                        </svg>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black">{item.label}</span>
                        <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">{item.helper}</span>
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { handleCloseDetail(); setIsCreateModalOpen(true); }}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-surf-primary px-3 py-2.5 text-xs font-black text-white transition hover:bg-surf-secondary"
                  >
                    + Tạo bài niêm yết mới
                  </button>
                  <div className="mt-4 border-t border-white/[0.08] pt-3">
                    <div className="px-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Hạng mục</div>
                    <div className="mt-2 space-y-1">
                      {CATEGORIES.filter((category) => category.key !== 'all').slice(0, 7).map((category) => (
                        <button
                          key={category.key}
                          type="button"
                          onClick={() => { handleCloseDetail(); setActiveTab('all'); setCategory(category.key); }}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                            category.key === selectedListing.category ? 'bg-surf-primary/15 text-surf-secondary' : 'text-slate-300 hover:bg-white/[0.06]'
                          }`}
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.08]">
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                              <path d={category.icon} />
                            </svg>
                          </span>
                          <span>{category.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </nav>
              </aside>

              <main className="flex min-h-[58vh] flex-col bg-transparent lg:h-full lg:min-h-0">
                <div className="market-detail-mobile-bar flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#111820] px-4 lg:hidden">
                  <button
                    type="button"
                    onClick={handleCloseDetail}
                    className="market-detail-icon-button flex h-9 w-9 items-center justify-center rounded-full border bg-white/[0.08] text-slate-200"
                    aria-label="Đóng"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                  <div className="min-w-0 flex-1 text-center">
                    <div className="truncate text-sm font-black text-white">{selectedListing.title}</div>
                    <div className="mt-0.5 truncate text-[11px] font-bold text-surf-secondary">{formatPrice(selectedListing.price)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTheme(isMarketDark ? 'light' : 'dark')}
                    className="market-detail-icon-button flex h-9 w-9 items-center justify-center rounded-full border bg-white/[0.08] text-slate-200"
                    aria-label={isMarketDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
                  >
                    {isMarketDark ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36l-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0l-1.42-1.42M7.06 7.06L5.64 5.64M12 8a4 4 0 100 8 4 4 0 000-8z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShareSellerListing(selectedListing)}
                    className="market-detail-icon-button flex h-9 w-9 items-center justify-center rounded-full border bg-white/[0.08] text-slate-200"
                    aria-label="Chia sẻ"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316" />
                    </svg>
                  </button>
                </div>
                <section className="market-detail-stage relative flex min-h-[52vh] flex-1 items-center justify-center overflow-hidden bg-[#151b23]">
                  {activeMediaUrl ? (
                    <>
                      <div
                        className="absolute inset-0 opacity-20 blur-3xl"
                        style={{
                          backgroundImage: `url(${activeMediaUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      />
                      <div className="market-detail-stage-shell relative z-10 flex h-full w-full items-center justify-center bg-gradient-to-b from-[#a9adb4]/15 via-[#d7dbe0]/10 to-[#a9adb4]/15 px-4 pb-24 pt-16 sm:px-8 lg:px-10 lg:py-10">
                        <img
                          src={activeMediaUrl}
                          alt={selectedListing.title}
                          className="market-detail-image h-full w-full max-w-[min(88vw,860px)] object-contain p-3 drop-shadow-2xl"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-500">
                      <svg className="h-24 w-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}

                  <div className="market-detail-glass pointer-events-none absolute left-4 top-4 z-20 hidden max-w-[min(420px,calc(100%-2rem))] rounded-2xl border border-white/[0.08] bg-black/35 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:block">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-surf-secondary">
                      <span className="h-2 w-2 rounded-full bg-surf-secondary" />
                      Chi tiết Surf Market
                    </div>
                    <div className="mt-2 line-clamp-2 text-lg font-black leading-tight text-white">{selectedListing.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-300">
                      <span className="text-surf-secondary">{formatPrice(selectedListing.price)}</span>
                      <span className="text-slate-600">·</span>
                      <span>{detailCategoryLabel}</span>
                      <span className="text-slate-600">·</span>
                      <span>{detailStatusLabel}</span>
                    </div>
                  </div>

                  {detailMediaUrls.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveMediaIndex((activeMediaIndex - 1 + detailMediaUrls.length) % detailMediaUrls.length)}
                        className="market-detail-floating-button absolute left-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white shadow-xl backdrop-blur transition hover:bg-black/65 lg:flex"
                        aria-label="Ảnh trước"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveMediaIndex((activeMediaIndex + 1) % detailMediaUrls.length)}
                        className="market-detail-floating-button absolute right-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white shadow-xl backdrop-blur transition hover:bg-black/65 lg:flex"
                        aria-label="Ảnh tiếp theo"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <div className="market-detail-glass absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-xs font-black text-white shadow-xl backdrop-blur">
                        {activeMediaIndex + 1}/{detailMediaUrls.length}
                      </div>
                    </>
                  )}

                  {detailMediaUrls.length > 1 && (
                    <div className="market-detail-glass absolute bottom-4 left-1/2 z-20 flex max-w-[92%] -translate-x-1/2 gap-2 overflow-x-auto rounded-2xl border bg-black/45 px-3 py-2 backdrop-blur">
                      {detailMediaUrls.map((url, i) => (
                        <button
                          key={`${url}-${i}`}
                          type="button"
                          onClick={() => setActiveMediaIndex(i)}
                          className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border transition ${
                            i === activeMediaIndex ? 'border-surf-secondary ring-2 ring-surf-secondary/30' : 'border-white/20 opacity-75 hover:opacity-100'
                          }`}
                        >
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                {detailRecommendationListings.length > 0 && (
                  <section className="market-detail-recommendations hidden shrink-0 border-t border-white/[0.08] bg-[#0f151d] px-5 py-4 lg:block">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-black text-white">Lựa chọn hôm nay</h3>
                      <span className="text-[11px] font-semibold text-slate-500">Gợi ý từ Surf Market</span>
                    </div>
                    <div className="grid grid-cols-4 gap-3 2xl:grid-cols-6">
                      {detailRecommendationListings.slice(0, 6).map((listing) => (
                        <button
                          key={listing.id}
                          type="button"
                          onClick={() => {
                            navigate(`/feed/market/${listing.id}`);
                          }}
                          className="market-detail-card min-w-0 overflow-hidden rounded-xl bg-white/[0.06] text-left transition hover:bg-white/[0.1]"
                        >
                          <div className="aspect-[4/3] bg-slate-800">
                            {listing.mediaUrls?.[0] ? (
                              <img src={listing.mediaUrls[0]} alt={listing.title} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-600">Surf</div>
                            )}
                          </div>
                          <div className="p-2">
                            <div className="truncate text-xs font-black text-white">{formatPrice(listing.price)}</div>
                            <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{listing.title}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </main>

              <aside className="market-detail-panel min-h-0 overflow-y-auto border-t border-white/[0.08] bg-[#181d24] p-5 lg:h-full lg:border-l lg:border-t-0">
                <div className="mb-4 hidden items-center justify-between lg:flex">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Chi tiết sản phẩm</div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-500">Xem nhanh, nhắn tin và lưu sản phẩm</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTheme(isMarketDark ? 'light' : 'dark')}
                      className="market-detail-icon-button flex h-8 w-8 items-center justify-center rounded-full border bg-white/[0.08] text-slate-300 transition hover:bg-white/[0.14]"
                      aria-label={isMarketDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
                      title={isMarketDark ? 'Chuyển sang sáng' : 'Chuyển sang tối'}
                    >
                      {isMarketDark ? (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36l-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0l-1.42-1.42M7.06 7.06L5.64 5.64M12 8a4 4 0 100 8 4 4 0 000-8z" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseDetail}
                      className="market-detail-icon-button flex h-8 w-8 items-center justify-center rounded-full border bg-white/[0.08] text-slate-300 transition hover:bg-white/[0.14]"
                      aria-label="Đóng"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-surf-primary/20 bg-surf-primary/10 p-4">
                    <h2 className="text-2xl font-black leading-tight text-white">{selectedListing.title}</h2>
                    <p className="mt-1 text-xl font-black text-surf-secondary">{formatPrice(selectedListing.price)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400">
                      <span>{detailStatusLabel}</span>
                      <span>·</span>
                      <span>{detailLocation}</span>
                      <span>·</span>
                      <span>{selectedListing.viewCount ?? 0} lượt xem</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={openSellerProfile}
                    className="market-detail-seller-card w-full rounded-2xl border border-surf-primary/20 bg-gradient-to-br from-[#111c2a] via-[#101822] to-[#0f151d] p-4 text-left shadow-xl shadow-black/20 transition hover:border-surf-primary/45 hover:from-[#132237]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <Avatar
                          src={selectedListing.sellerPhotoURL}
                          name={selectedListing.sellerDisplayName}
                          size="lg"
                          className="ring-2 ring-white/10"
                        />
                        <PresenceBadge
                          uid={selectedListing.sellerId}
                          size="lg"
                          className="border-[#111c2a]"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-base font-black text-white">{sellerName}</div>
                          <span className="shrink-0 rounded-full bg-surf-primary/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-surf-secondary">
                            {detailIsOwner ? 'Bạn' : 'Seller'}
                          </span>
                        </div>
                        <PresenceBadge
                          uid={selectedListing.sellerId}
                          variant="label"
                          className="mt-1 max-w-full border-white/[0.08] !bg-white/[0.06] !font-bold !text-slate-300"
                        />
                      </div>
                      <span className="market-detail-control shrink-0 rounded-lg border bg-white/[0.08] px-3 py-2 text-[11px] font-black text-slate-200">
                        Xem
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="market-detail-control rounded-xl border bg-white/[0.06] px-3 py-2">
                        <div className="text-sm font-black text-white">{sellerProfileListings.length}</div>
                        <div className="mt-0.5 text-[10px] font-bold text-slate-500">Bài bán</div>
                      </div>
                      <div className="market-detail-control rounded-xl border bg-white/[0.06] px-3 py-2">
                        <div className="text-sm font-black text-white">{selectedListing.viewCount ?? 0}</div>
                        <div className="mt-0.5 text-[10px] font-bold text-slate-500">Lượt xem</div>
                      </div>
                      <div className="market-detail-control rounded-xl border bg-white/[0.06] px-3 py-2">
                        <div className="truncate text-sm font-black text-white">{detailCategoryLabel}</div>
                        <div className="mt-0.5 text-[10px] font-bold text-slate-500">Danh mục</div>
                      </div>
                    </div>
                  </button>

                  {detailIsOwner ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <button
                          type="button"
                          onClick={() => openEditSellerListing(selectedListing)}
                          className="market-detail-control rounded-lg border bg-white/[0.12] px-4 py-2.5 text-xs font-black text-white transition hover:bg-white/[0.18]"
                        >
                          ✎ Chỉnh sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareSellerListing(selectedListing)}
                          className="market-detail-control flex h-10 w-10 items-center justify-center rounded-lg border bg-white/[0.12] text-slate-200 transition hover:bg-white/[0.18]"
                          aria-label="Chia sẻ"
                        >
                          ↗
                        </button>
                      </div>
                      {selectedListing.status === 'sold' ? (
                        <button
                          type="button"
                          onClick={() => handleMarkSellerListingAvailable(selectedListing)}
                          className="market-detail-primary-action w-full rounded-lg bg-surf-primary px-4 py-3 text-sm font-black text-white transition hover:bg-surf-secondary"
                        >
                          Đánh dấu là còn hàng
                        </button>
                      ) : selectedListing.saleStatus === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => handleMarkSellerListingAvailable(selectedListing)}
                          className="market-detail-primary-action w-full rounded-lg bg-surf-primary px-4 py-3 text-sm font-black text-white transition hover:bg-surf-secondary"
                        >
                          Đánh dấu là có sẵn
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleMarkSellerListingSold(selectedListing)}
                          disabled={selectedListing.status !== 'active' || listingActionId === selectedListing.id}
                          className="market-detail-primary-action w-full rounded-lg bg-surf-primary px-4 py-3 text-sm font-black text-white transition hover:bg-surf-secondary disabled:cursor-not-allowed disabled:bg-white/[0.12] disabled:text-slate-500"
                        >
                          {listingActionId === selectedListing.id ? 'Đang cập nhật...' : 'Đánh dấu là hết hàng'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openBoostSellerListing(selectedListing)}
                        className="market-detail-control w-full rounded-lg border bg-white/[0.12] px-4 py-3 text-sm font-black text-white transition hover:bg-white/[0.18]"
                      >
                        Quảng bá bài niêm yết
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => handleContactSeller(selectedListing)}
                        disabled={contactSubmitting}
                        className="market-detail-primary-action w-full rounded-lg bg-surf-primary px-4 py-3 text-sm font-black text-white transition hover:bg-surf-secondary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {contactSubmitting ? 'Đang gửi...' : 'Nhắn tin cho người bán'}
                      </button>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleSave(selectedListing)}
                          className={`rounded-lg border px-3 py-2 text-xs font-black transition ${
                            isSaved(selectedListing) ? 'border-surf-primary/30 bg-surf-primary/20 text-surf-secondary' : 'market-detail-control bg-white/[0.12] text-white hover:bg-white/[0.18]'
                          }`}
                        >
                          {isSaved(selectedListing) ? 'Đã lưu' : 'Lưu'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareSellerListing(selectedListing)}
                          className="market-detail-control rounded-lg border bg-white/[0.12] px-3 py-2 text-xs font-black text-white transition hover:bg-white/[0.18]"
                        >
                          Chia sẻ
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReportSelectedListing(selectedListing)}
                          disabled={reportSubmitting}
                          className="market-detail-control rounded-lg border bg-white/[0.12] px-3 py-2 text-xs font-black text-white transition hover:bg-white/[0.18] disabled:opacity-50"
                        >
                          Báo cáo
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="market-detail-card rounded-xl border border-white/[0.08] bg-white/[0.05] p-4">
                    <div className="text-sm font-black text-white">Chi tiết</div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                      <div>
                        <div className="text-slate-500">Tình trạng</div>
                        <div className="mt-1 font-bold text-slate-200">{CONDITION_LABELS[selectedListing.condition]}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Danh mục</div>
                        <div className="mt-1 font-bold text-slate-200">{detailCategoryLabel}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Thương hiệu</div>
                        <div className="mt-1 font-bold text-slate-200">{detailBrand}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Trạng thái</div>
                        <div className="mt-1 font-bold text-slate-200">{detailStatusLabel}</div>
                      </div>
                    </div>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                      {selectedListing.description || 'Không có mô tả chi tiết cho sản phẩm này.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsMapOpen(true)}
                    className="market-detail-card w-full overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.05] text-left transition hover:bg-white/[0.08]"
                  >
                    <div className="relative h-24 bg-slate-900">
                      <LocationMap center={mapCenter} zoom={MAP_ZOOM} interactive={false} />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#181d24] via-transparent to-transparent" />
                      <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-surf-primary text-xs font-black text-white">i</div>
                    </div>
                    <div className="px-4 py-3">
                      <div className="text-xs font-black text-white">{detailLocation}</div>
                      <div className="mt-1 text-[11px] text-slate-500">Đây chỉ là vị trí gần đúng</div>
                    </div>
                  </button>

                  <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-300/20 text-sm font-black text-amber-200">
                        !
                      </div>
                      <div>
                        <div className="text-sm font-black text-amber-100">Giao dịch an toàn</div>
                        <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-100/75">
                          Ưu tiên nhắn tin qua Surf Market, gặp ở nơi công cộng và kiểm tra sản phẩm trước khi thanh toán.
                        </p>
                      </div>
                    </div>
                  </div>

                  {!detailIsOwner && (
                    <div className="market-detail-card rounded-xl border border-white/[0.08] bg-white/[0.05] p-4">
                      <div className="text-sm font-black text-white">Gửi tin nhắn cho người bán</div>
                      <textarea
                        rows={2}
                        value={sellerMessageDraft}
                        onChange={(e) => setSellerMessageDraft(e.target.value)}
                        placeholder="Mặt hàng này còn chứ?"
                        className="market-detail-input mt-3 w-full resize-none rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-surf-primary/60"
                      />
                      <button
                        type="button"
                        onClick={() => handleContactSeller(selectedListing)}
                        disabled={contactSubmitting}
                        className="market-detail-primary-action mt-3 w-full rounded-lg bg-surf-primary py-2.5 text-sm font-black text-white transition hover:bg-surf-secondary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {contactSubmitting ? 'Đang gửi...' : 'Gửi'}
                      </button>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
          {isMapOpen && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/70"
                aria-hidden
                onClick={() => setIsMapOpen(false)}
              />
              <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="text-sm font-bold text-white">Vị trí niêm yết</div>
                  <button
                    type="button"
                    onClick={() => setIsMapOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    aria-label="Đóng"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                </div>
                <div className="aspect-[4/3] bg-slate-900">
                  <LocationMap
                    center={mapCenter}
                    zoom={MAP_ZOOM}
                    interactive={true}
                  />
                </div>
              </div>
            </div>
          )}
          {isSellerProfileOpen && (
            <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
                aria-hidden
                onClick={() => setIsSellerProfileOpen(false)}
              />
              <div className="market-seller-profile-modal relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#242526] text-white shadow-2xl">
                <div className="market-seller-profile-hero relative shrink-0 overflow-hidden border-b border-white/10 px-5 pb-5 pt-5 sm:px-6">
                  {sellerCoverUrl ? (
                    <img src={sellerCoverUrl} alt="" className="market-seller-profile-cover-art pointer-events-none absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-surf-primary/10 via-transparent to-purple-500/10" />
                  )}
                  <button
                    type="button"
                    onClick={() => setIsSellerProfileOpen(false)}
                    className="market-detail-icon-button absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border bg-white/80 text-slate-700 transition hover:bg-white"
                    aria-label="Đóng"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                  <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:pr-12">
                    <div className="relative shrink-0">
                      <Avatar
                        src={selectedListing.sellerPhotoURL}
                        name={sellerName}
                        size="2xl"
                        className="market-seller-profile-avatar h-24 w-24 rounded-full"
                      />
                      <PresenceBadge
                        uid={selectedListing.sellerId}
                        size="lg"
                        className="border-white"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 inline-flex rounded-full bg-surf-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-surf-secondary">
                        Trang bán hàng Surf Market
                      </div>
                      <h3 className="truncate text-3xl font-black leading-tight text-white">{sellerName}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <PresenceBadge
                          uid={selectedListing.sellerId}
                          variant="label"
                          className="border-white/[0.08] !bg-white/[0.12] !font-bold !text-slate-300"
                        />
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-black text-emerald-500">
                          {sellerProfileListings.length} bài đang bán
                        </span>
                        <span className="rounded-full bg-surf-primary/10 px-3 py-1 text-[11px] font-black text-surf-secondary">
                          {detailLocation}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="overflow-y-auto px-5 py-5 sm:px-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="market-seller-profile-card rounded-2xl border p-4">
                      <div className="text-xl font-black text-white">{sellerProfileListings.length}</div>
                      <div className="mt-1 text-[11px] font-bold text-slate-500">Bài niêm yết</div>
                    </div>
                    <div className="market-seller-profile-card rounded-2xl border p-4">
                      <div className="text-xl font-black text-white">{selectedListing.viewCount ?? 0}</div>
                      <div className="mt-1 text-[11px] font-bold text-slate-500">Lượt xem bài này</div>
                    </div>
                    <div className="market-seller-profile-card rounded-2xl border p-4">
                      <div className="truncate text-xl font-black text-white">{detailCategoryLabel}</div>
                      <div className="mt-1 text-[11px] font-bold text-slate-500">Danh mục chính</div>
                    </div>
                    <div className="market-seller-profile-card rounded-2xl border p-4">
                      <div className="text-xl font-black text-white">1h</div>
                      <div className="mt-1 text-[11px] font-bold text-slate-500">Phản hồi dự kiến</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                    <button
                      type="button"
                      onClick={() => showMarketToast('Tính năng theo dõi người bán sẽ sớm ra mắt.')}
                      className="rounded-2xl bg-surf-primary px-4 py-3 text-sm font-black text-white shadow-lg shadow-surf-primary/20 transition hover:bg-surf-secondary"
                    >
                      Theo dõi
                    </button>
                    <button
                      type="button"
                      onClick={() => handleContactSeller(selectedListing)}
                      disabled={contactSubmitting || selectedListing.sellerId === currentUserId}
                      className="market-seller-profile-action rounded-2xl border px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {contactSubmitting ? 'Đang gửi...' : 'Nhắn tin'}
                    </button>
                    <button
                      type="button"
                      onClick={() => showMarketToast('Bạn đang xem trang bán hàng của người bán này.')}
                      className="market-seller-profile-action rounded-2xl border px-4 py-3 text-sm font-black transition sm:col-span-2"
                    >
                      Trang bán hàng hiện tại
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <section className="market-seller-profile-card rounded-2xl border p-4">
                      <div className="text-sm font-black text-white">Huy hiệu người bán</div>
                      <p className="mt-1 text-xs font-semibold text-slate-400">Dựa theo hoạt động của {sellerShortName} trên Surf Market</p>
                      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-purple-500/10 p-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-purple-500 text-white">
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-black text-white">Rất tích cực</div>
                          <div className="text-xs font-semibold text-slate-400">Thường trả lời trong vòng 1 giờ</div>
                        </div>
                      </div>
                    </section>

                    <section className="market-seller-profile-card rounded-2xl border p-4">
                      <div className="text-sm font-black text-white">Giới thiệu</div>
                      <div className="mt-4 space-y-3 text-xs font-semibold text-slate-200">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surf-primary/10 text-surf-secondary">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                            </svg>
                          </span>
                          <span>Khu vực bán: {detailLocation}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surf-primary/10 text-surf-secondary">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm1 11h-2V7h2zm0 4h-2v-2h2z" />
                            </svg>
                          </span>
                          <span>Ưu tiên trả lời qua Surf Market</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surf-primary/10 text-surf-secondary">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.93 6h-2.95a15.3 15.3 0 00-1.38-3.25A8.03 8.03 0 0118.93 8zM12 4.04A13.2 13.2 0 0113.91 8h-3.82A13.2 13.2 0 0112 4.04zM4.26 14A8.35 8.35 0 014 12c0-.69.09-1.36.26-2h3.33A16.36 16.36 0 007.5 12c0 .68.03 1.35.09 2H4.26zm.81 2h2.95c.33 1.17.79 2.27 1.38 3.25A8.03 8.03 0 015.07 16zm2.95-8H5.07A8.03 8.03 0 019.4 4.75 15.3 15.3 0 008.02 8zM12 19.96A13.2 13.2 0 0110.09 16h3.82A13.2 13.2 0 0112 19.96zM14.34 14H9.66A14.71 14.71 0 019.5 12c0-.7.06-1.37.16-2h4.68c.1.63.16 1.3.16 2s-.06 1.37-.16 2zm.26 5.25A15.3 15.3 0 0015.98 16h2.95a8.03 8.03 0 01-4.33 3.25zM16.41 14c.06-.65.09-1.32.09-2s-.03-1.35-.09-2h3.33c.17.64.26 1.31.26 2s-.09 1.36-.26 2h-3.33z" />
                            </svg>
                          </span>
                          <span>Đã tham gia Surf Market</span>
                        </div>
                      </div>
                    </section>
                  </div>

                  <section className="market-seller-profile-card mt-5 rounded-2xl border p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <div className="text-sm font-black text-white">Bài niêm yết của {sellerShortName}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">Các mặt hàng đang hoạt động trên Surf Market.</div>
                      </div>
                      <span className="rounded-full bg-surf-primary/10 px-3 py-1 text-[11px] font-black text-surf-secondary">
                        {sellerFilteredListings.length} kết quả
                      </span>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={sellerListingSearch}
                          onChange={(e) => setSellerListingSearch(e.target.value)}
                          placeholder="Tìm kiếm bài niêm yết"
                          className="market-seller-profile-input w-full rounded-2xl border border-white/10 bg-white/10 py-3 pl-10 pr-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-surf-primary/60"
                        />
                        <svg className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <span className="market-seller-profile-action rounded-2xl border px-4 py-3 text-center text-xs font-black text-white">Đang hoạt động</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {sellerFilteredListings.map((listing) => (
                        <button
                          key={listing.id}
                          type="button"
                          onClick={() => {
                            setIsSellerProfileOpen(false);
                            navigate(`/feed/market/${listing.id}`);
                          }}
                          className="market-seller-listing-card overflow-hidden rounded-2xl border bg-white/5 text-left transition hover:bg-white/10"
                        >
                          <div className="aspect-[4/3] bg-slate-800">
                            {listing.mediaUrls?.[0] ? (
                              <img src={listing.mediaUrls[0]} alt={listing.title} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-600">
                                <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="p-3">
                            <div className="text-sm font-black text-white">{formatPrice(listing.price)}</div>
                            <div className="mt-1 line-clamp-2 text-xs font-semibold text-slate-200">{listing.title}</div>
                            <div className="mt-1 truncate text-[11px] text-slate-400">{listing.location || 'Toàn quốc'}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {sellerFilteredListings.length === 0 && (
                      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5 text-center text-sm font-semibold text-slate-400">
                        Không tìm thấy bài niêm yết phù hợp.
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Report Modal */}
      {isReportModalOpen && selectedListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#1e2329] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <h2 className="text-xl font-black text-white">Báo cáo bài niêm yết</h2>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={submitReportListing} className="p-4">
              <div className="mb-4 text-sm text-slate-300">
                Bạn đang báo cáo bài niêm yết <strong>{selectedListing.title}</strong>. Vui lòng chọn lý do báo cáo để chúng tôi có thể xem xét và xử lý theo Tiêu chuẩn Cộng đồng của Surf.
              </div>
              <div className="mb-4 max-h-[300px] space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                {REPORT_CATEGORIES.map((category) => (
                  <label key={category.key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-3 hover:bg-white/10">
                    <input
                      type="radio"
                      name="reportCategory"
                      value={category.key}
                      checked={reportCategory === category.key}
                      onChange={(e) => setReportCategory(e.target.value)}
                      className="h-4 w-4 rounded-full border-white/20 bg-transparent text-surf-primary focus:ring-2 focus:ring-surf-primary focus:ring-offset-1 focus:ring-offset-[#1e2329]"
                    />
                    <span className="text-sm font-semibold text-slate-200">{category.label}</span>
                  </label>
                ))}
              </div>
              {reportCategory && (
                <div className="mb-6">
                  <label className="mb-1.5 block text-xs font-bold text-slate-300">Chi tiết bổ sung (không bắt buộc)</label>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder="Vui lòng cung cấp thêm thông tin giúp chúng tôi hiểu rõ hơn..."
                    className="h-24 w-full rounded-xl border border-white/10 bg-[#0f141b] p-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-surf-primary/50 focus:outline-none focus:ring-1 focus:ring-surf-primary/50"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/5"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={reportSubmitting || !reportCategory}
                  className="rounded-lg bg-surf-primary px-5 py-2 text-sm font-bold text-white transition hover:bg-surf-secondary disabled:opacity-50"
                >
                  {reportSubmitting ? 'Đang gửi...' : 'Gửi báo cáo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
