import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Animated,
  Modal,
  PanResponder,
  FlatList,
  ScrollView,
  TextInput,
  Keyboard,
  Share,
  Platform,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useFeedStore, type FeedPost } from '@/stores/feedStore';
import { useAuthStore } from '@/stores/authStore';
import { useMediaPlaybackStore } from '@/stores/mediaPlaybackStore';
import { api } from '@/lib/api';
import { gestureState, setReactionPickerActive } from '@/lib/gestureState';

export type { FeedPost };

type Post = FeedPost;
type Comment = {
  id: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  content: string;
  createdAt: Post['createdAt'];
  likeCount: number;
  likedBy?: string[];
  reactions?: Record<string, string>;
  parentId?: string;
};

const REACTIONS = ['❤️', '🌊', '😂', '😮', '😢', '👍'] as const;

function parseMentions(text: string): string {
  return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
}

function topReactions(map: Record<string, string>): string[] {
  const freq: Record<string, number> = {};
  for (const v of Object.values(map)) freq[v] = (freq[v] ?? 0) + 1;
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e);
}

export type PostCardProps = {
  post: FeedPost;
  isVisible: boolean;
  navigation: NativeStackNavigationProp<RootStackParamList, any>;
};

const { width: SW, height: SH } = Dimensions.get('window');
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

const FEELING_STR: Record<string, string> = {
  happy: '😊', excited: '🎉', sad: '😢', angry: '😠', loved: '❤️', grateful: '🙏',
};

function timeAgo(raw: Post['createdAt']): string {
  let ms = 0;
  if (!raw) return '';
  if (typeof raw === 'number') ms = raw * 1000;
  else if (typeof raw === 'string') ms = new Date(raw).getTime();
  else if ('_seconds' in raw && raw._seconds) ms = raw._seconds * 1000;
  else if ('seconds' in raw && raw.seconds) ms = raw.seconds * 1000;
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
  const d = new Date(ms);
  return `${d.getDate()} tháng ${d.getMonth() + 1}`;
}

function isVideoUrl(url: string): boolean {
  const u = url.toLowerCase().split('?')[0];
  return (
    u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.webm') ||
    u.endsWith('.m4v') || u.includes('/video/upload/')
  );
}

function optimizeCloudinaryVideo(url: string): string {
  if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload/')) return url;
  return url.replace('/video/upload/', '/video/upload/q_auto:eco,w_720,f_auto/');
}

function cloudinaryVideoThumbnail(url: string): string | null {
  if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload/')) return null;
  return url
    .replace('/video/upload/', '/image/upload/w_720,q_auto,f_jpg,so_0/')
    .replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg');
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function privacyIcon(p?: string): keyof typeof Ionicons.glyphMap {
  if (p === 'friends') return 'people-outline';
  if (p === 'only-me') return 'lock-closed-outline';
  return 'globe-outline';
}

// ── FeedImage ────────────────────────────────────────────────────────────────
function FeedImage({ uri, style, resizeMode = 'cover' }: { uri: string; style: object; resizeMode?: 'cover' | 'contain' }) {
  const scheme = useColorScheme();
  const bg = scheme === 'dark' ? '#334155' : '#e2e8f0';
  const opacity = useRef(new Animated.Value(0)).current;
  const onLoad = () =>
    Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  return (
    <View style={[style as object, { backgroundColor: bg, overflow: 'hidden' }]}>
      <Animated.Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, { opacity }]}
        resizeMode={resizeMode}
        onLoad={onLoad}
        progressiveRenderingEnabled
        fadeDuration={0}
      />
    </View>
  );
}

// ── PinchZoomImage — pinch-to-zoom for lightbox images ────────────────────────
function PinchZoomImage({ uri }: { uri: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const baseScale = useRef(1);
  const initialDist = useRef<number | null>(null);

  const calcDist = (touches: any[]) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const pr = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onStartShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length === 2,
      onPanResponderGrant: (e) => {
        if (e.nativeEvent.touches.length === 2) {
          initialDist.current = calcDist(e.nativeEvent.touches);
        }
      },
      onPanResponderMove: (e) => {
        if (e.nativeEvent.touches.length === 2 && initialDist.current) {
          const d = calcDist(e.nativeEvent.touches);
          const next = Math.max(1, Math.min(4, baseScale.current * (d / initialDist.current)));
          scale.setValue(next);
        }
      },
      onPanResponderRelease: () => {
        const v = (scale as any)._value ?? 1;
        if (v < 1.15) {
          baseScale.current = 1;
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
        } else {
          baseScale.current = Math.min(4, v);
        }
        initialDist.current = null;
      },
      onPanResponderTerminate: () => {
        baseScale.current = 1;
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
        initialDist.current = null;
      },
    })
  ).current;

  return (
    <View style={{ width: SW, height: SH, justifyContent: 'center', alignItems: 'center' }}
      {...pr.panHandlers}
    >
      <Animated.Image
        source={{ uri }}
        style={{ width: SW, height: SH, transform: [{ scale }] }}
        resizeMode="contain"
      />
    </View>
  );
}

// ── VideoViewerItem ───────────────────────────────────────────────────────────
function VideoViewerItem({ url, isActive }: { url: string; isActive: boolean }) {
  const muted = useMediaPlaybackStore((state) => state.videosMuted);
  const player = useVideoPlayer(optimizeCloudinaryVideo(url), (p) => { p.loop = true; p.muted = muted; });
  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);
  useEffect(() => {
    try { isActive ? player.play() : player.pause(); } catch { /* ignore */ }
  }, [isActive, player]);
  return (
    <VideoView
      player={player}
      style={{ width: SW, height: SH }}
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
      allowsPictureInPicture={false}
    />
  );
}

function MediaViewerItem({ url, isActive }: { url: string; isActive: boolean }) {
  if (isVideoUrl(url)) return <VideoViewerItem url={url} isActive={isActive} />;
  return <PinchZoomImage uri={url} />;
}

