import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import {
  useMarketplaceStore,
  type BoostSandboxPaymentProvider,
  type Category,
  type Condition,
  type CreateListingInput,
  type ListingAvailability,
} from '@/stores/marketplaceStore';
import { uploadMarketplaceImages } from '@/lib/cloudinary';
import { api } from '@/lib/api';
import { useT, type I18nKey } from '@/lib/i18n';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreateListing'>;
  route: RouteProp<RootStackParamList, 'CreateListing'>;
};

type PaymentSession = {
  paymentId: string;
  provider: BoostSandboxPaymentProvider;
  orderId: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  paymentUrl: string;
  consumed?: boolean;
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
  green: '#22c55e',
  red: '#ef4444',
  input: '#172033',
  placeholder: '#64748b',
  pill: '#1e3a5f',
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
  green: '#16a34a',
  red: '#dc2626',
  input: '#ffffff',
  placeholder: '#94a3b8',
  pill: '#e0f2fe',
};

const CATEGORIES: { key: Exclude<Category, 'all'>; labelKey: I18nKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'electronics', labelKey: 'market_category_electronics', icon: 'phone-portrait-outline' },
  { key: 'clothing', labelKey: 'market_category_clothing', icon: 'shirt-outline' },
  { key: 'vehicles', labelKey: 'market_category_vehicles', icon: 'car-outline' },
  { key: 'property', labelKey: 'market_category_property', icon: 'business-outline' },
  { key: 'home', labelKey: 'market_category_home', icon: 'home-outline' },
  { key: 'sports', labelKey: 'market_category_sports', icon: 'football-outline' },
  { key: 'other', labelKey: 'market_category_other', icon: 'ellipsis-horizontal-outline' },
];

const CONDITIONS: { key: Condition; labelKey: I18nKey }[] = [
  { key: 'new', labelKey: 'market_condition_new_full' },
  { key: 'like_new', labelKey: 'market_condition_like_new' },
  { key: 'good', labelKey: 'market_condition_good' },
  { key: 'fair', labelKey: 'market_condition_fair' },
];

const AVAILABILITY_OPTIONS: { key: ListingAvailability; label: string; helper: string }[] = [
  { key: 'in_stock', label: 'Còn hàng', helper: 'Phù hợp nhiều món hoặc còn tồn kho.' },
  { key: 'single_item', label: 'Một mặt hàng', helper: 'Tin sẽ hết khi bạn đánh dấu đã bán.' },
];

const MEETING_OPTIONS = [
  { key: 'public_meetup', label: 'Gặp nơi công cộng', icon: 'people-outline' as const },
  { key: 'door_pickup', label: 'Người mua tới lấy', icon: 'home-outline' as const },
  { key: 'door_dropoff', label: 'Để hàng trước cửa', icon: 'cube-outline' as const },
];

type MapCenter = [number, number];
type LocationSuggestion = {
  id: string;
  label: string;
  subtitle: string;
  displayName: string;
  center: MapCenter;
};

type NominatimSearchResult = {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
  type?: string;
  address?: Record<string, string | undefined>;
};

const DEFAULT_MAP_CENTER: MapCenter = [10.8231, 106.6297];
const DEFAULT_LOCATION_SUGGESTIONS: LocationSuggestion[] = [
  {
    id: 'default-ho-chi-minh-city',
    label: 'Thành phố Hồ Chí Minh',
    subtitle: 'Tỉnh/Thành phố',
    displayName: 'Thành phố Hồ Chí Minh, Việt Nam',
    center: DEFAULT_MAP_CENTER,
  },
  {
    id: 'default-quan-1',
    label: 'Quận 1, Hồ Chí Minh City',
    subtitle: 'Quận 1, Hồ Chí Minh City',
    displayName: 'Quận 1, Thành phố Hồ Chí Minh, Việt Nam',
    center: [10.7769, 106.7009],
  },
  {
    id: 'default-binh-thanh',
    label: 'Bình Thạnh, Hồ Chí Minh City',
    subtitle: 'Bình Thạnh, Hồ Chí Minh City',
    displayName: 'Bình Thạnh, Thành phố Hồ Chí Minh, Việt Nam',
    center: [10.8017, 106.7108],
  },
  {
    id: 'default-thu-duc',
    label: 'Thủ Đức, Hồ Chí Minh City',
    subtitle: 'Thủ Đức, Hồ Chí Minh City',
    displayName: 'Thủ Đức, Thành phố Hồ Chí Minh, Việt Nam',
    center: [10.8494, 106.7537],
  },
  {
    id: 'default-ha-noi',
    label: 'Hà Nội',
    subtitle: 'Tỉnh/Thành phố',
    displayName: 'Hà Nội, Việt Nam',
    center: [21.0278, 105.8342],
  },
  {
    id: 'default-da-nang',
    label: 'Đà Nẵng',
    subtitle: 'Tỉnh/Thành phố',
    displayName: 'Đà Nẵng, Việt Nam',
    center: [16.0544, 108.2022],
  },
];

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

type BoostPlan = (typeof BOOST_BUDGET_OPTIONS)[number];

function getBoostTotal(plan: BoostPlan) {
  const budgetTotal = plan.dailyBudget * plan.durationDays;
  return budgetTotal + Math.round(budgetTotal * 0.1);
}

