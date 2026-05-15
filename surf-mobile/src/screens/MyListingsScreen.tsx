import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Alert,
  RefreshControl,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useMarketplaceStore, type Listing } from '@/stores/marketplaceStore';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MyListings'>;
};

const DARK = {
  bg: '#0f172a', card: '#1e293b', border: '#334155',
  text: '#e2e8f0', subtext: '#64748b', accent: '#0ea5e9',
  green: '#22c55e', red: '#ef4444',
};
const LIGHT = {
  bg: '#f1f5f9', card: '#ffffff', border: '#e2e8f0',
  text: '#1e293b', subtext: '#64748b', accent: '#0ea5e9',
  green: '#16a34a', red: '#dc2626',
};

function formatPrice(price: number): string {
  if (price === 0) return 'Miễn phí';
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)} triệu`;
  if (price >= 1_000) return `${(price / 1_000).toFixed(0)}k`;
  return price.toLocaleString('vi-VN') + ' đ';
}

function MyListingRow({
  item,
  C,
  onPress,
  onDelete,
  onMarkSold,
}: {
  item: Listing;
  C: typeof DARK;
  onPress: () => void;
  onDelete: () => void;
  onMarkSold: () => void;
}) {
  const imgUri = item.mediaUrls?.[0];
  const isSold = item.status === 'sold';

  return (
    <TouchableOpacity
      style={[s.row, { backgroundColor: C.card, borderColor: C.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Image */}
      <View style={[s.rowImg, { backgroundColor: C.border }]}>
        {imgUri ? (
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={24} color={C.subtext} />
        )}
        {isSold && (
          <View style={[StyleSheet.absoluteFill, s.soldOverlay]}>
            <Text style={s.soldText}>ĐÃ BÁN</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[s.rowPrice, { color: isSold ? C.subtext : C.accent }]}>
          {formatPrice(item.price)}
        </Text>
        {item.location ? (
          <Text style={{ color: C.subtext, fontSize: 12 }} numberOfLines={1}>
            📍 {item.location}
          </Text>
        ) : null}
        <Text style={{ color: C.subtext, fontSize: 11 }}>{item.viewCount ?? 0} lượt xem</Text>
      </View>

      {/* Actions */}
      {!isSold && (
        <View style={s.rowActions}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: C.green + '22' }]}
            onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              onMarkSold();
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color={C.green} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: C.red + '22' }]}
            onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Ionicons name="trash-outline" size={18} color={C.red} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function MyListingsScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const { myListings, myListingsLoading, error, fetchMyListings, deleteListing, markAsSold } =
    useMarketplaceStore();

  useEffect(() => {
    fetchMyListings();
  }, [fetchMyListings]);

  const confirmDelete = (id: string) => {
    Alert.alert('Xóa tin đăng', 'Bạn có chắc muốn xóa tin đăng này không?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteListing(id);
          } catch (e) {
            Alert.alert('Lỗi', (e as Error).message ?? 'Không thể xóa tin đăng.');
          }
        },
      },
    ]);
  };

  const confirmMarkSold = (id: string) => {
    Alert.alert('Đánh dấu đã bán', 'Tin này sẽ không còn hiển thị trong chợ. Tiếp tục?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đã bán',
        onPress: async () => {
          try {
            await markAsSold(id);
          } catch (e) {
            Alert.alert('Lỗi', (e as Error).message ?? 'Không thể cập nhật tin đăng.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>

      {/* Header */}
      <View style={[s.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]}>Tin của tôi</Text>
        <TouchableOpacity
          style={[s.postBtn, { backgroundColor: C.accent }]}
          onPress={() => navigation.navigate('CreateListing')}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={s.postBtnText}>Đăng tin</Text>
        </TouchableOpacity>
      </View>

      {myListingsLoading && myListings.length === 0 ? (
        <ActivityIndicator color={C.accent} size="large" style={{ marginTop: 40 }} />
      ) : error && myListings.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="warning-outline" size={52} color={C.red} />
          <Text style={[s.emptyTitle, { color: C.text }]}>Không thể tải tin của tôi</Text>
          <Text style={[s.emptySub, { color: C.subtext }]}>{error}</Text>
          <TouchableOpacity
            style={[s.createBtn, { backgroundColor: C.accent }]}
            onPress={() => fetchMyListings()}
          >
            <Text style={s.createBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : myListings.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="storefront-outline" size={52} color={C.subtext} />
          <Text style={[s.emptyTitle, { color: C.text }]}>Bạn chưa có tin đăng nào</Text>
          <TouchableOpacity
            style={[s.createBtn, { backgroundColor: C.accent }]}
            onPress={() => navigation.navigate('CreateListing')}
          >
            <Text style={s.createBtnText}>Đăng tin ngay</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={myListings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          renderItem={({ item }) => (
            <MyListingRow
              item={item}
              C={C}
              onPress={() => navigation.navigate('MarketplaceDetail', { listingId: item.id })}
              onDelete={() => confirmDelete(item.id)}
              onMarkSold={() => confirmMarkSold(item.id)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={myListingsLoading}
              onRefresh={() => fetchMyListings()}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  postBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  postBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Row
  row: {
    flexDirection: 'row', borderRadius: 14, borderWidth: 1,
    overflow: 'hidden', alignItems: 'center', gap: 12, padding: 10,
  },
  rowImg: {
    width: 80, height: 80, borderRadius: 10, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  soldOverlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  soldText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  rowPrice: { fontSize: 15, fontWeight: '800' },

  rowActions: { gap: 8 },
  actionBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  // Empty
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  createBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, marginTop: 4 },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
