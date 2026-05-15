import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
  ActivityIndicator,
  useColorScheme,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import PostCard from '@/components/PostCard';
import type { FeedPost } from '@/stores/feedStore';

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Profile'>;
  route: RouteProp<RootStackParamList, 'Profile'>;
};

type UserProfile = {
  id?: string;
  displayName?: string | null;
  photoURL?: string | null;
  email?: string | null;
  bio?: string | null;
  coverImageUrl?: string | null;
  currentCity?: string | null;
  hometown?: string | null;
  work?: Array<{ company: string; title?: string; current?: boolean }>;
  education?: Array<{ school: string; degree?: string; year?: string }>;
  relationship?: string | null;
  joinedAt?: unknown;
};

type Friend = { id: string; displayName?: string; photoURL?: string | null };

// ── Theme ─────────────────────────────────────────────────────────────────────

const DARK = {
  bg: '#0f172a', card: '#1e293b', border: '#334155',
  text: '#e2e8f0', subtext: '#64748b', accent: '#0ea5e9',
  placeholder: '#334155', tag: '#1e3a5f',
};
const LIGHT = {
  bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0',
  text: '#1f2937', subtext: '#64748b', accent: '#0ea5e9',
  placeholder: '#e2e8f0', tag: '#e0f2fe',
};

