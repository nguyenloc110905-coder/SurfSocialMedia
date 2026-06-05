import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  useColorScheme,
  Dimensions,
  Share,
  ActivityIndicator,
  Animated,
  Alert,
  FlatList,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation';
import { useMarketplaceStore, type Listing } from '@/stores/marketplaceStore';
import { useAuthStore } from '@/stores/authStore';
import { useLanguage, useT, type I18nKey } from '@/lib/i18n';
import { api } from '@/lib/api';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MarketplaceDetail'>;
  route: RouteProp<RootStackParamList, 'MarketplaceDetail'>;
};

// ── Theme ─────────────────────────────────────────────────────────────────────
const DARK = {
  bg: '#0f172a', card: '#1e293b', card2: '#111827', border: '#334155',
  text: '#e2e8f0', subtext: '#64748b', accent: '#0ea5e9',
  green: '#22c55e', red: '#ef4444', pill: '#1e3a5f',
};
const LIGHT = {
  bg: '#f1f5f9', card: '#ffffff', card2: '#f8fafc', border: '#e2e8f0',
  text: '#1e293b', subtext: '#64748b', accent: '#0ea5e9',
  green: '#16a34a', red: '#dc2626', pill: '#e0f2fe',
};

const CONDITION_LABEL_KEYS: Record<string, I18nKey> = {
  new: 'market_condition_new_full',
  like_new: 'market_condition_like_new',
  good: 'market_condition_good',
  fair: 'market_condition_fair',
};
const CATEGORY_LABEL_KEYS: Record<string, I18nKey> = {
  electronics: 'market_category_electronics',
  clothing: 'market_category_clothing',
  vehicles: 'market_category_vehicles',
  property: 'market_category_property',
  home: 'market_category_home',
  sports: 'market_category_sports',
  other: 'market_category_other',
};
const REPORT_CATEGORIES = [
  { key: 'spam', label: 'Spam hoặc lừa đảo' },
  { key: 'hate', label: 'Ngôn từ thù ghét hoặc quấy rối' },
  { key: 'violence', label: 'Ảnh khỏa thân hoặc bạo lực' },
  { key: 'fake_news', label: 'Thông tin sai lệch' },
  { key: 'illegal', label: 'Bán hàng trái phép' },
  { key: 'copyright', label: 'Vi phạm bản quyền' },
  { key: 'other', label: 'Lý do khác' },
];
const AVAILABILITY_LABELS: Record<string, string> = {
  in_stock: 'Còn hàng',
  single_item: 'Một mặt hàng duy nhất',
};
const MEETING_LABELS: Record<string, string> = {
  public_meetup: 'Gặp mặt nơi công cộng',
  door_pickup: 'Người mua tới lấy',
  door_dropoff: 'Để hàng trước cửa',
};
const BOOST_DAY_MS = 24 * 60 * 60 * 1000;

function formatPrice(price: number, language: string, t: ReturnType<typeof useT>): string {
  if (price === 0) return t('free');
  if (price >= 1_000_000_000) return t('price_billion_full', { value: (price / 1_000_000_000).toFixed(1) });
  if (price >= 1_000_000) return t('price_million_full', { value: (price / 1_000_000).toFixed(1) });
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  return t('price_currency_full', { value: price.toLocaleString(locale) });
}

