import React, { useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useFeedStore } from '@/stores/feedStore';
import { useAuthStore } from '@/stores/authStore';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
  onFeedPress?: () => void;
};

// ── Dimensions ───────────────────────────────────────────────────────────────
const { width: SW } = Dimensions.get('window');
const H_PAD = 8;
const COL_GAP = 6;
const LEFT_W = (SW - H_PAD * 2 - COL_GAP) * 0.55;
const RIGHT_W = (SW - H_PAD * 2 - COL_GAP) * 0.45;

// ── Theme — sync với surf-client tailwind.config.js ──────────────────────────
const DARK = {
  bg: '#0f172a',       // surf.dark
  card: '#1e293b',     // surf.card
  card2: '#253347',
  placeholder: '#334155',
  border: '#334155',
  text: '#e2e8f0',
  subtext: '#64748b',
  accent: '#0ea5e9',   // surf.primary
  accent2: '#06b6d4',  // surf.secondary
};

const LIGHT = {
  bg: '#f8fafc',       // surf.light
  card: '#ffffff',     // surf.card-light
  card2: '#f1f5f9',
  placeholder: '#e2e8f0',
  border: '#e2e8f0',
  text: '#1f2937',
  subtext: '#64748b',
  accent: '#0ea5e9',   // surf.primary
  accent2: '#06b6d4',  // surf.secondary
};

// ── Dữ liệu story — khi tích hợp API thay bằng prop/state thật ──────────────
type Story = { id: string; name: string };
const stories: Story[] = [];   // empty → không render
const STORY_LIMIT = 5;

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

