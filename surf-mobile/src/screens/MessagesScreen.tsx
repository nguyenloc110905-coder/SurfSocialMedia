import React, { useCallback, useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { api } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import PresenceBadge from '@/components/ui/PresenceBadge';
import { useAuthStore } from '@/stores/authStore';
import { useMessageStore } from '@/stores/messageStore';
import { useLanguage, useT, type I18nKey } from '@/lib/i18n';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Messages'>;
  scrollTopSignal?: number;
  resetSignal?: number;
  safeTop?: boolean;
  showHeader?: boolean;
  showBackButton?: boolean;
  onScrollPositionChange?: (atTop: boolean) => void;
};

type MarketplaceConversationContext = {
  kind: 'marketplace';
  listingId: string;
  buyerId: string;
  sellerId: string;
  title: string;
  price: number;
  currency: 'VND';
  imageUrl: string | null;
  location: string;
  status: string;
  saleStatus?: string | null;
  sellerDisplayName: string;
  sellerPhotoURL: string | null;
};

type ConversationItem = {
  id: string;
  type: 'dm' | 'group';
  title?: string;
  marketplace?: MarketplaceConversationContext;
  peer: { uid: string; name: string; avatarUrl: string | null } | null;
  members?: Array<{ uid: string; name: string; avatarUrl: string | null }>;
  memberCount?: number;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  muted?: boolean;
};

type MessageFilter = 'all' | 'unread' | 'groups';

const DARK = {
  bg: '#0b1120',
  card: '#111827',
  border: '#243044',
  text: '#f8fafc',
  subtext: '#94a3b8',
  accent: '#0084ff',
  input: '#1f2937',
};

const LIGHT = {
  bg: '#ffffff',
  card: '#ffffff',
  border: '#edf0f4',
  text: '#050505',
  subtext: '#65676b',
  accent: '#0084ff',
  input: '#f0f2f5',
};

const REPLY_PREFIX_PATTERN = /^↪\s*(.+?):\s*(.+)$/u;
const REPLY_TARGET_MARKER_INLINE_PATTERN = /__reply_to:[^\s]+__/g;
const REPLY_SENDER_MARKER_INLINE_PATTERN = /__reply_sender:[^\s]+__/g;
const REPLY_TARGET_MARKER_LINE_PATTERN = /^__reply_to:[^\n]+__\n?/;
const REPLY_SENDER_MARKER_LINE_PATTERN = /^__reply_sender:[^\n]+__\n?/;
const ACTION_W = 136;

function normalizeConversationPreview(value?: string | null) {
  const stripped = (value ?? '')
    .replace(REPLY_TARGET_MARKER_LINE_PATTERN, '')
    .replace(REPLY_SENDER_MARKER_LINE_PATTERN, '')
    .replace(REPLY_TARGET_MARKER_INLINE_PATTERN, ' ')
    .replace(REPLY_SENDER_MARKER_INLINE_PATTERN, ' ')
    .trim();
  if (!stripped) return '';
  const lines = stripped.split('\n');
  const firstLine = lines[0]?.trim() ?? '';
  const replyMatch = firstLine.match(REPLY_PREFIX_PATTERN);
  return (replyMatch ? (lines.slice(1).join('\n').trim() || replyMatch[2] || '') : stripped).replace(/\s+/g, ' ').trim();
}

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

