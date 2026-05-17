import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { FeedPost } from '@/stores/feedStore';
import { useNotificationStore, type NotificationItem } from '@/stores/notificationStore';
import PostCard from '@/components/PostCard';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MainTabs'>;
  isActive?: boolean;
};

type NotificationResponse = {
  notifications?: NotificationItem[];
  items?: NotificationItem[];
};

const DARK = {
  bg: '#0f172a',
  card: '#1e293b',
  card2: '#253347',
  border: '#334155',
  text: '#e2e8f0',
  subtext: '#94a3b8',
  muted: '#64748b',
  accent: '#0ea5e9',
  danger: '#ef4444',
};

const LIGHT = {
  bg: '#f8fafc',
  card: '#ffffff',
  card2: '#f1f5f9',
  border: '#e2e8f0',
  text: '#1f2937',
  subtext: '#64748b',
  muted: '#94a3b8',
  accent: '#0ea5e9',
  danger: '#ef4444',
};

const NOTIFICATION_TYPES: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
];

type FilterKey = 'all' | 'unread';

function isUnread(item: NotificationItem): boolean {
  if (typeof item.read === 'boolean') return !item.read;
  if (typeof item.isRead === 'boolean') return !item.isRead;
  return false;
}

function stripMentionMarkup(text: string): string {
  return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
}

function toMillis(createdAt: NotificationItem['createdAt']): number {
  if (!createdAt) return 0;
  if (typeof createdAt === 'number') return createdAt > 10_000_000_000 ? createdAt : createdAt * 1000;
  if (typeof createdAt === 'string') return new Date(createdAt).getTime();
  return (createdAt._seconds ?? createdAt.seconds ?? 0) * 1000;
}