function timeAgo(raw: any): string {
  let ms = 0;
  if (!raw) return '';
  if (typeof raw === 'number') ms = raw * 1000;
  else if (typeof raw === 'string') ms = new Date(raw).getTime();
  else if (raw._seconds) ms = raw._seconds * 1000;
  else if (raw.seconds) ms = raw.seconds * 1000;
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
  return `${Math.floor(diff / 86400)} ngày`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation, onFeedPress }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const posts = useFeedStore((s) => s.posts);
  const loading = useFeedStore((s) => s.loading);
  
  const user = useAuthStore((s) => s.user);
  
  // Watch user state - if it becomes null, Navigation will auto-handle logout
  useEffect(() => {
    if (user === null) {
      console.log('👤 User logged out - Navigation will redirect to Login');
    }
  }, [user]);
  
  // Ưu tiên bài có ảnh, fallback về bài đầu tiên
  const isImgUrl = (u: string) => !u.match(/\/video\/upload\//i) && !u.match(/\.(mp4|mov|webm|m4v)(\?|$)/i);
  const postWithImg = posts.find(p => p.mediaUrls?.some(isImgUrl)) ?? null;
  const firstPost = postWithImg ?? posts[0] ?? null;
  const firstImg = firstPost?.mediaUrls?.find(isImgUrl) ?? null;

  const visibleStories = stories.slice(0, STORY_LIMIT);
  const extra = Math.max(0, stories.length - STORY_LIMIT);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      {/* ── Stories — chỉ hiện khi có story ── */}
      {stories.length > 0 && (
        <View style={[s.storiesWrap, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.storiesList}
          >
            {visibleStories.map((item) => (
              <TouchableOpacity key={item.id} style={s.storyBtn}>
                <View style={[s.storyRing, { borderColor: C.accent }]}>
                  <View style={[s.storyAvatar, { backgroundColor: C.placeholder }]}>
                    <Ionicons name="person" size={18} color={C.subtext} />
                  </View>
                </View>
                <Text style={[s.storyLabel, { color: C.subtext }]} numberOfLines={1}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            ))}
            {extra > 0 && (
              <TouchableOpacity style={s.storyBtn}>
                <View style={[s.storyRing, { borderColor: C.border }]}>
                  <View style={[s.storyAvatar, { backgroundColor: C.card2 }]}>
                    <Text style={[s.extraText, { color: C.text }]}>+{extra}</Text>
                  </View>
                </View>
                <Text style={[s.storyLabel, { color: C.subtext }]}>Thêm</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}

      {/* ── Nội dung chính — grid + AI row ── */}
      <View style={[s.mainContent, { paddingHorizontal: H_PAD }]}>
      {/* ── Main grid ── */}
      <View style={[s.grid]}>

        {/* Left column */}
        <View style={[s.col, { width: LEFT_W }]}>

          {/* Feed card — flex 1 chiếm khoảng 55% chiều cao */}
          <TouchableOpacity
            style={[s.card, s.feedCard, { backgroundColor: C.card, borderColor: C.border }]}
            onPress={() => onFeedPress ? onFeedPress() : navigation.navigate('Feed')}
            activeOpacity={0.85}
          >
            {/* Header */}
            <View style={s.postHeader}>
              {firstPost?.authorPhotoURL
                ? <Image source={{ uri: firstPost.authorPhotoURL }} style={s.avatarSm} />
                : <View style={[s.avatarSm, { backgroundColor: C.placeholder, justifyContent: 'center', alignItems: 'center' }]}>
                    <Ionicons name="person" size={12} color={C.subtext} />
                  </View>
              }
              <View style={{ marginLeft: 6, flex: 1 }}>
                <Text style={[s.postAuthor, { color: C.text }]} numberOfLines={1}>
                  {firstPost?.authorDisplayName ?? (loading ? '...' : 'Chưa có bài')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[s.postTime, { color: C.subtext }]}>
                    {firstPost ? timeAgo(firstPost.createdAt) : ''}
                  </Text>
                  {firstPost && <Ionicons name="globe-outline" size={10} color={C.subtext} style={{ marginLeft: 3 }} />}
                </View>
              </View>
            </View>

            {/* Image or placeholder */}
            {firstImg
              ? <Image source={{ uri: firstImg }} style={[s.postImg, { backgroundColor: C.placeholder }]} resizeMode="cover" />
              : <View style={[s.postImg, { backgroundColor: C.placeholder }]} />
            }

            {/* Content */}
            {firstPost?.content
              ? <Text style={[s.postDesc, { color: C.subtext }]} numberOfLines={2}>{firstPost.content}</Text>
              : <Text style={[s.postDesc, { color: C.subtext }]}>{loading ? 'Đang tải...' : 'Mô tả'}</Text>
            }

            {/* Counts */}
            <View style={s.postActions}>
              <ActionItem icon="heart-outline" color={C.subtext} count={firstPost?.likeCount ?? 0} />
              <ActionItem icon="chatbubble-outline" color={C.subtext} count={firstPost?.replyCount ?? 0} />
              <ActionItem icon="arrow-redo-outline" color={C.subtext} count={0} />
            </View>

            <Text style={[s.feedTag, { color: C.accent, borderTopColor: C.border }]}>Feed</Text>
          </TouchableOpacity>

          {/* Short video card — flex 1 chiếm phần còn lại */}
          <TouchableOpacity
            style={[s.card, s.videoCard, { backgroundColor: C.placeholder, borderColor: C.border }]}
            activeOpacity={0.85}
          >
            <Ionicons name="play-circle" size={38} color="rgba(255,255,255,0.85)" />
            <View style={s.videoFooter}>
              <View style={[s.avatarSm, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
                <Ionicons name="person" size={12} color="#ccc" />
              </View>
              <View style={{ marginLeft: 5 }}>
                <Text style={s.videoAuthor}>tên</Text>
                <Text style={s.videoTime}>Giờ</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Right column */}
        <View style={[s.col, { width: RIGHT_W, marginLeft: COL_GAP }]}>

          {/* Thông báo — chỉ tiêu đề, không có mock row */}
          <View style={[s.card, s.rightCardTop, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Thông báo</Text>
            <View style={s.emptySection}>
              <Ionicons name="notifications-outline" size={22} color={C.placeholder} />
            </View>
          </View>

          {/* Đề xuất kết bạn — chỉ tiêu đề, không có mock row */}
          <View style={[s.card, s.rightCardMid, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Đề xuất kết bạn</Text>
            <View style={s.emptySection}>
              <Ionicons name="people-outline" size={22} color={C.placeholder} />
            </View>
          </View>

          {/* Placeholder card */}
          <View style={[s.card, s.rightCardBot, { backgroundColor: C.card2, borderColor: C.border }]} />
        </View>
      </View>

      {/* ── AI + Messages — cùng layout với grid ── */}
      <View style={s.aiRow}>
        <TouchableOpacity
          style={[s.aiButton, { backgroundColor: C.accent + '1a', borderColor: C.accent }]}
          onPress={() => navigation.navigate('AI')}
          activeOpacity={0.8}
        >
          <Text style={[s.aiButtonText, { color: C.accent }]}>AI</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.msgButton, { backgroundColor: C.card, borderColor: C.border }]}
          onPress={() => navigation.navigate('Messages')}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      </View>
    </SafeAreaView>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────
function ActionItem({ icon, color, count = 0 }: { icon: string; color: string; count?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
      <Ionicons name={icon as any} size={13} color={color} />
      <Text style={{ color, fontSize: 11, marginLeft: 2 }}>{count}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  // Stories
  storiesWrap: { borderBottomWidth: 1, paddingVertical: 10 },
  storiesList: { paddingHorizontal: 10, gap: 14 },
  storyBtn: { alignItems: 'center', width: 54 },
  storyRing: { borderWidth: 2, borderRadius: 27, padding: 2 },
  storyAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  storyLabel: { fontSize: 10, marginTop: 3, textAlign: 'center' },
  extraText: { fontSize: 12, fontWeight: '700' },

  // Main content wrapper
  mainContent: { flex: 1, paddingTop: 8, paddingBottom: 8 },

  // Grid
  grid: { flex: 1, flexDirection: 'row' },
  col: { flex: 1, flexDirection: 'column' },

  // Card base
  card: { borderRadius: 10, borderWidth: 1, overflow: 'hidden', padding: 8 },

  // Feed card — flex lớn hơn video
  feedCard: { flex: 3, marginBottom: 6 },

  // Feed card elements
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  avatarSm: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  postAuthor: { fontSize: 11, fontWeight: '600' },
  postTime: { fontSize: 9 },
  postImg: { flex: 1, borderRadius: 6, marginBottom: 5 },
  postDesc: { fontSize: 10, marginBottom: 5 },
  postActions: { flexDirection: 'row', marginBottom: 4 },
  feedTag: {
    fontSize: 11, fontWeight: '600', textAlign: 'center',
    paddingTop: 4, borderTopWidth: 1, marginTop: 2,
  },

  // Video card — flex nhỏ hơn feed
  videoCard: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoFooter: {
    position: 'absolute', bottom: 8, left: 8,
    flexDirection: 'row', alignItems: 'center',
  },
  videoAuthor: { color: '#fff', fontSize: 11, fontWeight: '600' },
  videoTime: { color: 'rgba(255,255,255,0.7)', fontSize: 9 },

  // Right column cards — chia nhau chiều cao
  rightCardTop: { flex: 2, marginBottom: 6 },
  rightCardMid: { flex: 3, marginBottom: 6 },
  rightCardBot: { flex: 2 },

  // Section headers
  sectionTitle: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  emptySection: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // AI row — nằm trong mainContent, dưới grid
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  aiButton: {
    flex: 1, borderRadius: 22, borderWidth: 1.5,
    paddingVertical: 9, alignItems: 'center',
  },
  aiButtonText: { fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  msgButton: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});

