import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  useColorScheme,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Search'>;
};

type SearchUser = { id: string; name: string; avatarUrl?: string; mutualCount?: number };
type SearchPost = {
  id: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  authorId: string;
  content: string;
  mediaUrls: string[];
  likeCount: number;
  replyCount: number;
};

type Tab = 'people' | 'posts' | 'videos';
type DateFilter = 'any' | 'today' | 'week' | 'month';

// ── Theme ─────────────────────────────────────────────────────────────────────

const DARK = {
  bg: '#0f172a', card: '#1e293b', border: '#334155',
  text: '#e2e8f0', subtext: '#64748b', accent: '#0ea5e9',
  input: '#1e293b', placeholder: '#64748b',
  chip: '#1e293b', chipActive: '#0ea5e9', chipText: '#94a3b8', chipActiveText: '#fff',
};
const LIGHT = {
  bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0',
  text: '#1f2937', subtext: '#64748b', accent: '#0ea5e9',
  input: '#f1f5f9', placeholder: '#94a3b8',
  chip: '#ffffff', chipActive: '#0ea5e9', chipText: '#6b7280', chipActiveText: '#fff',
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'people', label: 'Mọi người', icon: 'people-outline' },
  { key: 'posts',  label: 'Bài viết',  icon: 'newspaper-outline' },
  { key: 'videos', label: 'Video',     icon: 'videocam-outline' },
];

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'any',   label: 'Mọi thời gian' },
  { key: 'today', label: 'Hôm nay' },
  { key: 'week',  label: '7 ngày' },
  { key: 'month', label: '30 ngày' },
];

function isVideoUrl(url: string) {
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ q, C }: { q: string; C: typeof DARK }) {
  return (
    <View style={es.wrap}>
      <Ionicons name="search-outline" size={56} color={C.subtext} />
      <Text style={[es.title, { color: C.subtext }]}>
        Không tìm thấy kết quả cho "{q}"
      </Text>
      <Text style={[es.sub, { color: C.placeholder }]}>Thử tìm với từ khoá khác</Text>
    </View>
  );
}

const es = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  title: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  sub: { fontSize: 13, textAlign: 'center' },
});

