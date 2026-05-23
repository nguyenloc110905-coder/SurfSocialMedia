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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useClipStore } from '@/stores/clipStore';
import { useMediaPlaybackStore } from '@/stores/mediaPlaybackStore';
import { useSettingsStore } from '@/stores/settingsStore';

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
  allowComments?: boolean;
  editOptions?: {
    contentFit?: 'contain' | 'cover';
    mutedOriginal?: boolean;
  };
  textOverlays?: Array<{
    id?: string;
    text?: string;
    color?: string;
    fontSize?: number;
    placement?: 'top' | 'center' | 'bottom';
  }>;
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

function optimizeCloudinaryVideo(url: string, reduceDataUsage = false) {
  if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload/')) return url;
  const transform = reduceDataUsage ? 'q_auto:eco,w_480,f_auto' : 'q_auto:eco,w_720,f_auto';
  return url.replace('/video/upload/', `/video/upload/${transform}/`);
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

function FullscreenRotateIcon() {
  return <MaterialCommunityIcons name="phone-rotate-landscape" size={21} color="#fff" />;
}

function overlayPosition(placement?: 'top' | 'center' | 'bottom') {
  if (placement === 'top') return { top: '22%' as const };
  if (placement === 'bottom') return { bottom: '24%' as const };
  return { top: '46%' as const };
}

function VideoItem({
  item,
  active,
  height,
  liked,
  onLike,
  onComment,
  showTitle,
  onLandscapeModeChange,
  autoPlay,
  reduceDataUsage,
}: {
  item: ShortVideo;
  active: boolean;
  height: number;
  liked: boolean;
  onLike: () => void;
  onComment: () => void;
  showTitle: boolean;
  onLandscapeModeChange?: (enabled: boolean) => void;
  autoPlay: boolean;
  reduceDataUsage: boolean;
}) {
  const videosMuted = useMediaPlaybackStore((state) => state.videosMuted);
  const setVideosMuted = useMediaPlaybackStore((state) => state.setVideosMuted);
  const muted = videosMuted || item.editOptions?.mutedOriginal === true;
  const player = useVideoPlayer(optimizeCloudinaryVideo(item.videoUrl, reduceDataUsage), (p) => {
    p.loop = true;
    p.muted = muted;
  });
  const [buffering, setBuffering] = useState(true);
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
  const userPausedRef = useRef(false);
  const longPressRef = useRef(false);
  const pressDurationRef = useRef(0);
  const heartScale = useRef(new Animated.Value(0)).current;
  const thumbnail = item.thumbnailUrl || cloudinaryVideoThumbnail(item.videoUrl);
  const contentFit = item.editOptions?.contentFit === 'cover' ? 'cover' : 'contain';
  const landscapeVideoHeight = Math.min(height, screenDim.width * 9 / 16);
  const fullScreenHintTop = Math.min(
    Math.max(92, height - 140),
    Math.max(92, (height + landscapeVideoHeight) / 2 + 14)
  );
  const showFullScreenHint = active && isLandscapeVideo && !landscape && !paused && !buffering;

  const pausePlayer = useCallback(() => {
    try {
      player.pause();
      player.playbackRate = 1;
    } catch {
      // ignore player transition
    }
  }, [player]);

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
      pausePlayer();
      sub.remove();
      playSub.remove();
      timeSub.remove();
      sourceSub.remove();
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      dimSub?.remove?.();
    };
  }, [pausePlayer, player]);

  useEffect(() => {
    if (!active) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      setSpeeding(false);
      longPressRef.current = false;
      if (landscape) {
        setLandscape(false);
        onLandscapeModeChange?.(false);
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    }

    try {
      if (active && autoPlay && !userPausedRef.current) player.play();
      else pausePlayer();
    } catch {
      // Native player can be mid-transition while FlatList recycles rows.
    }
  }, [active, autoPlay, landscape, onLandscapeModeChange, pausePlayer, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

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
    if (!active) return;
    pressDurationRef.current = Date.now();
    longPressRef.current = false;
  };

  const handlePressOut = () => {
    if (!active) return;
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
          userPausedRef.current = next;
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
    if (!active) return;
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
    setVideosMuted(!videosMuted);
  };

  const toggleOrientation = async () => {
    const next = !landscape;
    setLandscape(next);
    onLandscapeModeChange?.(next);
    try {
      await ScreenOrientation.lockAsync(
        next
          ? ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
          : ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
    } catch {
      setLandscape(!next);
      onLandscapeModeChange?.(!next);
    }
  };

  const seek = (locationX: number, width: number) => {
    if (!active) return;
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
          contentFit={contentFit}
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
        {(item.textOverlays ?? []).map((overlay, idx) => {
          if (!overlay.text) return null;
          return (
            <View
              key={overlay.id ?? `${item.id}-text-${idx}`}
              pointerEvents="none"
              style={[s.overlayLayer, overlayPosition(overlay.placement)]}
            >
              <Text
                style={[
                  s.overlayText,
                  {
                    color: overlay.color ?? '#fff',
                    fontSize: overlay.fontSize ?? 28,
                    textShadowColor: overlay.color === '#111827' ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.72)',
                  },
                ]}
                numberOfLines={3}
              >
                {overlay.text}
              </Text>
            </View>
          );
        })}
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

      {showTitle && (
        <View style={s.topBar}>
          <Text style={s.topTitle}>Short Video</Text>
        </View>
      )}

      {showFullScreenHint && (
        <TouchableOpacity
          style={[s.fullScreenHint, { top: fullScreenHintTop }]}
          onPress={toggleOrientation}
          activeOpacity={0.82}
        >
          <FullscreenRotateIcon />
          <Text style={s.fullScreenHintText}>Toàn màn hình</Text>
        </TouchableOpacity>
      )}

      {landscape && (
        <TouchableOpacity
          style={s.landscapeBackBtn}
          onPress={toggleOrientation}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Quay lại màn hình dọc"
        >
          <Ionicons name="arrow-back" size={26} color="#fff" />
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
          disabled={item.allowComments === false}
        >
          <Ionicons name="chatbubble-outline" size={landscape ? 24 : 31} color={item.allowComments === false ? 'rgba(255,255,255,0.42)' : '#fff'} />
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

type ShortVideoScreenProps = {
  isActive?: boolean;
  resetSignal?: number;
  safeTop?: boolean;
  showTitle?: boolean;
  onFullscreenChange?: (enabled: boolean) => void;
};

export default function ShortVideoScreen({
  isActive = true,
  resetSignal = 0,
  safeTop = true,
  showTitle = true,
  onFullscreenChange,
}: ShortVideoScreenProps) {
  const user = useAuthStore((state) => state.user);
  const clipRefreshSignal = useClipStore((state) => state.refreshSignal);
  const listRef = useRef<FlatList<ShortVideo>>(null);
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
  const [landscapeLocked, setLandscapeLocked] = useState(false);
  const viewedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (isActive) return;
    setCommentTarget(null);
    setLandscapeLocked(false);
    onFullscreenChange?.(false);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, [isActive, onFullscreenChange]);

  useEffect(() => {
    onFullscreenChange?.(landscapeLocked);
  }, [landscapeLocked, onFullscreenChange]);

  useEffect(() => {
    if (!resetSignal) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setActiveIndex(0);
  }, [resetSignal]);

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
    if (!clipRefreshSignal) return;
    setActiveIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    load('refresh').catch(() => setRefreshing(false));
  }, [clipRefreshSignal]);

  useEffect(() => {
    if (!isActive) return;
    const active = items[activeIndex];
    const next = items[activeIndex + 1];
    const nextThumb = next?.thumbnailUrl || (next?.videoUrl ? cloudinaryVideoThumbnail(next.videoUrl) : null);
    if (nextThumb) Image.prefetch(nextThumb).catch(() => {});

    if (!active || active._source === 'post') return;
    const key = `${active._source}:${active.id}`;
    if (viewedRef.current.has(key)) return;
    viewedRef.current.add(key);
    api.post(`/api/videos/${active.id}/view`, {}).catch(() => {});
  }, [activeIndex, isActive, items]);

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
    if (item.allowComments === false) {
      Alert.alert('Bình luận', 'Tác giả đã tắt bình luận cho clip này.');
      return;
    }
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
        active={isActive && index === activeIndex}
        height={height}
        liked={liked}
        onLike={() => like(item)}
        onComment={() => openComments(item)}
        showTitle={showTitle}
        onLandscapeModeChange={setLandscapeLocked}
      />
    );
  }, [activeIndex, height, isActive, showTitle, user?.uid, items]);

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
    <SafeAreaView style={s.root} edges={safeTop ? ['top'] : []} onLayout={onLayout}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => `${item._source}:${item.id}`}
        renderItem={renderItem}
        extraData={`${isActive}:${activeIndex}:${height}:${showTitle}:${landscapeLocked}:${user?.uid ?? ''}`}
        scrollEnabled={!landscapeLocked}
        pagingEnabled={!landscapeLocked}
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
  fullScreenHint: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 13,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(31, 31, 35, 0.86)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.26,
    shadowRadius: 10,
    elevation: 4,
  },
  fullScreenHintText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  landscapeBackBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(15, 23, 42, 0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 7,
    elevation: 3,
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
  overlayLayer: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  overlayText: {
    color: '#fff',
    fontWeight: '900',
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
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