function ConvAvatar({ src, name, size = 56 }: { src: string | null; name: string; size?: number }) {
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

function getConversationTitle(conv: ConversationItem, t: (key: I18nKey, params?: Record<string, string | number>) => string) {
  if (conv.marketplace?.kind === 'marketplace') {
    return `${conv.peer?.name || t('user_fallback')} · ${conv.marketplace.title}`;
  }
  if (conv.type === 'group') return conv.title || t('group_chat');
  return conv.peer?.name || t('user_fallback');
}

function getConversationAvatar(conv: ConversationItem) {
  if (conv.marketplace?.kind === 'marketplace') {
    return conv.marketplace.imageUrl ?? conv.peer?.avatarUrl ?? null;
  }
  if (conv.type === 'group') return null;
  return conv.peer?.avatarUrl ?? null;
}

function getTypingIndicatorText(
  conversation: ConversationItem,
  typingUserIds: string[],
  t: (key: I18nKey, params?: Record<string, string | number>) => string
) {
  if (typingUserIds.length === 0) return null;

  const names = typingUserIds.map((uid) => {
    if (conversation.type === 'group') {
      return conversation.members?.find((member) => member.uid === uid)?.name ?? t('waves_typing_someone');
    }
    if (conversation.peer?.uid === uid) return conversation.peer.name;
    return t('waves_typing_someone');
  });

  if (names.length === 1) return t('waves_typing_one', { name: names[0] });
  if (names.length === 2) return t('waves_typing_two', { name1: names[0], name2: names[1] });
  return t('waves_typing_many', { name1: names[0], name2: names[1], count: names.length - 2 });
}

function SwipeableConvRow({
  item,
  C,
  typingText,
  onPress,
  onDelete,
  onToggleMute,
  t,
  locale,
}: {
  item: ConversationItem;
  C: typeof DARK;
  typingText?: string | null;
  onPress: () => void;
  onDelete: () => void;
  onToggleMute: () => void;
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
      onMoveShouldSetPanResponder: (_, { dx, dy }) => Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8,
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

  const title = getConversationTitle(item, t);
  const avatar = getConversationAvatar(item);
  const isUnread = (item.unreadCount ?? 0) > 0;
  const isMarketplace = item.marketplace?.kind === 'marketplace';
  const previewText = typingText
    ? typingText
    : isMarketplace
      ? `${item.marketplace?.title ?? t('waves_market_fallback')} � ${normalizeConversationPreview(item.lastMessagePreview) || t('waves_market_start')}`
      : normalizeConversationPreview(item.lastMessagePreview) || t('messages_start');

  return (
    <View style={{ overflow: 'hidden' }}>
      <View style={s.actionStrip}>
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: '#6366f1' }]}
          onPress={() => {
            snap(0);
            onToggleMute();
          }}
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

      <Animated.View style={{ transform: [{ translateX }], backgroundColor: C.card }} {...panResponder.panHandlers}>
        <TouchableOpacity
          style={[s.convItem, { borderBottomColor: C.border }]}
          onPress={() => {
            if (isOpen.current) {
              snap(0);
              return;
            }
            onPress();
          }}
          activeOpacity={0.7}
        >
          <View style={s.convAvatarWrap}>
            <ConvAvatar src={avatar} name={title} />
            {item.type !== 'group' && item.peer?.uid && (
              <PresenceBadge uid={item.peer.uid} size="md" style={{ borderColor: C.card }} />
            )}
            {item.type === 'group' && (
              <View style={[s.groupBadge, { backgroundColor: C.accent }]}>
                <Ionicons name="people" size={10} color="#fff" />
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
              {isMarketplace ? (
                <View style={[s.inlineBadge, { backgroundColor: `${C.accent}18` }]}>
                  <Text style={[s.inlineBadgeText, { color: C.accent }]}>{t('waves_market_badge')}</Text>
                </View>
              ) : null}
              {item.type === 'group' && item.memberCount ? (
                <View style={[s.inlineBadge, { backgroundColor: '#ede9fe' }]}>
                  <Text style={[s.inlineBadgeText, { color: '#7c3aed' }]}>{item.memberCount}</Text>
                </View>
              ) : null}
              <Text style={[s.convTime, { color: isUnread ? C.accent : C.subtext }]}>
                {timeAgo(item.lastMessageAt, locale, t)}
              </Text>
            </View>

            <View style={s.convBottom}>
              <Text
                style={[
                  s.convPreview,
                  {
                    color: typingText ? C.accent : isUnread ? C.text : C.subtext,
                    fontWeight: typingText || isUnread ? '600' : '400',
                  },
                ]}
                numberOfLines={1}
              >
                {previewText}
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

export default function MessagesScreen({
  navigation,
  scrollTopSignal = 0,
  resetSignal = 0,
  safeTop = true,
  showHeader = true,
  showBackButton = true,
  onScrollPositionChange,
}: Props) {
  const scheme = useColorScheme();
  const t = useT();
  const language = useLanguage();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';
  const C = scheme === 'dark' ? DARK : LIGHT;
  const user = useAuthStore((state) => state.user);
  const setUnreadMessages = useMessageStore((state) => state.setUnreadConversations);
  const listRef = useRef<FlatList<ConversationItem>>(null);
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MessageFilter>('all');
  const [typingUsersByConversation, setTypingUsersByConversation] = useState<Record<string, Record<string, number>>>({});

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ items: ConversationItem[] }>('/api/conversations?limit=30');
      const items = (data.items ?? [])
        .filter((c): c is ConversationItem => c != null && typeof c.id === 'string')
        .sort((a, b) => {
          const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bt - at;
        });
      setConversations(items);
      setUnreadMessages(items.filter((c) => (c.unreadCount ?? 0) > 0).length);
    } finally {
      setLoading(false);
    }
  }, [setUnreadMessages]);

  useEffect(() => {
    void load();
  }, [load, resetSignal]);

  useEffect(() => {
    if (!scrollTopSignal) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    onScrollPositionChange?.(true);
  }, [onScrollPositionChange, scrollTopSignal]);

  const clearTypingUser = useCallback((conversationId: string, userId: string) => {
    const key = `${conversationId}:${userId}`;
    const timeoutId = typingTimeoutsRef.current[key];
    if (timeoutId) {
      clearTimeout(timeoutId);
      delete typingTimeoutsRef.current[key];
    }

    setTypingUsersByConversation((current) => {
      const nextConversation = { ...(current[conversationId] ?? {}) };
      delete nextConversation[userId];
      if (Object.keys(nextConversation).length === 0) {
        const next = { ...current };
        delete next[conversationId];
        return next;
      }
      return { ...current, [conversationId]: nextConversation };
    });
  }, []);

  const scheduleTypingClear = useCallback((conversationId: string, userId: string) => {
    const key = `${conversationId}:${userId}`;
    const existing = typingTimeoutsRef.current[key];
    if (existing) clearTimeout(existing);
    typingTimeoutsRef.current[key] = setTimeout(() => {
      clearTypingUser(conversationId, userId);
    }, 4000);
  }, [clearTypingUser]);

  useEffect(() => {
    if (!user?.uid) return;
    connectSocket(user.uid);
    const socket = getSocket();

    const onMessageNew = (payload: {
      message?: { conversationId?: string; text?: string | null; senderId?: string };
      conversation?: { id?: string; lastMessagePreview?: string | null; lastMessageAt?: string | null };
    }) => {
      const convId = payload?.message?.conversationId ?? payload?.conversation?.id;
      if (!convId) return;
      const known = conversations.some((c) => c.id === convId);

      setConversations((prev) =>
        prev
          .map((c) => {
            if (c.id !== convId) return c;
            return {
              ...c,
              lastMessagePreview: payload.conversation?.lastMessagePreview ?? payload.message?.text ?? c.lastMessagePreview,
              lastMessageAt: payload.conversation?.lastMessageAt ?? c.lastMessageAt,
              unreadCount: payload.message?.senderId !== user.uid ? (c.unreadCount ?? 0) + 1 : c.unreadCount,
            };
          })
          .sort((a, b) => {
            const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return bt - at;
          })
      );

      if (payload.message?.senderId) {
        clearTypingUser(convId, payload.message.senderId);
      }

      if (!known) void load();
    };

    const onMessageUnreadCount = (payload: { count?: number }) => {
      if (typeof payload?.count === 'number') setUnreadMessages(payload.count);
    };

    const onTypingStart = (payload: { conversationId?: string; userId?: string; isTyping?: boolean }) => {
      if (!payload.conversationId || !payload.userId || payload.userId === user.uid) return;
      setTypingUsersByConversation((current) => ({
        ...current,
        [payload.conversationId!]: {
          ...(current[payload.conversationId!] ?? {}),
          [payload.userId!]: Date.now() + 4000,
        },
      }));
      scheduleTypingClear(payload.conversationId, payload.userId);
    };

    const onTypingStop = (payload: { conversationId?: string; userId?: string; isTyping?: boolean }) => {
      if (!payload.conversationId || !payload.userId || payload.userId === user.uid) return;
      clearTypingUser(payload.conversationId, payload.userId);
    };

    const onTypingStatus = (payload: { conversationId?: string; userId?: string; isTyping?: boolean }) => {
      if (payload?.isTyping) onTypingStart(payload);
      else onTypingStop(payload);
    };

    socket.on('message:new', onMessageNew);
    socket.on('message:unread-count', onMessageUnreadCount);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('typing', onTypingStatus);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('message:unread-count', onMessageUnreadCount);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('typing', onTypingStatus);
    };
  }, [clearTypingUser, conversations, load, scheduleTypingClear, setUnreadMessages, user?.uid]);

  useEffect(() => () => {
    Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
    typingTimeoutsRef.current = {};
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = conversations.filter((conversation) => {
    const title = getConversationTitle(conversation, t).toLowerCase();
    const preview = normalizeConversationPreview(conversation.lastMessagePreview).toLowerCase();
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || title.includes(query) || preview.includes(query);
    const matchesFilter =
      filter === 'all' ||
      (filter === 'unread' && (conversation.unreadCount ?? 0) > 0) ||
      (filter === 'groups' && conversation.type === 'group');
    return matchesSearch && matchesFilter;
  });

  const openConv = (conv: ConversationItem) => {
    setConversations((prev) => {
      const next = prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c));
      setUnreadMessages(next.filter((c) => (c.unreadCount ?? 0) > 0).length);
      return next;
    });

    navigation.navigate('Chat', {
      conversationId: conv.id,
      title: getConversationTitle(conv, t),
      peerUid: conv.type === 'dm' ? (conv.peer?.uid ?? null) : null,
      peerAvatar: getConversationAvatar(conv),
    });
  };

  const deleteConv = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    try {
      await api.delete(`/api/conversations/${id}`);
    } catch {
      void load();
    }
  };

  const toggleMute = async (item: ConversationItem) => {
    const muted = !item.muted;
    setConversations((prev) => prev.map((c) => (c.id === item.id ? { ...c, muted } : c)));
    try {
      await api.patch(`/api/conversations/${item.id}/mute`, { muted });
    } catch {
      void load();
    }
  };

  const renderItem = ({ item }: { item: ConversationItem }) => {
    if (!item?.id) return null;

    const typingUserIds = Object.entries(typingUsersByConversation[item.id] ?? {})
      .filter(([uid, expiresAt]) => uid !== user?.uid && expiresAt > Date.now())
      .map(([uid]) => uid);
    const typingText = getTypingIndicatorText(item, typingUserIds, t);

    return (
      <SwipeableConvRow
        item={item}
        C={C}
        typingText={typingText}
        onPress={() => openConv(item)}
        onDelete={() => deleteConv(item.id)}
        onToggleMute={() => toggleMute(item)}
        t={t}
        locale={locale}
      />
    );
  };

  const handleScroll = (event: any) => {
    onScrollPositionChange?.(Math.max(0, event.nativeEvent.contentOffset.y) < 12);
  };

  const emptyTitle = filter === 'groups' ? t('waves_group_empty_title') : t('messages_empty_title');
  const emptySubtitle = filter === 'groups' ? t('waves_group_empty_subtitle') : t('messages_empty_subtitle');

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={safeTop ? ['top'] : []}>
      {showHeader && (
        <View style={[s.header, { borderBottomColor: C.border }]}>
          {showBackButton ? (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={24} color={C.text} />
            </TouchableOpacity>
          ) : (
            <View style={s.headerIconSpace} />
          )}
          <Text style={[s.headerTitle, { color: C.text }]}>{t('messages_title')}</Text>
          <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="create-outline" size={24} color={C.text} />
          </TouchableOpacity>
        </View>
      )}

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
        <View style={s.filterRow}>
          {(['all', 'unread', 'groups'] as MessageFilter[]).map((key) => {
            const active = filter === key;
            const label = key === 'all'
              ? t('waves_filter_all')
              : key === 'unread'
                ? t('waves_filter_unread')
                : t('waves_filter_groups');
            return (
              <TouchableOpacity
                key={key}
                style={[s.filterChip, { backgroundColor: active ? '#e7f3ff' : C.input }]}
                onPress={() => setFilter(key)}
                activeOpacity={0.82}
              >
                <Text style={[s.filterText, { color: active ? C.accent : C.text }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="chatbubbles-outline" size={56} color={C.subtext} />
          <Text style={[s.emptyTitle, { color: C.text }]}>{emptyTitle}</Text>
          <Text style={[s.emptyText, { color: C.subtext }]}>{emptySubtitle}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.listContent}
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
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerIconSpace: { width: 24, height: 24 },
  searchWrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, gap: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterChip: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterText: { fontSize: 14, fontWeight: '800' },
  listContent: { paddingHorizontal: 8, paddingBottom: 14 },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 0,
    gap: 12,
    borderRadius: 16,
  },
  convAvatarWrap: { position: 'relative' },
  groupBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteBadge: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  convContent: { flex: 1, gap: 3 },
  convTop: { flexDirection: 'row', alignItems: 'center' },
  convName: { flex: 1, fontSize: 15, marginRight: 8 },
  convTime: { fontSize: 12, marginLeft: 'auto' },
  convBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convPreview: { flex: 1, fontSize: 13, marginRight: 8 },
  inlineBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 8,
  },
  inlineBadgeText: { fontSize: 10, fontWeight: '800' },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadCount: { color: '#fff', fontSize: 11, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  actionStrip: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_W,
    flexDirection: 'row',
  },
  actionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  actionLabel: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center', paddingHorizontal: 4 },
});


