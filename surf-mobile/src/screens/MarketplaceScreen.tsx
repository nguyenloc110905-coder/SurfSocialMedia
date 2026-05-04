import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  RefreshControl,
  Animated,
  Alert,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import {
  useMarketplaceStore,
  type Listing,
  type Category,
} from '@/stores/marketplaceStore';
import { useAuthStore } from '@/stores/authStore';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Marketplace'>;
};

// ── Theme ─────────────────────────────────────────────────────────────────────
const DARK = {
  bg: '#0f172a',
  card: '#1e293b',
  border: '#334155',
  text: '#e2e8f0',
  subtext: '#64748b',
  accent: '#0ea5e9',
  accent2: '#06b6d4',
  pill: '#1e3a5f',
  pillActive: '#0ea5e9',
  input: '#1e293b',
  placeholder: '#475569',
  green: '#22c55e',
  red: '#ef4444',
};
const LIGHT = {
  bg: '#f1f5f9',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#1e293b',
  subtext: '#64748b',
  accent: '#0ea5e9',
  accent2: '#06b6d4',
  pill: '#e0f2fe',
  pillActive: '#0ea5e9',
  input: '#ffffff',
  placeholder: '#94a3b8',
  green: '#16a34a',
  red: '#dc2626',
};

// ── Category definitions ───────────────────────────────────────────────────────
const CATEGORIES: { key: Category; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all',         label: 'Tất cả',    icon: 'grid-outline' },
  { key: 'electronics', label: 'Điện tử',   icon: 'phone-portrait-outline' },
  { key: 'clothing',    label: 'Thời trang', icon: 'shirt-outline' },
  { key: 'vehicles',   label: 'Xe cộ',      icon: 'car-outline' },
  { key: 'home',       label: 'Gia dụng',   icon: 'home-outline' },
  { key: 'sports',     label: 'Thể thao',   icon: 'football-outline' },
  { key: 'other',      label: 'Khác',       icon: 'ellipsis-horizontal-outline' },
];

const CONDITION_LABELS: Record<string, string> = {
  new: 'Mới',
  like_new: 'Như mới',
  good: 'Tốt',
  fair: 'Khá',
};

