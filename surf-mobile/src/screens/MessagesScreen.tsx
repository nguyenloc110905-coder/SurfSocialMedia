import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  RefreshControl,
  useColorScheme,
  TextInput,
  Animated,
  PanResponder,
  Alert,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { api } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';
import { useLanguage, useT, type I18nKey } from '@/lib/i18n';
import { useFriendStore } from '@/stores/friendStore';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Messages'>;
};

type ConversationItem = {
  id: string;
  type: 'dm' | 'group';
  title?: string;
  marketplace?: {
    kind: 'marketplace';
    listingId: string;
    title: string;
    imageUrl: string | null;
    price?: number;
    location?: string;
    sellerId?: string;
  };
  peer: { uid: string; name: string; avatarUrl: string | null } | null;
  members?: Array<{ uid: string; name: string; avatarUrl: string | null }>;
  memberCount?: number;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  muted?: boolean;
};

type ActiveTab = 'all' | 'unread' | 'groups';

type RealtimeListMessage = {
  id?: string;
  conversationId?: string;
  senderId?: string;
  type?: 'text' | 'image' | 'file' | 'audio' | 'call_log';
  text?: string | null;
  fileName?: string | null;
  createdAt?: string;
  recalledForEveryone?: boolean;
  isRecalled?: boolean;
};

type RealtimeMessageListPayload = {
  conversationId?: string;
  message?: RealtimeListMessage;
  conversation?: {
    id?: string;
    lastMessagePreview?: string | null;
    lastMessageAt?: string | null;
  };
};

type CreatedConversationItem = {
  id: string;
  type?: 'dm' | 'group';
  title?: string;
  members?: Array<{ uid: string; name: string; avatarUrl: string | null }>;
  memberCount?: number;
  muted?: boolean;
};

