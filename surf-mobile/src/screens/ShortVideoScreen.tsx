import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

type ShortVideo = {
  _source?: 'clip' | 'post';
  id: string;
  authorId?: string;
  authorDisplayName?: string;
  authorPhotoURL?: string | null;
  title?: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string | null;
  likeCount?: number;
  likedBy?: string[];
  commentCount?: number;
  viewCount?: number;
};

type FeedResponse = {
  videos: ShortVideo[];
  hasMore?: boolean;
  nextCursor?: number | null;
};

type CommentItem = {
  id: string;
  authorDisplayName?: string;
  authorPhotoURL?: string | null;
  content: string;
};

function optimizeCloudinaryVideo(url: string) {
  if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload/')) return url;
  return url.replace('/video/upload/', '/video/upload/q_auto:eco,w_720,f_auto/');
}

function cloudinaryVideoThumbnail(url: string) {
  if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload/')) return null;
  return url
    .replace('/video/upload/', '/image/upload/w_720,q_auto,f_jpg,so_0/')
    .replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg');
}

function fmtCount(value = 0) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function VideoItem({
  item,
  active,
  height,
  liked,
  onLike,
  onComment,
}: {
  item: ShortVideo;
  active: boolean;
  height: number;
  liked: boolean;
  onLike: () => void;
  onComment: () => void;
}) {
  const player = useVideoPlayer(optimizeCloudinaryVideo(item.videoUrl), (p) => {
    p.loop = true;
    p.muted = false;
  });
  const [buffering, setBuffering] = useState(true);
  const [muted, setMuted] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [isLandscapeVideo, setIsLandscapeVideo] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speeding, setSpeeding] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [progressWidth, setProgressWidth] = useState(1);
  const [screenDim, setScreenDim] = useState(Dimensions.get('screen'));
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRef = useRef(false);
  const pressDurationRef = useRef(0);
  const heartScale = useRef(new Animated.Value(0)).current;
  const thumbnail = item.thumbnailUrl || cloudinaryVideoThumbnail(item.videoUrl);

  useEffect(() => {
    player.timeUpdateEventInterval = 0.25;
    const sub = player.addListener('statusChange', (payload: { status: string }) => {
      setBuffering(payload.status === 'idle' || payload.status === 'loading');
    });
    const playSub = player.addListener('playingChange', (payload: { isPlaying: boolean }) => {
      setPaused(!payload.isPlaying);
    });
    const timeSub = player.addListener('timeUpdate', (payload: { currentTime: number }) => {
      setCurrentTime(payload.currentTime);
      setDuration(player.duration || 0);
    });
    const sourceSub = player.addListener(
      'sourceLoad',
      (payload: { duration: number; availableVideoTracks?: Array<{ size?: { width?: number; height?: number } }> }) => {
        setDuration(payload.duration || 0);
        const size = payload.availableVideoTracks?.[0]?.size;
        if (size?.width && size?.height) setIsLandscapeVideo(size.width > size.height);
      }
    );
    
    const dimSub = Dimensions.addEventListener('change', ({ screen }) => {
      setScreenDim(screen);
    });

    return () => {
      sub.remove();
      playSub.remove();
      timeSub.remove();
      sourceSub.remove();
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      dimSub?.remove?.();
    };
  }, [player]);

  useEffect(() => {
    try {
      if (active && !paused) player.play();
      else player.pause();
    } catch {
      // Native player can be mid-transition while FlatList recycles rows.
    }
  }, [active, paused, player]);

  useEffect(() => {
    if (!thumbnail) return;
    Image.getSize(
      thumbnail,
      (width, imageHeight) => setIsLandscapeVideo(width > imageHeight),
      () => {}
    );
  }, [thumbnail]);

  // Auto-hide controls when playing
  useEffect(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }

    // Show controls when paused or buffering
    if (paused || buffering) {
      setShowControls(true);
      return;
    }

    // Auto-hide after 3 seconds when playing
    hideControlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => {
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
    };
  }, [paused, buffering]);

  const pulseHeart = () => {
    heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, friction: 4 }),
      Animated.timing(heartScale, { toValue: 0, duration: 320, delay: 360, useNativeDriver: true }),
    ]).start();
  };

  const handlePressIn = () => {
    pressDurationRef.current = Date.now();
    longPressRef.current = false;
  };

  const handlePressOut = () => {
    const duration = Date.now() - pressDurationRef.current;
    
    // Nếu long press (>= 260ms), không làm gì
    if (longPressRef.current || duration >= 260) {
      longPressRef.current = false;
      return;
    }

    // Tap ngắn: kiểm tra double tap
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    // Double tap (< 280ms)
    if (timeSinceLastTap < 280 && lastTapRef.current > 0) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      pulseHeart();
      if (!liked) onLike();
      lastTapRef.current = 0;
      return;
    }

    // Single tap: chờ 280ms để xem có double tap không
    lastTapRef.current = now;
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
    }
    singleTapTimerRef.current = setTimeout(() => {
      if (lastTapRef.current === now) {
        // Đây là single tap
        setPaused((nextPaused) => {
          const next = !nextPaused;
          try {
            next ? player.pause() : player.play();
          } catch {
            // ignore player transition
          }
          return next;
        });
      }
      singleTapTimerRef.current = null;
    }, 280);
  };

  const startFastForward = () => {
    longPressRef.current = true;
    setSpeeding(true);
    try {
      player.playbackRate = 2;
    } catch {
      // ignore unsupported rate changes
    }
  };

  const stopFastForward = () => {
    if (!speeding) return;
    setSpeeding(false);
    longPressRef.current = false;
    try {
      player.playbackRate = 1;
    } catch {
      // ignore unsupported rate changes
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  };

  const toggleOrientation = async () => {
    try {
      const next = !landscape;
      setLandscape(next);
      await ScreenOrientation.lockAsync(
        next
          ? ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
          : ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
    } catch {
      setLandscape((current) => !current);
    }
  };

  const seek = (locationX: number, width: number) => {
    if (!duration || width <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / width));
    const nextTime = ratio * duration;
    try {
      player.currentTime = nextTime;
      setCurrentTime(nextTime);
    } catch {
      // ignore seek errors while loading
    }
  };

  const caption = item.description || item.title || '';

  return (
    <View style={[s.item, { height }]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPressIn={handlePressIn}
        onPressOut={() => {
          if (longPressRef.current) {
            stopFastForward();
          } else {
            handlePressOut();
          }
        }}
        onLongPress={startFastForward}
        delayLongPress={260}
      >
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
        {buffering && thumbnail && <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} resizeMode="contain" />}
        {buffering && (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        {paused && !buffering && (
          <View style={s.center}>
            <View style={s.playBadge}>
              <Ionicons name="play" size={42} color="#fff" />
            </View>
          </View>
        )}
        {speeding && (
          <View style={s.speedBadge}>
            <Text style={s.speedText}>2x</Text>
          </View>
        )}
        <Animated.View
          pointerEvents="none"
          style={[
            s.bigHeart,
            {
              opacity: heartScale,
              transform: [{ scale: heartScale.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.25] }) }],
            },
          ]}
        >
          <Ionicons name="heart" size={96} color="#fff" />
        </Animated.View>
      </Pressable>

      <View style={s.topBar}>
        <Text style={s.topTitle}>Short Video</Text>
      </View>

      {isLandscapeVideo && (
        <TouchableOpacity style={s.rotateBtn} onPress={toggleOrientation}>
          <Ionicons name={landscape ? 'phone-portrait-outline' : 'phone-landscape-outline'} size={22} color="#fff" />
        </TouchableOpacity>
      )}

      {!landscape && (
        <View style={s.meta}>
          <Text style={s.author} numberOfLines={1}>@{item.authorDisplayName || 'Anonymous'}</Text>
          {!!caption && <Text style={s.caption} numberOfLines={3}>{caption}</Text>}
        </View>
      )}

      <View style={[
        s.actions,
        landscape && { 
          position: 'absolute', 
          right: 12, 
          bottom: 12,
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          borderRadius: 12,
          alignItems: 'center'
        }
      ]}>
        <TouchableOpacity style={landscape ? s.actionBtnCompact : s.avatar}>
          {item.authorPhotoURL ? (
            <Image source={{ uri: item.authorPhotoURL }} style={s.avatarImg} />
          ) : (
            <Ionicons name="person" size={24} color="#fff" />
          )}
        </TouchableOpacity>
        <TouchableOpacity style={landscape ? s.actionBtnCompact : s.actionBtn} onPress={onLike}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={landscape ? 24 : 34} color={liked ? '#ef4444' : '#fff'} />
          {!landscape && <Text style={s.actionText}>{fmtCount(item.likeCount)}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={landscape ? s.actionBtnCompact : s.actionBtn}
          onPress={onComment}
        >
          <Ionicons name="chatbubble-outline" size={landscape ? 24 : 31} color="#fff" />
          {!landscape && <Text style={s.actionText}>{fmtCount(item.commentCount)}</Text>}
        </TouchableOpacity>
        <View style={landscape ? s.actionBtnCompact : s.actionBtn}>
          <Ionicons name="play-outline" size={landscape ? 24 : 31} color="#fff" />
          {!landscape && <Text style={s.actionText}>{fmtCount(item.viewCount)}</Text>}
        </View>
        <TouchableOpacity style={landscape ? s.actionBtnCompact : s.actionBtn} onPress={toggleMute}>
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={landscape ? 24 : 30} color="#fff" />
        </TouchableOpacity>
      </View>

      <Pressable
        style={[s.progressWrap, landscape && { bottom: 74 }]}
        onPress={(event) => seek(event.nativeEvent.locationX, progressWidth)}
      >
        {({ pressed }) => (
          <View
            style={s.progressTrack}
            onLayout={(event) => setProgressWidth(Math.max(1, event.nativeEvent.layout.width))}
          >
            <View style={[s.progressFill, { width: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }]} />
            <View style={[s.progressThumb, { left: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%`, opacity: pressed ? 1 : 0.85 }]} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

export default function ShortVideoScreen() {
  const user = useAuthStore((state) => state.user);
  const [items, setItems] = useState<ShortVideo[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [height, setHeight] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [commentTarget, setCommentTarget] = useState<ShortVideo | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const viewedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'more' = 'initial') => {
    if (mode === 'more') setLoadingMore(true);
    else if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({ limit: '10' });
      if (mode === 'more' && nextCursor) params.set('before', String(nextCursor));
      const data = await api.get<FeedResponse>(`/api/videos/feed?${params.toString()}`);
      setItems((current) => {
        const incoming = data.videos ?? [];
        if (mode !== 'more') return incoming;
        const existing = new Set(current.map((item) => `${item._source}:${item.id}`));
        return [...current, ...incoming.filter((item) => !existing.has(`${item._source}:${item.id}`))];
      });
      setHasMore(!!data.hasMore);
      setNextCursor(data.nextCursor ?? null);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [nextCursor]);

  useEffect(() => {
    load('initial').catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const active = items[activeIndex];
    const next = items[activeIndex + 1];
    const nextThumb = next?.thumbnailUrl || (next?.videoUrl ? cloudinaryVideoThumbnail(next.videoUrl) : null);
    if (nextThumb) Image.prefetch(nextThumb).catch(() => {});

    if (!active || active._source === 'post') return;
    const key = `${active._source}:${active.id}`;
    if (viewedRef.current.has(key)) return;
    viewedRef.current.add(key);
    api.post(`/api/videos/${active.id}/view`, {}).catch(() => {});
  }, [activeIndex, items]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((token) => token.isViewable && typeof token.index === 'number');
    if (typeof first?.index === 'number') setActiveIndex(first.index);
  }).current;

  const onLayout = (event: LayoutChangeEvent) => {
    setHeight(Math.max(1, event.nativeEvent.layout.height));
  };

  const refresh = () => load('refresh').catch(() => setRefreshing(false));

  const like = async (item: ShortVideo) => {
    const uid = user?.uid;
    const liked = !!uid && (item.likedBy ?? []).includes(uid);
    const endpoint = item._source === 'post' ? `/api/posts/${item.id}/like` : `/api/videos/${item.id}/like`;

    setItems((current) =>
      current.map((video) => {
        if (video.id !== item.id || video._source !== item._source) return video;
        const likedBy = new Set(video.likedBy ?? []);
        if (uid) liked ? likedBy.delete(uid) : likedBy.add(uid);
        return { ...video, likedBy: [...likedBy], likeCount: Math.max(0, (video.likeCount ?? 0) + (liked ? -1 : 1)) };
      })
    );

    try {
      const res = await api.post<any>(endpoint, item._source === 'post' ? { reaction: '❤️' } : {});
      setItems((current) =>
        current.map((video) =>
          video.id === item.id && video._source === item._source
            ? {
                ...video,
                likeCount: typeof res.likeCount === 'number' ? res.likeCount : video.likeCount,
                likedBy: Array.isArray(res.likedBy) ? res.likedBy : video.likedBy,
              }
            : video
        )
      );
    } catch {
      load('refresh').catch(() => {});
    }
  };

  const openComments = async (item: ShortVideo) => {
    setCommentTarget(item);
    setComments([]);
    setCommentInput('');
    setCommentsLoading(true);
    try {
      const res = await api.get<{ comments: CommentItem[] }>(`/api/comments/${item.id}`);
      setComments(res.comments ?? []);
    } catch (err) {
      Alert.alert('Bình luận', (err as Error).message || 'Không thể tải bình luận.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const sendComment = async () => {
    if (!commentTarget || !commentInput.trim() || commentSending) return;
    setCommentSending(true);
    try {
      const created = await api.post<CommentItem>(`/api/comments/${commentTarget.id}`, {
        content: commentInput.trim(),
      });
      setComments((current) => [...current, created]);
      setCommentInput('');
      setItems((current) =>
        current.map((video) =>
          video.id === commentTarget.id && video._source === commentTarget._source
            ? { ...video, commentCount: (video.commentCount ?? 0) + 1 }
            : video
        )
      );
      setCommentTarget((target) =>
        target ? { ...target, commentCount: (target.commentCount ?? 0) + 1 } : target
      );
    } catch (err) {
      Alert.alert('Bình luận', (err as Error).message || 'Không thể gửi bình luận.');
    } finally {
      setCommentSending(false);
    }
  };

  const renderItem = useCallback(({ item, index }: { item: ShortVideo; index: number }) => {
    const liked = !!user?.uid && (item.likedBy ?? []).includes(user.uid);
    return (
      <VideoItem
        item={item}
        active={index === activeIndex}
        height={height}
        liked={liked}
        onLike={() => like(item)}
        onComment={() => openComments(item)}
      />
    );
  }, [activeIndex, height, user?.uid, items]);

  const getItemLayout = useCallback((_: unknown, index: number) => ({
    length: height,
    offset: height * index,
    index,
  }), [height]);

  const empty = useMemo(() => (
    <View style={[s.empty, { height }]}>
      {loading ? <ActivityIndicator size="large" color="#0ea5e9" /> : (
        <>
          <Ionicons name="videocam-outline" size={52} color="#64748b" />
          <Text style={s.emptyText}>Chưa có video đề xuất</Text>
        </>
      )}
    </View>
  ), [height, loading]);

  return (
    <SafeAreaView style={s.root} edges={['top']} onLayout={onLayout}>
      <FlatList
        data={items}
        keyExtractor={(item) => `${item._source}:${item.id}`}
        renderItem={renderItem}
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 72 }}
        getItemLayout={getItemLayout}
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        removeClippedSubviews
        ListEmptyComponent={empty}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
        onEndReached={() => {
          if (!loadingMore && hasMore) load('more').catch(() => setLoadingMore(false));
        }}
        onEndReachedThreshold={0.6}
      />
      <Modal
        visible={!!commentTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setCommentTarget(null)}
      >
        <KeyboardAvoidingView
          style={s.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={s.modalScrim} onPress={() => setCommentTarget(null)} />
          <View style={s.commentSheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Bình luận</Text>
              <TouchableOpacity onPress={() => setCommentTarget(null)} style={s.closeBtn}>
                <Ionicons name="close" size={22} color="#e2e8f0" />
              </TouchableOpacity>
            </View>
            {commentsLoading ? (
              <View style={s.commentLoading}>
                <ActivityIndicator color="#0ea5e9" />
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(item) => item.id}
                style={s.commentList}
                ListEmptyComponent={<Text style={s.noComments}>Chưa có bình luận</Text>}
                renderItem={({ item }) => (
                  <View style={s.commentRow}>
                    <View style={s.commentAvatar}>
                      {item.authorPhotoURL ? (
                        <Image source={{ uri: item.authorPhotoURL }} style={s.commentAvatarImg} />
                      ) : (
                        <Ionicons name="person" size={16} color="#94a3b8" />
                      )}
                    </View>
                    <View style={s.commentBubble}>
                      <Text style={s.commentAuthor}>{item.authorDisplayName || 'Anonymous'}</Text>
                      <Text style={s.commentText}>{item.content}</Text>
                    </View>
                  </View>
                )}
              />
            )}
            <View style={s.commentInputRow}>
              <TextInput
                value={commentInput}
                onChangeText={setCommentInput}
                placeholder="Viết bình luận..."
                placeholderTextColor="#64748b"
                style={s.commentInput}
              />
              <TouchableOpacity
                style={[s.sendBtn, (!commentInput.trim() || commentSending) && s.sendBtnDisabled]}
                onPress={sendComment}
                disabled={!commentInput.trim() || commentSending}
              >
                {commentSending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  item: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  rotateBtn: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { position: 'absolute', left: 14, right: 86, bottom: 96 },
  author: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  caption: { color: '#fff', fontSize: 14, lineHeight: 20 },
  actions: { position: 'absolute', right: 10, bottom: 94, alignItems: 'center', gap: 16 },
  actionBtn: { alignItems: 'center' },
  actionBtnCompact: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 3 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  playBadge: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  speedBadge: {
    position: 'absolute',
    top: 58,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  speedText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  progressWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 64,
    height: 22,
    justifyContent: 'center',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  progressThumb: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  bigHeart: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#000' },
  emptyText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  commentSheet: {
    height: '62%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#475569',
    marginBottom: 10,
  },
  sheetHeader: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sheetTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '800' },
  closeBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  commentLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  commentList: { flex: 1 },
  noComments: { color: '#94a3b8', textAlign: 'center', marginTop: 28 },
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  commentAvatarImg: { width: '100%', height: '100%' },
  commentBubble: { flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 10 },
  commentAuthor: { color: '#e2e8f0', fontSize: 12, fontWeight: '800', marginBottom: 3 },
  commentText: { color: '#cbd5e1', fontSize: 13, lineHeight: 18 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  commentInput: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },
});