const { width: SW } = Dimensions.get('window');
const CARD_W = (SW - 36) / 2;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatPrice(price: number): string {
  if (price === 0) return 'Miễn phí';
  if (price >= 1_000_000_000) return `${(price / 1_000_000_000).toFixed(1)} tỷ`;
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)} triệu`;
  if (price >= 1_000) return `${(price / 1_000).toFixed(0)}k`;
  return price.toLocaleString('vi-VN') + ' đ';
}

// ── Skeleton card ──────────────────────────────────────────────────────────────
function SkeletonCard({ C }: { C: typeof DARK }) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  return (
    <Animated.View
      style={[s.card, { backgroundColor: C.card, width: CARD_W, opacity: anim }]}
    >
      <View style={[s.cardImg, { backgroundColor: C.border }]} />
      <View style={{ padding: 8, gap: 6 }}>
        <View style={{ height: 10, borderRadius: 4, backgroundColor: C.border, width: '80%' }} />
        <View style={{ height: 12, borderRadius: 4, backgroundColor: C.border, width: '50%' }} />
        <View style={{ height: 8, borderRadius: 4, backgroundColor: C.border, width: '60%' }} />
      </View>
    </Animated.View>
  );
}

// ── Listing card ──────────────────────────────────────────────────────────────
function ListingCard({
  item,
  C,
  onPress,
  userId,
  onSave,
}: {
  item: Listing;
  C: typeof DARK;
  onPress: () => void;
  userId?: string;
  onSave: (id: string) => Promise<void>;
}) {
  const isSaved = item.savedBy?.includes(userId ?? '');
  const imgUri = item.mediaUrls?.[0];
  const isNew = item.condition === 'new' || item.condition === 'like_new';

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: C.card, width: CARD_W, borderColor: C.border }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      {/* Image */}
      <View style={[s.cardImg, { backgroundColor: C.border }]}>
        {imgUri ? (
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="image-outline" size={32} color={C.subtext} />
          </View>
        )}
        {/* Save button */}
        <TouchableOpacity
          style={[s.saveFab, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
          onPress={(event: GestureResponderEvent) => {
            event.stopPropagation();
            onSave(item.id);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isSaved ? 'bookmark' : 'bookmark-outline'}
            size={16}
            color={isSaved ? C.accent : '#fff'}
          />
        </TouchableOpacity>
        {/* Condition badge */}
        {isNew && (
          <View style={[s.condBadge, { backgroundColor: C.green }]}>
            <Text style={s.condBadgeText}>{CONDITION_LABELS[item.condition]}</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={{ padding: 9 }}>
        {/* Price */}
        <Text style={[s.price, { color: item.price === 0 ? C.green : C.accent }]} numberOfLines={1}>
          {formatPrice(item.price)}
        </Text>
        {/* Title */}
        <Text style={[s.cardTitle, { color: C.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        {/* Location */}
        {item.location ? (
          <View style={s.locRow}>
            <Ionicons name="location-outline" size={10} color={C.subtext} />
            <Text style={[s.locText, { color: C.subtext }]} numberOfLines={1}>
              {item.location}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function MarketplaceScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const user = useAuthStore((s) => s.user);

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
    fetchListings,
    setCategory,
    search,
    setSearchQuery,
    toggleSave,
  } = useMarketplaceStore();

  const [isSearchMode, setIsSearchMode] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch on mount
  useEffect(() => {
    fetchListings(true);
  }, [fetchListings]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Debounced search
  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q.trim()) search(q);
      else setSearchQuery('');
    }, 400);
  }, [search, setSearchQuery]);

  const handleSave = useCallback(async (id: string) => {
    try {
      await toggleSave(id);
    } catch (e) {
      Alert.alert('Lỗi', (e as Error).message ?? 'Không thể lưu tin đăng.');
    }
  }, [toggleSave]);

  const handleEndReached = useCallback(() => {
    if (isSearchMode && searchQuery.trim()) return;
    if (!loading && nextCursor) fetchListings(false);
  }, [isSearchMode, searchQuery, loading, nextCursor, fetchListings]);

  const isShowingSearch = isSearchMode && !!searchQuery.trim();
  const displayedListings = isShowingSearch ? searchResults : listings;
  const contentLoading = isShowingSearch ? searching : loading;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>

      {/* ── Header ── */}
      <View style={[s.header, { borderBottomColor: C.border }]}>
        {isSearchMode ? (
          <View style={[s.searchBar, { backgroundColor: C.input, borderColor: C.border }]}>
            <Ionicons name="search" size={16} color={C.subtext} />
            <TextInput
              ref={searchRef}
              style={[s.searchInput, { color: C.text }]}
              placeholder="Tìm kiếm sản phẩm..."
              placeholderTextColor={C.placeholder}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoFocus
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); search(''); }}>
                <Ionicons name="close-circle" size={16} color={C.subtext} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={[s.headerTitle, { color: C.text }]}>Chợ</Text>
        )}

        <View style={s.headerActions}>
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: C.card, borderColor: C.border }]}
            onPress={() => {
              const next = !isSearchMode;
              setIsSearchMode(next);
              if (next) {
                setTimeout(() => searchRef.current?.focus(), 100);
              } else {
                setSearchQuery('');
                search('');
              }
            }}
          >
            <Ionicons name={isSearchMode ? 'close' : 'search-outline'} size={20} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: C.card, borderColor: C.border }]}
            onPress={() => navigation.navigate('MyListings')}
          >
            <Ionicons name="storefront-outline" size={20} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Category pills ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.pills}
        style={{ flexGrow: 0 }}
      >
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[
                s.pill,
                {
                  backgroundColor: isActive ? C.pillActive : C.pill,
                  borderColor: isActive ? C.accent : 'transparent',
                },
              ]}
              onPress={() => {
                setIsSearchMode(false);
                setCategory(cat.key);
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={cat.icon}
                size={14}
                color={isActive ? '#fff' : C.text}
                style={{ marginRight: 4 }}
              />
              <Text style={[s.pillLabel, { color: isActive ? '#fff' : C.text }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Content ── */}
      {contentLoading && displayedListings.length === 0 ? (
        // Skeleton loading
        <ScrollView
          contentContainerStyle={[s.grid, { paddingHorizontal: 12, paddingTop: 12 }]}
          scrollEnabled={false}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} C={C} />
          ))}
        </ScrollView>
      ) : error && displayedListings.length === 0 && !contentLoading ? (
        <View style={s.empty}>
          <Ionicons name="warning-outline" size={56} color={C.red} />
          <Text style={[s.emptyTitle, { color: C.text }]}>Không thể tải marketplace</Text>
          <Text style={[s.emptySub, { color: C.subtext }]}>{error}</Text>
          <TouchableOpacity
            style={[s.retryBtn, { backgroundColor: C.accent }]}
            onPress={() => isShowingSearch ? search(searchQuery) : fetchListings(true)}
          >
            <Text style={s.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : displayedListings.length === 0 && !contentLoading ? (
        <View style={s.empty}>
          <Ionicons name="storefront-outline" size={56} color={C.subtext} />
          <Text style={[s.emptyTitle, { color: C.text }]}>
            {isSearchMode ? 'Không tìm thấy kết quả' : 'Chưa có sản phẩm'}
          </Text>
          <Text style={[s.emptySub, { color: C.subtext }]}>
            {isSearchMode ? 'Thử từ khóa khác' : 'Hãy là người đăng tin đầu tiên!'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayedListings}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 100 }}
          columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
          renderItem={({ item }) => (
            <ListingCard
              item={item}
              C={C}
              onPress={() => navigation.navigate('MarketplaceDetail', { listingId: item.id })}
              userId={user?.uid}
              onSave={handleSave}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => isShowingSearch ? search(searchQuery) : fetchListings(true)}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            searching && isShowingSearch ? (
              <ActivityIndicator color={C.accent} style={{ paddingVertical: 16 }} />
            ) : loading && !isShowingSearch && listings.length > 0 ? (
              <ActivityIndicator color={C.accent} style={{ paddingVertical: 16 }} />
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── FAB ── */}
      <TouchableOpacity
        style={[s.fab, { backgroundColor: C.accent }]}
        onPress={() => navigation.navigate('CreateListing')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },

  // Search
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderRadius: 22, borderWidth: 1, paddingHorizontal: 12, height: 38,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  // Category pills
  pills: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  pillLabel: { fontSize: 13, fontWeight: '600' },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  // Card
  card: {
    borderRadius: 24, borderWidth: 1,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  cardImg: { width: '100%', height: CARD_W, overflow: 'hidden' },
  saveFab: {
    position: 'absolute', top: 10, right: 10,
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  condBadge: {
    position: 'absolute', top: 10, left: 10,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 12,
  },
  condBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  price: { fontSize: 16, fontWeight: '900', marginBottom: 2 },
  cardTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18, marginBottom: 6 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  locText: { fontSize: 11, flex: 1, fontWeight: '700' },

  // Empty
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center', tracking: -0.5 },
  emptySub: { fontSize: 14, textAlign: 'center', opacity: 0.8 },
  retryBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 18, marginTop: 4 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // FAB
  fab: {
    position: 'absolute', bottom: 30, right: 20,
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    elevation: 8,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
});
