import React, { useEffect, useState, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { useAuthStore } from '@/stores/authStore';
import { useLanguage, useT, type I18nKey } from '@/lib/i18n';
import { api } from '@/lib/api';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MarketplaceDetail'>;
  route: RouteProp<RootStackParamList, 'MarketplaceDetail'>;
};

// ── Theme ─────────────────────────────────────────────────────────────────────
const DARK = {
  bg: '#0f172a', card: '#1e293b', border: '#334155',
  text: '#e2e8f0', subtext: '#64748b', accent: '#0ea5e9',
  green: '#22c55e', red: '#ef4444', pill: '#1e3a5f',
};
const LIGHT = {
  bg: '#f1f5f9', card: '#ffffff', border: '#e2e8f0',
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

const { width: SW } = Dimensions.get('window');

export default function MarketplaceDetailScreen({ navigation, route }: Props) {
  const t = useT();
  const language = useLanguage();
  const { listingId } = route.params;
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;

  const { detailListing, detailLoading, error, fetchDetail, toggleSave, deleteListing, markAsSold } =
    useMarketplaceStore();
  const user = useAuthStore((s) => s.user);

  const [activeImg, setActiveImg] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);

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

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: C.border }]} />

          {/* Description */}
          <Text style={[s.sectionLabel, { color: C.text }]}>{t('market_description')}</Text>
          <Text style={[s.desc, { color: C.subtext }]}>
            {detailListing.description || t('market_no_description')}
          </Text>

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
              onPress={() => navigation.navigate('Profile', { userId: detailListing.sellerId })}
            >
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>{t('view_profile')}</Text>
            </TouchableOpacity>
          </View>

          {/* Owner actions */}
          {isOwner && (
            <View style={[s.ownerActions]}>
              {detailListing.status !== 'sold' && (
                <TouchableOpacity
                  style={[s.ownerBtn, { backgroundColor: C.green }]}
                  onPress={confirmMarkSold}
                  disabled={actionLoading}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={s.ownerBtnText}>{t('mark_sold')}</Text>
                </TouchableOpacity>
              )}
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
  ownerActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  ownerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
  },
  ownerBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Bottom bar
  bottomBar: {
    padding: 16, borderTopWidth: 1,
    paddingBottom: 24,
  },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14, borderRadius: 16,
  },
  contactBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