const { width: SW } = Dimensions.get('window');
const COVER_H = SW * 0.42;
const AVATAR_SIZE = 90;
const TABS = ['Bài viết', 'Giới thiệu', 'Bạn bè'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatJoined(raw: unknown): string {
  if (!raw) return '';
  let ms = 0;
  if (typeof raw === 'number') ms = raw * 1000;
  else if (typeof raw === 'string') ms = new Date(raw).getTime();
  else if (typeof raw === 'object' && raw !== null) {
    const r = raw as Record<string, unknown>;
    if (typeof r._seconds === 'number') ms = r._seconds * 1000;
    else if (typeof r.seconds === 'number') ms = r.seconds * 1000;
  }
  if (!ms) return '';
  const d = new Date(ms);
  return `Tham gia ${d.getMonth() + 1}/${d.getFullYear()}`;
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen({ navigation, route }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const { user: authUser } = useAuthStore();

  const targetUid = route.params?.userId ?? authUser?.uid ?? '';
  const isOwn = !route.params?.userId || route.params.userId === authUser?.uid;

  // ── State ──────────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Bài viết');
  const [refreshing, setRefreshing] = useState(false);
  const [friendStatus, setFriendStatus] = useState<'loading' | 'friends' | 'request_sent' | 'stranger'>('loading');
  const [actionLoading, setActionLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [friendRequestId, setFriendRequestId] = useState<string | null>(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({ inputRange: [COVER_H - 60, COVER_H], outputRange: [0, 1], extrapolate: 'clamp' });

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    if (!targetUid) return;
    setProfileLoading(true);
    try {
      const data = await api.get<UserProfile>(`/api/users/${targetUid}`);
      setProfile(data);
    } catch {
      setProfile({});
    } finally {
      setProfileLoading(false);
    }
  }, [targetUid]);

  const loadPosts = useCallback(async () => {
    if (!targetUid) return;
    setPostsLoading(true);
    try {
      const data = await api.get<{ posts: FeedPost[] }>(`/api/users/${targetUid}/posts`);
      setPosts(data.posts ?? []);
    } catch {
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }, [targetUid]);

  const loadFriends = useCallback(async () => {
    if (!targetUid) return;
    setFriendsLoading(true);
    try {
      const data = await api.get<{ friends: Friend[] }>(`/api/users/${targetUid}/friends`);
      setFriends(data.friends ?? []);
    } catch {
      setFriends([]);
    } finally {
      setFriendsLoading(false);
    }
  }, [targetUid]);

  const loadFriendStatus = useCallback(async () => {
    if (isOwn || !targetUid) return;
    try {
      const data = await api.get<{ status: string; requestId?: string }>(`/api/friends/status/${targetUid}`);
      setFriendStatus(data.status as typeof friendStatus);
      setFriendRequestId(data.requestId ?? null);
    } catch {
      setFriendStatus('stranger');
    }
  }, [targetUid, isOwn]);

  useEffect(() => {
    loadProfile();
    loadPosts();
    loadFriends();
    if (!isOwn) loadFriendStatus();
    else setFriendStatus('stranger');
  }, [loadProfile, loadPosts, loadFriends, loadFriendStatus, isOwn]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadPosts(), loadFriends()]);
    setRefreshing(false);
  };

  // ── Friend actions ─────────────────────────────────────────────────────────

  const handleFriendAction = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      if (friendStatus === 'stranger') {
        const res = await api.post<{ id: string }>('/api/friends/requests', { toUid: targetUid });
        setFriendStatus('request_sent');
        setFriendRequestId(res.id);
      } else if (friendStatus === 'request_sent' && friendRequestId) {
        await api.delete(`/api/friends/requests/${friendRequestId}`);
        setFriendStatus('stranger');
        setFriendRequestId(null);
      } else if (friendStatus === 'friends') {
        await api.delete(`/api/friends/${targetUid}`);
        setFriendStatus('stranger');
      }
    } catch { /* ignore */ } finally {
      setActionLoading(false);
    }
  };

  // ── Start chat ───────────────────────────────────────────────────────────────

  const handleStartChat = async () => {
    if (chatLoading || !targetUid) return;
    setChatLoading(true);
    try {
      const res = await api.post<{ item: { id: string } }>('/api/conversations', { peerUid: targetUid });
      const convId = res.item?.id;
      if (!convId) return;
      navigation.navigate('Chat', {
        conversationId: convId,
        title: displayName,
        peerUid: targetUid,
        peerAvatar: photoURL ?? null,
      });
    } catch { /* ignore */ } finally {
      setChatLoading(false);
    }
  };

  // ── Derived display values ─────────────────────────────────────────────────

  const displayName = isOwn
    ? (authUser?.displayName || profile?.displayName || 'Người dùng')
    : (profile?.displayName || 'Người dùng');
  const photoURL = isOwn
    ? (authUser?.photoURL || profile?.photoURL || null)
    : (profile?.photoURL || null);
  const coverUrl = profile?.coverImageUrl ?? null;
  const bio = profile?.bio ?? null;
  const initial = displayName.charAt(0).toUpperCase();
  const joined = formatJoined(profile?.joinedAt);

  // ── Friend button label ────────────────────────────────────────────────────

  function friendBtnLabel() {
    if (friendStatus === 'friends') return 'Bạn bè';
    if (friendStatus === 'request_sent') return 'Đã gửi lời mời';
    return 'Thêm bạn';
  }
  function friendBtnIcon(): keyof typeof Ionicons.glyphMap {
    if (friendStatus === 'friends') return 'people';
    if (friendStatus === 'request_sent') return 'time-outline';
    return 'person-add-outline';
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderHeader = () => (
    <View>
      {/* Cover */}
      <View style={[s.cover, { height: COVER_H }]}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0c2d48' }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1a4a6b', opacity: 0.6, top: COVER_H * 0.4 }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0ea5e9', opacity: 0.08 }]} />
          </>
        )}
      </View>

      {/* Avatar row */}
      <View style={[s.avatarRow, { backgroundColor: C.card }]}>
        <View style={s.avatarWrap}>
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={s.avatarImg} />
          ) : (
            <View style={[s.avatarImg, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={s.avatarInitial}>{initial}</Text>
            </View>
          )}
        </View>

        {/* Action buttons */}
        <View style={s.actionBtns}>
          {isOwn ? (
            <TouchableOpacity
              style={[s.btnOutline, { borderColor: C.border }]}
              onPress={() => navigation.navigate('Settings')}
            >
              <Ionicons name="create-outline" size={16} color={C.text} />
              <Text style={[s.btnOutlineText, { color: C.text }]}>Chỉnh sửa</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[s.btnPrimary, { backgroundColor: friendStatus === 'friends' ? C.card : C.accent, borderColor: C.border, borderWidth: friendStatus === 'friends' ? 1 : 0 }]}
                onPress={handleFriendAction}
                disabled={actionLoading || friendStatus === 'loading'}
              >
                {actionLoading ? (
                  <ActivityIndicator size={14} color={friendStatus === 'friends' ? C.text : '#fff'} />
                ) : (
                  <Ionicons name={friendBtnIcon()} size={16} color={friendStatus === 'friends' ? C.text : '#fff'} />
                )}
                <Text style={[s.btnPrimaryText, { color: friendStatus === 'friends' ? C.text : '#fff' }]}>
                  {friendBtnLabel()}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnOutline, { borderColor: C.border }]}
                onPress={handleStartChat}
                disabled={chatLoading}
              >
                {chatLoading
                  ? <ActivityIndicator size={14} color={C.text} />
                  : <Ionicons name="chatbubble-outline" size={16} color={C.text} />
                }
                <Text style={[s.btnOutlineText, { color: C.text }]}>Nhắn tin</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Name + bio */}
      <View style={[s.nameSection, { backgroundColor: C.card, borderBottomColor: C.border }]}>
        <Text style={[s.displayName, { color: C.text }]}>{displayName}</Text>
        {bio ? (
          <Text style={[s.bio, { color: C.subtext }]}>{bio}</Text>
        ) : isOwn ? (
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Text style={[s.addBio, { color: C.accent }]}>+ Thêm tiểu sử</Text>
          </TouchableOpacity>
        ) : null}

        {/* Stats */}
        <View style={[s.statsRow, { borderTopColor: C.border }]}>
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: C.text }]}>{posts.length}</Text>
            <Text style={[s.statLabel, { color: C.subtext }]}>Bài viết</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: C.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: C.text }]}>{friends.length}</Text>
            <Text style={[s.statLabel, { color: C.subtext }]}>Bạn bè</Text>
          </View>
          {joined ? (
            <>
              <View style={[s.statDivider, { backgroundColor: C.border }]} />
              <View style={s.statItem}>
                <Ionicons name="water-outline" size={14} color={C.accent} />
                <Text style={[s.statLabel, { color: C.subtext }]}>{joined}</Text>
              </View>
            </>
          ) : null}
        </View>
      </View>

      {/* Tabs */}
      <View style={[s.tabBar, { backgroundColor: C.card, borderBottomColor: C.border }]}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tabItem, activeTab === tab && { borderBottomColor: C.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabText, { color: activeTab === tab ? C.accent : C.subtext }]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ── About section ──────────────────────────────────────────────────────────

  const renderAbout = () => (
    <View style={[s.aboutCard, { backgroundColor: C.card, borderColor: C.border }]}>
      {bio ? (
        <View style={s.aboutRow}>
          <Ionicons name="information-circle-outline" size={20} color={C.accent} />
          <Text style={[s.aboutText, { color: C.text }]}>{bio}</Text>
        </View>
      ) : (
        <Text style={[s.aboutEmpty, { color: C.subtext }]}>Chưa có tiểu sử.</Text>
      )}

      {(profile?.work ?? []).map((w, i) => (
        <View key={i} style={s.aboutRow}>
          <Ionicons name="briefcase-outline" size={20} color={C.accent} />
          <Text style={[s.aboutText, { color: C.text }]}>
            {w.title ? `${w.title} tại ${w.company}` : w.company}
            {w.current ? <Text style={{ color: C.subtext }}> · Đang làm</Text> : null}
          </Text>
        </View>
      ))}

      {(profile?.education ?? []).map((e, i) => (
        <View key={i} style={s.aboutRow}>
          <Ionicons name="school-outline" size={20} color={C.accent} />
          <Text style={[s.aboutText, { color: C.text }]}>
            {e.school}{e.degree ? ` · ${e.degree}` : ''}
          </Text>
        </View>
      ))}

      {profile?.currentCity ? (
        <View style={s.aboutRow}>
          <Ionicons name="location-outline" size={20} color={C.accent} />
          <Text style={[s.aboutText, { color: C.text }]}>Sống tại {profile.currentCity}</Text>
        </View>
      ) : null}

      {profile?.hometown ? (
        <View style={s.aboutRow}>
          <Ionicons name="home-outline" size={20} color={C.accent} />
          <Text style={[s.aboutText, { color: C.text }]}>Quê ở {profile.hometown}</Text>
        </View>
      ) : null}

      {profile?.relationship ? (
        <View style={s.aboutRow}>
          <Ionicons name="heart-outline" size={20} color={C.accent} />
          <Text style={[s.aboutText, { color: C.text }]}>{profile.relationship}</Text>
        </View>
      ) : null}

      {joined ? (
        <View style={s.aboutRow}>
          <Ionicons name="water-outline" size={20} color={C.accent} />
          <Text style={[s.aboutText, { color: C.subtext }]}>{joined}</Text>
        </View>
      ) : null}
    </View>
  );

  // ── Friends grid ───────────────────────────────────────────────────────────

  const renderFriendsGrid = () => (
    <View style={[s.friendsGrid, { backgroundColor: C.card, borderColor: C.border }]}>
      {friendsLoading ? (
        <ActivityIndicator color={C.accent} style={{ paddingVertical: 20 }} />
      ) : friends.length === 0 ? (
        <Text style={[s.aboutEmpty, { color: C.subtext }]}>Chưa có bạn bè.</Text>
      ) : (
        <View style={s.friendsWrap}>
          {friends.slice(0, 9).map((f) => (
            <TouchableOpacity
              key={f.id}
              style={s.friendItem}
              onPress={() => navigation.navigate('Profile', { userId: f.id })}
            >
              {f.photoURL ? (
                <Image source={{ uri: f.photoURL }} style={s.friendAvatar} />
              ) : (
                <View style={[s.friendAvatar, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={s.friendInitial}>{(f.displayName ?? '?').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={[s.friendName, { color: C.text }]} numberOfLines={1}>{f.displayName ?? 'Người dùng'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  // ── Tab content ────────────────────────────────────────────────────────────

  const renderTabContent = () => {
    if (activeTab === 'Giới thiệu') return renderAbout();
    if (activeTab === 'Bạn bè') return renderFriendsGrid();

    // Posts
    if (postsLoading) {
      return (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={C.accent} />
        </View>
      );
    }
    if (posts.length === 0) {
      return (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
          <Ionicons name="newspaper-outline" size={44} color={C.subtext} />
          <Text style={{ color: C.subtext, fontSize: 14 }}>Chưa có bài viết nào.</Text>
        </View>
      );
    }
    return (
      <>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} isVisible navigation={navigation} />
        ))}
      </>
    );
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (profileLoading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <View style={[s.topBar, { borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      {/* Sticky header (shows on scroll) */}
      <Animated.View
        style={[s.topBar, { borderBottomColor: C.border, backgroundColor: C.card, opacity: headerOpacity }]}
        pointerEvents="none"
      >
        <Text style={[s.topBarTitle, { color: C.text }]} numberOfLines={1}>{displayName}</Text>
      </Animated.View>

      {/* Back button (always on top) */}
      <View style={[s.topBar, s.topBarAbsolute]} pointerEvents="box-none">
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.accent} colors={[C.accent]} />}
      >
        {renderHeader()}
        <View style={{ paddingBottom: insets.bottom + 16 }}>
          {renderTabContent()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // Top bar
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    height: 52, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, borderBottomWidth: 1,
  },
  topBarAbsolute: {
    backgroundColor: 'transparent', borderBottomWidth: 0,
  },
  topBarTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  // Cover
  cover: { width: SW },
  coverGradient: {
    backgroundColor: '#1e3a5f',
  },

  // Avatar row
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 0,
    gap: 12,
  },
  avatarWrap: {
    marginTop: -(AVATAR_SIZE / 2),
    borderRadius: AVATAR_SIZE / 2 + 3,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
  },
  avatarInitial: { fontSize: 36, fontWeight: 'bold', color: '#fff' },

  // Action buttons
  actionBtns: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'flex-end', paddingBottom: 4 },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  btnPrimaryText: { fontSize: 13, fontWeight: '600' },
  btnOutline: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  btnOutlineText: { fontSize: 13, fontWeight: '600' },

  // Name section
  nameSection: { paddingHorizontal: 16, paddingBottom: 0, borderBottomWidth: 1 },
  displayName: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  bio: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  addBio: { fontSize: 14, marginTop: 4 },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, marginTop: 10, borderTopWidth: 1, gap: 12 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statNum: { fontSize: 15, fontWeight: '700' },
  statLabel: { fontSize: 13 },
  statDivider: { width: 1, height: 16 },

  // Tabs
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 1,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 13, fontWeight: '600' },

  // About
  aboutCard: {
    margin: 12, borderRadius: 14, borderWidth: 1,
    padding: 16, gap: 14,
  },
  aboutRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  aboutText: { flex: 1, fontSize: 14, lineHeight: 20 },
  aboutEmpty: { fontSize: 14, textAlign: 'center', paddingVertical: 8 },

  // Friends grid
  friendsGrid: {
    margin: 12, borderRadius: 14, borderWidth: 1, padding: 12,
  },
  friendsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  friendItem: { width: (SW - 24 - 12 * 2 - 8 * 2) / 3, alignItems: 'center', gap: 4 },
  friendAvatar: { width: 70, height: 70, borderRadius: 35, overflow: 'hidden' },
  friendInitial: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  friendName: { fontSize: 12, textAlign: 'center' },
});