function timeAgo(createdAt: NotificationItem['createdAt']): string {
  const ms = toMillis(createdAt);
  if (!ms) return '';
  const diff = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày`;
  return new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function initials(name?: string): string {
  const clean = (name ?? 'S').trim();
  return clean.charAt(0).toUpperCase();
}

function getActorPhoto(item: NotificationItem): string | null {
  return item.actorPhoto ?? item.actorPhotoURL ?? null;
}

function getNotificationIcon(type: string): keyof typeof Ionicons.glyphMap {
  if (type === 'friend_request' || type === 'friend_accept') return 'person-add-outline';
  if (type === 'reaction' || type === 'post_reaction' || type === 'comment_reaction') return 'heart-outline';
  if (type === 'comment' || type === 'reply' || type === 'mention') return 'chatbubble-ellipses-outline';
  if (type === 'tag') return 'pricetag-outline';
  if (type === 'message') return 'mail-outline';
  if (type === 'system') return 'megaphone-outline';
  return 'notifications-outline';
}

function notificationTitle(item: NotificationItem): string {
  if (item.message) return stripMentionMarkup(item.message);

  const name = item.actorName ?? 'Ai đó';
  const type = item.type;
  if (type === 'tag') return `${name} đã gắn thẻ bạn trong một bài viết`;
  if (type === 'friend_request') return `${name} đã gửi lời mời kết bạn`;
  if (type === 'friend_accept') return `${name} đã chấp nhận lời mời kết bạn`;
  if (type === 'reaction' || type === 'post_reaction') {
    return `${name} đã bày tỏ cảm xúc ${item.reaction ?? ''} với bài viết của bạn`.trim();
  }
  if (type === 'comment') return `${name} đã bình luận về bài viết của bạn`;
  if (type === 'reply') return `${name} đã trả lời bình luận của bạn`;
  if (type === 'comment_reaction') {
    return `${name} đã thả ${item.reaction ?? ''} vào bình luận của bạn`.trim();
  }
  if (type === 'mention') return `${name} đã nhắc đến bạn`;
  if (type === 'message') return `${name} đã gửi tin nhắn`;
  return `${name} đã thông báo cho bạn`;
}

function notificationSnippet(item: NotificationItem): string | null {
  const snippet = item.commentSnippet ?? item.postSnippet;
  return snippet ? stripMentionMarkup(snippet) : null;
}

function SkeletonRow({ C }: { C: typeof DARK }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  return (
    <Animated.View style={[s.row, { opacity: pulse, borderBottomColor: C.border }]}>
      <View style={[s.avatar, { backgroundColor: C.card2 }]} />
      <View style={s.rowBody}>
        <View style={[s.skLine, { width: '82%', backgroundColor: C.card2 }]} />
        <View style={[s.skLine, { width: '52%', backgroundColor: C.card2 }]} />
      </View>
    </Animated.View>
  );
}

function NotificationAvatar({ item, C }: { item: NotificationItem; C: typeof DARK }) {
  const photo = getActorPhoto(item);
  if (photo) return <Image source={{ uri: photo }} style={s.avatar} />;
  return (
    <View style={[s.avatar, { backgroundColor: C.accent }]}>
      <Text style={s.avatarText}>{initials(item.actorName)}</Text>
    </View>
  );
}

export default function NotificationCenterScreen({ navigation, isActive = true }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const user = useAuthStore((state) => state.user);
  const items = useNotificationStore((state) => state.items);
  const setItems = useNotificationStore((state) => state.setItems);
  const markItemRead = useNotificationStore((state) => state.markItemRead);
  const markAllItemsRead = useNotificationStore((state) => state.markAllRead);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await api.get<NotificationResponse>('/api/notifications?limit=50');
      const next = (data.notifications ?? data.items ?? [])
        .filter((item): item is NotificationItem => item != null && typeof item.id === 'string')
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setItems(next);
    } catch (e) {
      setError((e as Error).message || 'Không thể tải thông báo');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isActive) load(true);
  }, [isActive, load]);

  useEffect(() => {
    if (!isActive || !user) return;
    const interval = setInterval(() => load(true), 15_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') load(true);
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [isActive, load, user]);

  const unreadCount = useMemo(() => items.filter(isUnread).length, [items]);
  const visibleItems = filter === 'unread' ? items.filter(isUnread) : items;

  const markRead = useCallback(async (id: string) => {
    markItemRead(id);
    if (id.startsWith('message-')) return;
    try {
      await api.patch(`/api/notifications/${id}/read`);
    } catch {
      // Keep optimistic UI; the next refresh will reconcile the server state.
    }
  }, [markItemRead]);

  const markAllRead = useCallback(async () => {
    if (unreadCount === 0) return;
    markAllItemsRead();
    try {
      await api.patch('/api/notifications/read-all');
    } catch {
      load(true);
    }
  }, [load, markAllItemsRead, unreadCount]);

  const openNotification = useCallback(async (item: NotificationItem) => {
    if (isUnread(item)) await markRead(item.id);

    const postId = item.postId ?? (item.entityType === 'post' ? item.entityId : undefined);
    const conversationId =
      item.conversationId ?? (item.entityType === 'conversation' || item.entityType === 'chat' ? item.entityId : undefined);

    if (conversationId) {
      navigation.navigate('Chat', {
        conversationId,
        title: item.actorName ?? 'Tin nhắn',
        peerUid: item.actorId ?? null,
        peerAvatar: getActorPhoto(item),
      });
      return;
    }

    if (postId) {
      navigation.navigate('NotificationPost', { postId });
      return;
    }

    if (item.actorId) {
      navigation.navigate('Profile', { userId: item.actorId });
    }
  }, [markRead, navigation]);

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const unread = isUnread(item);
    const snippet = notificationSnippet(item);

    return (
      <TouchableOpacity
        style={[
          s.row,
          {
            borderBottomColor: C.border,
            backgroundColor: unread ? `${C.accent}18` : C.bg,
          },
        ]}
        onPress={() => openNotification(item)}
        activeOpacity={0.75}
      >
        <View style={s.avatarWrap}>
          <NotificationAvatar item={item} C={C} />
          <View style={[s.typeBadge, { backgroundColor: C.card, borderColor: C.border }]}>
            <Ionicons name={getNotificationIcon(item.type)} size={12} color={C.accent} />
          </View>
        </View>
        <View style={s.rowBody}>
          <Text style={[s.title, { color: C.text, fontWeight: unread ? '700' : '500' }]} numberOfLines={2}>
            {notificationTitle(item)}
          </Text>
          {snippet ? (
            <Text style={[s.snippet, { color: C.subtext }]} numberOfLines={1}>
              "{snippet}"
            </Text>
          ) : null}
          <Text style={[s.time, { color: unread ? C.accent : C.muted }]}>
            {timeAgo(item.createdAt)}
          </Text>
        </View>
        {unread ? <View style={[s.dot, { backgroundColor: C.accent }]} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      <View style={[s.header, { borderBottomColor: C.border }]}>
        <View>
          <Text style={[s.headerTitle, { color: C.text }]}>Thông báo</Text>
          <Text style={[s.headerSub, { color: C.subtext }]}>
            {unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : 'Tất cả đã đọc'}
          </Text>
        </View>
        <TouchableOpacity
          style={[s.markAllBtn, { borderColor: unreadCount > 0 ? C.accent : C.border }]}
          onPress={markAllRead}
          disabled={unreadCount === 0}
          activeOpacity={0.75}
        >
          <Ionicons name="checkmark-done-outline" size={18} color={unreadCount > 0 ? C.accent : C.muted} />
          <Text style={[s.markAllText, { color: unreadCount > 0 ? C.accent : C.muted }]}>Đã đọc</Text>
        </TouchableOpacity>
      </View>

      <View style={s.filters}>
        {NOTIFICATION_TYPES.map((item) => {
          const active = filter === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[
                s.filterBtn,
                {
                  backgroundColor: active ? C.accent : C.card,
                  borderColor: active ? C.accent : C.border,
                },
              ]}
              activeOpacity={0.75}
            >
              <Text style={[s.filterText, { color: active ? '#fff' : C.text }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View>
          {[0, 1, 2, 3, 4, 5].map((item) => <SkeletonRow key={item} C={C} />)}
        </View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons name="cloud-offline-outline" size={54} color={C.subtext} />
          <Text style={[s.emptyTitle, { color: C.text }]}>Không thể tải thông báo</Text>
          <Text style={[s.emptyText, { color: C.subtext }]}>{error}</Text>
          <TouchableOpacity style={[s.retryBtn, { borderColor: C.accent }]} onPress={() => load()}>
            <Text style={[s.retryText, { color: C.accent }]}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name={filter === 'unread' ? 'checkmark-circle-outline' : 'notifications-outline'} size={56} color={C.subtext} />
              <Text style={[s.emptyTitle, { color: C.text }]}>
                {filter === 'unread' ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo'}
              </Text>
              <Text style={[s.emptyText, { color: C.subtext }]}>
                Thông báo về bài viết, bình luận, bạn bè và tin nhắn sẽ xuất hiện tại đây.
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

type PostDetailProps = NativeStackScreenProps<RootStackParamList, 'NotificationPost'>;

export function NotificationPostDetailScreen({ route, navigation }: PostDetailProps) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const [post, setPost] = useState<FeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPost = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<FeedPost>(`/api/posts/${route.params.postId}`);
      setPost(data);
    } catch (e) {
      setError((e as Error).message || 'Không thể tải bài viết');
    } finally {
      setLoading(false);
    }
  }, [route.params.postId]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      <View style={[s.postHeader, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.postHeaderTitle, { color: C.text }]}>Bài viết</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : error || !post ? (
        <View style={s.center}>
          <Ionicons name="document-text-outline" size={54} color={C.subtext} />
          <Text style={[s.emptyTitle, { color: C.text }]}>Không tìm thấy bài viết</Text>
          <Text style={[s.emptyText, { color: C.subtext }]}>{error ?? 'Bài viết không còn tồn tại.'}</Text>
          <TouchableOpacity style={[s.retryBtn, { borderColor: C.accent }]} onPress={loadPost}>
            <Text style={[s.retryText, { color: C.accent }]}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={[post]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.postList}
          renderItem={({ item }) => <PostCard post={item} isVisible navigation={navigation as any} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 24, fontWeight: '800' },
  headerSub: { fontSize: 12, marginTop: 2 },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  markAllText: { fontSize: 13, fontWeight: '700' },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterBtn: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  filterText: { fontSize: 13, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  typeBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minHeight: 48, justifyContent: 'center' },
  title: { fontSize: 14, lineHeight: 19 },
  snippet: { fontSize: 12, marginTop: 3 },
  time: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 8 },
  skLine: { height: 12, borderRadius: 8, marginBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 28 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryBtn: { marginTop: 8, borderWidth: 1, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 8 },
  retryText: { fontSize: 14, fontWeight: '700' },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  postHeaderTitle: { fontSize: 18, fontWeight: '800' },
  postList: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 16 },
});
