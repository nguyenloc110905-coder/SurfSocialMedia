import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
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
import { useGestureStore } from '@/lib/gestureState';
import { useAuthStore } from '@/stores/authStore';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import PostCard from '@/components/PostCard';
import MomentsBar from '@/components/MomentsBar';
import { useT } from '@/lib/i18n';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Feed'>;
  isActive?: boolean;
  scrollTopSignal?: number;
  resetSignal?: number;
  safeTop?: boolean;
  onCreatePost?: () => void;
  headerComponent?: React.ReactElement | null;
  onFloatingHeaderChange?: (visible: boolean, immediate?: boolean) => void;
  onScrollPositionChange?: (atTop: boolean) => void;
};
type Post = FeedPost;
type FeedListItem = string | Post;

const { width: SW } = Dimensions.get('window');
const MEDIA_W = SW - 24;

const DARK = {
  bg: '#0b1120', card: '#111827', card2: '#1f2937',
  border: '#243044', text: '#f8fafc', subtext: '#94a3b8',
  placeholder: '#334155', accent: '#38bdf8', accent2: '#8b5cf6', inputBg: '#151719',
  composerBg: '#15191c',
  composerBorder: '#3b485b',
  waveA: 'rgba(6, 182, 212, 0.22)', waveB: 'rgba(14, 165, 233, 0.13)', waveC: 'rgba(139, 92, 246, 0.11)',
};
const LIGHT = {
  bg: '#f3f7fb', card: '#ffffff', card2: '#f1f5f9',
  border: '#e2e8f0', text: '#0f172a', subtext: '#64748b',
  placeholder: '#e2e8f0', accent: '#0284c7', accent2: '#7c3aed', inputBg: '#ffffff',
  composerBg: '#ffffff',
  composerBorder: '#bfd2e5',
  waveA: 'rgba(6, 182, 212, 0.15)', waveB: 'rgba(14, 165, 233, 0.09)', waveC: 'rgba(139, 92, 246, 0.08)',
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
const FLOATING_HEADER_REVEAL_Y = 220;
const FLOATING_HEADER_SHOW_DISTANCE = 44;
const FLOATING_HEADER_HIDE_DISTANCE = 24;
const PROGRAMMATIC_SCROLL_SUPPRESS_MS = 900;
export default function FeedScreen({
  navigation,
  isActive = true,
  scrollTopSignal = 0,
  resetSignal = 0,
  safeTop = true,
  onCreatePost,
  headerComponent,
  onFloatingHeaderChange,
  onScrollPositionChange,
}: Props) {
  const scheme = useColorScheme();
  const t = useT();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const listRef = useRef<FlatList<string | Post>>(null);
  const lastScrollYRef = useRef(0);
  const pullIntentRef = useRef(0);
  const floatingHeaderVisibleRef = useRef(false);
  const suppressFloatingHeaderRef = useRef(false);
  const suppressFloatingHeaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollTopSignalRef = useRef(0);
  const lastResetSignalRef = useRef(0);
  const [visiblePostIds, setVisiblePostIds] = useState<Set<string>>(new Set());
  const user = useAuthStore((state) => state.user);
  const reactionPickerActive = useGestureStore((s) => s.reactionPickerActive);

  const posts         = useFeedStore((s) => s.posts);
  const loading       = useFeedStore((s) => s.loading);
  const loadingMore   = useFeedStore((s) => s.loadingMore);
  const refreshing    = useFeedStore((s) => s.refreshing);
  const error         = useFeedStore((s) => s.error);
  const fetchFeed     = useFeedStore((s) => s.fetch);
  const hasMore       = useFeedStore((s) => s.hasMore);
  const fetchMore     = useFeedStore((s) => s.fetchMore);
  const setRefreshing = useFeedStore((s) => s.setRefreshing);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  const setFloatingHeader = useCallback((visible: boolean, immediate = false) => {
    if (floatingHeaderVisibleRef.current === visible && !immediate) return;
    floatingHeaderVisibleRef.current = visible;
    pullIntentRef.current = 0;
    onFloatingHeaderChange?.(visible, immediate);
  }, [onFloatingHeaderChange]);

  const handleScroll = useCallback((event: any) => {
    const y = Math.max(0, event.nativeEvent.contentOffset.y);
    const dy = y - lastScrollYRef.current;

    if (suppressFloatingHeaderRef.current) {
      setFloatingHeader(false, true);
      pullIntentRef.current = 0;
      onScrollPositionChange?.(y < 12);
      if (y < FLOATING_HEADER_REVEAL_Y) {
        suppressFloatingHeaderRef.current = false;
        if (suppressFloatingHeaderTimerRef.current) {
          clearTimeout(suppressFloatingHeaderTimerRef.current);
          suppressFloatingHeaderTimerRef.current = null;
        }
      }
      lastScrollYRef.current = y;
      return;
    }

    if (y < FLOATING_HEADER_REVEAL_Y) {
      setFloatingHeader(false, true);
      pullIntentRef.current = 0;
    } else if (dy < -3) {
      pullIntentRef.current = Math.min(0, pullIntentRef.current) + dy;
      if (pullIntentRef.current < -FLOATING_HEADER_SHOW_DISTANCE) setFloatingHeader(true);
    } else if (dy > 3) {
      pullIntentRef.current = Math.max(0, pullIntentRef.current) + dy;
      if (pullIntentRef.current > FLOATING_HEADER_HIDE_DISTANCE) setFloatingHeader(false);
    } else {
      pullIntentRef.current *= 0.75;
    }

    onScrollPositionChange?.(y < 12);
    lastScrollYRef.current = y;
  }, [onScrollPositionChange, setFloatingHeader]);

  const scrollToTopFromTabPress = useCallback(() => {
    suppressFloatingHeaderRef.current = true;
    if (suppressFloatingHeaderTimerRef.current) clearTimeout(suppressFloatingHeaderTimerRef.current);
    suppressFloatingHeaderTimerRef.current = setTimeout(() => {
      suppressFloatingHeaderRef.current = false;
      suppressFloatingHeaderTimerRef.current = null;
    }, PROGRAMMATIC_SCROLL_SUPPRESS_MS);
    setFloatingHeader(false, true);
    onScrollPositionChange?.(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [onScrollPositionChange, setFloatingHeader]);

  useEffect(() => {
    if (!scrollTopSignal || scrollTopSignal === lastScrollTopSignalRef.current) return;
    lastScrollTopSignalRef.current = scrollTopSignal;
    scrollToTopFromTabPress();
  }, [scrollTopSignal, scrollToTopFromTabPress]);

  useEffect(() => {
    if (!resetSignal || resetSignal === lastResetSignalRef.current) return;
    lastResetSignalRef.current = resetSignal;
    scrollToTopFromTabPress();
  }, [resetSignal, scrollToTopFromTabPress]);

  useEffect(() => () => {
    if (suppressFloatingHeaderTimerRef.current) clearTimeout(suppressFloatingHeaderTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isActive) setVisiblePostIds(new Set());
  }, [isActive]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchFeed(true);
  }, [fetchFeed, setRefreshing]);

  const isFirstLoad = loading && posts.length === 0;
  const listData = useMemo<FeedListItem[]>(
    () => (isFirstLoad ? SKELETON_KEYS : posts),
    [isFirstLoad, posts]
  );
  const displayName = user?.displayName || user?.email || t('user_fallback');
  const initial = displayName.charAt(0).toUpperCase();
  const openCreatePost = useCallback(() => {
    if (onCreatePost) onCreatePost();
    else navigation.navigate('CreatePost' as never);
  }, [navigation, onCreatePost]);

  const renderItem = useCallback(({ item }: { item: FeedListItem }) =>
    typeof item === 'string'
      ? <SkeletonCard C={C} />
      : <PostCard post={item} isVisible={isActive && visiblePostIds.has(item.id)} navigation={navigation} />,
  [C, isActive, navigation, visiblePostIds]);

  const keyExtractor = useCallback((item: FeedListItem) =>
    typeof item === 'string' ? item : item.id,
  []);

  const handleEndReached = useCallback(() => {
    if (!isFirstLoad && !loadingMore) fetchMore();
  }, [fetchMore, isFirstLoad, loadingMore]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 65,
    minimumViewTime: 120,
  }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const ids = new Set<string>();
    viewableItems.forEach((token) => {
      const item = token.item as FeedListItem;
      if (token.isViewable && item && typeof item !== 'string') ids.add(item.id);
    });
    setVisiblePostIds(ids);
  }).current;

  const composer = useMemo(() => (
    <View style={s.composerOuter}>
      <View style={[s.composerShell, { backgroundColor: C.composerBg, borderColor: C.composerBorder }]}>
        <View style={[s.waveBandTop, { backgroundColor: C.waveA }]} />
        <View style={[s.waveBandBottom, { backgroundColor: C.waveB }]} />
        <View style={[s.waveBandMiddle, { backgroundColor: C.waveC }]} />
        <View style={s.composerTopRow}>
          <TouchableOpacity
            style={[s.composerAvatar, { borderColor: scheme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(2,132,199,0.18)' }]}
            onPress={() => navigation.navigate('Profile', { userId: user?.uid } as never)}
            activeOpacity={0.78}
          >
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={s.composerAvatarImg} />
            ) : (
              <View style={[s.composerAvatarImg, { backgroundColor: C.accent }]}>
                <Text style={s.composerAvatarText}>{initial}</Text>
              </View>
            )}
            <View style={[s.onlineDot, { borderColor: scheme === 'dark' ? '#0b1120' : '#fff' }]} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.composerInput, { borderColor: C.composerBorder, backgroundColor: C.inputBg }]}
            onPress={openCreatePost}
            activeOpacity={0.82}
          >
            <Text style={[s.composerText, { color: C.text }]} numberOfLines={1} ellipsizeMode="tail">
              🌊 Chia sẻ làn sóng cảm xúc của bạn...
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  ), [C, initial, navigation, openCreatePost, scheme, user?.photoURL, user?.uid]);

  const listHeader = useMemo(() => (
    <>
      {headerComponent}
      {composer}
      <MomentsBar navigation={navigation} />
    </>
  ), [composer, headerComponent, navigation]);

  const listFooter = useMemo(() => {
    if (loadingMore && !isFirstLoad) {
      return <View style={s.footerLoading}><ActivityIndicator color={C.accent} /></View>;
    }

    if (!isFirstLoad && posts.length > 0 && !hasMore) {
      return (
        <View style={s.caughtUpWrap}>
          <Ionicons name="checkmark-circle-outline" size={28} color={C.subtext} />
          <Text style={{ color: C.subtext, fontSize: 13 }}>{t('feed_all_caught_up')}</Text>
        </View>
      );
    }

    return null;
  }, [C.accent, C.subtext, hasMore, isFirstLoad, loadingMore, posts.length, t]);

  const listEmpty = useMemo(() => {
    if (isFirstLoad) return null;

    if (error) {
      return (
        <View style={s.emptyWrap}>
          <Ionicons name="cloud-offline-outline" size={52} color={C.subtext} />
          <Text style={[s.emptyTitle, { color: C.text }]}>{t('feed_load_error')}</Text>
          <Text style={[s.emptySub, { color: C.subtext }]}>{error}</Text>
          <TouchableOpacity style={[s.retryBtn, { borderColor: C.accent }]} onPress={() => fetchFeed(true)}>
            <Text style={[s.retryText, { color: C.accent }]}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={s.emptyWrap}>
        <Ionicons name="newspaper-outline" size={52} color={C.subtext} />
        <Text style={[s.emptyTitle, { color: C.text }]}>{t('feed_empty_title')}</Text>
        <Text style={[s.emptySub, { color: C.subtext }]}>{t('feed_empty_subtitle')}</Text>
      </View>
    );
  }, [C.accent, C.subtext, C.text, error, fetchFeed, isFirstLoad, t]);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={safeTop ? ['top'] : []}>
      <FlatList
        ref={listRef}
        data={listData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        extraData={`${isActive}:${isFirstLoad}:${Array.from(visiblePostIds).join(',')}`}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isFirstLoad && !reactionPickerActive}
        removeClippedSubviews
        initialNumToRender={5}
        maxToRenderPerBatch={4}
        windowSize={7}
        updateCellsBatchingPeriod={80}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onEndReached={handleEndReached}
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
        ListFooterComponent={listFooter}
        ListEmptyComponent={listEmpty}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 16 },
  composerOuter: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  composerShell: {
    minHeight: 88,
    borderRadius: 22,
    borderWidth: 1.5,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#0ea5e9',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    justifyContent: 'center',
  },
  waveBandTop: {
    position: 'absolute',
    left: -32,
    right: -32,
    top: -22,
    height: 76,
    borderBottomLeftRadius: 120,
    borderBottomRightRadius: 95,
    transform: [{ rotate: '-2deg' }],
  },
  waveBandMiddle: {
    position: 'absolute',
    left: -42,
    right: -42,
    top: 38,
    height: 58,
    borderTopLeftRadius: 100,
    borderBottomRightRadius: 120,
    transform: [{ rotate: '3deg' }],
  },
  waveBandBottom: {
    position: 'absolute',
    left: -26,
    right: -26,
    bottom: -32,
    height: 78,
    borderTopLeftRadius: 140,
    borderTopRightRadius: 88,
    transform: [{ rotate: '-1deg' }],
  },
  composerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  composerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  composerAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    backgroundColor: '#22c55e',
  },
  composerInput: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    minWidth: 0,
  },
  composerText: { flex: 1, fontSize: 13, fontWeight: '600', opacity: 0.8 },
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  avatarCircle: { width: 40, height: 40, borderRadius: 20 },
  skLine: { height: 12, borderRadius: 6, marginBottom: 2 },
  mediaArea: { width: MEDIA_W, height: MEDIA_W * 0.5625, alignSelf: 'center' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4, borderTopWidth: 1 },
  footerLoading: { paddingVertical: 20 },
  caughtUpWrap: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  retryBtn: { marginTop: 8, borderWidth: 1, borderRadius: 20, paddingHorizontal: 24, paddingVertical: 8 },
  retryText: { fontSize: 14, fontWeight: '600' },
});