function UserCard({ user, C, onPress }: { user: SearchUser; C: typeof DARK; onPress: () => void }) {
  const initial = (user.name ?? '?').charAt(0).toUpperCase();
  return (
    <TouchableOpacity style={[uc.row]} onPress={onPress} activeOpacity={0.7}>
      {user.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={uc.avatar} />
      ) : (
        <View style={[uc.avatar, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={uc.initial}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[uc.name, { color: C.text }]}>{user.name}</Text>
        {(user.mutualCount ?? 0) > 0 && (
          <Text style={[uc.mutual, { color: C.subtext }]}>{user.mutualCount} bạn chung</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.subtext} />
    </TouchableOpacity>
  );
}

const uc = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden' },
  initial: { fontSize: 20, fontWeight: '700', color: '#fff' },
  name: { fontSize: 15, fontWeight: '600' },
  mutual: { fontSize: 12, marginTop: 1 },
});

function PostCard({ post, C, onPress }: { post: SearchPost; C: typeof DARK; onPress: () => void }) {
  const firstImage = post.mediaUrls?.find((u) => !isVideoUrl(u));
  const initial = (post.authorDisplayName ?? '?').charAt(0).toUpperCase();
  return (
    <TouchableOpacity style={[pc.row]} onPress={onPress} activeOpacity={0.7}>
      {firstImage ? (
        <Image source={{ uri: firstImage }} style={pc.thumb} />
      ) : (
        <View style={[pc.thumb, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[pc.author, { color: C.text }]} numberOfLines={1}>{post.authorDisplayName}</Text>
        <Text style={[pc.content, { color: C.subtext }]} numberOfLines={2}>{post.content}</Text>
        <View style={pc.stats}>
          <Text style={[pc.stat, { color: C.placeholder }]}>❤️ {post.likeCount}</Text>
          <Text style={[pc.stat, { color: C.placeholder }]}>💬 {post.replyCount}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const pc = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'flex-start' },
  thumb: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', flexShrink: 0 },
  author: { fontSize: 14, fontWeight: '600' },
  content: { fontSize: 13, lineHeight: 18 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { fontSize: 12 },
});

function VideoCard({ post, C, onPress }: { post: SearchPost; C: typeof DARK; onPress: () => void }) {
  const videoUrl = post.mediaUrls?.find((u) => isVideoUrl(u));
  if (!videoUrl) return null;
  const initial = (post.authorDisplayName ?? '?').charAt(0).toUpperCase();
  return (
    <TouchableOpacity style={[vc.card, { backgroundColor: C.card, borderColor: C.border }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[vc.thumb, { backgroundColor: '#111' }]}>
        <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.85)" />
      </View>
      <View style={vc.info}>
        <View style={[vc.avatar, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
          {post.authorPhotoURL ? (
            <Image source={{ uri: post.authorPhotoURL }} style={StyleSheet.absoluteFill} />
          ) : (
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{initial}</Text>
          )}
        </View>
        <Text style={[vc.name, { color: C.text }]} numberOfLines={2}>{post.authorDisplayName}</Text>
      </View>
    </TouchableOpacity>
  );
}

const vc = StyleSheet.create({
  card: { width: '47%', borderRadius: 12, borderWidth: 1, overflow: 'hidden', margin: '1.5%' },
  thumb: { height: 110, alignItems: 'center', justifyContent: 'center' },
  info: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  avatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden', flexShrink: 0 },
  name: { flex: 1, fontSize: 12, fontWeight: '500' },
});

function Separator({ C }: { C: typeof DARK }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginHorizontal: 16 }} />;
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SearchScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('people');
  const [dateFilter, setDateFilter] = useState<DateFilter>('any');

  const [users, setUsers] = useState<SearchUser[]>([]);
  const [posts, setPosts] = useState<SearchPost[]>([]);
  const [videos, setVideos] = useState<SearchPost[]>([]);

  const [loadingPeople, setLoadingPeople] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [donePeople, setDonePeople] = useState(false);
  const [donePosts, setDonePosts] = useState(false);
  const [doneVideos, setDoneVideos] = useState(false);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load recent searches ──
  useEffect(() => {
    api.get<{ recentSearches: string[] }>('/api/users/me/recent-searches')
      .then(d => setRecentSearches(d.recentSearches ?? []))
      .catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ── Save to recent searches ──
  const saveRecent = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const updated = [trimmed, ...prev.filter(s => s !== trimmed)].slice(0, 10);
      api.put('/api/users/me/recent-searches', { recentSearches: updated }).catch(() => {});
      return updated;
    });
  }, []);

  // ── Fetch helpers ──
  const fetchPeople = useCallback(async (q: string) => {
    if (!q.trim()) { setUsers([]); setDonePeople(true); return; }
    setLoadingPeople(true); setDonePeople(false);
    try {
      const res = await api.get<{ users: SearchUser[] }>(`/api/users/search?q=${encodeURIComponent(q.trim())}`);
      setUsers(res.users ?? []);
    } catch { setUsers([]); } finally { setLoadingPeople(false); setDonePeople(true); }
  }, []);

  const fetchPosts = useCallback(async (q: string, date: DateFilter) => {
    if (!q.trim()) { setPosts([]); setDonePosts(true); return; }
    setLoadingPosts(true); setDonePosts(false);
    try {
      const params = new URLSearchParams({ q: q.trim(), type: 'posts' });
      if (date !== 'any') params.set('date', date);
      const res = await api.get<{ posts: SearchPost[] }>(`/api/posts/search?${params}`);
      setPosts(res.posts ?? []);
    } catch { setPosts([]); } finally { setLoadingPosts(false); setDonePosts(true); }
  }, []);

  const fetchVideos = useCallback(async (q: string, date: DateFilter) => {
    if (!q.trim()) { setVideos([]); setDoneVideos(true); return; }
    setLoadingVideos(true); setDoneVideos(false);
    try {
      const params = new URLSearchParams({ q: q.trim(), type: 'videos' });
      if (date !== 'any') params.set('date', date);
      const res = await api.get<{ posts: SearchPost[] }>(`/api/posts/search?${params}`);
      setVideos(res.posts ?? []);
    } catch { setVideos([]); } finally { setLoadingVideos(false); setDoneVideos(true); }
  }, []);

  // ── Debounced search ──
  const doSearch = useCallback((q: string, date: DateFilter) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPeople(q);
      fetchPosts(q, date);
      fetchVideos(q, date);
    }, 350);
  }, [fetchPeople, fetchPosts, fetchVideos]);

  const handleChangeText = (text: string) => {
    setQuery(text);
    doSearch(text, dateFilter);
  };

  const handleSubmit = () => {
    if (query.trim()) { saveRecent(query); doSearch(query, dateFilter); Keyboard.dismiss(); }
  };

  const handleDateFilter = (d: DateFilter) => {
    setDateFilter(d);
    doSearch(query, d);
  };

  const handleRecent = (q: string) => {
    setQuery(q);
    doSearch(q, dateFilter);
  };

  const handleClearRecent = (q: string) => {
    setRecentSearches(prev => {
      const updated = prev.filter(s => s !== q);
      api.put('/api/users/me/recent-searches', { recentSearches: updated }).catch(() => {});
      return updated;
    });
  };

  const loadingCurrent = activeTab === 'people' ? loadingPeople : activeTab === 'posts' ? loadingPosts : loadingVideos;
  const doneCurrent    = activeTab === 'people' ? donePeople    : activeTab === 'posts' ? donePosts    : doneVideos;
  const hasQuery = query.trim().length > 0;

  // ── Render content ──

  const renderContent = () => {
    if (!hasQuery) {
      if (recentSearches.length === 0) {
        return (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
            <Ionicons name="search-outline" size={56} color={C.subtext} />
            <Text style={{ color: C.subtext, fontSize: 15 }}>Nhập từ khoá để tìm kiếm</Text>
          </View>
        );
      }
      return (
        <View style={[s.recentBox, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={s.recentHeader}>
            <Text style={[s.recentTitle, { color: C.text }]}>Tìm kiếm gần đây</Text>
            <TouchableOpacity onPress={() => { setRecentSearches([]); api.put('/api/users/me/recent-searches', { recentSearches: [] }).catch(() => {}); }}>
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>Xóa tất cả</Text>
            </TouchableOpacity>
          </View>
          {recentSearches.map((q) => (
            <TouchableOpacity key={q} style={[s.recentRow, { borderBottomColor: C.border }]} onPress={() => handleRecent(q)}>
              <Ionicons name="time-outline" size={18} color={C.subtext} />
              <Text style={[s.recentText, { color: C.text }]} numberOfLines={1}>{q}</Text>
              <TouchableOpacity onPress={() => handleClearRecent(q)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={16} color={C.subtext} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    if (loadingCurrent) {
      return <ActivityIndicator color={C.accent} style={{ marginTop: 48 }} size="large" />;
    }

    if (!doneCurrent) return null;

    if (activeTab === 'people') {
      if (!users.length) return <EmptyState q={query} C={C} />;
      return (
        <FlatList
          data={users}
          keyExtractor={u => u.id}
          renderItem={({ item }) => (
            <UserCard user={item} C={C} onPress={() => navigation.navigate('Profile', { userId: item.id })} />
          )}
          ItemSeparatorComponent={() => <Separator C={C} />}
          ListHeaderComponent={<Text style={[s.resultCount, { color: C.subtext }]}>{users.length} người dùng</Text>}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={false}
        />
      );
    }

    if (activeTab === 'posts') {
      if (!posts.length) return <EmptyState q={query} C={C} />;
      return (
        <FlatList
          data={posts}
          keyExtractor={p => p.id}
          renderItem={({ item }) => (
            <PostCard post={item} C={C} onPress={() => navigation.navigate('Profile', { userId: item.authorId })} />
          )}
          ItemSeparatorComponent={() => <Separator C={C} />}
          ListHeaderComponent={<Text style={[s.resultCount, { color: C.subtext }]}>{posts.length} bài viết</Text>}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={false}
        />
      );
    }

    if (activeTab === 'videos') {
      const filtered = videos.filter(v => v.mediaUrls?.some(isVideoUrl));
      if (!filtered.length) return <EmptyState q={query} C={C} />;
      return (
        <View>
          <Text style={[s.resultCount, { color: C.subtext }]}>{filtered.length} video</Text>
          <View style={s.videoGrid}>
            {filtered.map(v => (
              <VideoCard
                key={v.id}
                post={v}
                C={C}
                onPress={() => navigation.navigate('Profile', { userId: v.authorId })}
              />
            ))}
          </View>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      {/* Search bar */}
      <View style={[s.searchBar, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={[s.inputWrap, { backgroundColor: C.input }]}>
          <Ionicons name="search-outline" size={18} color={C.placeholder} />
          <TextInput
            ref={inputRef}
            style={[s.input, { color: C.text }]}
            value={query}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSubmit}
            placeholder="Tìm kiếm..."
            placeholderTextColor={C.placeholder}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setUsers([]); setPosts([]); setVideos([]); setDonePeople(false); setDonePosts(false); setDoneVideos(false); }}>
              <Ionicons name="close-circle" size={18} color={C.placeholder} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Tabs */}
        {hasQuery && (
          <View style={[s.tabRow, { borderBottomColor: C.border }]}>
            {TABS.map(tab => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[s.tabItem, active && { borderBottomColor: C.accent, borderBottomWidth: 2 }]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Ionicons name={tab.icon} size={16} color={active ? C.accent : C.subtext} />
                  <Text style={[s.tabText, { color: active ? C.accent : C.subtext }]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Date filter chips (only for posts/videos) */}
        {hasQuery && (activeTab === 'posts' || activeTab === 'videos') && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chips}
            keyboardShouldPersistTaps="handled"
          >
            {DATE_FILTERS.map(f => {
              const active = dateFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[s.chip, { backgroundColor: active ? C.chipActive : C.chip, borderColor: active ? C.chipActive : C.border }]}
                  onPress={() => handleDateFilter(f.key)}
                >
                  <Text style={[s.chipText, { color: active ? C.chipActiveText : C.chipText }]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Result count for people */}
        {hasQuery && donePeople && activeTab === 'people' && users.length > 0 && (
          <Text style={[s.resultCount, { color: C.subtext }]}>{users.length} người dùng</Text>
        )}

        {/* Content */}
        <View style={{ paddingTop: 4 }}>
          {renderContent()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1,
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },

  tabRow: {
    flexDirection: 'row', borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 11,
  },
  tabText: { fontSize: 13, fontWeight: '600' },

  chips: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '500' },

  resultCount: {
    fontSize: 12, fontWeight: '500',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },

  videoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 6,
  },

  recentBox: {
    margin: 12, borderRadius: 14, borderWidth: 1, overflow: 'hidden',
  },
  recentHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  recentTitle: { fontSize: 15, fontWeight: '700' },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentText: { flex: 1, fontSize: 14 },
});