const DARK = { bg: '#0f172a', card: '#1e293b', border: '#334155', text: '#e2e8f0', subtext: '#64748b', accent: '#0ea5e9', input: '#1e293b' };
const LIGHT = { bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0', text: '#1f2937', subtext: '#94a3b8', accent: '#0ea5e9', input: '#f1f5f9' };

function timeAgo(iso: string | null, locale: string, t: (key: I18nKey, params?: Record<string, string | number>) => string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('post_just_now');
  if (m < 60) return t('minutes_short', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('hours_short', { count: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t('days_short', { count: d });
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

function trimPreview(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function stripReplyMetadata(value: string): string {
  return value
    .replace(/^__reply_to:[^\n]+__\n?/u, '')
    .replace(/^__reply_sender:[^\n]+__\n?/u, '')
    .replace(/__reply_to:[^\s]+__/gu, ' ')
    .replace(/__reply_sender:[^\s]+__/gu, ' ')
    .replace(/^↪\s*.+?:\s*.+\n/u, '')
    .trim();
}

function buildMessagePreview(message: RealtimeListMessage | undefined, fallback?: string | null): string | null {
  if (!message) return fallback ?? null;
  if (message.isRecalled || message.recalledForEveryone) return 'Tin nhắn đã được thu hồi';

  const text = stripReplyMetadata(message.text ?? '');
  if (text) return trimPreview(text);
  if (message.type === 'image') return '📷 Hình ảnh';
  if (message.type === 'audio') return '🎤 Tin nhắn thoại';
  if (message.type === 'file') return message.fileName ? `📎 ${message.fileName}` : '📎 Tệp đính kèm';
  if (message.type === 'call_log') return trimPreview(message.text ?? 'Cuộc gọi Surf');
  return fallback ?? null;
}

function buildConversationPreview(conv: ConversationItem, message: RealtimeListMessage, currentUserId?: string | null) {
  const preview = buildMessagePreview(message, conv.lastMessagePreview);
  if (!preview || conv.type !== 'group') return preview;
  const senderId = message.senderId;
  if (!senderId) return preview;
  const senderName =
    senderId === currentUserId
      ? 'Bạn'
      : conv.members?.find(member => member.uid === senderId)?.name;
  return senderName ? `${senderName}: ${preview}` : preview;
}

function getConversationLastMessageAtMs(item: ConversationItem): number {
  const timestamp = item.lastMessageAt ? new Date(item.lastMessageAt).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function uniqueConversations(items: ConversationItem[]): ConversationItem[] {
  const byId = new Map<string, ConversationItem>();
  items.forEach(item => {
    if (!item?.id) return;
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...existing, ...item } : item);
  });

  return Array.from(byId.values()).sort(
    (a, b) => getConversationLastMessageAtMs(b) - getConversationLastMessageAtMs(a)
  );
}

function ConvAvatar({ src, name, size = 48 }: { src: string | null; name: string; size?: number }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  if (src) {
    return <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initial}</Text>
    </View>
  );
}

// ── Swipeable row ─────────────────────────────────────────────────────────────────

const ACTION_W = 136;

function SwipeableConvRow({
  item,
  C,
  onPress,
  onDelete,
  onToggleMute,
  typingText,
  t,
  locale,
}: {
  item: ConversationItem;
  C: typeof DARK;
  onPress: () => void;
  onDelete: () => void;
  onToggleMute: () => void;
  typingText?: string;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
  locale: string;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const snap = (toValue: number) => {
    isOpen.current = toValue < 0;
    Animated.spring(translateX, { toValue, useNativeDriver: true, tension: 70, friction: 12 }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8,
      onPanResponderMove: (_, { dx }) => {
        const base = isOpen.current ? -ACTION_W : 0;
        translateX.setValue(Math.max(-ACTION_W, Math.min(0, base + dx)));
      },
      onPanResponderRelease: (_, { dx }) => {
        const threshold = ACTION_W / 3;
        if (isOpen.current) snap(dx > threshold ? 0 : -ACTION_W);
        else snap(dx < -threshold ? -ACTION_W : 0);
      },
      onPanResponderTerminate: () => snap(0),
    })
  ).current;

  const title = item.marketplace?.title || (item.type === 'group' ? (item.title || t('group_chat')) : (item.peer?.name || t('user_fallback')));
  const avatar = item.marketplace?.imageUrl ?? (item.type === 'group' ? null : (item.peer?.avatarUrl ?? null));
  const isUnread = (item.unreadCount ?? 0) > 0;
  const isTyping = Boolean(typingText);

  return (
    <View style={{ overflow: 'hidden' }}>
      {/* Action strip */}
      <View style={[s.actionStrip]}>
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: '#6366f1' }]}
          onPress={() => { snap(0); onToggleMute(); }}
        >
          <Ionicons name={item.muted ? 'notifications-outline' : 'notifications-off-outline'} size={20} color="#fff" />
          <Text style={s.actionLabel}>{item.muted ? t('unmute_notifications') : t('mute_notifications')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: '#ef4444' }]}
          onPress={() => {
            snap(0);
            Alert.alert(t('delete_conversation'), t('delete_conversation_confirm'), [
              { text: t('cancel'), style: 'cancel' },
              { text: t('delete'), style: 'destructive', onPress: onDelete },
            ]);
          }}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={s.actionLabel}>{t('delete')}</Text>
        </TouchableOpacity>
      </View>

      {/* Sliding row */}
      <Animated.View
        style={{ transform: [{ translateX }], backgroundColor: C.card }}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={[s.convItem, { borderBottomColor: C.border }]}
          onPress={() => { if (isOpen.current) { snap(0); return; } onPress(); }}
          activeOpacity={0.7}
        >
          <View style={s.convAvatarWrap}>
            <ConvAvatar src={avatar} name={title} />
            {item.type === 'group' && !item.marketplace && (
              <View style={[s.groupBadge, { backgroundColor: C.accent }]}>
                <Ionicons name="people" size={10} color="#fff" />
              </View>
            )}
            {item.marketplace && (
              <View style={[s.groupBadge, { backgroundColor: C.accent }]}>
                <Ionicons name="storefront" size={10} color="#fff" />
              </View>
            )}
            {item.muted && (
              <View style={[s.muteBadge, { backgroundColor: C.border }]}>
                <Ionicons name="notifications-off" size={9} color={C.subtext} />
              </View>
            )}
          </View>
          <View style={s.convContent}>
            <View style={s.convTop}>
              <Text style={[s.convName, { color: C.text, fontWeight: isUnread ? '700' : '500' }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[s.convTime, { color: isUnread ? C.accent : C.subtext }]}>
                {timeAgo(item.lastMessageAt, locale, t)}
              </Text>
            </View>
            <View style={s.convBottom}>
              <Text
                style={[
                  s.convPreview,
                  {
                    color: isTyping ? C.accent : isUnread ? C.text : C.subtext,
                    fontWeight: isTyping || isUnread ? '700' : '400',
                  },
                ]}
                numberOfLines={1}
              >
                {typingText || item.lastMessagePreview || t('messages_start')}
              </Text>
              {item.unreadCount > 0 && (
                <View style={[s.unreadBadge, { backgroundColor: C.accent }]}>
                  <Text style={s.unreadCount}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function MessagesScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const t = useT();
  const language = useLanguage();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';
  const C = scheme === 'dark' ? DARK : LIGHT;
  const { user } = useAuthStore();
  const friends = useFriendStore(state => state.friends);
  const friendsLoading = useFriendStore(state => state.loading);
  const fetchFriends = useFriendStore(state => state.fetchFriends);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<'dm' | 'group'>('dm');
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [groupFriendSearch, setGroupFriendSearch] = useState('');
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [openingFriendId, setOpeningFriendId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typingByConversation, setTypingByConversation] = useState<Record<string, Record<string, number>>>({});
  const conversationsRef = useRef<ConversationItem[]>([]);
  const creatingGroupRef = useRef(false);
  const openingConversationRef = useRef<string | null>(null);
  const openingFriendRef = useRef<string | null>(null);
  const handledRealtimeMessageIdsRef = useRef<Set<string>>(new Set());
  const typingClearTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    if (!user?.uid) {
      setConversations([]);
      setLoading(false);
      return;
    }

    try {
      setLoadError(null);
      const data = await api.get<{ items: ConversationItem[] }>('/api/conversations?limit=30');
      const items = (data.items ?? []).filter((c): c is ConversationItem => c != null && typeof c.id === 'string');
      console.log('Messages conversations loaded:', items.length);
      setConversations(uniqueConversations(items));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể tải tin nhắn';
      console.warn('Messages load error:', message);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (user?.uid) {
        void load();
      }
    }, [load, user?.uid])
  );

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const clearTypingUser = useCallback((conversationId: string, userId: string) => {
    const key = `${conversationId}:${userId}`;
    const timer = typingClearTimersRef.current[key];
    if (timer) {
      clearTimeout(timer);
      delete typingClearTimersRef.current[key];
    }

    setTypingByConversation(current => {
      const conversationTyping = current[conversationId];
      if (!conversationTyping?.[userId]) return current;
      const nextConversationTyping = { ...conversationTyping };
      delete nextConversationTyping[userId];
      if (Object.keys(nextConversationTyping).length === 0) {
        const next = { ...current };
        delete next[conversationId];
        return next;
      }
      return { ...current, [conversationId]: nextConversationTyping };
    });
  }, []);

  const markTypingUser = useCallback((conversationId: string, userId: string) => {
    if (!conversationId || !userId || userId === user?.uid) return;
    const expiresAt = Date.now() + 4500;
    const key = `${conversationId}:${userId}`;

    setTypingByConversation(current => ({
      ...current,
      [conversationId]: {
        ...(current[conversationId] ?? {}),
        [userId]: expiresAt,
      },
    }));

    const previous = typingClearTimersRef.current[key];
    if (previous) clearTimeout(previous);
    typingClearTimersRef.current[key] = setTimeout(() => {
      clearTypingUser(conversationId, userId);
    }, 4500);
  }, [clearTypingUser, user?.uid]);

  // ── Real-time: update conversation list on new messages ─────────────────────

  useEffect(() => {
    if (!user?.uid) return;
    connectSocket(user.uid);
    const socket = getSocket();

    const onMessageNew = (payload: RealtimeMessageListPayload) => {
      const convId = payload?.conversationId ?? payload?.message?.conversationId ?? payload?.conversation?.id;
      if (!convId) return;
      if (payload.message?.senderId) clearTypingUser(convId, payload.message.senderId);
      const messageId = payload.message?.id;
      const alreadyHandledMessage = Boolean(messageId && handledRealtimeMessageIdsRef.current.has(messageId));
      if (messageId) {
        handledRealtimeMessageIdsRef.current.add(messageId);
        if (handledRealtimeMessageIdsRef.current.size > 300) {
          handledRealtimeMessageIdsRef.current = new Set(
            Array.from(handledRealtimeMessageIdsRef.current).slice(-150)
          );
        }
      }

      if (!conversationsRef.current.some(item => item.id === convId)) {
        void load();
        return;
      }

      setConversations(prev =>
        uniqueConversations(prev.map(c =>
          c.id !== convId
            ? c
            : {
              ...c,
              lastMessagePreview:
                payload.conversation?.lastMessagePreview ??
                buildConversationPreview(c, payload.message ?? {}, user.uid) ??
                c.lastMessagePreview,
              lastMessageAt: payload.conversation?.lastMessageAt ?? payload.message?.createdAt ?? c.lastMessageAt ?? null,
              unreadCount: payload.message?.senderId !== user.uid && !alreadyHandledMessage
                ? (c.unreadCount ?? 0) + 1
                : c.unreadCount,
            }
        ))
      );
    };

    const onMessageUpdated = (payload: RealtimeMessageListPayload) => {
      const convId = payload?.conversationId ?? payload?.message?.conversationId ?? payload?.conversation?.id;
      const message = payload?.message;
      if (!convId || !message?.createdAt) return;
      const messageCreatedAt = message.createdAt;

      setConversations(prev =>
        uniqueConversations(prev.map(c => {
          if (c.id !== convId) return c;

          const messageAt = new Date(messageCreatedAt).getTime();
          const currentAt = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
          if (Number.isFinite(currentAt) && messageAt < currentAt) return c;

          return {
            ...c,
            lastMessagePreview: buildConversationPreview(c, message, user.uid) ?? c.lastMessagePreview,
            lastMessageAt: messageCreatedAt,
          };
        }))
      );
    };

    const onMessageSelfHidden = (payload: { conversationId?: string; messageId?: string }) => {
      if (!payload.conversationId) return;
      void load();
    };

    const onTypingStart = (payload: { conversationId?: string; userId?: string }) => {
      if (!payload.conversationId || !payload.userId) return;
      markTypingUser(payload.conversationId, payload.userId);
    };

    const onTypingStop = (payload: { conversationId?: string; userId?: string }) => {
      if (!payload.conversationId || !payload.userId) return;
      clearTypingUser(payload.conversationId, payload.userId);
    };

    const onTypingStatus = (payload: { conversationId?: string; userId?: string; isTyping?: boolean }) => {
      if (payload?.isTyping) {
        onTypingStart(payload);
        return;
      }
      onTypingStop(payload);
    };

    socket.on('message:new', onMessageNew);
    socket.on('message:updated', onMessageUpdated);
    socket.on('message:recalled', onMessageUpdated);
    socket.on('message:reaction-updated', onMessageUpdated);
    socket.on('message:self-hidden', onMessageSelfHidden);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('typing', onTypingStatus);
    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('message:updated', onMessageUpdated);
      socket.off('message:recalled', onMessageUpdated);
      socket.off('message:reaction-updated', onMessageUpdated);
      socket.off('message:self-hidden', onMessageSelfHidden);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('typing', onTypingStatus);
    };
  }, [clearTypingUser, load, markTypingUser, user?.uid]);

  useEffect(() => {
    return () => {
      Object.values(typingClearTimersRef.current).forEach(timer => clearTimeout(timer));
      typingClearTimersRef.current = {};
      handledRealtimeMessageIdsRef.current.clear();
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const getConvTitle = (conv: ConversationItem) =>
    conv.marketplace?.title || (conv.type === 'group' ? (conv.title || t('group_chat')) : (conv.peer?.name || t('user_fallback')));

  const getConvAvatar = (conv: ConversationItem) =>
    conv.marketplace?.imageUrl ?? (conv.type === 'group' ? null : (conv.peer?.avatarUrl ?? null));

  const getConvPeerUid = (conv: ConversationItem) =>
    conv.type === 'dm' ? (conv.peer?.uid ?? null) : null;

  const getTypingText = useCallback((conv: ConversationItem) => {
    const activeTypingUserIds = Object.entries(typingByConversation[conv.id] ?? {})
      .filter(([uid, expiresAt]) => uid !== user?.uid && expiresAt > Date.now())
      .map(([uid]) => uid);
    if (activeTypingUserIds.length === 0) return '';

    const names = activeTypingUserIds
      .map(uid => {
        if (conv.type === 'group') {
          return conv.members?.find(member => member.uid === uid)?.name ?? 'Thành viên';
        }
        return conv.peer?.name ?? 'Ai đó';
      })
      .filter(Boolean);

    if (names.length === 0) return 'Đang nhập...';
    if (names.length === 1) return `${names[0]} đang nhập...`;
    if (names.length === 2) return `${names[0]} và ${names[1]} đang nhập...`;
    return `${names[0]} và ${names.length - 1} người khác đang nhập...`;
  }, [typingByConversation, user?.uid]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, item) => sum + (item.unreadCount ?? 0), 0),
    [conversations]
  );
  const groupCount = useMemo(
    () => conversations.filter(item => item.type === 'group').length,
    [conversations]
  );
  const unreadConversationCount = useMemo(
    () => conversations.filter(item => (item.unreadCount ?? 0) > 0).length,
    [conversations]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations
      .filter(item => {
        if (activeTab === 'unread') return (item.unreadCount ?? 0) > 0;
        if (activeTab === 'groups') return item.type === 'group';
        return true;
      })
      .filter(item => !query || getConvTitle(item).toLowerCase().includes(query));
  }, [activeTab, conversations, search]);

  const openCompose = useCallback((mode: 'dm' | 'group' = 'dm') => {
    setComposeMode(mode);
    setCreateGroupOpen(true);
    setNewGroupTitle('');
    setGroupFriendSearch('');
    setSelectedGroupMemberIds([]);
  }, []);

  const closeCreateGroup = useCallback(() => {
    if (creatingGroup) return;
    setCreateGroupOpen(false);
    setComposeMode('dm');
    setNewGroupTitle('');
    setGroupFriendSearch('');
    setSelectedGroupMemberIds([]);
  }, [creatingGroup]);

  useEffect(() => {
    if (!createGroupOpen) return;
    void fetchFriends();
  }, [createGroupOpen, fetchFriends]);

  const availableGroupFriends = useMemo(() => {
    const query = groupFriendSearch.trim().toLowerCase();
    return friends.filter(friend => !query || friend.name.toLowerCase().includes(query));
  }, [friends, groupFriendSearch]);

  const toggleGroupMember = useCallback((friendId: string) => {
    setSelectedGroupMemberIds(current =>
      current.includes(friendId)
        ? current.filter(id => id !== friendId)
        : [...current, friendId]
    );
  }, []);

  const createGroup = useCallback(async () => {
    const groupName = newGroupTitle.trim();
    if (!groupName || selectedGroupMemberIds.length === 0 || creatingGroupRef.current) return;

    creatingGroupRef.current = true;
    setCreatingGroup(true);
    try {
      const created = await api.post<{ item?: CreatedConversationItem }>('/api/conversations/group', {
        groupName,
        participants: selectedGroupMemberIds,
      });
      const item = created.item;
      if (!item?.id) throw new Error('missing_created_conversation');

      const selectedFriends = friends.filter(friend => selectedGroupMemberIds.includes(friend.id));
      const fallbackMembers = [
        ...(user?.uid
          ? [{
              uid: user.uid,
              name: user.displayName || user.email?.split('@')[0] || 'Bạn',
              avatarUrl: user.photoURL ?? null,
            }]
          : []),
        ...selectedFriends.map(friend => ({
          uid: friend.id,
          name: friend.name,
          avatarUrl: friend.avatarUrl ?? null,
        })),
      ];
      const members = item.members?.length ? item.members : fallbackMembers;

      setCreateGroupOpen(false);
      setNewGroupTitle('');
      setGroupFriendSearch('');
      setSelectedGroupMemberIds([]);
      setActiveTab('groups');
      void load();
      navigation.navigate('Chat', {
        conversationId: item.id,
        title: item.title || groupName,
        peerUid: null,
        peerName: null,
        peerAvatar: null,
        muted: Boolean(item.muted),
        members,
        memberCount: item.memberCount ?? members.length,
        marketplace: null,
      });
    } catch {
      Alert.alert('Không thể tạo nhóm', 'Vui lòng thử lại sau.');
    } finally {
      creatingGroupRef.current = false;
      setCreatingGroup(false);
    }
  }, [
    friends,
    load,
    navigation,
    newGroupTitle,
    selectedGroupMemberIds,
    user?.displayName,
    user?.email,
    user?.photoURL,
    user?.uid,
  ]);

  const openConv = (conv: ConversationItem) => {
    if (openingConversationRef.current === conv.id) return;
    openingConversationRef.current = conv.id;
    setConversations(prev =>
      uniqueConversations(prev.map(item => item.id === conv.id ? { ...item, unreadCount: 0 } : item))
    );
    navigation.navigate('Chat', {
      conversationId: conv.id,
      title: getConvTitle(conv),
      peerUid: getConvPeerUid(conv),
      peerName: conv.peer?.name ?? null,
      peerAvatar: getConvAvatar(conv),
      muted: Boolean(conv.muted),
      members: conv.members ?? (conv.peer ? [conv.peer] : []),
      memberCount: conv.memberCount,
      marketplace: conv.marketplace
        ? {
            listingId: conv.marketplace.listingId,
            title: conv.marketplace.title,
            imageUrl: conv.marketplace.imageUrl,
            price: conv.marketplace.price,
            location: conv.marketplace.location,
            sellerId: conv.marketplace.sellerId,
          }
        : null,
    });
    setTimeout(() => {
      if (openingConversationRef.current === conv.id) {
        openingConversationRef.current = null;
      }
    }, 700);
  };

  const openConversationWithFriend = useCallback(async (friend: { id: string; name: string; avatarUrl: string | null }) => {
    if (openingFriendRef.current) return;

    const existing = conversations.find(item => item.type === 'dm' && item.peer?.uid === friend.id);
    if (existing) {
      setCreateGroupOpen(false);
      setGroupFriendSearch('');
      openConv(existing);
      return;
    }

    openingFriendRef.current = friend.id;
    setOpeningFriendId(friend.id);
    try {
      const created = await api.post<{ item?: CreatedConversationItem }>('/api/conversations', {
        peerUid: friend.id,
      });
      const item = created.item;
      if (!item?.id) throw new Error('missing_created_conversation');

      setCreateGroupOpen(false);
      setGroupFriendSearch('');
      setSelectedGroupMemberIds([]);
      void load();
      navigation.navigate('Chat', {
        conversationId: item.id,
        title: friend.name,
        peerUid: friend.id,
        peerName: friend.name,
        peerAvatar: friend.avatarUrl,
        muted: Boolean(item.muted),
        members: [{ uid: friend.id, name: friend.name, avatarUrl: friend.avatarUrl }],
        memberCount: 2,
        marketplace: null,
      });
    } catch {
      Alert.alert('Không thể mở cuộc trò chuyện', 'Vui lòng thử lại sau.');
    } finally {
      openingFriendRef.current = null;
      setOpeningFriendId(null);
    }
  }, [conversations, load, navigation]);

  const deleteConv = async (id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    try { await api.delete(`/api/conversations/${id}`); } catch { load(); }
  };

  const toggleMute = async (item: ConversationItem) => {
    const muted = !item.muted;
    setConversations(prev => uniqueConversations(prev.map(c => c.id === item.id ? { ...c, muted } : c)));
    try { await api.patch(`/api/conversations/${item.id}/mute`, { muted }); } catch { load(); }
  };

  const renderItem = ({ item }: { item: ConversationItem }) => {
    if (!item?.id) return null;
    return (
      <SwipeableConvRow
        item={item}
        C={C}
        onPress={() => openConv(item)}
        onDelete={() => deleteConv(item.id)}
        onToggleMute={() => toggleMute(item)}
        typingText={getTypingText(item)}
        t={t}
        locale={locale}
      />
    );
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]}>{t('messages_title')}</Text>
        <TouchableOpacity
          onPress={() => openCompose('dm')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Tạo nhóm trò chuyện"
        >
          <Ionicons name="create-outline" size={24} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[s.searchWrap, { backgroundColor: C.bg }]}>
        <View style={[s.searchBox, { backgroundColor: C.input }]}>
          <Ionicons name="search" size={16} color={C.subtext} />
          <TextInput
            style={[s.searchInput, { color: C.text }]}
            placeholder={t('messages_search')}
            placeholderTextColor={C.subtext}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <View style={s.tabRow}>
          {([
            ['all', 'Tất cả', conversations.length],
            ['unread', 'Chưa đọc', unreadConversationCount],
            ['groups', 'Nhóm', groupCount],
          ] as Array<[ActiveTab, string, number]>).map(([tab, label, count]) => {
            const active = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  s.tabChip,
                  { backgroundColor: active ? C.accent : C.input, borderColor: active ? C.accent : C.border },
                ]}
                activeOpacity={0.8}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[s.tabText, { color: active ? '#fff' : C.text }]}>{label}</Text>
                {count > 0 ? (
                  <View style={[s.tabBadge, { backgroundColor: active ? 'rgba(255,255,255,0.22)' : C.bg }]}>
                    <Text style={[s.tabBadgeText, { color: active ? '#fff' : C.subtext }]}>
                      {tab === 'unread' ? totalUnread : count}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
          {activeTab === 'groups' ? (
            <TouchableOpacity
              style={[s.tabCreateButton, { backgroundColor: C.accent }]}
              activeOpacity={0.82}
              onPress={() => openCompose('group')}
              accessibilityLabel="Tạo nhóm mới"
            >
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : loadError ? (
        <View style={s.center}>
          <Ionicons name="cloud-offline-outline" size={56} color={C.subtext} />
          <Text style={[s.emptyTitle, { color: C.text }]}>Không thể tải tin nhắn</Text>
          <Text style={[s.emptyText, { color: C.subtext }]} numberOfLines={3}>{loadError}</Text>
          <TouchableOpacity style={[s.retryButton, { borderColor: C.accent }]} onPress={load}>
            <Text style={[s.retryText, { color: C.accent }]}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="chatbubbles-outline" size={56} color={C.subtext} />
          <Text style={[s.emptyTitle, { color: C.text }]}>{t('messages_empty_title')}</Text>
          <Text style={[s.emptyText, { color: C.subtext }]}>{t('messages_empty_subtitle')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}
          showsVerticalScrollIndicator={false}
        />
      )}
      <Modal visible={createGroupOpen} transparent animationType="fade" onRequestClose={closeCreateGroup}>
        <Pressable style={s.modalBackdrop} onPress={closeCreateGroup}>
          <Pressable style={[s.groupSheet, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <View style={s.sheetHeaderCopy}>
                <Text style={[s.sheetTitle, { color: C.text }]}>
                  {composeMode === 'group' ? 'Tạo nhóm mới' : 'Tin nhắn mới'}
                </Text>
                <Text style={[s.sheetSubtitle, { color: C.subtext }]}>
                  {composeMode === 'group'
                    ? 'Đặt tên nhóm và chọn bạn bè ban đầu'
                    : 'Chọn một người bạn để mở cuộc trò chuyện'}
                </Text>
              </View>
              <TouchableOpacity
                style={[s.sheetClose, { backgroundColor: C.input }]}
                onPress={closeCreateGroup}
                disabled={creatingGroup}
              >
                <Ionicons name="close" size={18} color={C.subtext} />
              </TouchableOpacity>
            </View>

            <View style={[s.composeModeRow, { backgroundColor: C.input }]}>
              {([
                ['dm', 'Tin nhắn'],
                ['group', 'Nhóm'],
              ] as Array<['dm' | 'group', string]>).map(([mode, label]) => {
                const active = composeMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[s.composeModeButton, { backgroundColor: active ? C.accent : 'transparent' }]}
                    activeOpacity={0.82}
                    disabled={creatingGroup || Boolean(openingFriendId)}
                    onPress={() => {
                      setComposeMode(mode);
                      setSelectedGroupMemberIds([]);
                      setNewGroupTitle('');
                    }}
                  >
                    <Ionicons name={mode === 'group' ? 'people' : 'chatbubble'} size={15} color={active ? '#fff' : C.subtext} />
                    <Text style={[s.composeModeText, { color: active ? '#fff' : C.text }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {composeMode === 'group' ? (
              <View style={[s.groupInputBox, { backgroundColor: C.input, borderColor: C.border }]}>
                <Ionicons name="people" size={17} color={C.subtext} />
                <TextInput
                  style={[s.groupInput, { color: C.text }]}
                  value={newGroupTitle}
                  onChangeText={setNewGroupTitle}
                  placeholder="Tên nhóm..."
                  placeholderTextColor={C.subtext}
                  returnKeyType="next"
                />
              </View>
            ) : null}

            <View style={[s.groupInputBox, { backgroundColor: C.input, borderColor: C.border }]}>
              <Ionicons name="search" size={17} color={C.subtext} />
              <TextInput
                style={[s.groupInput, { color: C.text }]}
                value={groupFriendSearch}
                onChangeText={setGroupFriendSearch}
                placeholder="Tìm bạn bè..."
                placeholderTextColor={C.subtext}
                returnKeyType="search"
              />
              {friendsLoading ? <ActivityIndicator size={16} color={C.accent} /> : null}
            </View>

            <FlatList
              data={availableGroupFriends}
              keyExtractor={item => `create-group-friend-${item.id}`}
              style={s.groupFriendList}
              contentContainerStyle={s.groupFriendListContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={s.groupEmpty}>
                  <Ionicons name="people-outline" size={34} color={C.subtext} />
                  <Text style={[s.groupEmptyText, { color: C.subtext }]}>
                    {friendsLoading
                      ? 'Đang tải bạn bè...'
                      : groupFriendSearch.trim()
                        ? 'Không tìm thấy bạn bè phù hợp'
                        : composeMode === 'group'
                          ? 'Chưa có bạn bè để tạo nhóm'
                          : 'Chưa có bạn bè để nhắn tin'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const selected = selectedGroupMemberIds.includes(item.id);
                const openingThisFriend = openingFriendId === item.id;
                return (
                  <TouchableOpacity
                    style={[s.groupFriendRow, { borderBottomColor: C.border }]}
                    activeOpacity={0.78}
                    disabled={creatingGroup || Boolean(openingFriendId)}
                    onPress={() => {
                      if (composeMode === 'dm') {
                        void openConversationWithFriend(item);
                      } else {
                        toggleGroupMember(item.id);
                      }
                    }}
                  >
                    <ConvAvatar src={item.avatarUrl} name={item.name} size={40} />
                    <View style={s.groupFriendCopy}>
                      <Text style={[s.groupFriendName, { color: C.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {typeof item.mutualCount === 'number' && item.mutualCount > 0 ? (
                        <Text style={[s.groupFriendSub, { color: C.subtext }]} numberOfLines={1}>
                          {item.mutualCount} bạn chung
                        </Text>
                      ) : null}
                    </View>
                    {composeMode === 'dm' ? (
                      openingThisFriend ? (
                        <ActivityIndicator size={18} color={C.accent} />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={C.subtext} />
                      )
                    ) : (
                      <View
                        style={[
                          s.groupCheck,
                          {
                            borderColor: selected ? C.accent : C.border,
                            backgroundColor: selected ? C.accent : 'transparent',
                          },
                        ]}
                      >
                        {selected ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />

            {composeMode === 'group' ? (
              <View style={[s.groupFooter, { borderTopColor: C.border }]}>
                <Text style={[s.groupCount, { color: C.subtext }]}>
                  {selectedGroupMemberIds.length + 1} thành viên
                </Text>
                <TouchableOpacity
                  style={[
                    s.groupSubmit,
                    {
                      backgroundColor:
                        newGroupTitle.trim() && selectedGroupMemberIds.length > 0 && !creatingGroup
                          ? C.accent
                          : C.border,
                    },
                  ]}
                  activeOpacity={0.82}
                  disabled={!newGroupTitle.trim() || selectedGroupMemberIds.length === 0 || creatingGroup}
                  onPress={createGroup}
                >
                  {creatingGroup ? (
                    <ActivityIndicator size={16} color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="people" size={17} color="#fff" />
                      <Text style={s.groupSubmitText}>Tạo nhóm</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  searchWrap: { paddingHorizontal: 12, paddingVertical: 8 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14 },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  tabChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tabText: { fontSize: 12, fontWeight: '800' },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeText: { fontSize: 10, fontWeight: '900' },
  tabCreateButton: {
    marginLeft: 'auto',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  convItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  convAvatarWrap: { position: 'relative' },
  groupBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  muteBadge: {
    position: 'absolute', bottom: -2, left: -2,
    width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  convContent: { flex: 1, gap: 3 },
  convTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convName: { flex: 1, fontSize: 15, marginRight: 8 },
  convTime: { fontSize: 12 },
  convBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convPreview: { flex: 1, fontSize: 13, marginRight: 8 },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  unreadCount: { color: '#fff', fontSize: 11, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  retryButton: { marginTop: 8, borderWidth: 1, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8 },
  retryText: { fontSize: 14, fontWeight: '700' },
  actionStrip: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: ACTION_W, flexDirection: 'row',
  },
  actionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  actionLabel: { color: '#fff', fontSize: 11, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.42)',
  },
  groupSheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 12,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetHeaderCopy: { flex: 1, minWidth: 0 },
  sheetTitle: { fontSize: 17, fontWeight: '900' },
  sheetSubtitle: { marginTop: 3, fontSize: 12, fontWeight: '700' },
  sheetClose: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  composeModeRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 18,
    padding: 4,
    marginTop: 14,
  },
  composeModeButton: {
    flex: 1,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 15,
    paddingHorizontal: 10,
  },
  composeModeText: { fontSize: 12, fontWeight: '900' },
  groupInputBox: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  groupInput: { flex: 1, fontSize: 15, fontWeight: '700', paddingVertical: Platform.OS === 'ios' ? 10 : 6 },
  groupFriendList: { marginTop: 12, maxHeight: 330 },
  groupFriendListContent: { paddingBottom: 8 },
  groupFriendRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  groupFriendCopy: { flex: 1, minWidth: 0 },
  groupFriendName: { fontSize: 14, fontWeight: '900' },
  groupFriendSub: { marginTop: 2, fontSize: 11, fontWeight: '700' },
  groupCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupEmpty: { minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 9 },
  groupEmptyText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  groupFooter: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  groupCount: { flex: 1, fontSize: 12, fontWeight: '800' },
  groupSubmit: {
    minWidth: 114,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 21,
    paddingHorizontal: 16,
  },
  groupSubmitText: { color: '#fff', fontSize: 13, fontWeight: '900' },
});