// ── ImageViewer — fullscreen lightbox, swipe-down to dismiss ─────────────────
function ImageViewer({ urls, initialIndex, onClose }: {
  urls: string[]; initialIndex: number; onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const flatRef = useRef<FlatList>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const bgOpacity = translateY.interpolate({
    inputRange: [0, 250], outputRange: [1, 0], extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (e, { dx, dy }) =>
        e.nativeEvent.touches.length < 2 && dy > 12 && Math.abs(dy) > Math.abs(dx) * 1.3,
      onPanResponderMove: (_, { dy }) => { if (dy > 0) translateY.setValue(dy); },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 100 || vy > 0.8) {
          Animated.timing(translateY, { toValue: SH, duration: 220, useNativeDriver: true }).start(onClose);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <Modal visible transparent statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: bgOpacity }]} />
      <Animated.View style={{ flex: 1, transform: [{ translateY }] }} {...panResponder.panHandlers}>
        <View style={iv.handle}><View style={iv.handleBar} /></View>
        <FlatList
          ref={flatRef}
          data={urls}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
          onScrollToIndexFailed={(info) => {
            flatRef.current?.scrollToOffset({ offset: info.index * SW, animated: false });
          }}
          renderItem={({ item, index }) => (
            <MediaViewerItem url={item} isActive={index === idx} />
          )}
          onMomentumScrollEnd={(e) => {
            setIdx(Math.round(e.nativeEvent.contentOffset.x / SW));
          }}
        />
        <TouchableOpacity style={iv.closeBtn} onPress={onClose}>
          <View style={iv.closeBtnInner}><Ionicons name="close" size={22} color="#fff" /></View>
        </TouchableOpacity>
        {urls.length > 1 && (
          <View style={iv.dots}>
            {urls.map((_, i) => <View key={i} style={[iv.dot, i === idx && iv.dotActive]} />)}
          </View>
        )}
        {urls.length > 1 && (
          <View style={iv.counter}>
            <Text style={iv.counterText}>{idx + 1} / {urls.length}</Text>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

const iv = StyleSheet.create({
  handle: { paddingTop: 12, paddingBottom: 4, alignItems: 'center', zIndex: 10 },
  handleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' },
  closeBtn: { position: 'absolute', top: 52, right: 16, zIndex: 10 },
  closeBtnInner: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  dots: { position: 'absolute', bottom: 44, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { width: 18, backgroundColor: '#fff' },
  counter: { position: 'absolute', top: 58, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  counterText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});

// ── VideoPlaceholder ──────────────────────────────────────────────────────────
function VideoPlaceholder() {
  const scheme = useColorScheme();
  const bg = scheme === 'dark' ? '#1a2535' : '#d1d5db';
  return (
    <View style={[s.videoContainer, { backgroundColor: bg, justifyContent: 'center', alignItems: 'center' }]}>
      <Ionicons name="play-circle-outline" size={52} color="rgba(255,255,255,0.55)" />
    </View>
  );
}

// ── VideoMediaItem ────────────────────────────────────────────────────────────
function VideoMediaItem({ url, isVisible }: { url: string; isVisible: boolean }) {
  const [buffering, setBuffering] = useState(true);
  const muted = useMediaPlaybackStore((state) => state.videosMuted);
  const setVideosMuted = useMediaPlaybackStore((state) => state.setVideosMuted);
  const thumbnail = cloudinaryVideoThumbnail(url);
  const player = useVideoPlayer(optimizeCloudinaryVideo(url), (p) => { p.loop = true; p.muted = muted; });

  useEffect(() => {
    const sub = player.addListener('statusChange', (payload: { status: string }) => {
      setBuffering(payload.status === 'idle' || payload.status === 'loading');
    });
    return () => {
      try { player.pause(); } catch { /* ignore */ }
      sub.remove();
    };
  }, [player]);

  useEffect(() => {
    try { isVisible ? player.play() : player.pause(); } catch { /* ignore */ }
  }, [isVisible, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  const toggleMute = () => {
    setVideosMuted(!muted);
  };

  return (
    <View style={s.videoContainer}>
      <VideoView
        player={player}
        style={s.videoArea}
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture={false}
        contentFit="contain"
      />
      {buffering && thumbnail && (
        <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      {buffering && (
        <View style={s.videoBuffering}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
      <TouchableOpacity style={s.muteBtn} onPress={toggleMute}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={15} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

// ── MediaGrid ─────────────────────────────────────────────────────────────────
function MediaGrid({ urls, isVisible }: { urls: string[]; isVisible: boolean }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const count = urls.length;
  if (count === 0) return null;

  if (count === 1) {
    if (isVideoUrl(urls[0])) {
      return isVisible
        ? <VideoMediaItem url={urls[0]} isVisible />
        : <VideoPlaceholder />;
    }
    return (
      <>
        <TouchableOpacity onPress={() => setViewerIndex(0)} activeOpacity={0.92}>
          <FeedImage uri={urls[0]} style={s.mediaArea} />
        </TouchableOpacity>
        {viewerIndex !== null && (
          <ImageViewer urls={urls} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
        )}
      </>
    );
  }

  const Tile = ({ url, idx, style }: { url: string; idx: number; style: object }) => (
    <TouchableOpacity onPress={() => setViewerIndex(idx)} activeOpacity={0.88} style={style}>
      <FeedImage uri={url} style={StyleSheet.absoluteFill} />
      {isVideoUrl(url) && (
        <View style={mg.playOverlay}>
          <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.9)" />
        </View>
      )}
    </TouchableOpacity>
  );

  const H2 = (MEDIA_W - 2) / 2;
  const showUrls = urls.slice(0, 4);
  const extra = count - 4;

  let grid: React.ReactElement;
  if (count === 2) {
    grid = (
      <View style={[mg.row, { height: H2 * 0.7 }]}>
        <Tile url={showUrls[0]} idx={0} style={[mg.half, { marginRight: 1 }]} />
        <Tile url={showUrls[1]} idx={1} style={[mg.half, { marginLeft: 1 }]} />
      </View>
    );
  } else if (count === 3) {
    grid = (
      <View style={[mg.row, { height: H2 * 1.1 }]}>
        <Tile url={showUrls[0]} idx={0} style={[mg.twoThirds, { marginRight: 1 }]} />
        <View style={[mg.oneThird, { marginLeft: 1 }]}>
          <Tile url={showUrls[1]} idx={1} style={[mg.halfHeight, { marginBottom: 1 }]} />
          <Tile url={showUrls[2]} idx={2} style={[mg.halfHeight, { marginTop: 1 }]} />
        </View>
      </View>
    );
  } else {
    grid = (
      <View style={mg.grid2x2}>
        {showUrls.map((url, i) => (
          <View key={i} style={mg.quadrant}>
            <Tile url={url} idx={i} style={StyleSheet.absoluteFill} />
            {i === 3 && extra > 0 && (
              <View style={mg.moreOverlay}>
                <Text style={mg.moreText}>+{extra}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  }

  return (
    <>
      <View style={{ width: MEDIA_W, alignSelf: 'center', overflow: 'hidden', borderRadius: 4 }}>
        {grid}
      </View>
      {viewerIndex !== null && (
        <ImageViewer urls={urls} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </>
  );
}

const mg = StyleSheet.create({
  row: { flexDirection: 'row' },
  half: { flex: 1 },
  twoThirds: { flex: 2 },
  oneThird: { flex: 1 },
  halfHeight: { flex: 1 },
  grid2x2: { flexDirection: 'row', flexWrap: 'wrap', height: (MEDIA_W - 2) * 0.65 },
  quadrant: {
    width: (MEDIA_W - 2) / 2 - 1, height: ((MEDIA_W - 2) * 0.65 - 2) / 2,
    margin: 0.5, overflow: 'hidden',
  },
  playOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  moreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  moreText: { color: '#fff', fontSize: 24, fontWeight: '700' },
});

// ── ReactionPickerOverlay ─────────────────────────────────────────────────────
type PickerAnchor = { px: number; py: number; pw: number; ph: number };

function ReactionPickerOverlay({ visible, C, anchor, hovered }: {
  visible: boolean;
  C: typeof DARK;
  anchor: PickerAnchor;
  hovered: number | null;
}) {
  const PICKER_H = 70;
  const PICKER_W = Math.min(SW - 16, REACTIONS.length * 50 + 28);
  const pickerTop = anchor.py > PICKER_H + 12
    ? anchor.py - PICKER_H - 8
    : anchor.py + anchor.ph + 8;
  const pickerLeft = Math.max(8, Math.min(SW - PICKER_W - 8, anchor.px + anchor.pw / 2 - PICKER_W / 2));

  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.7); opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }),
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, scale, opacity]);

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View
        style={[rp.picker, { top: pickerTop, left: pickerLeft, width: PICKER_W,
          backgroundColor: C.card, borderColor: C.border, shadowColor: '#000',
          transform: [{ scale }], opacity }]}
        pointerEvents="none"
      >
        {REACTIONS.map((emoji, idx) => (
          <View
            key={emoji}
            style={[
              rp.emojiBtn,
              hovered === idx && rp.emojiBtnHovered,
            ]}
          >
            <Text style={[rp.emoji, hovered === idx && rp.emojiHovered]}>{emoji}</Text>
          </View>
        ))}
      </Animated.View>
    </Modal>
  );
}

const rp = StyleSheet.create({
  picker: {
    position: 'absolute', flexDirection: 'row', justifyContent: 'space-evenly',
    paddingHorizontal: 8, paddingVertical: 10, borderRadius: 40, borderWidth: 1,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 20,
  },
  emojiBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, borderRadius: 22 },
  emojiBtnHovered: { transform: [{ scale: 1.35 }, { translateY: -8 }] },
  emoji: { fontSize: 26 },
  emojiHovered: { fontSize: 30 },
});

// ── CommentReactionButton ────────────────────────────────────────────────────
function CommentReactionButton({ liked, reaction, C, onShortPress, onPickReaction }: {
  liked: boolean;
  reaction: string | null;
  C: typeof DARK;
  onShortPress: () => void;
  onPickReaction: (emoji: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<PickerAnchor>({ px: 0, py: 0, pw: 0, ph: 0 });
  const [hoveredEmoji, setHoveredEmoji] = useState<number | null>(null);
  const btnRef = useRef<View>(null);
  const pickerActiveRef = useRef(false);
  const pickerAnchorRef = useRef<PickerAnchor>({ px: 0, py: 0, pw: 0, ph: 0 });
  const hoveredEmojiRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onShortPressRef = useRef(onShortPress);
  const onPickReactionRef = useRef(onPickReaction);
  onShortPressRef.current = onShortPress;
  onPickReactionRef.current = onPickReaction;

  const calcIdx = (pageX: number, pageY: number, anch: PickerAnchor): number | null => {
    const PICKER_H = 70;
    const PICKER_W = Math.min(SW - 16, REACTIONS.length * 50 + 28);
    const pt = anch.py > PICKER_H + 12 ? anch.py - PICKER_H - 8 : anch.py + anch.ph + 8;
    const pl = Math.max(8, Math.min(SW - PICKER_W - 8, anch.px + anch.pw / 2 - PICKER_W / 2));
    if (pageY < pt - 24 || pageY > pt + PICKER_H + 24) return null;
    const i = Math.floor((pageX - pl) / (PICKER_W / REACTIONS.length));
    return i >= 0 && i < REACTIONS.length ? i : null;
  };

  const gesture = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      pickerActiveRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        btnRef.current?.measure((_fx, _fy, pw, ph, px, py) => {
          const a = { px, py, pw, ph };
          pickerAnchorRef.current = a;
          pickerActiveRef.current = true;
          setReactionPickerActive(true);
          setPickerAnchor(a);
          setShowPicker(true);
        });
      }, 400);
    },
    onPanResponderMove: (e) => {
      if (!pickerActiveRef.current) return;
      const { pageX, pageY } = e.nativeEvent;
      const i = calcIdx(pageX, pageY, pickerAnchorRef.current);
      hoveredEmojiRef.current = i;
      setHoveredEmoji(i);
    },
    onPanResponderRelease: () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        onShortPressRef.current();
        return;
      }
      const wasActive = pickerActiveRef.current;
      const i = hoveredEmojiRef.current;
      pickerActiveRef.current = false;
      hoveredEmojiRef.current = null;
      setReactionPickerActive(false);
      setShowPicker(false);
      setHoveredEmoji(null);
      if (wasActive && i !== null) onPickReactionRef.current(REACTIONS[i]);
    },
    onPanResponderTerminate: () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      pickerActiveRef.current = false;
      hoveredEmojiRef.current = null;
      setReactionPickerActive(false);
      setShowPicker(false);
      setHoveredEmoji(null);
    },
    onPanResponderTerminationRequest: () => !pickerActiveRef.current,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  return (
    <>
      <View ref={btnRef} style={cs.cLikeBtn} {...gesture.panHandlers}>
        {liked && reaction
          ? <Text style={cs.cReactionEmoji}>{reaction}</Text>
          : <Text style={[cs.cLikeText, { color: C.subtext }]}>Thích</Text>
        }
      </View>
      <ReactionPickerOverlay visible={showPicker} C={C} anchor={pickerAnchor} hovered={hoveredEmoji} />
    </>
  );
}

// ── CommentSheet ──────────────────────────────────────────────────────────────
function CommentSheet({ postId, onClose, onCountChange }: {
  postId: string; onClose: () => void; onCountChange: (n: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const { user } = useAuthStore();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentLikes, setCommentLikes] = useState<Record<string, boolean>>({});
  const [commentReactions, setCommentReactions] = useState<Record<string, string | null>>({});
  const [replyTo, setReplyTo] = useState<{ commentId: string; authorDisplayName: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [kbHeight, setKbHeight] = useState(0);
  const slideY = useRef(new Animated.Value(SH * 0.75)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, e => setKbHeight(e.endCoordinates.height));
    const h = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { s.remove(); h.remove(); };
  }, []);

  const close = useCallback(() => {
    Animated.timing(slideY, { toValue: SH, duration: 260, useNativeDriver: true }).start(onClose);
  }, [onClose, slideY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 8,
      onPanResponderMove: (_, { dy }) => { if (dy > 0) slideY.setValue(dy); },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 100 || vy > 0.8) close();
        else Animated.spring(slideY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const loadComments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<{ comments: Comment[] }>(`/api/comments/${postId}`);
      const list = data.comments ?? [];
      setComments(list);
      onCountChangeRef.current(list.length);
      const uid = user?.uid;
      const likes: Record<string, boolean> = {};
      const reactions: Record<string, string | null> = {};
      list.forEach(c => {
        likes[c.id] = uid ? (c.likedBy?.includes(uid) ?? false) : false;
        reactions[c.id] = uid ? (c.reactions?.[uid] ?? null) : null;
      });
      setCommentLikes(likes);
      setCommentReactions(reactions);
    } catch (e) {
      console.warn('Load comments error:', e);
    } finally { setLoading(false); }
  }, [postId, user?.uid]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const handleReactComment = async (commentId: string, emoji: string) => {
    const prevLiked = commentLikes[commentId] ?? false;
    const prevReaction = commentReactions[commentId] ?? null;
    const alreadyPicked = prevLiked && prevReaction === emoji;
    const newLiked = !alreadyPicked;
    setCommentLikes(p => ({ ...p, [commentId]: newLiked }));
    setCommentReactions(p => ({ ...p, [commentId]: newLiked ? emoji : null }));
    setComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      const next = alreadyPicked ? Math.max(0, c.likeCount - 1) : prevLiked ? c.likeCount : c.likeCount + 1;
      return { ...c, likeCount: next };
    }));
    try {
      await api.post(`/api/comments/${postId}/${commentId}/react`, { reaction: emoji });
    } catch {
      setCommentLikes(p => ({ ...p, [commentId]: prevLiked }));
      setCommentReactions(p => ({ ...p, [commentId]: prevReaction }));
    }
  };

  const handleReply = (commentId: string, authorDisplayName: string) => {
    setReplyTo({ commentId, authorDisplayName });
    setText(`@${authorDisplayName} `);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const toggleReplies = (parentId: string) => {
    setExpandedReplies(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId); else next.add(parentId);
      return next;
    });
  };

  const renderCommentRow = (c: Comment, isReply = false) => {
    const cLiked = commentLikes[c.id] ?? false;
    const cReaction = commentReactions[c.id] ?? null;
    const cTopReacts = topReactions(c.reactions ?? {});
    return (
      <View key={c.id} style={[cs.row, isReply && cs.replyRow]}>
        {isReply && <View style={[cs.replyLine, { backgroundColor: C.accent + '55' }]} />}
        {c.authorPhotoURL
          ? <Image source={{ uri: c.authorPhotoURL }} style={[cs.avatar, isReply && cs.replyAvatar]} />
          : <View style={[cs.avatar, isReply && cs.replyAvatar, { backgroundColor: C.placeholder, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="person" size={isReply ? 10 : 13} color={C.subtext} />
            </View>
        }
        <View style={{ flex: 1 }}>
          <View style={[cs.bubble, { backgroundColor: C.card2 }]}>
            <Text style={[cs.cAuthor, { color: C.text }]}>{c.authorDisplayName}</Text>
            <Text style={[cs.cContent, { color: C.text }]}>{parseMentions(c.content)}</Text>
          </View>
          {c.likeCount > 0 && cTopReacts.length > 0 && (
            <View style={cs.cReactBar}>
              <Text style={cs.cReactEmoji}>{cTopReacts.join('')}</Text>
              <Text style={[cs.cReactCount, { color: C.subtext }]}>{c.likeCount}</Text>
            </View>
          )}
          <View style={cs.cActions}>
            <CommentReactionButton liked={cLiked} reaction={cReaction} C={C}
              onShortPress={() => handleReactComment(c.id, cReaction ?? '❤️')}
              onPickReaction={(emoji) => handleReactComment(c.id, emoji)}
            />
            <TouchableOpacity style={cs.cLikeBtn} onPress={() => handleReply(isReply ? c.parentId! : c.id, c.authorDisplayName)}>
              <Text style={[cs.cLikeText, { color: C.subtext }]}>Trả lời</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const clearReply = () => { setReplyTo(null); setText(''); };

  const submit = async () => {
    const tmp = text.trim();
    if (!tmp || submitting) return;
    setText('');
    setReplyTo(null);
    setSubmitting(true);
    try {
      await api.post(`/api/comments/${postId}`, {
        content: tmp,
        ...(replyTo ? { parentId: replyTo.commentId } : {}),
      });
      await loadComments();
    } catch { setText(tmp); } finally { setSubmitting(false); }
  };

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={close}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      </TouchableOpacity>
      <Animated.View style={[cs.sheet, { bottom: kbHeight, backgroundColor: C.card, paddingBottom: insets.bottom + 4, transform: [{ translateY: slideY }] }]}>
        <View {...panResponder.panHandlers} style={cs.handleArea}>
          <View style={[cs.handle, { backgroundColor: C.placeholder }]} />
        </View>
        <Text style={[cs.title, { color: C.text, borderBottomColor: C.border }]}>Bình luận</Text>
        {loading ? (
          <View style={[cs.list, { paddingTop: 12 }]}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[cs.row, { opacity: 1 - i * 0.2 }]}>
                <View style={[cs.avatar, { backgroundColor: C.placeholder }]} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 11, borderRadius: 6, width: '38%', backgroundColor: C.placeholder }} />
                  <View style={{ height: 11, borderRadius: 6, width: '72%', backgroundColor: C.placeholder }} />
                </View>
              </View>
            ))}
          </View>
        ) : (() => {
          const topLevel = comments.filter(c => !c.parentId);
          const repliesByParent: Record<string, Comment[]> = {};
          comments.filter(c => c.parentId).forEach(c => {
            if (!repliesByParent[c.parentId!]) repliesByParent[c.parentId!] = [];
            repliesByParent[c.parentId!].push(c);
          });
          return (
          <ScrollView
            style={cs.list}
            contentContainerStyle={{ paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {topLevel.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 36 }}>
                <Ionicons name="chatbubble-outline" size={40} color={C.subtext} />
                <Text style={{ color: C.subtext, marginTop: 8, fontSize: 14 }}>Chưa có bình luận nào</Text>
              </View>
            ) : (
              topLevel.map(c => {
                const replies = repliesByParent[c.id] ?? [];
                const isExpanded = expandedReplies.has(c.id);
                return (
                  <View key={c.id}>
                    {renderCommentRow(c, false)}
                    {replies.length > 0 && (
                      <View style={cs.repliesWrap}>
                        <TouchableOpacity style={cs.toggleRepliesBtn} onPress={() => toggleReplies(c.id)}>
                          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={C.accent} />
                          <Text style={[cs.toggleRepliesText, { color: C.accent }]}>
                            {isExpanded ? 'Ẩn trả lời' : `Xem ${replies.length} trả lời`}
                          </Text>
                        </TouchableOpacity>
                        {isExpanded && replies.map(r => renderCommentRow(r, true))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
          );
        })()}
          <ScrollView scrollEnabled={false} keyboardShouldPersistTaps="handled" style={{ flexShrink: 0 }}>
            {replyTo && (
              <View style={[cs.replyChip, { backgroundColor: C.accent + '18', borderTopColor: C.border }]}>
                <Ionicons name="return-down-forward-outline" size={13} color={C.accent} />
                <Text style={[cs.replyChipText, { color: C.accent }]} numberOfLines={1}>
                  Trả lời <Text style={{ fontWeight: '700' }}>@{replyTo.authorDisplayName}</Text>
                </Text>
                <TouchableOpacity onPress={clearReply} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={14} color={C.accent} />
                </TouchableOpacity>
              </View>
            )}
            <View style={[cs.inputRow, { borderTopColor: C.border }]}>
              {user?.photoURL ? (
                <Image source={{ uri: user.photoURL }} style={cs.inputAvatar} />
              ) : (
                <View style={[cs.inputAvatar, { backgroundColor: C.placeholder, justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="person" size={12} color={C.subtext} />
                </View>
              )}
              <TextInput
                ref={inputRef}
                style={[cs.input, { backgroundColor: C.inputBg, color: C.text }]}
                placeholder="Viết bình luận..."
                placeholderTextColor={C.subtext}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity onPressIn={submit} disabled={!text.trim() || submitting} style={[cs.sendBtn, { opacity: text.trim() ? 1 : 0.35 }]}>
                {submitting
                  ? <ActivityIndicator size="small" color={C.accent} />
                  : <Ionicons name="send" size={20} color={C.accent} />}
              </TouchableOpacity>
            </View>
          </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const cs = StyleSheet.create({
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SH * 0.75 },
  handleArea: { paddingVertical: 10, alignItems: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2 },
  title: { fontSize: 16, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  bubble: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  cAuthor: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  cContent: { fontSize: 13, lineHeight: 18 },
  cActions: { flexDirection: 'row', gap: 12, marginTop: 4, paddingHorizontal: 4 },
  cLikeBtn: { paddingVertical: 2, paddingHorizontal: 4 },
  cLikeText: { fontSize: 12, fontWeight: '600' },
  cReactionEmoji: { fontSize: 16 },
  cReactBar: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, paddingHorizontal: 4 },
  cReactEmoji: { fontSize: 12 },
  cReactCount: { fontSize: 11 },
  cPickerRow: { flexDirection: 'row', gap: 2, marginTop: 6, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 24, borderWidth: 1, alignSelf: 'flex-start',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 10, elevation: 8 },
  cPickerEmoji: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  repliesWrap: { paddingLeft: 44, marginTop: -4, marginBottom: 4 },
  toggleRepliesBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 4, marginBottom: 4 },
  toggleRepliesText: { fontSize: 12, fontWeight: '600' },
  replyRow: { paddingLeft: 0, marginBottom: 8 },
  replyLine: { position: 'absolute', left: -16, top: 6, bottom: 6, width: 2, borderRadius: 1 },
  replyAvatar: { width: 26, height: 26, borderRadius: 13 },
  replyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  replyChipText: { flex: 1, fontSize: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, gap: 8 },
  inputAvatar: { width: 32, height: 32, borderRadius: 16 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, maxHeight: 100 },
  sendBtn: { padding: 6 },
});

// ── ReactionsSheet ─────────────────────────────────────────────────────────
type Reactor = { uid: string; displayName: string; photoURL: string | null; reaction: string };

function ReactionsSheet({ postId, onClose, C }: {
  postId: string; onClose: () => void; C: typeof DARK;
}) {
  const insets = useSafeAreaInsets();
  const [reactors, setReactors] = useState<Reactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const slideY = useRef(new Animated.Value(SH * 0.75)).current;

  useEffect(() => {
    Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    api.get<Reactor[]>(`/api/posts/${postId}/reactions`)
      .then(d => setReactors(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId, slideY]);

  const close = useCallback(() => {
    Animated.timing(slideY, { toValue: SH, duration: 260, useNativeDriver: true }).start(onClose);
  }, [onClose, slideY]);

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dy }) => dy > 8,
    onPanResponderMove: (_, { dy }) => { if (dy > 0) slideY.setValue(dy); },
    onPanResponderRelease: (_, { dy, vy }) => {
      if (dy > 100 || vy > 0.8) close();
      else Animated.spring(slideY, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  const uniqueReactions = useMemo(() => [...new Set(reactors.map(r => r.reaction))], [reactors]);
  const tabs = useMemo(() => ['all', ...uniqueReactions], [uniqueReactions]);
  const filtered = activeTab === 'all' ? reactors : reactors.filter(r => r.reaction === activeTab);

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={close}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      </TouchableOpacity>
      <Animated.View style={[rs.sheet, { backgroundColor: C.card, paddingBottom: insets.bottom + 4, transform: [{ translateY: slideY }] }]}>
        <View {...panResponder.panHandlers} style={rs.handleArea}>
          <View style={[rs.handle, { backgroundColor: C.placeholder }]} />
        </View>
        <Text style={[rs.title, { color: C.text, borderBottomColor: C.border }]}>Cảm xúc</Text>

        {/* Tabs */}
        {tabs.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={rs.tabsRow} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 8 }}>
            {tabs.map(tab => (
              <TouchableOpacity
                key={tab}
                style={[rs.tab, activeTab === tab && { backgroundColor: C.accent + '22', borderColor: C.accent }]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[rs.tabText, { color: activeTab === tab ? C.accent : C.subtext }]}>
                  {tab === 'all' ? `Tất cả ${reactors.length}` : `${tab} ${reactors.filter(r => r.reaction === tab).length}`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 32 }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => item.uid}
            style={rs.list}
            contentContainerStyle={{ paddingBottom: 8 }}
            renderItem={({ item }) => (
              <View style={rs.row}>
                {item.photoURL
                  ? <Image source={{ uri: item.photoURL }} style={rs.avatar} />
                  : <View style={[rs.avatar, { backgroundColor: C.placeholder, justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="person" size={14} color={C.subtext} />
                    </View>
                }
                <Text style={[rs.name, { color: C.text }]} numberOfLines={1}>{item.displayName}</Text>
                <Text style={rs.reactionEmoji}>{item.reaction}</Text>
              </View>
            )}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ color: C.subtext, fontSize: 14 }}>Chưa có cảm xúc nào</Text>
              </View>
            }
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const rs = StyleSheet.create({
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SH * 0.65 },
  handleArea: { paddingVertical: 10, alignItems: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2 },
  title: { fontSize: 16, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  tabsRow: { flexGrow: 0 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '600' },
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  name: { flex: 1, fontSize: 14, fontWeight: '500' },
  reactionEmoji: { fontSize: 22 },
});

// ── EmbedVideoItem ─────────────────────────────────────────────────────────
function EmbedVideoItem({ url, isVisible }: { url: string; isVisible: boolean }) {
  const [buffering, setBuffering] = useState(true);
  const thumbnail = cloudinaryVideoThumbnail(url);
  const player = useVideoPlayer(optimizeCloudinaryVideo(url), (p) => { p.loop = true; p.muted = false; });
  useEffect(() => {
    const sub = player.addListener('statusChange', (e: { status: string }) => setBuffering(e.status === 'idle' || e.status === 'loading'));
    return () => { try { player.pause(); } catch {} sub.remove(); };
  }, [player]);
  useEffect(() => { try { isVisible ? player.play() : player.pause(); } catch {} }, [isVisible, player]);
  return (
    <View style={ev.wrap}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" />
      {buffering && thumbnail && <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      {buffering && <View style={ev.loader}><ActivityIndicator color="#fff" size="small" /></View>}
    </View>
  );
}
const ev = StyleSheet.create({
  wrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  loader: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
});

// ── SharedPostEmbed ─────────────────────────────────────────────────────────
function SharedPostEmbed({ sf, C, isVisible = true }: { sf: NonNullable<Post['sharedFrom']>; C: typeof LIGHT; isVisible?: boolean }) {
  const text = parseMentions(sf.content ?? '');
  const firstMedia = sf.mediaUrls?.find(u => u && !isVideoUrl(u));
  const hasVideo = sf.mediaUrls?.some(u => u && isVideoUrl(u));
  return (
    <View style={[se.wrap, { borderColor: C.border, borderLeftColor: C.accent }]}>
      <View style={[se.inner, { backgroundColor: C.card2 }]}>
        <View style={se.header}>
          {sf.authorPhotoURL
            ? <Image source={{ uri: sf.authorPhotoURL }} style={se.avatar} />
            : <View style={[se.avatar, { backgroundColor: C.placeholder, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={12} color={C.subtext} />
              </View>
          }
          <Text style={[se.author, { color: C.text }]} numberOfLines={1}>{sf.authorDisplayName}</Text>
        </View>
        {text ? <Text style={[se.content, { color: C.text }]} numberOfLines={5}>{text}</Text> : null}
        {hasVideo && !firstMedia && <EmbedVideoItem url={sf.mediaUrls.find(u => u && isVideoUrl(u))!} isVisible={isVisible} />}
        {firstMedia && <Image source={{ uri: firstMedia }} style={se.media} resizeMode="cover" />}
      </View>
    </View>
  );
}

const se = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginTop: 8, borderRadius: 10, borderWidth: 1, borderLeftWidth: 3 },
  inner: { borderRadius: 9, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, paddingBottom: 4 },
  avatar: { width: 24, height: 24, borderRadius: 12 },
  author: { fontSize: 13, fontWeight: '700', flex: 1 },
  content: { fontSize: 13, lineHeight: 19, paddingHorizontal: 10, paddingBottom: 10 },
  media: { width: '100%', height: 180 },
  videoTag: { flexDirection: 'row', alignItems: 'center', gap: 6, margin: 10, marginTop: 0, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
  videoText: { fontSize: 12 },
});

// ── SharePostModal ────────────────────────────────────────────────────────────
function SharePostModal({ post, C, onClose }: { post: Post; C: typeof LIGHT; onClose: () => void }) {
  const [caption, setCaption] = useState('');
  const [sharing, setSharing] = useState(false);
  const addPost = useFeedStore((s) => s.addPost);
  const insets = useSafeAreaInsets();

  const handlePostShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const result = await api.post<Post>(`/api/posts/${post.id}/share`, { content: caption.trim() });
      addPost(result as unknown as FeedPost);
      onClose();
    } catch {
      setSharing(false);
    }
  };

  const originalSf: NonNullable<Post['sharedFrom']> = post.sharedFrom ?? {
    id: post.id,
    authorId: post.authorId ?? null,
    authorDisplayName: post.authorDisplayName,
    authorPhotoURL: post.authorPhotoURL,
    content: post.content ?? '',
    mediaUrls: post.mediaUrls ?? [],
    createdAt: post.createdAt,
  };

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      </TouchableOpacity>
      <View style={[sm.sheet, { backgroundColor: C.card, paddingBottom: insets.bottom + 12 }]}>
        <View style={[sm.header, { borderBottomColor: C.border }]}>
          <Text style={[sm.title, { color: C.text }]}>Chia sẻ lên feed</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={C.subtext} />
          </TouchableOpacity>
        </View>
        <SharedPostEmbed sf={originalSf} C={C} isVisible={false} />
        <TextInput
          style={[sm.input, { backgroundColor: C.inputBg, color: C.text }]}
          placeholder="Thêm ghi chú (tùy chọn)…"
          placeholderTextColor={C.placeholder}
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={300}
        />
        <TouchableOpacity
          style={[sm.submitBtn, { backgroundColor: C.accent, opacity: sharing ? 0.6 : 1 }]}
          onPress={handlePostShare}
          disabled={sharing}
        >
          {sharing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={sm.submitText}>Đăng lên feed</Text>}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const sm = StyleSheet.create({
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: '700' },
  preview: { margin: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  previewAuthor: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  previewContent: { fontSize: 13, lineHeight: 18 },
  input: { marginHorizontal: 12, marginTop: 4, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 70, textAlignVertical: 'top' },
  submitBtn: { marginHorizontal: 12, marginTop: 12, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

// ── PostCard ──────────────────────────────────────────────────────────────────
export default function PostCard({ post, isVisible, navigation }: PostCardProps) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const { user } = useAuthStore();
  const uid = user?.uid;
  const updatePost = useFeedStore((s) => s.updatePost);

  const [liked, setLiked] = useState(uid ? (post.likedBy?.includes(uid) ?? false) : false);
  const [selectedReaction, setSelectedReaction] = useState<string | null>(uid ? (post.reactions?.[uid] ?? null) : null);
  const [saved, setSaved] = useState(uid ? (post.savedBy?.includes(uid) ?? false) : false);
  const [reactionsMap, setReactionsMap] = useState<Record<string, string>>(post.reactions ?? {});
  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);
  const [commentCount, setCommentCount] = useState(post.replyCount ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showReactionsSheet, setShowReactionsSheet] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<PickerAnchor>({ px: 0, py: 0, pw: 0, ph: 0 });
  const [hoveredEmoji, setHoveredEmoji] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const likeButtonRef = useRef<View>(null);
  const pickerActiveRef = useRef(false);
  const pickerAnchorRef = useRef<PickerAnchor>({ px: 0, py: 0, pw: 0, ph: 0 });
  const hoveredEmojiRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLikePressRef = useRef<() => void>(() => {});
  const handleReactRef = useRef<(e: string) => void>(() => {});

  const handleShare = () => setShowShareModal(true);

  const handleSave = async () => {
    if (!uid) return;
    const next = !saved;
    setSaved(next);
    try {
      if (next) await api.post(`/api/posts/${post.id}/save`, {});
      else await api.delete(`/api/posts/${post.id}/save`);
    } catch { setSaved(!next); }
  };

  const MAX_CHARS = 150;
  const long = (post.content?.length ?? 0) > MAX_CHARS;
  const displayText = expanded
    ? post.content
    : long ? post.content.slice(0, MAX_CHARS).trimEnd() + '…' : post.content;

  const handleReact = async (emoji: string) => {
    if (!uid) return;
    const alreadyPicked = liked && selectedReaction === emoji;
    const newLiked = !alreadyPicked;
    const prevLiked = liked;
    const prevReaction = selectedReaction;
    const prevCount = likeCount;
    const prevMap = reactionsMap;
    setLiked(newLiked);
    setSelectedReaction(newLiked ? emoji : null);
    setLikeCount(c => alreadyPicked ? Math.max(0, c - 1) : prevLiked ? c : c + 1);
    setShowReactionPicker(false);
    setReactionsMap(prev => {
      const next = { ...prev };
      if (newLiked) next[uid] = emoji;
      else delete next[uid];
      return next;
    });
    try {
      if (alreadyPicked || !prevLiked) {
        await api.post(`/api/posts/${post.id}/like`, { reaction: emoji });
      } else {
        await api.post(`/api/posts/${post.id}/like`, { reaction: prevReaction });
        await api.post(`/api/posts/${post.id}/like`, { reaction: emoji });
      }
      updatePost({ id: post.id, likeCount: newLiked ? (prevLiked ? prevCount : prevCount + 1) : Math.max(0, prevCount - 1) });
    } catch {
      setLiked(prevLiked);
      setSelectedReaction(prevReaction);
      setLikeCount(prevCount);
      setReactionsMap(prevMap);
    }
  };

  const handleLikePress = () => handleReact(selectedReaction ?? '❤️');
  handleLikePressRef.current = handleLikePress;
  handleReactRef.current = handleReact;

  const calcHoverIdx = (pageX: number, pageY: number, anch: PickerAnchor): number | null => {
    const PICKER_H = 70;
    const PICKER_W = Math.min(SW - 16, REACTIONS.length * 50 + 28);
    const pickerTop = anch.py > PICKER_H + 12 ? anch.py - PICKER_H - 8 : anch.py + anch.ph + 8;
    const pickerLeft = Math.max(8, Math.min(SW - PICKER_W - 8, anch.px + anch.pw / 2 - PICKER_W / 2));
    const slot = PICKER_W / REACTIONS.length;
    if (pageY < pickerTop - 24 || pageY > pickerTop + PICKER_H + 24) return null;
    const idx = Math.floor((pageX - pickerLeft) / slot);
    return idx >= 0 && idx < REACTIONS.length ? idx : null;
  };

  const likeGesture = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      pickerActiveRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        likeButtonRef.current?.measure((_fx, _fy, pw, ph, px, py) => {
          const anchor = { px, py, pw, ph };
          pickerAnchorRef.current = anchor;
          pickerActiveRef.current = true;
          setReactionPickerActive(true);
          setPickerAnchor(anchor);
          setShowReactionPicker(true);
        });
      }, 400);
    },
    onPanResponderMove: (e) => {
      if (!pickerActiveRef.current) return;
      const { pageX, pageY } = e.nativeEvent;
      const idx = calcHoverIdx(pageX, pageY, pickerAnchorRef.current);
      hoveredEmojiRef.current = idx;
      setHoveredEmoji(idx);
    },
    onPanResponderRelease: () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        handleLikePressRef.current();
        return;
      }
      const wasActive = pickerActiveRef.current;
      const idx = hoveredEmojiRef.current;
      pickerActiveRef.current = false;
      hoveredEmojiRef.current = null;
      setReactionPickerActive(false);
      setShowReactionPicker(false);
      setHoveredEmoji(null);
      if (wasActive && idx !== null) handleReactRef.current(REACTIONS[idx]);
    },
    onPanResponderTerminate: () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      pickerActiveRef.current = false;
      hoveredEmojiRef.current = null;
      setReactionPickerActive(false);
      setShowReactionPicker(false);
      setHoveredEmoji(null);
    },
    onPanResponderTerminationRequest: () => !pickerActiveRef.current,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const goToProfile = () => {
    if (post.authorId) {
      navigation.navigate('Profile', { userId: post.authorId });
    }
  };

  const feelingStr = post.feeling ? (FEELING_STR[post.feeling] ?? '') + post.feeling : null;

  return (
    <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
      {post._discover && (
        <View style={[s.discoverBadge, { backgroundColor: C.accent + '22', borderColor: C.accent }]}>
          <Ionicons name="compass-outline" size={11} color={C.accent} />
          <Text style={[s.discoverText, { color: C.accent }]}>Khám phá</Text>
        </View>
      )}

      {/* Header */}
      <View style={s.cardHeader}>
        <TouchableOpacity onPress={goToProfile} activeOpacity={0.8}>
          {post.authorPhotoURL
            ? <Image source={{ uri: post.authorPhotoURL }} style={s.avatarCircle} />
            : <View style={[s.avatarCircle, { backgroundColor: C.placeholder, justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="person" size={16} color={C.subtext} />
              </View>
          }
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <TouchableOpacity onPress={goToProfile} activeOpacity={0.8}>
            <Text style={[s.authorName, { color: C.text }]} numberOfLines={2}>
              {post.authorDisplayName}
              {feelingStr
                ? <Text style={{ fontWeight: '400', fontSize: 13, color: C.subtext }}>{' '}đang cảm thấy {feelingStr}</Text>
                : null}
              {post.taggedFriends?.length
                ? <Text style={{ fontWeight: '400', fontSize: 13, color: C.subtext }}>
                    {' '}cùng với{' '}
                    <Text style={{ color: C.accent }}>{post.taggedFriends[0].displayName}</Text>
                    {post.taggedFriends.length > 1 ? ` và ${post.taggedFriends.length - 1} người khác` : ''}
                  </Text>
                : null}
            </Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Text style={[s.metaText, { color: C.subtext }]}>{timeAgo(post.createdAt)}</Text>
            {post.location
              ? <><Text style={[s.metaText, { color: C.subtext }]}>·</Text>
                  <Ionicons name="location-outline" size={11} color={C.subtext} />
                  <Text style={[s.metaText, { color: C.subtext }]} numberOfLines={1}>{post.location}</Text></>
              : null}
            {post.isEdited && <Text style={[s.metaText, { color: C.subtext }]}>· đã chỉnh sửa</Text>}
            <Ionicons name={privacyIcon(post.privacy)} size={11} color={C.subtext} />
          </View>
        </View>
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color={C.subtext} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {post.content ? (
        <View style={s.contentWrap}>
          <Text style={[s.contentText, { color: C.text }]}>{displayText}</Text>
          {long && (
            <TouchableOpacity onPress={() => setExpanded((e) => !e)}>
              <Text style={[s.seeMore, { color: C.accent }]}>{expanded ? ' Thu gọn' : ' Xem thêm'}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Media */}
      {post.mediaUrls?.length > 0 && (
        <View style={{ marginVertical: 4 }}>
          <MediaGrid urls={post.mediaUrls} isVisible={isVisible} />
        </View>
      )}

      {/* Shared post embed */}
      {post.sharedFrom && <SharedPostEmbed sf={post.sharedFrom} C={C} isVisible={isVisible} />}

      {/* Reactions summary */}
      {Object.keys(reactionsMap).length > 0 && (
        <TouchableOpacity
          style={[s.reactionsBar, { borderTopColor: C.border }]}
          onPress={() => setShowReactionsSheet(true)}
          activeOpacity={0.7}
        >
          <Text style={s.reactionsEmoji}>{topReactions(reactionsMap).join('')}</Text>
          <Text style={[s.reactionsCount, { color: C.subtext }]}>{fmtCount(Object.keys(reactionsMap).length)}</Text>
        </TouchableOpacity>
      )}

      {/* Actions */}
      <View style={[s.actionsRow, { borderTopColor: C.border }]}>
        <View
          ref={likeButtonRef}
          style={s.actionBtn}
          {...likeGesture.panHandlers}
        >
          {liked && selectedReaction
            ? <Text style={s.selectedEmoji}>{selectedReaction}</Text>
            : <Ionicons name="heart-outline" size={22} color={C.subtext} />
          }
          {likeCount > 0 && (
            <Text style={[s.actionCount, { color: liked ? '#ef4444' : C.subtext }]}>
              {fmtCount(likeCount)}
            </Text>
          )}
        </View>
        <TouchableOpacity style={s.actionBtn} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={21} color={C.subtext} />
          {commentCount > 0 && <Text style={[s.actionCount, { color: C.subtext }]}>{fmtCount(commentCount)}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={handleShare}>
          <Ionicons name="arrow-redo-outline" size={22} color={C.subtext} />
        </TouchableOpacity>
        {showShareModal && (
          <SharePostModal
            post={post}
            C={C}
            onClose={() => setShowShareModal(false)}
          />
        )}
        <TouchableOpacity style={s.actionBtn} onPress={handleSave}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={21} color={saved ? C.accent : C.subtext} />
        </TouchableOpacity>
      </View>

      <ReactionPickerOverlay
        visible={showReactionPicker}
        C={C}
        anchor={pickerAnchor}
        hovered={hoveredEmoji}
      />

      {showReactionsSheet && (
        <ReactionsSheet postId={post.id} onClose={() => setShowReactionsSheet(false)} C={C} />
      )}

      {showComments && (
        <CommentSheet
          postId={post.id}
          onClose={() => setShowComments(false)}
          onCountChange={(n) => {
            setCommentCount(n);
            updatePost({ id: post.id, replyCount: n });
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  avatarCircle: { width: 40, height: 40, borderRadius: 20 },
  authorName: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  metaText: { fontSize: 12 },
  discoverBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginLeft: 12, marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  discoverText: { fontSize: 11, fontWeight: '600' },
  contentWrap: { paddingHorizontal: 12, paddingBottom: 8 },
  contentText: { fontSize: 14, lineHeight: 21 },
  seeMore: { fontSize: 14, fontWeight: '600' },
  mediaArea: { width: MEDIA_W, height: MEDIA_W * 0.5625, alignSelf: 'center' },
  videoContainer: { width: MEDIA_W, maxHeight: MEDIA_W, minHeight: MEDIA_W * 0.5625, alignSelf: 'center', backgroundColor: '#000', overflow: 'hidden', borderRadius: 4 },
  videoArea: { width: MEDIA_W, height: MEDIA_W },
  muteBtn: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, padding: 6 },
  videoBuffering: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4, borderTopWidth: 1 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9 },
  actionCount: { fontSize: 13, fontWeight: '500' },
  selectedEmoji: { fontSize: 22 },
  reactionsBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  reactionsEmoji: { fontSize: 14 },
  reactionsCount: { fontSize: 12, fontWeight: '500' },
});