function timeAgo(raw: any, t: ReturnType<typeof useT>): string {
  let ms = 0;
  if (!raw) return '';
  if (typeof raw === 'number') ms = raw * 1000;
  else if (typeof raw === 'string') ms = new Date(raw).getTime();
  else if (raw._seconds) ms = raw._seconds * 1000;
  else if (raw.seconds) ms = raw.seconds * 1000;
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return t('post_just_now');
  if (diff < 3600) return t('post_minutes_ago', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('post_hours_ago', { count: Math.floor(diff / 3600) });
  return t('post_days_ago', { count: Math.floor(diff / 86400) });
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

function getBoostStatusText(listing: Listing) {
  if (!listing.boostEnabled) return 'Chưa quảng bá';
  if (isBoostActive(listing)) return 'Đang Boost';
  if (listing.boostStatus === 'paused') return 'Đã ngưng Boost';
  if (listing.boostStatus === 'awaiting_moderation') return 'Boost chờ duyệt';
  if (listing.boostStatus === 'completed') return 'Boost hoàn tất';
  if (listing.boostStatus === 'cancelled') return 'Boost đã hủy';
  if (listing.boostStatus === 'rejected') return 'Boost bị từ chối';
  return 'Đã bật Boost';
}

function uniqueListings(items: Listing[]) {
  const map = new Map<string, Listing>();
  items.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

const { width: SW } = Dimensions.get('window');

export default function MarketplaceDetailScreen({ navigation, route }: Props) {
  const t = useT();
  const language = useLanguage();
  const { listingId } = route.params;
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;

  const {
    detailListing,
    detailLoading,
    error,
    listings,
    searchResults,
    savedListings,
    myListings,
    fetchDetail,
    toggleSave,
    deleteListing,
    markAsSold,
    updateListing,
    reportListing,
    pauseBoost,
    resumeBoost,
  } = useMarketplaceStore();
  const user = useAuthStore((s) => s.user);

  const [activeImg, setActiveImg] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [sellerProfileOpen, setSellerProfileOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const scrollX = useRef(new Animated.Value(0)).current;
  const contactOpeningRef = useRef(false);

  useEffect(() => {
    fetchDetail(listingId);
  }, [listingId, fetchDetail]);

  const handleSave = async () => {
    if (!detailListing) return;
    setActionLoading(true);
    try {
      await toggleSave(detailListing.id);
    } catch (e) {
      Alert.alert(t('error'), (e as Error).message ?? t('listing_update_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleShare = async () => {
    if (!detailListing) return;
    await Share.share({
      title: detailListing.title,
      message: `${detailListing.title} — ${formatPrice(detailListing.price, language, t)}`,
    });
  };

  const handleContactSeller = async () => {
    if (!detailListing || contactOpeningRef.current) return;
    contactOpeningRef.current = true;
    setContactLoading(true);
    try {
      const res = await api.post<{ item?: { id: string; muted?: boolean } }>(
        `/api/marketplace/${encodeURIComponent(detailListing.id)}/contact`,
        {}
      );
      const conversationId = res.item?.id;
      if (!conversationId) throw new Error('missing_conversation_id');

      navigation.navigate('Chat', {
        conversationId,
        title: detailListing.title,
        peerUid: detailListing.sellerId,
        peerName: detailListing.sellerDisplayName,
        peerAvatar: detailListing.sellerPhotoURL,
        muted: Boolean(res.item?.muted),
        members: [{
          uid: detailListing.sellerId,
          name: detailListing.sellerDisplayName,
          avatarUrl: detailListing.sellerPhotoURL,
        }],
        memberCount: 2,
        marketplace: {
          listingId: detailListing.id,
          title: detailListing.title,
          imageUrl: detailListing.mediaUrls?.[0] ?? null,
          price: detailListing.price,
          location: detailListing.location,
          sellerId: detailListing.sellerId,
        },
      });
    } catch {
      Alert.alert(t('cannot_open_messages'), t('try_again_later'));
    } finally {
      contactOpeningRef.current = false;
      setContactLoading(false);
    }
  };

  const isOwner = detailListing?.sellerId === user?.uid;
  const isSaved = detailListing?.savedBy?.includes(user?.uid ?? '') ?? false;
  const sellerListings = useMemo(() => {
    if (!detailListing) return [];
    return uniqueListings([...listings, ...searchResults, ...savedListings, ...myListings, detailListing])
      .filter((item) => item.sellerId === detailListing.sellerId && item.status === 'active')
      .sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
  }, [detailListing, listings, myListings, savedListings, searchResults]);

  const confirmMarkSold = () => {
    if (!detailListing) return;
    Alert.alert(t('mark_sold'), t('mark_sold_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('sold'),
        onPress: async () => {
          setActionLoading(true);
          try {
            await markAsSold(detailListing.id);
          } catch (e) {
            Alert.alert(t('error'), (e as Error).message ?? t('listing_update_error'));
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const confirmMarkAvailable = () => {
    if (!detailListing) return;
    setActionLoading(true);
    updateListing(
      detailListing.id,
      detailListing.status === 'sold' ? { status: 'active' } : { saleStatus: 'available' }
    )
      .catch((e) => Alert.alert(t('error'), (e as Error).message ?? t('listing_update_error')))
      .finally(() => setActionLoading(false));
  };

  const handleBoostAction = async () => {
    if (!detailListing) return;
    if (!isBoostActive(detailListing) && !canResumeBoost(detailListing)) {
      Alert.alert(
        'Boost tin',
        'Tạo chiến dịch Boost ở tab Người bán trong Surf Market để chọn gói và cổng thanh toán sandbox.',
        [
          { text: t('cancel'), style: 'cancel' },
          { text: 'Mở Market', onPress: () => navigation.navigate('Marketplace') },
        ]
      );
      return;
    }

    setActionLoading(true);
    try {
      if (isBoostActive(detailListing)) await pauseBoost(detailListing.id);
      else await resumeBoost(detailListing.id);
    } catch (e) {
      Alert.alert(t('error'), (e as Error).message ?? t('listing_update_error'));
    } finally {
      setActionLoading(false);
    }
  };

  const submitReport = async () => {
    if (!detailListing || !reportCategory || reportSubmitting) return;
    const categoryLabel = REPORT_CATEGORIES.find((item) => item.key === reportCategory)?.label ?? reportCategory;
    const reason = reportDetails.trim() ? `${categoryLabel} - ${reportDetails.trim()}` : categoryLabel;
    setReportSubmitting(true);
    try {
      await reportListing(detailListing.id, reason);
      setReportOpen(false);
      setReportCategory('');
      setReportDetails('');
      Alert.alert('Đã gửi báo cáo', 'Surf sẽ xem xét bài niêm yết này theo tiêu chuẩn cộng đồng.');
    } catch (e) {
      Alert.alert(t('error'), (e as Error).message || 'Không thể gửi báo cáo.');
    } finally {
      setReportSubmitting(false);
    }
  };

  const confirmDelete = () => {
    if (!detailListing) return;
    Alert.alert(t('delete_listing'), t('delete_listing_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            await deleteListing(detailListing.id);
            navigation.goBack();
          } catch (e) {
            Alert.alert(t('error'), (e as Error).message ?? t('listing_delete_error'));
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  if (detailLoading || !detailListing) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <TouchableOpacity style={[s.backBtn, { backgroundColor: C.card }]} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={s.centerState}>
          {detailLoading ? (
            <ActivityIndicator size="large" color={C.accent} />
          ) : (
            <>
              <Ionicons name="warning-outline" size={52} color={C.red} />
              <Text style={[s.emptyTitle, { color: C.text }]}>{t('market_listing_load_error')}</Text>
              <Text style={[s.emptySub, { color: C.subtext }]}>{error ?? t('market_listing_missing')}</Text>
              <TouchableOpacity style={[s.retryBtn, { backgroundColor: C.accent }]} onPress={() => fetchDetail(listingId)}>
                <Text style={s.retryText}>{t('retry')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const images = detailListing.mediaUrls?.length > 0 ? detailListing.mediaUrls : [null];

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>

      {/* ── Back / Share buttons overlay ── */}
      <View style={s.overlay}>
        <TouchableOpacity
          style={[s.overlayBtn, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={[s.overlayBtn, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
            onPress={handleShare}
          >
            <Ionicons name="share-social-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.overlayBtn, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
            onPress={handleSave}
            disabled={actionLoading}
          >
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={isSaved ? C.accent : '#fff'}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} bounces>

        {/* ── Image carousel ── */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: false,
            listener: (e: any) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
              setActiveImg(idx);
            },
          })}
          scrollEventThrottle={16}
        >
          {images.map((uri, i) => (
            <View key={i} style={{ width: SW, height: SW * 0.75, backgroundColor: C.card }}>
              {uri ? (
                <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="image-outline" size={56} color={C.subtext} />
                  <Text style={{ color: C.subtext, marginTop: 8 }}>{t('market_no_image')}</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Dots indicator */}
        {images.length > 1 && (
          <View style={s.dots}>
            {images.map((_, i) => (
              <View
                key={i}
                style={[s.dot, { backgroundColor: i === activeImg ? C.accent : C.border }]}
              />
            ))}
          </View>
        )}

        {/* ── Content ── */}
        <View style={{ padding: 16, gap: 4 }}>

          {/* Price */}
          <Text style={[s.price, { color: detailListing.price === 0 ? C.green : C.accent }]}>
            {formatPrice(detailListing.price, language, t)}
          </Text>

          {/* Title */}
          <Text style={[s.title, { color: C.text }]}>{detailListing.title}</Text>

          {/* Meta row */}
          <View style={[s.metaRow, { marginTop: 4 }]}>
            <View style={[s.badge, { backgroundColor: C.pill }]}>
              <Text style={[s.badgeText, { color: C.accent }]}>
                {CATEGORY_LABEL_KEYS[detailListing.category]
                  ? t(CATEGORY_LABEL_KEYS[detailListing.category])
                  : detailListing.category}
              </Text>
            </View>
            <View style={[s.badge, { backgroundColor: C.pill }]}>
              <Text style={[s.badgeText, { color: C.accent }]}>
                {CONDITION_LABEL_KEYS[detailListing.condition]
                  ? t(CONDITION_LABEL_KEYS[detailListing.condition])
                  : detailListing.condition}
              </Text>
            </View>
            {detailListing.status === 'sold' && (
              <View style={[s.badge, { backgroundColor: '#fef2f2' }]}>
                <Text style={[s.badgeText, { color: C.red }]}>{t('sold')}</Text>
              </View>
            )}
          </View>

          {/* Location + Time */}
          <View style={[s.metaRow, { marginTop: 8 }]}>
            {detailListing.location ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="location-outline" size={13} color={C.subtext} />
                <Text style={{ color: C.subtext, fontSize: 13 }}>{detailListing.location}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="time-outline" size={13} color={C.subtext} />
              <Text style={{ color: C.subtext, fontSize: 13 }}>{timeAgo(detailListing.createdAt, t)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="eye-outline" size={13} color={C.subtext} />
              <Text style={{ color: C.subtext, fontSize: 13 }}>{t('views_count', { count: detailListing.viewCount ?? 0 })}</Text>
            </View>
          </View>

          {(detailListing.boostEnabled || detailListing.status !== 'active' || detailListing.saleStatus === 'pending') && (
            <View style={[s.noticeCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Ionicons
                name={detailListing.status === 'active' ? 'flash-outline' : 'shield-checkmark-outline'}
                size={18}
                color={detailListing.status === 'active' ? C.accent : C.red}
              />
              <View style={{ flex: 1 }}>
                <Text style={[s.noticeTitle, { color: C.text }]}>
                  {detailListing.status === 'active' ? getBoostStatusText(detailListing) : detailListing.status === 'sold' ? t('sold') : 'Đang kiểm duyệt'}
                </Text>
                {detailListing.moderationReason ? (
                  <Text style={[s.noticeSub, { color: C.subtext }]}>{detailListing.moderationReason}</Text>
                ) : detailListing.boostPlan ? (
                  <Text style={[s.noticeSub, { color: C.subtext }]}>
                    {detailListing.boostPlan.durationDays} ngày · {detailListing.boostPlan.placements.join(', ')}
                  </Text>
                ) : null}
              </View>
            </View>
          )}

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: C.border }]} />

          {/* Description */}
          <Text style={[s.sectionLabel, { color: C.text }]}>{t('market_description')}</Text>
          <Text style={[s.desc, { color: C.subtext }]}>
            {detailListing.description || t('market_no_description')}
          </Text>

          <View style={[s.divider, { backgroundColor: C.border, marginTop: 8 }]} />

          <Text style={[s.sectionLabel, { color: C.text }]}>Thông tin chi tiết</Text>
          <View style={s.detailGrid}>
            <View style={[s.detailInfoCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Ionicons name="pricetag-outline" size={17} color={C.accent} />
              <Text style={[s.infoLabel, { color: C.subtext }]}>Danh mục</Text>
              <Text style={[s.infoValue, { color: C.text }]} numberOfLines={1}>
                {CATEGORY_LABEL_KEYS[detailListing.category]
                  ? t(CATEGORY_LABEL_KEYS[detailListing.category])
                  : detailListing.category}
              </Text>
            </View>
            <View style={[s.detailInfoCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Ionicons name="sparkles-outline" size={17} color={C.accent} />
              <Text style={[s.infoLabel, { color: C.subtext }]}>Tình trạng</Text>
              <Text style={[s.infoValue, { color: C.text }]} numberOfLines={1}>
                {CONDITION_LABEL_KEYS[detailListing.condition]
                  ? t(CONDITION_LABEL_KEYS[detailListing.condition])
                  : detailListing.condition}
              </Text>
            </View>
            <View style={[s.detailInfoCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Ionicons name="cube-outline" size={17} color={C.accent} />
              <Text style={[s.infoLabel, { color: C.subtext }]}>Loại hàng</Text>
              <Text style={[s.infoValue, { color: C.text }]} numberOfLines={1}>
                {detailListing.productType || detailListing.brand || 'Chưa thêm'}
              </Text>
            </View>
            <View style={[s.detailInfoCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Ionicons name="albums-outline" size={17} color={C.accent} />
              <Text style={[s.infoLabel, { color: C.subtext }]}>Kho hàng</Text>
              <Text style={[s.infoValue, { color: C.text }]} numberOfLines={1}>
                {AVAILABILITY_LABELS[detailListing.availability ?? 'in_stock']}
              </Text>
            </View>
          </View>

          {detailListing.material || detailListing.sku || detailListing.tags?.length || detailListing.meetingPreferences?.length ? (
            <View style={s.chipWrap}>
              {detailListing.material ? <Text style={[s.infoChip, { backgroundColor: C.pill, color: C.text }]}>Chất liệu: {detailListing.material}</Text> : null}
              {detailListing.sku ? <Text style={[s.infoChip, { backgroundColor: C.pill, color: C.text }]}>SKU: {detailListing.sku}</Text> : null}
              {detailListing.meetingPreferences?.map((item) => (
                <Text key={item} style={[s.infoChip, { backgroundColor: C.pill, color: C.text }]}>
                  {MEETING_LABELS[item] ?? item}
                </Text>
              ))}
              {detailListing.tags?.map((tag) => (
                <Text key={tag} style={[s.infoChip, { backgroundColor: C.pill, color: C.text }]}>#{tag}</Text>
              ))}
            </View>
          ) : null}

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: C.border, marginTop: 8 }]} />

          {/* Seller card */}
          <Text style={[s.sectionLabel, { color: C.text }]}>{t('market_seller')}</Text>
          <View style={[s.sellerCard, { backgroundColor: C.card, borderColor: C.border }]}>
            {detailListing.sellerPhotoURL ? (
              <Image source={{ uri: detailListing.sellerPhotoURL }} style={s.sellerAvatar} />
            ) : (
              <View style={[s.sellerAvatar, { backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={22} color={C.subtext} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[s.sellerName, { color: C.text }]}>{detailListing.sellerDisplayName}</Text>
              <Text style={{ color: C.subtext, fontSize: 12 }}>{t('market_surf_member')}</Text>
            </View>
            <TouchableOpacity
              style={[s.profileBtn, { borderColor: C.border }]}
              onPress={() => setSellerProfileOpen(true)}
            >
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>Trang bán hàng</Text>
            </TouchableOpacity>
          </View>

          {/* Owner actions */}
          {isOwner && (
            <View style={[s.ownerActions]}>
              {detailListing.status === 'sold' || detailListing.saleStatus === 'pending' ? (
                <TouchableOpacity
                  style={[s.ownerBtn, { backgroundColor: C.green }]}
                  onPress={confirmMarkAvailable}
                  disabled={actionLoading}
                >
                  <Ionicons name="play-circle-outline" size={18} color="#fff" />
                  <Text style={s.ownerBtnText}>Còn hàng</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[s.ownerBtn, { backgroundColor: C.green }]}
                  onPress={confirmMarkSold}
                  disabled={actionLoading || detailListing.status !== 'active'}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={s.ownerBtnText}>{t('mark_sold')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.ownerBtn, { backgroundColor: C.accent }]}
                onPress={() => navigation.navigate('CreateListing', { listingId: detailListing.id })}
                disabled={actionLoading}
              >
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={s.ownerBtnText}>Sửa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.ownerBtn, { backgroundColor: C.accent }]}
                onPress={handleBoostAction}
                disabled={actionLoading || detailListing.status !== 'active'}
              >
                <Ionicons name="flash-outline" size={18} color="#fff" />
                <Text style={s.ownerBtnText}>
                  {isBoostActive(detailListing) ? 'Ngưng Boost' : canResumeBoost(detailListing) ? 'Bật Boost' : 'Boost'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.ownerBtn, { backgroundColor: C.red }]}
                onPress={confirmDelete}
                disabled={actionLoading}
              >
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={s.ownerBtnText}>{t('delete')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Bottom action bar ── */}
      {!isOwner && detailListing.status === 'active' && (
        <View style={[s.bottomBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
          <TouchableOpacity
            style={[s.bottomIconBtn, { borderColor: C.border }]}
            onPress={() => setReportOpen(true)}
            disabled={contactLoading}
          >
            <Ionicons name="flag-outline" size={20} color={C.red} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.contactBtn, { backgroundColor: C.accent }]}
            onPress={handleContactSeller}
            disabled={contactLoading}
          >
            {contactLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="chatbubble-outline" size={20} color="#fff" />
            )}
            <Text style={s.contactBtnText}>{t('market_message_seller')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {sellerProfileOpen && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSellerProfileOpen(false)}>
          <Pressable style={[s.modalBackdrop, { backgroundColor: 'rgba(0,0,0,0.55)' }]} onPress={() => setSellerProfileOpen(false)}>
            <Pressable style={[s.sellerSheet, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={s.sheetHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  {detailListing.sellerPhotoURL ? (
                    <Image source={{ uri: detailListing.sellerPhotoURL }} style={s.sheetAvatar} />
                  ) : (
                    <View style={[s.sheetAvatar, { backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="person" size={24} color={C.subtext} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.sheetTitle, { color: C.text }]} numberOfLines={1}>{detailListing.sellerDisplayName}</Text>
                    <Text style={[s.sheetSub, { color: C.subtext }]}>{sellerListings.length} bài đang bán · {detailListing.location || 'Toàn quốc'}</Text>
                  </View>
                </View>
                <TouchableOpacity style={[s.modalCloseBtn, { borderColor: C.border }]} onPress={() => setSellerProfileOpen(false)}>
                  <Ionicons name="close" size={20} color={C.text} />
                </TouchableOpacity>
              </View>

              <View style={s.sellerStats}>
                <View style={[s.sellerStat, { backgroundColor: C.card2, borderColor: C.border }]}>
                  <Text style={[s.sellerStatValue, { color: C.text }]}>{sellerListings.length}</Text>
                  <Text style={[s.sellerStatLabel, { color: C.subtext }]}>Bài niêm yết</Text>
                </View>
                <View style={[s.sellerStat, { backgroundColor: C.card2, borderColor: C.border }]}>
                  <Text style={[s.sellerStatValue, { color: C.text }]}>{detailListing.viewCount ?? 0}</Text>
                  <Text style={[s.sellerStatLabel, { color: C.subtext }]}>Lượt xem bài này</Text>
                </View>
                <View style={[s.sellerStat, { backgroundColor: C.card2, borderColor: C.border }]}>
                  <Text style={[s.sellerStatValue, { color: C.text }]} numberOfLines={1}>
                    {CATEGORY_LABEL_KEYS[detailListing.category] ? t(CATEGORY_LABEL_KEYS[detailListing.category]) : detailListing.category}
                  </Text>
                  <Text style={[s.sellerStatLabel, { color: C.subtext }]}>Danh mục</Text>
                </View>
              </View>

              <View style={s.sheetActionsRow}>
                <TouchableOpacity
                  style={[s.sheetPrimaryBtn, { backgroundColor: C.accent, opacity: isOwner ? 0.55 : 1 }]}
                  onPress={handleContactSeller}
                  disabled={isOwner || contactLoading}
                >
                  <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                  <Text style={s.sheetPrimaryText}>{contactLoading ? 'Đang mở...' : 'Nhắn tin'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.sheetSecondaryBtn, { borderColor: C.border }]}
                  onPress={() => navigation.navigate('Profile', { userId: detailListing.sellerId })}
                >
                  <Text style={[s.sheetSecondaryText, { color: C.text }]}>{t('view_profile')}</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={sellerListings}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, gap: 10 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[s.sellerListingCard, { backgroundColor: C.card2, borderColor: C.border }]}
                    onPress={() => {
                      setSellerProfileOpen(false);
                      navigation.navigate('MarketplaceDetail', { listingId: item.id });
                    }}
                  >
                    <View style={[s.sellerListingImg, { backgroundColor: C.border }]}>
                      {item.mediaUrls?.[0] ? <Image source={{ uri: item.mediaUrls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                    </View>
                    <Text style={[s.sellerListingPrice, { color: C.accent }]}>{formatPrice(item.price, language, t)}</Text>
                    <Text style={[s.sellerListingTitle, { color: C.text }]} numberOfLines={2}>{item.title}</Text>
                  </TouchableOpacity>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {reportOpen && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setReportOpen(false)}>
          <Pressable style={[s.modalBackdrop, { backgroundColor: 'rgba(0,0,0,0.55)' }]} onPress={() => setReportOpen(false)}>
            <Pressable style={[s.reportSheet, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={s.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sheetTitle, { color: C.text }]}>Báo cáo bài niêm yết</Text>
                  <Text style={[s.sheetSub, { color: C.subtext }]} numberOfLines={1}>{detailListing.title}</Text>
                </View>
                <TouchableOpacity style={[s.modalCloseBtn, { borderColor: C.border }]} onPress={() => setReportOpen(false)}>
                  <Ionicons name="close" size={20} color={C.text} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
                {REPORT_CATEGORIES.map((category) => {
                  const active = reportCategory === category.key;
                  return (
                    <TouchableOpacity
                      key={category.key}
                      style={[s.reportOption, { backgroundColor: active ? `${C.accent}1f` : C.card2, borderColor: active ? C.accent : C.border }]}
                      onPress={() => setReportCategory(category.key)}
                    >
                      <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? C.accent : C.subtext} />
                      <Text style={[s.reportOptionText, { color: C.text }]}>{category.label}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TextInput
                  style={[s.reportInput, { backgroundColor: C.card2, borderColor: C.border, color: C.text }]}
                  placeholder="Chi tiết bổ sung (không bắt buộc)"
                  placeholderTextColor={C.subtext}
                  value={reportDetails}
                  onChangeText={setReportDetails}
                  multiline
                  textAlignVertical="top"
                />
              </ScrollView>
              <View style={[s.reportActions, { borderTopColor: C.border }]}>
                <TouchableOpacity style={[s.reportCancelBtn, { borderColor: C.border }]} onPress={() => setReportOpen(false)}>
                  <Text style={[s.reportCancelText, { color: C.text }]}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.reportSubmitBtn, { backgroundColor: C.red, opacity: reportCategory && !reportSubmitting ? 1 : 0.55 }]}
                  onPress={submitReport}
                  disabled={!reportCategory || reportSubmitting}
                >
                  {reportSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={s.reportSubmitText}>Gửi báo cáo</Text>}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  retryBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 18, marginTop: 4 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  backBtn: {
    position: 'absolute', top: 50, left: 16, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },

  // Overlay buttons on image
  overlay: {
    position: 'absolute', top: 10, left: 16, right: 16,
    zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  overlayBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },

  // Dots
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4 },

  // Content
  price: { fontSize: 26, fontWeight: '800' },
  title: { fontSize: 18, fontWeight: '600', lineHeight: 26 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: '600' },

  divider: { height: 1, marginVertical: 14 },

  sectionLabel: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  desc: { fontSize: 14, lineHeight: 22 },
  noticeCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  noticeTitle: { fontSize: 13, fontWeight: '900' },
  noticeSub: { marginTop: 2, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  detailInfoCard: { width: '48.5%', borderRadius: 13, borderWidth: 1, padding: 11, gap: 4 },
  infoLabel: { fontSize: 11, fontWeight: '700' },
  infoValue: { fontSize: 13, fontWeight: '900' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  infoChip: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, fontWeight: '800' },

  // Seller card
  sellerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  sellerAvatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden' },
  sellerName: { fontSize: 15, fontWeight: '700' },
  profileBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },

  // Owner actions
  ownerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  ownerBtn: {
    minWidth: '30%', flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
  },
  ownerBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Bottom bar
  bottomBar: {
    padding: 16, borderTopWidth: 1,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bottomIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14, borderRadius: 16,
  },
  contactBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  sellerSheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  reportSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  sheetAvatar: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden' },
  sheetTitle: { fontSize: 19, fontWeight: '900' },
  sheetSub: { marginTop: 2, fontSize: 12, fontWeight: '700' },
  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerStats: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  sellerStat: { flex: 1, borderWidth: 1, borderRadius: 13, padding: 10, gap: 3 },
  sellerStatValue: { fontSize: 15, fontWeight: '900' },
  sellerStatLabel: { fontSize: 10.5, fontWeight: '700' },
  sheetActionsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16 },
  sheetPrimaryBtn: {
    flex: 1.2,
    minHeight: 42,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  sheetPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  sheetSecondaryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSecondaryText: { fontSize: 14, fontWeight: '900' },
  sellerListingCard: { width: 138, borderWidth: 1, borderRadius: 13, overflow: 'hidden' },
  sellerListingImg: { width: '100%', height: 98 },
  sellerListingPrice: { marginTop: 8, paddingHorizontal: 9, fontSize: 13, fontWeight: '900' },
  sellerListingTitle: { paddingHorizontal: 9, paddingBottom: 10, marginTop: 2, fontSize: 12, fontWeight: '800', lineHeight: 16 },
  reportOption: { minHeight: 46, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  reportOptionText: { flex: 1, fontSize: 13, fontWeight: '800' },
  reportInput: { minHeight: 92, borderRadius: 13, borderWidth: 1, padding: 12, fontSize: 13 },
  reportActions: { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1 },
  reportCancelBtn: { flex: 1, minHeight: 42, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  reportSubmitBtn: { flex: 1.25, minHeight: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  reportCancelText: { fontSize: 14, fontWeight: '900' },
  reportSubmitText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
