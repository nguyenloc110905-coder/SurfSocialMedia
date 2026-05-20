import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  KeyboardAvoidingView,
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
import { api } from '@/lib/api';

export type { FeedPost };

type Post = FeedPost;
type Comment = {
  id: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  content: string;
  createdAt: Post['createdAt'];
  likeCount: number;
};

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
  const player = useVideoPlayer(optimizeCloudinaryVideo(url), (p) => { p.loop = true; p.muted = false; });
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
  const [muted, setMuted] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const thumbnail = cloudinaryVideoThumbnail(url);
  const player = useVideoPlayer(optimizeCloudinaryVideo(url), (p) => { p.loop = true; p.muted = false; });

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

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
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
  const slideY = useRef(new Animated.Value(SH * 0.75)).current;

  useEffect(() => {
    Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
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
    } catch (e) {
      console.warn('Load comments error:', e);
    } finally { setLoading(false); }
  }, [postId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const submit = async () => {
    const tmp = text.trim();
    if (!tmp || submitting) return;
    setText('');
    setSubmitting(true);
    try {
      await api.post(`/api/comments/${postId}`, { content: tmp });
      await loadComments();
    } catch { setText(tmp); } finally { setSubmitting(false); }
  };

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={close}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      </TouchableOpacity>
      <Animated.View style={[cs.sheet, { backgroundColor: C.card, paddingBottom: insets.bottom + 4, transform: [{ translateY: slideY }] }]}>
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
        ) : (
          <ScrollView style={cs.list} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
            {comments.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 36 }}>
                <Ionicons name="chatbubble-outline" size={40} color={C.subtext} />
                <Text style={{ color: C.subtext, marginTop: 8, fontSize: 14 }}>Chưa có bình luận nào</Text>
              </View>
            ) : (
              comments.map((c) => (
                <View key={c.id} style={cs.row}>
                  {c.authorPhotoURL ? (
                    <Image source={{ uri: c.authorPhotoURL }} style={cs.avatar} />
                  ) : (
                    <View style={[cs.avatar, { backgroundColor: C.placeholder, justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="person" size={13} color={C.subtext} />
                    </View>
                  )}
                  <View style={[cs.bubble, { backgroundColor: C.card2 }]}>
                    <Text style={[cs.cAuthor, { color: C.text }]}>{c.authorDisplayName}</Text>
                    <Text style={[cs.cContent, { color: C.text }]}>{c.content}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[cs.inputRow, { borderTopColor: C.border }]}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={cs.inputAvatar} />
            ) : (
              <View style={[cs.inputAvatar, { backgroundColor: C.placeholder, justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="person" size={12} color={C.subtext} />
              </View>
            )}
            <TextInput
              style={[cs.input, { backgroundColor: C.inputBg, color: C.text }]}
              placeholder="Viết bình luận..."
              placeholderTextColor={C.subtext}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity onPress={submit} disabled={!text.trim() || submitting} style={[cs.sendBtn, { opacity: text.trim() ? 1 : 0.35 }]}>
              {submitting
                ? <ActivityIndicator size="small" color={C.accent} />
                : <Ionicons name="send" size={20} color={C.accent} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
  bubble: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  cAuthor: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  cContent: { fontSize: 13, lineHeight: 18 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, gap: 8 },
  inputAvatar: { width: 32, height: 32, borderRadius: 16 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, maxHeight: 100 },
  sendBtn: { padding: 6 },
});

// ── PostCard ──────────────────────────────────────────────────────────────────
export default function PostCard({ post, isVisible, navigation }: PostCardProps) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const { user } = useAuthStore();
  const uid = user?.uid;
  const updatePost = useFeedStore((s) => s.updatePost);

  const [liked, setLiked] = useState(uid ? (post.likedBy?.includes(uid) ?? false) : false);
  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);
  const [commentCount, setCommentCount] = useState(post.replyCount ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const MAX_CHARS = 150;
  const long = (post.content?.length ?? 0) > MAX_CHARS;
  const displayText = expanded
    ? post.content
    : long ? post.content.slice(0, MAX_CHARS).trimEnd() + '…' : post.content;

  const handleLike = async () => {
    if (!uid) return;
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => (newLiked ? c + 1 : Math.max(0, c - 1)));
    try {
      await api.post(`/api/posts/${post.id}/like`, { reaction: '❤️' });
      updatePost({ id: post.id, likeCount: newLiked ? (post.likeCount ?? 0) + 1 : Math.max(0, (post.likeCount ?? 0) - 1) });
    } catch {
      setLiked(!newLiked);
      setLikeCount((c) => (newLiked ? c - 1 : c + 1));
    }
  };

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

      {/* Actions */}
      <View style={[s.actionsRow, { borderTopColor: C.border }]}>
        <TouchableOpacity style={s.actionBtn} onPress={handleLike}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? '#ef4444' : C.subtext} />
          {likeCount > 0 && <Text style={[s.actionCount, { color: liked ? '#ef4444' : C.subtext }]}>{fmtCount(likeCount)}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={21} color={C.subtext} />
          {commentCount > 0 && <Text style={[s.actionCount, { color: C.subtext }]}>{fmtCount(commentCount)}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn}>
          <Ionicons name="arrow-redo-outline" size={22} color={C.subtext} />
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn}>
          <Ionicons name="bookmark-outline" size={21} color={C.subtext} />
        </TouchableOpacity>
      </View>

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
});