function formatVnd(value: number) {
  return `${value.toLocaleString('vi-VN')} ₫`;
}

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
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const address = place.address ?? {};
  const label =
    place.name ||
    address.city ||
    address.town ||
    address.suburb ||
    address.county ||
    address.state ||
    place.display_name?.split(',')[0] ||
    'Địa điểm';
  const displayName = place.display_name || label;
  const subtitle = [address.suburb, address.city || address.town, address.state, address.country]
    .filter(Boolean)
    .join(', ') || place.type || 'Địa điểm';
  return {
    id: `nominatim-${place.place_id ?? index}`,
    label,
    subtitle,
    displayName,
    center: [lat, lon],
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
  return suggestions
    .filter((suggestion) => {
      const key = normalizeLocationText(`${suggestion.label}-${suggestion.displayName}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function getOpenStreetMapTileUrl(center: MapCenter, zoom = 12) {
  const latRad = (center[0] * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = Math.floor(((center[1] + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  return (
    <View style={s.field}>
      <Text style={[s.fieldLabel, { color: C.text }]}>
        {label}
        {required ? <Text style={{ color: C.red }}> *</Text> : null}
      </Text>
      {helper ? <Text style={[s.fieldHelper, { color: C.subtext }]}>{helper}</Text> : null}
      {children}
    </View>
  );
}

export default function CreateListingScreen({ navigation, route }: Props) {
  const t = useT();
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const createListing = useMarketplaceStore((state) => state.createListing);
  const updateListing = useMarketplaceStore((state) => state.updateListing);
  const fetchDetail = useMarketplaceStore((state) => state.fetchDetail);
  const detailLoading = useMarketplaceStore((state) => state.detailLoading);
  const editListingId = route.params?.listingId;
  const editListing = useMarketplaceStore((state) =>
    editListingId && state.detailListing?.id === editListingId ? state.detailListing : null
  );
  const isEditMode = Boolean(editListingId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<Exclude<Category, 'all'>>('other');
  const [condition, setCondition] = useState<Condition>('good');
  const [location, setLocation] = useState('');
  const [brand, setBrand] = useState('');
  const [productType, setProductType] = useState('');
  const [material, setMaterial] = useState('');
  const [availability, setAvailability] = useState<ListingAvailability>('in_stock');
  const [tags, setTags] = useState('');
  const [sku, setSku] = useState('');
  const [meetingPreferences, setMeetingPreferences] = useState<string[]>(['public_meetup']);
  const [hideFromFriends, setHideFromFriends] = useState(false);
  const [boostEnabled, setBoostEnabled] = useState(false);
  const [selectedBoostPlanId, setSelectedBoostPlanId] = useState<BoostPlan['id']>('starter');
  const [paymentProvider, setPaymentProvider] = useState<BoostSandboxPaymentProvider>('zalopay');
  const [pendingPayment, setPendingPayment] = useState<PaymentSession | null>(null);
  const [existingMediaUrls, setExistingMediaUrls] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [hydratedListingId, setHydratedListingId] = useState<string | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>(
    DEFAULT_LOCATION_SUGGESTIONS.slice(0, 5)
  );
  const [locationLoading, setLocationLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const [locationMapOpen, setLocationMapOpen] = useState(false);

  const selectedBoostPlan = useMemo(
    () => BOOST_BUDGET_OPTIONS.find((plan) => plan.id === selectedBoostPlanId) ?? BOOST_BUDGET_OPTIONS[0],
    [selectedBoostPlanId]
  );
  const priceValue = Number(price.replace(/[^\d]/g, '')) || 0;
  const totalImageCount = existingMediaUrls.length + selectedImages.length;
  const editLoading = isEditMode && !editListing;
  const parsedTags = useMemo(
    () => tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    [tags]
  );
  const previewImageUri = selectedImages[0]?.uri ?? existingMediaUrls[0] ?? '';
  const previewTitle = title.trim() || 'Tiêu đề mặt hàng';
  const previewLocation = location.trim() || 'Vị trí niêm yết';
  const previewDescription = description.trim() || 'Mô tả của người bán sẽ hiển thị tại đây.';
  const previewCategoryLabel = t(CATEGORIES.find((item) => item.key === category)?.labelKey ?? 'market_category_other');
  const previewConditionLabel = t(CONDITIONS.find((item) => item.key === condition)?.labelKey ?? 'market_condition_good');

  useEffect(() => {
    if (editListingId) void fetchDetail(editListingId);
  }, [editListingId, fetchDetail]);

  useEffect(() => {
    if (!editListing || hydratedListingId === editListing.id) return;
    setTitle(editListing.title ?? '');
    setDescription(editListing.description ?? '');
    setPrice(editListing.price ? String(editListing.price) : '');
    setCategory(editListing.category ?? 'other');
    setCondition(editListing.condition ?? 'good');
    setLocation(editListing.location ?? '');
    setBrand(editListing.brand ?? '');
    setProductType(editListing.productType ?? '');
    setMaterial(editListing.material ?? '');
    setAvailability(editListing.availability ?? 'in_stock');
    setTags((editListing.tags ?? []).join(', '));
    setSku(editListing.sku ?? '');
    setMeetingPreferences(editListing.meetingPreferences?.length ? editListing.meetingPreferences : ['public_meetup']);
    setHideFromFriends(Boolean(editListing.hideFromFriends));
    setExistingMediaUrls(editListing.mediaUrls ?? []);
    setSelectedLocation(
      DEFAULT_LOCATION_SUGGESTIONS.find(
        (suggestion) =>
          normalizeLocationText(suggestion.displayName) === normalizeLocationText(editListing.location ?? '') ||
          normalizeLocationText(suggestion.label) === normalizeLocationText(editListing.location ?? '')
      ) ?? null
    );
    setSelectedImages([]);
    setBoostEnabled(false);
    setPendingPayment(null);
    setHydratedListingId(editListing.id);
  }, [editListing, hydratedListingId]);

  useEffect(() => {
    const query = location.trim();
    const exactDefault = DEFAULT_LOCATION_SUGGESTIONS.find(
      (suggestion) =>
        normalizeLocationText(suggestion.displayName) === normalizeLocationText(query) ||
        normalizeLocationText(suggestion.label) === normalizeLocationText(query)
    );

    if (!query) {
      setLocationSuggestions(DEFAULT_LOCATION_SUGGESTIONS.slice(0, 5));
      setSelectedLocation(null);
      setLocationLoading(false);
      return;
    }

    setLocationSuggestions(mergeLocationSuggestions([], query));
    if (exactDefault) setSelectedLocation(exactDefault);
    else setSelectedLocation(null);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLocationLoading(true);
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=5`;
      fetch(url, { signal: controller.signal, headers: { 'Accept-Language': 'vi' } })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          const apiSuggestions = Array.isArray(data)
            ? data.map((place, index) => toLocationSuggestion(place, index)).filter(Boolean) as LocationSuggestion[]
            : [];
          const nextSuggestions = mergeLocationSuggestions(apiSuggestions, query);
          setLocationSuggestions(nextSuggestions);
          const exact = nextSuggestions.find(
            (suggestion) =>
              normalizeLocationText(suggestion.displayName) === normalizeLocationText(query) ||
              normalizeLocationText(suggestion.label) === normalizeLocationText(query)
          );
          if (exact) setSelectedLocation(exact);
        })
        .catch(() => setLocationSuggestions(mergeLocationSuggestions([], query)))
        .finally(() => setLocationLoading(false));
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [location]);

  const handlePickImages = async () => {
    if (totalImageCount >= 5) {
      Alert.alert(t('listing_max_images_title'), t('listing_max_images_message'));
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('listing_permission_title'), t('listing_permission_message'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5 - totalImageCount,
      quality: 0.85,
    });

    if (result.canceled) return;
    setSelectedImages((current) => [...current, ...result.assets].slice(0, 5 - existingMediaUrls.length));
  };

  const resetPendingPayment = () => setPendingPayment(null);

  const toggleMeeting = (key: string) => {
    setMeetingPreferences((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      return [...current, key].slice(0, 3);
    });
  };

  const validate = () => {
    if (!title.trim()) {
      Alert.alert(t('listing_missing_info'), t('listing_missing_title'));
      return false;
    }
    if (!location.trim()) {
      Alert.alert(t('listing_missing_info'), 'Vui lòng nhập địa điểm bán hàng.');
      return false;
    }
    if (meetingPreferences.length === 0) {
      Alert.alert(t('listing_missing_info'), 'Chọn ít nhất một cách giao nhận.');
      return false;
    }
    return true;
  };

  const buildInput = async (boostPaymentId?: string): Promise<CreateListingInput> => {
    const uploadedMediaUrls = selectedImages.length
      ? await uploadMarketplaceImages(
          selectedImages.map((asset) => ({
            uri: asset.uri,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
          }))
        )
      : [];
    const mediaUrls = [...existingMediaUrls, ...uploadedMediaUrls].slice(0, 5);

    return {
      title: title.trim(),
      description: description.trim(),
      price: priceValue,
      category,
      condition,
      mediaUrls,
      location: location.trim(),
      brand: brand.trim(),
      productType: productType.trim(),
      material: material.trim(),
      availability,
      saleStatus: 'available',
      tags: parsedTags,
      sku: sku.trim(),
      meetingPreferences,
      hideFromFriends,
      boostEnabled: Boolean(boostPaymentId),
      boostPlan: boostPaymentId
        ? {
            dailyBudget: selectedBoostPlan.dailyBudget,
            durationDays: selectedBoostPlan.durationDays,
            placements: [...selectedBoostPlan.placements],
          }
        : null,
      boostPaymentProvider: boostPaymentId ? paymentProvider : null,
      boostPaymentId: boostPaymentId ?? null,
    };
  };

  const launchPayment = async () => {
    if (!validate()) return;
    setPaymentLoading(true);
    try {
      const total = getBoostTotal(selectedBoostPlan);
      const session = await api.post<PaymentSession>('/api/marketplace/boost-payments', {
        provider: paymentProvider,
        amount: total,
        title: `Surf Boost - ${title.trim() || 'Tin mới'}`,
      });
      setPendingPayment(session);
      await WebBrowser.openBrowserAsync(session.paymentUrl);
    } catch (err) {
      Alert.alert('Không mở được thanh toán', (err as Error).message || 'Vui lòng thử lại.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const submitListing = async (withBoost: boolean) => {
    if (!validate()) return;
    setLoading(true);
    try {
      if (isEditMode && editListingId) {
        const input = await buildInput();
        const listing = await updateListing(editListingId, {
          title: input.title,
          description: input.description,
          price: input.price,
          category: input.category,
          condition: input.condition,
          mediaUrls: input.mediaUrls,
          location: input.location,
          brand: input.brand,
          productType: input.productType,
          material: input.material,
          availability: input.availability,
          saleStatus: input.saleStatus,
          tags: input.tags,
          sku: input.sku,
          meetingPreferences: input.meetingPreferences,
          hideFromFriends: input.hideFromFriends,
        });
        Alert.alert('Đã cập nhật', 'Bài niêm yết đã được lưu.', [
          {
            text: t('view_listing'),
            onPress: () => {
              navigation.goBack();
              navigation.navigate('MarketplaceDetail', { listingId: listing.id });
            },
          },
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

      let boostPaymentId: string | undefined;
      if (withBoost) {
        if (!pendingPayment) {
          Alert.alert('Chưa có giao dịch Boost', 'Hãy tạo thanh toán sandbox trước khi đăng kèm Boost.');
          return;
        }
        const status = await api.get<PaymentSession>(`/api/marketplace/boost-payments/${pendingPayment.paymentId}/status`);
        if (status.status !== 'paid') {
          Alert.alert('Chưa xác nhận thanh toán', 'Giao dịch sandbox chưa paid. Hoàn tất thanh toán rồi bấm đăng lại.');
          return;
        }
        boostPaymentId = status.paymentId;
      }

      const input = await buildInput(boostPaymentId);
      const listing = await createListing(input);
      const successMessage = listing.status === 'active'
        ? t('listing_success_active')
        : withBoost
          ? 'Tin đăng và Boost đã được gửi, đang chờ kiểm duyệt trước khi hiển thị.'
          : t('listing_success_pending');
      Alert.alert(t('listing_success_title'), successMessage, [
        {
          text: t('view_listing'),
          onPress: () => {
            navigation.goBack();
            navigation.navigate('MarketplaceDetail', { listingId: listing.id });
          },
        },
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert(t('error'), (err as Error).message ?? (isEditMode ? 'Không thể cập nhật tin đăng' : t('listing_create_error')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.header, { borderBottomColor: C.border }]}>
          <TouchableOpacity style={[s.iconBtn, { borderColor: C.border }]} onPress={() => navigation.goBack()} disabled={loading || paymentLoading}>
            <Ionicons name="close" size={22} color={C.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: C.text }]}>{isEditMode ? 'Chỉnh sửa tin' : t('create_listing_title')}</Text>
            <Text style={[s.headerSub, { color: C.subtext }]}>{isEditMode ? 'Cập nhật bài niêm yết Surf Market' : 'Surf Market Studio'}</Text>
          </View>
          <TouchableOpacity
            style={[s.submitBtn, { backgroundColor: loading || editLoading ? C.muted : C.accent }]}
            onPress={() => void submitListing(false)}
            disabled={loading || paymentLoading || editLoading}
          >
            {loading && !boostEnabled ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.submitBtnText}>{isEditMode ? 'Lưu' : t('create_listing_submit')}</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 42 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[s.sectionCard, { backgroundColor: C.card, borderColor: C.border }]}>
            {editLoading ? (
              <View style={[s.imgPicker, { backgroundColor: C.card2, borderColor: C.border }]}>
                <ActivityIndicator color={C.accent} />
                <Text style={[s.imgPickerText, { color: C.subtext }]}>Đang tải tin đăng...</Text>
              </View>
            ) : totalImageCount === 0 ? (
              <TouchableOpacity style={[s.imgPicker, { backgroundColor: C.card2, borderColor: C.border }]} onPress={handlePickImages} disabled={loading || paymentLoading}>
                <Ionicons name="camera-outline" size={34} color={C.subtext} />
                <Text style={[s.imgPickerText, { color: C.subtext }]}>{t('add_product_photos')}</Text>
                <Text style={{ color: C.placeholder, fontSize: 11, marginTop: 2 }}>{t('max_5_photos')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ marginBottom: 18 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.imageList}>
                  {existingMediaUrls.map((uri) => (
                    <View key={uri} style={[s.imagePreview, { backgroundColor: C.card2, borderColor: C.border }]}>
                      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      <TouchableOpacity
                        style={[s.removeImageBtn, { backgroundColor: C.red }]}
                        onPress={() => setExistingMediaUrls((current) => current.filter((item) => item !== uri))}
                        disabled={loading || paymentLoading}
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {selectedImages.map((asset) => (
                    <View key={asset.uri} style={[s.imagePreview, { backgroundColor: C.card2, borderColor: C.border }]}>
                      <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      <TouchableOpacity
                        style={[s.removeImageBtn, { backgroundColor: C.red }]}
                        onPress={() => setSelectedImages((current) => current.filter((item) => item.uri !== asset.uri))}
                        disabled={loading || paymentLoading}
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {totalImageCount < 5 && (
                    <TouchableOpacity style={[s.addImageBtn, { backgroundColor: C.card2, borderColor: C.border }]} onPress={handlePickImages} disabled={loading || paymentLoading}>
                      <Ionicons name="add" size={28} color={C.accent} />
                    </TouchableOpacity>
                  )}
                </ScrollView>
                <Text style={{ color: C.subtext, fontSize: 12, marginTop: 8 }}>
                  {t('selected_photos_count', { count: totalImageCount })}
                </Text>
              </View>
            )}

            <Field label={t('listing_title_label')} required>
              <TextInput
                style={[s.input, { backgroundColor: C.input, borderColor: C.border, color: C.text }]}
                placeholder={t('listing_title_placeholder')}
                placeholderTextColor={C.placeholder}
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />
            </Field>

            <Field label={t('listing_price_label')} required>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[s.input, { backgroundColor: C.input, borderColor: C.border, color: C.text, paddingRight: 54 }]}
                  placeholder="0"
                  placeholderTextColor={C.placeholder}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                />
                <Text style={[s.currencyTag, { color: C.subtext }]}>VND</Text>
              </View>
            </Field>

            <Field label={t('listing_category_label')} required>
              <View style={s.optionGrid}>
                {CATEGORIES.map((cat) => {
                  const active = category === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      style={[s.optionBtn, { backgroundColor: active ? C.accent : C.pill, borderColor: active ? C.accent : 'transparent' }]}
                      onPress={() => setCategory(cat.key)}
                    >
                      <Ionicons name={cat.icon} size={16} color={active ? '#fff' : C.text} />
                      <Text style={[s.optionLabel, { color: active ? '#fff' : C.text }]}>{t(cat.labelKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>

            <Field label={t('listing_condition_label')} required>
              <View style={s.condRow}>
                {CONDITIONS.map((cond) => {
                  const active = condition === cond.key;
                  return (
                    <TouchableOpacity
                      key={cond.key}
                      style={[s.condBtn, { backgroundColor: active ? C.accent : C.pill, borderColor: active ? C.accent : 'transparent' }]}
                      onPress={() => setCondition(cond.key)}
                    >
                      <Text style={[s.condBtnText, { color: active ? '#fff' : C.text }]}>{t(cond.labelKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>

            <Field label={t('market_description')} helper="Mô tả càng cụ thể thì kiểm duyệt và người mua càng dễ hiểu.">
              <TextInput
                style={[s.input, s.textarea, { backgroundColor: C.input, borderColor: C.border, color: C.text }]}
                placeholder={t('listing_description_placeholder')}
                placeholderTextColor={C.placeholder}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={5}
                maxLength={1000}
                textAlignVertical="top"
              />
            </Field>
          </View>

          <View style={[s.sectionCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Thông tin bán hàng</Text>
            <View style={s.twoCol}>
              <Field label="Thương hiệu">
                <TextInput style={[s.input, { backgroundColor: C.input, borderColor: C.border, color: C.text }]} placeholder="Apple, Sony..." placeholderTextColor={C.placeholder} value={brand} onChangeText={setBrand} />
              </Field>
              <Field label="Loại sản phẩm">
                <TextInput style={[s.input, { backgroundColor: C.input, borderColor: C.border, color: C.text }]} placeholder="Điện thoại, áo khoác..." placeholderTextColor={C.placeholder} value={productType} onChangeText={setProductType} />
              </Field>
            </View>
            <View style={s.twoCol}>
              <Field label="Chất liệu">
                <TextInput style={[s.input, { backgroundColor: C.input, borderColor: C.border, color: C.text }]} placeholder="Da, nhôm..." placeholderTextColor={C.placeholder} value={material} onChangeText={setMaterial} />
              </Field>
              <Field label="SKU">
                <TextInput style={[s.input, { backgroundColor: C.input, borderColor: C.border, color: C.text }]} placeholder="Mã nội bộ" placeholderTextColor={C.placeholder} value={sku} onChangeText={setSku} />
              </Field>
            </View>
            <Field label="Tags" helper="Ngăn cách bằng dấu phẩy, tối đa 20 tag.">
              <TextInput
                style={[s.input, { backgroundColor: C.input, borderColor: C.border, color: C.text }]}
                placeholder="iphone, fullbox, bảo hành"
                placeholderTextColor={C.placeholder}
                value={tags}
                onChangeText={setTags}
              />
            </Field>

            <Field label="Tình trạng kho" required>
              <View style={s.availabilityGrid}>
                {AVAILABILITY_OPTIONS.map((option) => {
                  const active = availability === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={[s.availabilityCard, { borderColor: active ? C.accent : C.border, backgroundColor: active ? `${C.accent}17` : C.card2 }]}
                      onPress={() => setAvailability(option.key)}
                    >
                      <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? C.accent : C.subtext} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.availabilityTitle, { color: C.text }]}>{option.label}</Text>
                        <Text style={[s.availabilityHelper, { color: C.subtext }]}>{option.helper}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>
          </View>

          <View style={[s.sectionCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Địa điểm & giao nhận</Text>
            <Field label={t('listing_location_label')} required>
              <View style={[s.inputRow, { backgroundColor: C.input, borderColor: C.border }]}>
                <Ionicons name="location-outline" size={18} color={C.subtext} />
                <TextInput
                  style={[s.inputInner, { color: C.text }]}
                  placeholder={t('listing_location_placeholder')}
                  placeholderTextColor={C.placeholder}
                  value={location}
                  onChangeText={setLocation}
                  maxLength={100}
                />
              </View>
              <View style={[s.locationSuggestions, { backgroundColor: C.card2, borderColor: C.border }]}>
                <View style={s.locationSuggestionHeader}>
                  <Text style={[s.locationSuggestionTitle, { color: C.accent }]}>
                    {locationLoading ? 'Đang tìm địa chỉ...' : 'Chọn một địa chỉ trong danh sách'}
                  </Text>
                  {locationLoading ? <ActivityIndicator size="small" color={C.accent} /> : null}
                </View>
                {locationSuggestions.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion.id}
                    style={[s.locationSuggestionRow, { borderTopColor: C.border }]}
                    onPress={() => {
                      setLocation(suggestion.displayName);
                      setSelectedLocation(suggestion);
                    }}
                  >
                    <View style={[s.locationIconCircle, { backgroundColor: C.pill }]}>
                      <Ionicons name="locate-outline" size={16} color={C.accent} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.locationSuggestionLabel, { color: C.text }]} numberOfLines={1}>{suggestion.label}</Text>
                      <Text style={[s.locationSuggestionSub, { color: C.subtext }]} numberOfLines={2}>{suggestion.subtitle}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[s.locationPreview, { backgroundColor: C.card2, borderColor: C.border }]}
                onPress={() => selectedLocation && setLocationMapOpen(true)}
                disabled={!selectedLocation}
                activeOpacity={0.86}
              >
                <View style={s.locationPreviewMap}>
                  {selectedLocation ? (
                    <Image
                      source={{ uri: getOpenStreetMapTileUrl(selectedLocation.center) }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ) : (
                    <Ionicons name="map-outline" size={30} color={C.accent} />
                  )}
                  <View style={[s.locationRadius, { borderColor: C.accent, backgroundColor: `${C.accent}1a` }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.locationSuggestionLabel, { color: C.text }]} numberOfLines={1}>
                    {selectedLocation?.label || 'Khu vực bán hàng'}
                  </Text>
                  <Text style={[s.locationSuggestionSub, { color: C.subtext }]} numberOfLines={2}>
                    {selectedLocation
                      ? `Hiển thị gần ${selectedLocation.center[0].toFixed(4)}, ${selectedLocation.center[1].toFixed(4)}`
                      : 'Chọn gợi ý để định vị khu vực gặp mặt khoảng 1.5km.'}
                  </Text>
                </View>
              </TouchableOpacity>
            </Field>

            <Field label="Cách giao nhận" required>
              <View style={s.optionGrid}>
                {MEETING_OPTIONS.map((option) => {
                  const active = meetingPreferences.includes(option.key);
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={[s.meetingBtn, { backgroundColor: active ? C.accent : C.pill, borderColor: active ? C.accent : 'transparent' }]}
                      onPress={() => toggleMeeting(option.key)}
                    >
                      <Ionicons name={option.icon} size={15} color={active ? '#fff' : C.text} />
                      <Text style={[s.optionLabel, { color: active ? '#fff' : C.text }]}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>

            <View style={[s.switchRow, { borderColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.switchTitle, { color: C.text }]}>Ẩn khỏi bạn bè</Text>
                <Text style={[s.switchSub, { color: C.subtext }]}>Tin vẫn có thể hiện trong Surf Market cho người mua phù hợp.</Text>
              </View>
              <Switch value={hideFromFriends} onValueChange={setHideFromFriends} trackColor={{ false: C.border, true: C.accent }} thumbColor="#fff" />
            </View>
          </View>

          <View style={[s.sectionCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Xem trước</Text>
            <View style={[s.previewCard, { backgroundColor: C.card2, borderColor: C.border }]}>
              <View style={[s.previewHero, { backgroundColor: C.border }]}>
                {previewImageUri ? (
                  <Image source={{ uri: previewImageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <View style={s.previewPlaceholder}>
                    <Ionicons name="image-outline" size={42} color={C.subtext} />
                    <Text style={[s.previewPlaceholderText, { color: C.subtext }]}>Thêm ảnh để xem trước</Text>
                  </View>
                )}
              </View>
              <View style={s.previewBody}>
                <Text style={[s.previewTitle, { color: C.text }]}>{previewTitle}</Text>
                <Text style={[s.previewPrice, { color: C.accent }]}>{formatVnd(priceValue)}</Text>
                <Text style={[s.previewMeta, { color: C.subtext }]} numberOfLines={2}>
                  Đã niêm yết vài giây trước tại {previewLocation}
                </Text>
                <View style={s.previewDetailGrid}>
                  <View>
                    <Text style={[s.previewDetailLabel, { color: C.muted }]}>Tình trạng</Text>
                    <Text style={[s.previewDetailValue, { color: C.text }]}>{previewConditionLabel}</Text>
                  </View>
                  <View>
                    <Text style={[s.previewDetailLabel, { color: C.muted }]}>Hạng mục</Text>
                    <Text style={[s.previewDetailValue, { color: C.text }]}>{previewCategoryLabel}</Text>
                  </View>
                  {brand.trim() ? (
                    <View>
                      <Text style={[s.previewDetailLabel, { color: C.muted }]}>Thương hiệu</Text>
                      <Text style={[s.previewDetailValue, { color: C.text }]}>{brand.trim()}</Text>
                    </View>
                  ) : null}
                  {productType.trim() ? (
                    <View>
                      <Text style={[s.previewDetailLabel, { color: C.muted }]}>Loại</Text>
                      <Text style={[s.previewDetailValue, { color: C.text }]}>{productType.trim()}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[s.previewDescription, { color: C.subtext }]}>{previewDescription}</Text>
                {selectedLocation ? (
                  <View style={[s.previewLocationCard, { backgroundColor: C.card, borderColor: C.border }]}>
                    <View style={s.previewLocationTile}>
                      <Image source={{ uri: getOpenStreetMapTileUrl(selectedLocation.center, 13) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      <View style={[s.locationRadius, { borderColor: C.accent, backgroundColor: `${C.accent}1a` }]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.previewDetailValue, { color: C.text }]} numberOfLines={1}>{previewLocation}</Text>
                      <Text style={[s.previewDetailLabel, { color: C.subtext }]} numberOfLines={2}>Khu vực gặp mặt khoảng 1.5km</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {!isEditMode && (
            <View style={[s.sectionCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={s.boostHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sectionTitle, { color: C.text }]}>Boost Surf Market</Text>
                  <Text style={[s.fieldHelper, { color: C.subtext }]}>Thanh toán sandbox rồi gửi tin vào hàng chờ kiểm duyệt Boost.</Text>
                </View>
                <Switch
                  value={boostEnabled}
                  onValueChange={(value) => {
                    setBoostEnabled(value);
                    resetPendingPayment();
                  }}
                  trackColor={{ false: C.border, true: C.accent }}
                  thumbColor="#fff"
                />
              </View>
              {boostEnabled && (
                <View style={{ gap: 12 }}>
                {BOOST_BUDGET_OPTIONS.map((plan) => {
                  const active = selectedBoostPlanId === plan.id;
                  const total = getBoostTotal(plan);
                  return (
                    <TouchableOpacity
                      key={plan.id}
                      style={[s.boostPlan, { backgroundColor: active ? `${C.accent}17` : C.card2, borderColor: active ? C.accent : C.border }]}
                      onPress={() => {
                        setSelectedBoostPlanId(plan.id);
                        resetPendingPayment();
                      }}
                    >
                      <View style={s.boostPlanTop}>
                        <Text style={[s.boostPlanTitle, { color: C.text }]}>{plan.name}</Text>
                        <Text style={[s.boostBadge, { color: C.accent }]}>{plan.badge}</Text>
                      </View>
                      <Text style={[s.boostPrice, { color: C.accent }]}>{formatVnd(total)} · {plan.durationDays} ngày</Text>
                      <Text style={[s.boostSub, { color: C.subtext }]}>Dự kiến tiếp cận {plan.reach} người</Text>
                      <Text style={[s.boostSub, { color: C.muted }]}>{plan.placements.map((item) => BOOST_PLACEMENT_LABELS[item] ?? item).join(' · ')}</Text>
                    </TouchableOpacity>
                  );
                })}

                <Text style={[s.fieldLabel, { color: C.text }]}>Cổng thanh toán</Text>
                <View style={s.paymentGrid}>
                  {BOOST_PAYMENT_METHODS.map((method) => {
                    const active = paymentProvider === method.key;
                    return (
                      <TouchableOpacity
                        key={method.key}
                        style={[s.paymentMethod, { backgroundColor: active ? C.accent : C.card2, borderColor: active ? C.accent : C.border }]}
                        onPress={() => {
                          setPaymentProvider(method.key);
                          resetPendingPayment();
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
                    <Text style={[s.pendingTitle, { color: C.text }]}>Giao dịch {pendingPayment.orderId}</Text>
                    <Text style={[s.pendingText, { color: C.subtext }]}>Hoàn tất thanh toán sandbox rồi bấm "Kiểm tra & đăng Boost".</Text>
                  </View>
                ) : null}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        <View style={[s.bottomBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
          {isEditMode ? (
            <TouchableOpacity style={[s.fullPrimary, { backgroundColor: loading || editLoading ? C.muted : C.accent }]} onPress={() => void submitListing(false)} disabled={loading || paymentLoading || editLoading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.bottomPrimaryText}>Lưu thay đổi</Text>}
            </TouchableOpacity>
          ) : boostEnabled ? (
            <>
              <TouchableOpacity style={[s.bottomSecondary, { borderColor: C.border }]} onPress={() => void submitListing(false)} disabled={loading || paymentLoading}>
                <Text style={[s.bottomSecondaryText, { color: C.text }]}>Đăng không Boost</Text>
              </TouchableOpacity>
              {pendingPayment ? (
                <TouchableOpacity style={[s.bottomPrimary, { backgroundColor: C.accent }]} onPress={() => void submitListing(true)} disabled={loading || paymentLoading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.bottomPrimaryText}>Kiểm tra & đăng Boost</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.bottomPrimary, { backgroundColor: C.accent }]} onPress={launchPayment} disabled={loading || paymentLoading}>
                  {paymentLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.bottomPrimaryText}>Thanh toán Boost</Text>}
                </TouchableOpacity>
              )}
            </>
          ) : (
            <TouchableOpacity style={[s.fullPrimary, { backgroundColor: C.accent }]} onPress={() => void submitListing(false)} disabled={loading || paymentLoading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.bottomPrimaryText}>{t('create_listing_submit')}</Text>}
            </TouchableOpacity>
          )}
        </View>
        <Modal visible={locationMapOpen && !!selectedLocation} transparent animationType="slide" onRequestClose={() => setLocationMapOpen(false)}>
          <Pressable style={s.mapModalBackdrop} onPress={() => setLocationMapOpen(false)}>
            <Pressable style={[s.mapModalSheet, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={s.mapModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.mapModalTitle, { color: C.text }]}>Bản đồ vị trí</Text>
                  <Text style={[s.mapModalSub, { color: C.subtext }]} numberOfLines={1}>{selectedLocation?.displayName}</Text>
                </View>
                <TouchableOpacity style={[s.iconBtn, { borderColor: C.border }]} onPress={() => setLocationMapOpen(false)}>
                  <Ionicons name="close" size={20} color={C.text} />
                </TouchableOpacity>
              </View>
              {selectedLocation ? (
                <View style={[s.mapModalTile, { backgroundColor: C.card2 }]}>
                  <Image source={{ uri: getOpenStreetMapTileUrl(selectedLocation.center, 12) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  <View style={[s.mapModalRadius, { borderColor: C.accent, backgroundColor: `${C.accent}22` }]} />
                </View>
              ) : null}
              <View style={{ padding: 14 }}>
                <Text style={[s.mapModalTitle, { color: C.text }]}>{selectedLocation?.label}</Text>
                <Text style={[s.mapModalSub, { color: C.subtext }]}>Người mua sẽ thấy khu vực gặp mặt gần vị trí này, không phải địa chỉ chính xác.</Text>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
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
    paddingVertical: 9,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900' },
  headerSub: { marginTop: 1, fontSize: 11, fontWeight: '700' },
  submitBtn: { minHeight: 38, minWidth: 72, borderRadius: 19, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  sectionCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '900', marginBottom: 10 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '900', marginBottom: 6 },
  fieldHelper: { marginTop: -2, marginBottom: 8, fontSize: 11.5, fontWeight: '600', lineHeight: 16 },
  imgPicker: {
    height: 132,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    gap: 6,
  },
  imgPickerText: { fontSize: 14, fontWeight: '800' },
  imageList: { gap: 10 },
  imagePreview: { width: 96, height: 96, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  removeImageBtn: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addImageBtn: { width: 96, height: 96, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, fontSize: 14 },
  textarea: { minHeight: 112, paddingTop: 12 },
  currencyTag: { position: 'absolute', right: 14, top: 13, fontSize: 12, fontWeight: '900' },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: { minHeight: 36, borderRadius: 11, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  optionLabel: { fontSize: 12.5, fontWeight: '800' },
  condRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  condBtn: { minHeight: 38, borderRadius: 11, borderWidth: 1.5, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  condBtnText: { fontSize: 12.5, fontWeight: '800' },
  twoCol: { flexDirection: 'row', gap: 10 },
  availabilityGrid: { gap: 8 },
  availabilityCard: { borderWidth: 1, borderRadius: 13, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  availabilityTitle: { fontSize: 13, fontWeight: '900' },
  availabilityHelper: { marginTop: 2, fontSize: 11.5, fontWeight: '600', lineHeight: 16 },
  inputRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 13 },
  inputInner: { flex: 1, fontSize: 14, paddingVertical: 0 },
  locationSuggestions: { marginTop: 8, borderRadius: 13, borderWidth: 1, overflow: 'hidden' },
  locationSuggestionHeader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 11 },
  locationSuggestionTitle: { fontSize: 11.5, fontWeight: '900' },
  locationSuggestionRow: { minHeight: 60, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 9 },
  locationIconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  locationSuggestionLabel: { fontSize: 13, fontWeight: '900' },
  locationSuggestionSub: { marginTop: 1, fontSize: 11.5, fontWeight: '600', lineHeight: 16 },
  locationPreview: { marginTop: 8, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11 },
  locationPreviewMap: { width: 72, height: 72, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  locationRadius: { position: 'absolute', width: 56, height: 56, borderRadius: 28, borderWidth: 2 },
  meetingBtn: { minHeight: 36, borderRadius: 11, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  switchRow: { borderWidth: 1, borderRadius: 13, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTitle: { fontSize: 14, fontWeight: '900' },
  switchSub: { marginTop: 2, fontSize: 11.5, fontWeight: '600', lineHeight: 16 },
  previewCard: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  previewHero: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  previewPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  previewPlaceholderText: { fontSize: 13, fontWeight: '800' },
  previewBody: { padding: 14, gap: 9 },
  previewTitle: { fontSize: 20, fontWeight: '900', lineHeight: 25 },
  previewPrice: { fontSize: 16, fontWeight: '900' },
  previewMeta: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  previewDetailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 4 },
  previewDetailLabel: { fontSize: 10.5, fontWeight: '800' },
  previewDetailValue: { marginTop: 2, fontSize: 12.5, fontWeight: '900' },
  previewDescription: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  previewLocationCard: { borderWidth: 1, borderRadius: 13, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewLocationTile: { width: 74, height: 58, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  mapModalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.56)' },
  mapModalSheet: { maxHeight: '86%', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, overflow: 'hidden' },
  mapModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  mapModalTitle: { fontSize: 17, fontWeight: '900' },
  mapModalSub: { marginTop: 2, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  mapModalTile: { height: 330, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  mapModalRadius: { width: 190, height: 190, borderRadius: 95, borderWidth: 3 },
  boostHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  boostPlan: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  boostPlanTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  boostPlanTitle: { flex: 1, fontSize: 14, fontWeight: '900' },
  boostBadge: { fontSize: 11, fontWeight: '900' },
  boostPrice: { fontSize: 13, fontWeight: '900' },
  boostSub: { fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
  paymentGrid: { flexDirection: 'row', gap: 8 },
  paymentMethod: { flex: 1, minHeight: 66, borderRadius: 13, borderWidth: 1, padding: 9, justifyContent: 'center', gap: 4 },
  paymentShort: { fontSize: 12, fontWeight: '900' },
  paymentLabel: { fontSize: 10.5, fontWeight: '700', lineHeight: 14 },
  pendingPayment: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 4 },
  pendingTitle: { fontSize: 13, fontWeight: '900' },
  pendingText: { fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
  bottomBar: { borderTopWidth: 1, padding: 14, paddingBottom: 18, flexDirection: 'row', gap: 10 },
  bottomSecondary: { flex: 1, minHeight: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  bottomPrimary: { flex: 1.45, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  fullPrimary: { flex: 1, minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bottomSecondaryText: { fontSize: 13, fontWeight: '900' },
  bottomPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
