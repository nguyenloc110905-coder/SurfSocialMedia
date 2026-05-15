import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Animated,
  RefreshControl,
  useColorScheme,
  Dimensions,
  ActivityIndicator,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFeedStore, type FeedPost } from '@/stores/feedStore';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import PostCard from '@/components/PostCard';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Feed'> };
type Post = FeedPost;

const { width: SW } = Dimensions.get('window');
const MEDIA_W = SW - 24;

const DARK = {
  bg: '#0f172a', card: '#1e293b', card2: '#253347',
  border: '#334155', text: '#e2e8f0', subtext: '#64748b',
  placeholder: '#334155', accent: '#0ea5e9', inputBg: '#253347',
};
const LIGHT = {
  bg: '#f8fafc', card: '#ffffff', card2: '#f1f5f9',
  border: '#e2e8f0', text: '#1f2937', subtext: '#64748b',
  placeholder: '#e2e8f0', accent: '#0ea5e9', inputBg: '#f1f5f9',
};

function SkeletonCard({ C }: { C: typeof DARK }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);
  return (
    <Animated.View style={[s.card, { backgroundColor: C.card, borderColor: C.border, opacity: pulse }]}>
      <View style={s.cardHeader}>
        <View style={[s.avatarCircle, { backgroundColor: C.placeholder }]} />
        <View style={{ flex: 1, marginLeft: 10, gap: 6 }}>
          <View style={[s.skLine, { backgroundColor: C.placeholder, width: '42%' }]} />
          <View style={[s.skLine, { backgroundColor: C.placeholder, width: '26%' }]} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 12, gap: 8, marginBottom: 10 }}>
        <View style={[s.skLine, { backgroundColor: C.placeholder, width: '88%' }]} />
        <View style={[s.skLine, { backgroundColor: C.placeholder, width: '65%' }]} />
      </View>
      <View style={[s.mediaArea, { backgroundColor: C.placeholder }]} />
      <View style={[s.actionsRow, { borderTopColor: C.border }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[s.skLine, { width: 60, height: 14, backgroundColor: C.placeholder }]} />
        ))}
      </View>
    </Animated.View>
  );
}

const SKELETON_KEYS = ['sk1', 'sk2', 'sk3', 'sk4', 'sk5'];

export default function FeedScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;

  const posts         = useFeedStore((s) => s.posts);
  const loading       = useFeedStore((s) => s.loading);
  const loadingMore   = useFeedStore((s) => s.loadingMore);
  const refreshing    = useFeedStore((s) => s.refreshing);
  const error         = useFeedStore((s) => s.error);
  const fetchFeed     = useFeedStore((s) => s.fetch);
  const hasMore       = useFeedStore((s) => s.hasMore);
  const fetchMore     = useFeedStore((s) => s.fetchMore);
  const setRefreshing = useFeedStore((s) => s.setRefreshing);

  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    setVisibleIds(
      new Set(
        viewableItems
          .filter((v) => typeof v.item !== 'string')
          .map((v) => (v.item as Post).id)
      )
    );
  }).current;

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFeed(true);
  }, [fetchFeed, setRefreshing]);

  const isFirstLoad = loading && posts.length === 0;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      <FlatList
        data={(isFirstLoad ? SKELETON_KEYS : posts) as (string | Post)[]}
        keyExtractor={(item) => (typeof item === 'string' ? item : (item as Post).id)}
        renderItem={({ item }) =>
          typeof item === 'string'
            ? <SkeletonCard C={C} />
            : <PostCard post={item as Post} isVisible={visibleIds.has((item as Post).id)} navigation={navigation} />
        }
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isFirstLoad}
        onEndReached={() => { if (!isFirstLoad) fetchMore(); }}
        onEndReachedThreshold={0.4}
        refreshControl={
          isFirstLoad ? undefined : (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          )
        }
        ListFooterComponent={
          loadingMore && !isFirstLoad
            ? <View style={{ paddingVertical: 20 }}><ActivityIndicator color={C.accent} /></View>
            : !isFirstLoad && posts.length > 0 && !hasMore
            ? (
                <View style={{ alignItems: 'center', paddingVertical: 24, gap: 6 }}>
                  <Ionicons name="checkmark-circle-outline" size={28} color={C.subtext} />
                  <Text style={{ color: C.subtext, fontSize: 13 }}>Da xem het bai viet</Text>
                </View>
              )
            : null
        }
        ListEmptyComponent={
          isFirstLoad ? null : error ? (
            <View style={s.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={52} color={C.subtext} />
              <Text style={[s.emptyTitle, { color: C.text }]}>Khong the tai feed</Text>
              <Text style={[s.emptySub, { color: C.subtext }]}>{error}</Text>
              <TouchableOpacity style={[s.retryBtn, { borderColor: C.accent }]} onPress={() => fetchFeed(true)}>
                <Text style={[s.retryText, { color: C.accent }]}>Thu lai</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.emptyWrap}>
              <Ionicons name="newspaper-outline" size={52} color={C.subtext} />
              <Text style={[s.emptyTitle, { color: C.text }]}>Chua co bai dang</Text>
              <Text style={[s.emptySub, { color: C.subtext }]}>Ket noi voi ban be de xem bai viet cua ho</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 16 },
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  avatarCircle: { width: 40, height: 40, borderRadius: 20 },
  skLine: { height: 12, borderRadius: 6, marginBottom: 2 },
  mediaArea: { width: MEDIA_W, height: MEDIA_W * 0.5625, alignSelf: 'center' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4, borderTopWidth: 1 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  retryBtn: { marginTop: 8, borderWidth: 1, borderRadius: 20, paddingHorizontal: 24, paddingVertical: 8 },
  retryText: { fontSize: 14, fontWeight: '600' },
});
