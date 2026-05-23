import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Chat'>;
  route: RouteProp<RootStackParamList, 'Chat'>;
};

type ApiMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'text' | 'image' | 'file' | 'audio' | 'call_log';
  text: string;
  mediaUrl?: string;
  fileName?: string;
  createdAt: string;
  isRecalled?: boolean;
};

// ── Theme ─────────────────────────────────────────────────────────────────────

const DARK = {
  bg: '#0f172a', card: '#1e293b', border: '#334155',
  text: '#e2e8f0', subtext: '#64748b', accent: '#0ea5e9',
  ownBubble: '#0ea5e9', otherBubble: '#1e293b',
  ownText: '#fff', otherText: '#e2e8f0',
  input: '#1e293b', inputBorder: '#334155',
};
const LIGHT = {
  bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0',
  text: '#1f2937', subtext: '#94a3b8', accent: '#0ea5e9',
  ownBubble: '#0ea5e9', otherBubble: '#f1f5f9',
  ownText: '#fff', otherText: '#1f2937',
  input: '#ffffff', inputBorder: '#e2e8f0',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Hôm nay';
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

const POLL_INTERVAL = 5000;

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatScreen({ navigation, route }: Props) {
  const { conversationId, title, peerUid, peerAvatar } = route.params;
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const flatRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  // ── Load messages ──────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await api.get<{ items: ApiMessage[]; nextCursor: string | null }>(
        `/api/conversations/${conversationId}/messages?limit=30`
      );
      const items = (data.items ?? []).filter((m): m is ApiMessage => m != null && typeof m.id === 'string').reverse();
      setMessages(items);
      setNextCursor(data.nextCursor ?? null);

      if (items.length > 0) {
        const newest = items[0];
        if (newest.id !== lastMessageIdRef.current) {
          lastMessageIdRef.current = newest.id;
          markRead(newest.id, newest.createdAt);
        }
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // ── Load more (older messages) ─────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api.get<{ items: ApiMessage[]; nextCursor: string | null }>(
        `/api/conversations/${conversationId}/messages?limit=20&cursor=${encodeURIComponent(nextCursor)}`
      );
      const older = (data.items ?? []).reverse();
      setMessages(prev => [...prev, ...older]);
      setNextCursor(data.nextCursor ?? null);
    } catch { /* ignore */ } finally {
      setLoadingMore(false);
    }
  }, [conversationId, nextCursor, loadingMore]);

  // ── Mark as read ───────────────────────────────────────────────────────────

  const markRead = async (lastId: string, lastCreatedAt: string) => {
    try {
      await api.patch(`/api/conversations/${conversationId}/read`, {
        lastReadMessageId: lastId,
        lastReadMessageCreatedAt: lastCreatedAt,
      });
    } catch { /* ignore */ }
  };

  // ── Polling ────────────────────────────────────────────────────────────────

  const poll = useCallback(async () => {
    try {
      const data = await api.get<{ items: ApiMessage[]; nextCursor: string | null }>(
        `/api/conversations/${conversationId}/messages?limit=20`
      );
      const items = (data.items ?? []).filter((m): m is ApiMessage => m != null && typeof m.id === 'string').reverse();
      if (items.length === 0) return;
      const newest = items[0];
      if (newest.id === lastMessageIdRef.current) return;

      lastMessageIdRef.current = newest.id;
      setMessages(prev => {
        const existingIds = new Set(prev.filter(m => m != null).map(m => m.id));
        const fresh = items.filter(m => !existingIds.has(m.id));
        return fresh.length > 0 ? [...fresh, ...prev] : prev;
      });
      markRead(newest.id, newest.createdAt);
    } catch { /* ignore */ }
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadMessages, poll]);

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    const optimisticId = `opt_${Date.now()}`;
    const optimistic: ApiMessage = {
      id: optimisticId,
      conversationId,
      senderId: user?.uid ?? '',
      type: 'text',
      text,
      createdAt: new Date().toISOString(),
    };

    setDraft('');
    setSending(true);
    setMessages(prev => [optimistic, ...prev]);

    try {
      const data = await api.post<{ item: ApiMessage }>(
        `/api/conversations/${conversationId}/messages`,
        { text }
      );
      const real = data.item;
      if (!real?.id) {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        return;
      }
      setMessages(prev => prev.map(m => m.id === optimisticId ? real : m));
      lastMessageIdRef.current = real.id;
      markRead(real.id, real.createdAt);
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  // ── Render message ─────────────────────────────────────────────────────────

  const renderMessage = ({ item, index }: { item: ApiMessage; index: number }) => {
    const isOwn = item.senderId === user?.uid;
    const showDateHeader =
      index === messages.length - 1 ||
      new Date(messages[index + 1]?.createdAt).toDateString() !== new Date(item.createdAt).toDateString();

    const isRecalled = item.isRecalled;

    return (
      <>
        {showDateHeader && (
          <View style={s.dateHeader}>
            <Text style={[s.dateHeaderText, { color: C.subtext }]}>{formatDateHeader(item.createdAt)}</Text>
          </View>
        )}
        <View style={[s.msgRow, isOwn && s.msgRowOwn]}>
          {!isOwn && (
            <View style={s.msgAvatarWrap}>
              {peerAvatar ? (
                <Image source={{ uri: peerAvatar }} style={s.msgAvatar} />
              ) : (
                <View style={[s.msgAvatar, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{(title || '?').charAt(0)}</Text>
                </View>
              )}
            </View>
          )}
          <View style={[s.bubble, isOwn
            ? [s.bubbleOwn, { backgroundColor: C.ownBubble }]
            : [s.bubbleOther, { backgroundColor: C.otherBubble }]
          ]}>
            {isRecalled ? (
              <Text style={[s.recalledText, { color: isOwn ? 'rgba(255,255,255,0.6)' : C.subtext }]}>
                Tin nhắn đã được thu hồi
              </Text>
            ) : item.type === 'image' && item.mediaUrl ? (
              <Image source={{ uri: item.mediaUrl }} style={s.imgMsg} resizeMode="cover" />
            ) : (
              <Text style={[s.msgText, { color: isOwn ? C.ownText : C.otherText }]}>{item.text}</Text>
            )}
            <Text style={[s.msgTime, { color: isOwn ? 'rgba(255,255,255,0.65)' : C.subtext }]}>
              {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
      </>
    );
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <View style={[s.header, { borderBottomColor: C.border, backgroundColor: C.card }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: C.text }]}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: C.border, backgroundColor: C.card }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.headerInfo}
          onPress={() => peerUid && navigation.navigate('Profile', { userId: peerUid })}
          activeOpacity={0.7}
        >
          {peerAvatar ? (
            <Image source={{ uri: peerAvatar }} style={s.headerAvatar} />
          ) : (
            <View style={[s.headerAvatar, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{(title || '?').charAt(0)}</Text>
            </View>
          )}
          <Text style={[s.headerTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
        </TouchableOpacity>
        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="call-outline" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={s.msgList}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={C.accent} style={{ paddingVertical: 12 }} /> : null}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <Ionicons name="chatbubble-outline" size={48} color={C.subtext} />
              <Text style={[s.emptyChatText, { color: C.subtext }]}>Chưa có tin nhắn. Hãy bắt đầu trò chuyện!</Text>
            </View>
          }
        />

        {/* Composer */}
        <View style={[s.composer, { backgroundColor: C.card, borderTopColor: C.border, paddingBottom: insets.bottom || 10 }]}>
          <View style={[s.inputWrap, { backgroundColor: C.input, borderColor: C.inputBorder }]}>
            <TextInput
              style={[s.input, { color: C.text }]}
              placeholder="Nhập tin nhắn..."
              placeholderTextColor={C.subtext}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
          </View>
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: draft.trim() ? C.accent : C.border }]}
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size={16} color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, gap: 10,
  },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  msgList: { paddingHorizontal: 12, paddingVertical: 8, gap: 2 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 2, gap: 6 },
  msgRowOwn: { flexDirection: 'row-reverse' },
  msgAvatarWrap: { marginBottom: 4 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },

  bubble: {
    maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9,
    paddingBottom: 5,
  },
  bubbleOwn: { borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 },

  msgText: { fontSize: 15, lineHeight: 21 },
  recalledText: { fontSize: 14, fontStyle: 'italic' },
  msgTime: { fontSize: 10, marginTop: 3, textAlign: 'right' },
  imgMsg: { width: 200, height: 200, borderRadius: 12 },

  dateHeader: { alignItems: 'center', marginVertical: 12 },
  dateHeaderText: { fontSize: 12, fontWeight: '500' },

  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 80 },
  emptyChatText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, gap: 10,
  },
  inputWrap: {
    flex: 1, borderRadius: 24, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    maxHeight: 120,
  },
  input: { fontSize: 15, maxHeight: 100 },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
});
