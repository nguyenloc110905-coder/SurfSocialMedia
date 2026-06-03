import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useFeedStore } from '@/stores/feedStore';
import { useAuthStore } from '@/stores/authStore';
import { useFriendStore } from '@/stores/friendStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { api } from '@/lib/api';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
  onFeedPress?: () => void;
  onFriendsPress?: () => void;
  onVideoPress?: () => void;
  onNotificationsPress?: () => void;
  onMessagesPress?: () => void;
};

type ConversationPreview = {
  id: string;
  type: 'dm' | 'group';
  title?: string;
  peer: { uid: string; name: string; avatarUrl: string | null } | null;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

const { width: SW } = Dimensions.get('window');
const H_PAD = 8;
const COL_GAP = 6;
const LEFT_W = (SW - H_PAD * 2 - COL_GAP) * 0.55;
const RIGHT_W = (SW - H_PAD * 2 - COL_GAP) * 0.45;

const DARK = {
  bg: '#0f172a',
  card: '#1e293b',
  card2: '#253347',
  placeholder: '#334155',
  border: '#334155',
  text: '#e2e8f0',
  subtext: '#64748b',
  accent: '#0ea5e9',
  accent2: '#06b6d4',
  green: '#22c55e',
  amber: '#f59e0b',
};

const LIGHT = {
  bg: '#f8fafc',
  card: '#ffffff',
  card2: '#f1f5f9',
  placeholder: '#e2e8f0',
  border: '#e2e8f0',
  text: '#1f2937',
  subtext: '#64748b',
  accent: '#0ea5e9',
  accent2: '#06b6d4',
  green: '#16a34a',
  amber: '#d97706',
};

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

function isImgUrl(url: string) {
  return !url.match(/\/video\/upload\//i) && !url.match(/\.(mp4|mov|webm|m4v)(\?|$)/i);
}

export default function HomeScreen({
  navigation,
  onFeedPress,
  onFriendsPress,
  onVideoPress,
  onNotificationsPress,
  onMessagesPress,
}: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const posts = useFeedStore((s) => s.posts);
  const loading = useFeedStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const incomingFriendRequests = useFriendStore((s) => s.incomingRequests.length);
  const unreadNotifications = useNotificationStore((s) =>
    s.items.filter((item) => !(item.read ?? item.isRead)).length
  );
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);

  const loadConversations = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const data = await api.get<{ items: ConversationPreview[] }>('/api/conversations?limit=3');
      const items = (data.items ?? [])
        .filter((item): item is ConversationPreview => item != null && typeof item.id === 'string')
        .sort((a, b) => {
          const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bt - at;
        });
      setConversations(items);
    } catch {
      setConversations([]);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (user === null) {
      console.log('User logged out - Navigation will redirect to Login');
    }
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const postWithImg = posts.find((p) => p.mediaUrls?.some(isImgUrl)) ?? null;
  const firstPost = postWithImg ?? posts[0] ?? null;
  const firstImg = firstPost?.mediaUrls?.find(isImgUrl) ?? null;
  const unreadMessages = conversations.reduce((sum, item) => sum + (item.unreadCount ?? 0), 0);

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <View style={[s.mainContent, { paddingHorizontal: H_PAD }]}>
        <View style={s.grid}>
          <View style={[s.col, { width: LEFT_W }]}>
            <TouchableOpacity
              style={[s.card, s.feedCard, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={onFeedPress}
              activeOpacity={0.85}
            >
              <View style={s.postHeader}>
                {firstPost?.authorPhotoURL ? (
                  <Image source={{ uri: firstPost.authorPhotoURL }} style={s.avatarSm} />
                ) : (
                  <View style={[s.avatarSm, { backgroundColor: C.placeholder }]}>
                    <Ionicons name="person" size={12} color={C.subtext} />
                  </View>
                )}
                <View style={{ marginLeft: 6, flex: 1 }}>
                  <Text style={[s.postAuthor, { color: C.text }]} numberOfLines={1}>
                    {firstPost?.authorDisplayName ?? (loading ? '...' : 'Chưa có bài')}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[s.postTime, { color: C.subtext }]}>
                      {firstPost ? timeAgo(firstPost.createdAt) : ''}
                    </Text>
                    {firstPost ? <Ionicons name="globe-outline" size={10} color={C.subtext} style={{ marginLeft: 3 }} /> : null}
                  </View>
                </View>
              </View>

              {firstImg ? (
                <Image source={{ uri: firstImg }} style={[s.postImg, { backgroundColor: C.placeholder }]} resizeMode="cover" />
              ) : (
                <View style={[s.postImg, { backgroundColor: C.placeholder }]}>
                  <Ionicons name="newspaper-outline" size={32} color={C.subtext} />
                </View>
              )}

              {firstPost?.content ? (
                <Text style={[s.postDesc, { color: C.subtext }]} numberOfLines={2}>{firstPost.content}</Text>
              ) : (
                <Text style={[s.postDesc, { color: C.subtext }]}>{loading ? 'Đang tải...' : 'Tạo bài viết đầu tiên'}</Text>
              )}

              <View style={s.postActions}>
                <ActionItem icon="heart-outline" color={C.subtext} count={firstPost?.likeCount ?? 0} />
                <ActionItem icon="chatbubble-outline" color={C.subtext} count={firstPost?.replyCount ?? 0} />
                <ActionItem icon="arrow-redo-outline" color={C.subtext} count={0} />
              </View>

              <Text style={[s.feedTag, { color: C.accent, borderTopColor: C.border }]}>Bài mới</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.card, s.videoCard, { backgroundColor: '#0b1120', borderColor: C.border }]}
              onPress={onVideoPress}
              activeOpacity={0.85}
            >
              <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.9)" />
              <View style={s.videoFooter}>
                <View style={[s.avatarSm, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
                  <Ionicons name="videocam" size={12} color="#fff" />
                </View>
                <View style={{ marginLeft: 5 }}>
                  <Text style={s.videoAuthor}>Surf Clips</Text>
                  <Text style={s.videoTime}>Xem ngay</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          <View style={[s.col, { width: RIGHT_W, marginLeft: COL_GAP }]}>
            <TouchableOpacity
              style={[s.card, s.rightCardTop, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={onNotificationsPress}
              activeOpacity={0.85}
            >
              <View style={s.cardTitleRow}>
                <Text style={[s.sectionTitle, { color: C.text }]}>Thông báo</Text>
                {unreadNotifications > 0 ? <Badge value={unreadNotifications} color={C.amber} /> : null}
              </View>
              <View style={s.emptySection}>
                <Ionicons name="notifications-outline" size={24} color={C.amber} />
                <Text style={[s.sectionSub, { color: C.subtext }]} numberOfLines={2}>
                  {unreadNotifications > 0 ? `${unreadNotifications} mục mới` : 'Không có thông báo mới'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.card, s.rightCardMid, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={onMessagesPress}
              activeOpacity={0.85}
            >
              <View style={s.cardTitleRow}>
                <Text style={[s.sectionTitle, { color: C.text }]}>Waves</Text>
                {unreadMessages > 0 ? <Badge value={unreadMessages} color={C.accent} /> : null}
              </View>
              {conversations.length > 0 ? (
                <View style={s.messageList}>
                  {conversations.slice(0, 3).map((item) => (
                    <MessagePreviewRow key={item.id} item={item} C={C} />
                  ))}
                </View>
              ) : (
                <View style={s.emptySection}>
                  <Ionicons name="chatbubble-ellipses-outline" size={25} color={C.accent} />
                  <Text style={[s.sectionSub, { color: C.subtext }]} numberOfLines={2}>
                    Chưa có trò chuyện
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.card, s.rightCardBot, { backgroundColor: C.card2, borderColor: C.border }]}
              onPress={onFriendsPress}
              activeOpacity={0.85}
            >
              <View style={s.friendCard}>
                <View style={s.cardTitleRow}>
                  <Text style={[s.sectionTitle, { color: C.text }]}>Bạn bè</Text>
                  {incomingFriendRequests > 0 ? <Badge value={incomingFriendRequests} color={C.green} /> : null}
                </View>
                <View style={s.friendContent}>
                  <Ionicons name="people-outline" size={24} color={C.green} />
                  <Text style={[s.marketText, { color: C.text }]} numberOfLines={1}>
                    {incomingFriendRequests > 0 ? 'Lời mời mới' : 'Tìm bạn mới'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.aiRow}>
          <TouchableOpacity
            style={[s.aiButton, { backgroundColor: C.accent + '1a', borderColor: C.accent }]}
            onPress={() => navigation.navigate('AI')}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles-outline" size={18} color={C.accent} />
            <Text style={[s.aiButtonText, { color: C.accent }]}>AI</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function ActionItem({ icon, color, count = 0 }: { icon: string; color: string; count?: number }) {
  return (
    <View style={s.actionItem}>
      <Ionicons name={icon as any} size={13} color={color} />
      <Text style={{ color, fontSize: 11, marginLeft: 2 }}>{count}</Text>
    </View>
  );
}

function Badge({ value, color }: { value: number; color: string }) {
  return (
    <View style={[s.badge, { backgroundColor: color }]}>
      <Text style={s.badgeText}>{value > 99 ? '99+' : value}</Text>
    </View>
  );
}

function MessagePreviewRow({ item, C }: { item: ConversationPreview; C: typeof DARK }) {
  const title = item.type === 'group' ? (item.title || 'Nhóm chat') : (item.peer?.name || 'Người dùng');
  const initial = title.charAt(0).toUpperCase();
  const isUnread = (item.unreadCount ?? 0) > 0;

  return (
    <View style={s.messageRow}>
      {item.peer?.avatarUrl ? (
        <Image source={{ uri: item.peer.avatarUrl }} style={s.messageAvatar} />
      ) : (
        <View style={[s.messageAvatar, { backgroundColor: C.placeholder }]}>
          <Text style={[s.messageInitial, { color: C.text }]}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.messageTopLine}>
          <Text style={[s.messageName, { color: C.text, fontWeight: isUnread ? '800' : '700' }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[s.messageTime, { color: C.subtext }]} numberOfLines={1}>
            {timeAgo(item.lastMessageAt)}
          </Text>
        </View>
        <Text style={[s.messagePreview, { color: isUnread ? C.text : C.subtext }]} numberOfLines={1}>
          {item.lastMessagePreview || 'Bắt đầu trò chuyện'}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  mainContent: { flex: 1, paddingTop: 8, paddingBottom: 8 },
  grid: { flex: 1, flexDirection: 'row' },
  col: { flex: 1, flexDirection: 'column' },
  card: { borderRadius: 10, borderWidth: 1, overflow: 'hidden', padding: 8 },
  feedCard: { flex: 3, marginBottom: 6 },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  avatarSm: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAuthor: { fontSize: 11, fontWeight: '600' },
  postTime: { fontSize: 9 },
  postImg: {
    flex: 1,
    borderRadius: 6,
    marginBottom: 5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  postDesc: { fontSize: 10, marginBottom: 5 },
  postActions: { flexDirection: 'row', marginBottom: 4 },
  actionItem: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  feedTag: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    paddingTop: 4,
    borderTopWidth: 1,
    marginTop: 2,
  },
  videoCard: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoFooter: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  videoAuthor: { color: '#fff', fontSize: 11, fontWeight: '700' },
  videoTime: { color: 'rgba(255,255,255,0.7)', fontSize: 9 },
  rightCardTop: { flex: 2, marginBottom: 6 },
  rightCardMid: { flex: 3, marginBottom: 6 },
  rightCardBot: { flex: 2 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  sectionSub: { marginTop: 6, fontSize: 10, fontWeight: '600', textAlign: 'center' },
  emptySection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 5,
    gap: 7,
  },
  messageRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageInitial: {
    fontSize: 11,
    fontWeight: '800',
  },
  messageTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  messageName: {
    flex: 1,
    fontSize: 10,
  },
  messageTime: {
    fontSize: 8,
    maxWidth: 34,
  },
  messagePreview: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: '600',
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  friendCard: {
    flex: 1,
    justifyContent: 'space-between',
  },
  friendContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7 },
  marketText: { fontSize: 11, fontWeight: '800' },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  aiButton: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1.5,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  aiButtonText: { fontSize: 15, fontWeight: '700', letterSpacing: 1 },
});
