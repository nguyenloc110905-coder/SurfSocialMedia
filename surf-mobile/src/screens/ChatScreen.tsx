import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  LayoutAnimation,
  AppState,
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
  Animated,
  Alert,
  Linking,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { View as TamaguiView, Text as TamaguiText, styled } from '@tamagui/core';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { uploadFile, uploadImage } from '@/lib/cloudinary';
import { connectSocket, getSocket } from '@/lib/socket';
import PresenceBadge from '@/components/ui/PresenceBadge';
import MessageActionModal from '@/components/ui/MessageActionModal';
import { useLanguage, useT } from '@/lib/i18n';
import { messagesCache, type CachedMessage } from '@/lib/cache';

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
  editedAt?: string;
  isRecalled?: boolean;
  recalledForEveryone?: boolean;
  optimistic?: boolean;
  pinnedBy?: string[];
  reactions?: MessageReactionsByEmoji;
  callMode?: 'audio' | 'video';
  callOutcome?: 'completed' | 'missed' | 'declined' | 'busy' | 'failed' | 'ended' | 'started';
  durationSeconds?: number;
};

type MessageReactionActor = {
  uid: string;
  name: string;
  avatarUrl: string | null;
};

type MessageReactionsByEmoji = Record<string, Record<string, MessageReactionActor>>;

type ParsedReplyQuote = {
  senderId: string | null;
  senderName: string;
  snippet: string;
  bodyText: string;
  targetMessageId: string | null;
};

type ApiReadReceiptItem = {
  userId: string;
  lastReadMessageId: string;
  lastReadMessageCreatedAt: string;
  lastReadAt: string | null;
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

const GlassPanel = styled(TamaguiView, {
  borderRadius: 24,
  borderWidth: 1,
  overflow: 'hidden',
});

const Pill = styled(TamaguiView, {
  borderRadius: 999,
  borderWidth: 1,
  flexDirection: 'row',
  alignItems: 'center',
});

const SoftTitle = styled(TamaguiText, {
  fontSize: 15,
  fontWeight: '700',
});

const SoftMeta = styled(TamaguiText, {
  fontSize: 12,
  fontWeight: '500',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeader(iso: string, locale: string, t: ReturnType<typeof useT>): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return t('chat_today');
  if (d.toDateString() === yesterday.toDateString()) return t('chat_yesterday');
  return d.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: '2-digit' });
}

const POLL_INTERVAL = 30000;
const MESSAGE_REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const URL_TOKEN_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
const REPLY_PREFIX_PATTERN = /^↪\s*(.+?):\s*(.+)$/u;
const REPLY_TARGET_MARKER_PATTERN = /^__reply_to:([^\n]+)__$/;
const REPLY_SENDER_MARKER_PATTERN = /^__reply_sender:([^\n]+)__$/;
const REPLY_TARGET_MARKER_INLINE_PATTERN = /__reply_to:[^\s]+__/g;
const REPLY_SENDER_MARKER_INLINE_PATTERN = /__reply_sender:[^\s]+__/g;
const REPLY_TARGET_MARKER_LINE_PATTERN = /^__reply_to:[^\n]+__\n?/;
const REPLY_SENDER_MARKER_LINE_PATTERN = /^__reply_sender:[^\n]+__\n?/;

function stripReplyMetadata(value: string) {
  return (value || '')
    .replace(REPLY_TARGET_MARKER_LINE_PATTERN, '')
    .replace(REPLY_SENDER_MARKER_LINE_PATTERN, '')
    .replace(REPLY_TARGET_MARKER_INLINE_PATTERN, ' ')
    .replace(REPLY_SENDER_MARKER_INLINE_PATTERN, ' ')
    .trim();
}

function unwrapReplyPrefix(value: string) {
  let normalized = value.trim();
  for (let depth = 0; depth < 4; depth += 1) {
    const match = normalized.match(REPLY_PREFIX_PATTERN);
    if (!match) break;
    normalized = match[2].trim();
  }
  return normalized;
}

function extractLatestChatContent(value: string) {
  const stripped = stripReplyMetadata(value);
  if (!stripped) return '';
  const lines = stripped.split('\n');
  const firstLine = lines[0]?.trim() ?? '';
  const replyMatch = firstLine.match(REPLY_PREFIX_PATTERN);
  if (!replyMatch) return stripped;
  const body = lines.slice(1).join('\n').trim();
  return body || unwrapReplyPrefix(replyMatch[2]);
}

function parseReplyQuoteFromText(value: string): ParsedReplyQuote | null {
  const lines = value.split('\n');
  let targetMessageId: string | null = null;
  let senderId: string | null = null;

  while (lines.length > 0) {
    const line = lines[0]?.trim() ?? '';
    const targetMatch = line.match(REPLY_TARGET_MARKER_PATTERN);
    if (targetMatch) {
      targetMessageId = targetMatch[1]?.trim() || null;
      lines.shift();
      continue;
    }
    const senderMatch = line.match(REPLY_SENDER_MARKER_PATTERN);
    if (senderMatch) {
      senderId = senderMatch[1]?.trim() || null;
      lines.shift();
      continue;
    }
    break;
  }

  const firstLine = lines[0]?.trim() ?? '';
  const replyMatch = firstLine.match(REPLY_PREFIX_PATTERN);
  if (!replyMatch) return null;

  return {
    senderId,
    senderName: replyMatch[1]?.trim() || 'Tin nhắn',
    snippet: replyMatch[2]?.trim() || '',
    bodyText: lines.slice(1).join('\n').trim(),
    targetMessageId,
  };
}

function normalizeHref(value: string) {
  return value.toLowerCase().startsWith('www.') ? `https://${value}` : value;
}

function LinkifiedText({ text, style, linkColor }: { text: string; style: object; linkColor: string }) {
  const parts: React.ReactNode[] = [];
  const matcher = new RegExp(URL_TOKEN_PATTERN);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    parts.push(
      <Text
        key={`${match.index}-${token}`}
        style={{ color: linkColor, fontWeight: '700', textDecorationLine: 'underline' }}
        onPress={() => Linking.openURL(normalizeHref(token)).catch(() => {})}
      >
        {token}
      </Text>
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <Text style={style}>{parts.length > 0 ? parts : text}</Text>;
}

function getMessageSnippet(message: ApiMessage) {
  if (message.type === 'image') return 'đã gửi một ảnh';
  if (message.type === 'audio') return 'đã gửi một đoạn ghi âm';
  if (message.type === 'file') return message.fileName ? `[File] ${message.fileName}` : '[File] tệp đính kèm';
  if (message.type === 'call_log') return 'cuộc gọi';
  const text = extractLatestChatContent(message.text).replace(/\s+/g, ' ').trim();
  return text.length > 90 ? `${text.slice(0, 90)}...` : text || 'tin nhắn';
}

// ── Typing dots ───────────────────────────────────────────────────────────────

function formatCallDuration(durationSeconds?: number) {
  if (!durationSeconds || durationSeconds <= 0) return '0 giây';
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  if (minutes <= 0) return `${seconds} giây`;
  if (seconds <= 0) return `${minutes} phút`;
  return `${minutes} phút ${seconds} giây`;
}

function getCallLabel(message: ApiMessage) {
  const modeLabel = message.callMode === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
  if (message.callOutcome === 'missed') return `${modeLabel} nhỡ`;
  if (message.callOutcome === 'declined') return `${modeLabel} bị từ chối`;
  if (message.callOutcome === 'failed') return `${modeLabel} thất bại`;
  return `${modeLabel} • ${formatCallDuration(message.durationSeconds)}`;
}

function formatVoiceDuration(durationMillis?: number) {
  const totalSeconds = Math.max(0, Math.floor((durationMillis ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getMarketplaceQuickReplies(t: ReturnType<typeof useT>) {
  return [
    t('waves_quick_reply_like'),
    t('waves_quick_reply_follow_up'),
    t('waves_quick_reply_sold_out'),
  ];
}

function TypingDots({ C }: { C: typeof DARK }) {
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const d3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeDot = (d: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(d, { toValue: -5, duration: 280, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 280, useNativeDriver: true }),
          Animated.delay(Math.max(0, 560 - delay)),
        ])
      );
    const anim = Animated.parallel([makeDot(d1, 0), makeDot(d2, 180), makeDot(d3, 360)]);
    anim.start();
    return () => anim.stop();
  }, [d1, d2, d3]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 2 }}>
      {[d1, d2, d3].map((d, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.subtext, transform: [{ translateY: d }] }} />
      ))}
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatScreen({ navigation, route }: Props) {
  const {
    conversationId,
    title,
    peerUid,
    peerAvatar,
    conversationType,
    marketplaceTitle,
  } = route.params;
  const scheme = useColorScheme();
  const t = useT();
  const language = useLanguage();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';
  const C = scheme === 'dark' ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);
  const [reactionDetailsMessageId, setReactionDetailsMessageId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ApiMessage | null>(null);
  const [seenMessageId, setSeenMessageId] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  const flatRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const lastMarkedReadRef = useRef<string | null>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const socketConnectedRef = useRef(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const sameMessages = useCallback((left: ApiMessage[], right: ApiMessage[]) => {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      const a = left[i];
      const b = right[i];
      if (
        a.id !== b.id ||
        a.text !== b.text ||
        a.createdAt !== b.createdAt ||
        a.mediaUrl !== b.mediaUrl ||
        a.senderId !== b.senderId ||
        a.type !== b.type
      ) {
        return false;
      }
    }
    return true;
  }, []);

  // ── Load messages ──────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (silent = false) => {
    if (loading || (!silent && messages.length > 0 && !nextCursor)) return;
    setLoading(!silent);
    try {
      const cached = await messagesCache.getMessages(conversationId);
      let hasCache = false;
      if (cached && cached.length > 0 && !nextCursor) {
        const cachedMessages = cached.map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          type: m.mediaUrl ? 'image' : 'text',
          text: m.text,
          mediaUrl: m.mediaUrl,
          createdAt: m.createdAt,
        })) as ApiMessage[];
        setMessages(cachedMessages);
        hasCache = true;
      }

      const data = await api.get<{ items: ApiMessage[]; nextCursor: string | null }>(
        `/api/conversations/${conversationId}/messages?limit=20${nextCursor ? `&cursor=${nextCursor}` : ''}`
      );
      const items = (data.items ?? []).filter((m): m is ApiMessage => m != null && typeof m.id === 'string');
      
      if (items.length > 0) {
        setMessages(prev => {
          if (!nextCursor && !hasCache) return items;
          const prevIds = new Set(prev.map(m => m.id));
          return [...prev.filter(m => hasCache ? m.optimistic : true), ...items.filter(m => !prevIds.has(m.id))];
        });
        if (!nextCursor) {
          lastMessageIdRef.current = items[0].id;
          markRead(items[0].id, items[0].createdAt);
          items.forEach(m => messagesCache.addMessage(conversationId, {
            id: m.id,
            conversationId: m.conversationId,
            senderId: m.senderId,
            text: m.text,
            mediaUrl: m.mediaUrl || null,
            createdAt: m.createdAt,
            senderName: '',
            senderAvatarUrl: null
          }));
        }
      }
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // ignore error
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [conversationId, messages.length, nextCursor, loading]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loadingMore && !loading) {
      setLoadingMore(true);
      loadMessages(true);
    }
  }, [nextCursor, loadingMore, loading, loadMessages]);

  const isMarketplaceThread =
    conversationType === 'marketplace' ||
    (typeof marketplaceTitle === 'string' && marketplaceTitle.length > 0) ||
    title.includes('·');
  const marketplaceQuickReplies = getMarketplaceQuickReplies(t);
  const selectedMessage = selectedMessageId
    ? messages.find((message) => message.id === selectedMessageId) ?? null
    : null;
  const reactionDetailsMessage = reactionDetailsMessageId
    ? messages.find((message) => message.id === reactionDetailsMessageId) ?? null
    : null;
  const pinnedMessages = messages.filter(
    (message) => (message.pinnedBy?.length ?? 0) > 0 && !message.isRecalled && !message.recalledForEveryone
  );

  // ── Mark as read ───────────────────────────────────────────────────────────

  const markRead = async (lastId: string, lastCreatedAt: string) => {
    if (lastMarkedReadRef.current === lastId) return;
    lastMarkedReadRef.current = lastId;
    try {
      await api.patch(`/api/conversations/${conversationId}/read`, {
        lastReadMessageId: lastId,
        lastReadMessageCreatedAt: lastCreatedAt,
      });
    } catch {
      if (lastMarkedReadRef.current === lastId) lastMarkedReadRef.current = null;
    }
  };

  const loadReadReceipts = useCallback(async () => {
    if (!peerUid || messages.length === 0) return;
    const oldest = messages[messages.length - 1];
    const newest = messages[0];
    if (!oldest?.createdAt || !newest?.createdAt) return;
    try {
      const data = await api.get<{ items: ApiReadReceiptItem[] }>(
        `/api/conversations/${conversationId}/read-receipts?fromCreatedAt=${encodeURIComponent(oldest.createdAt)}&toCreatedAt=${encodeURIComponent(newest.createdAt)}&limit=20`
      );
      const peerReceipt = (data.items ?? []).find((item) => item.userId === peerUid);
      setSeenMessageId(peerReceipt?.lastReadMessageId ?? null);
    } catch {
      setSeenMessageId(null);
    }
  }, [conversationId, messages, peerUid]);

  // ── Polling ────────────────────────────────────────────────────────────────

  const replaceMessage = useCallback((nextMessage: ApiMessage) => {
    setMessages(prev => prev.map(message => message.id === nextMessage.id ? { ...message, ...nextMessage } : message));
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    // Dummy scrollToMessage to satisfy TS
  }, []);

  const copyMessage = useCallback(async (msg: ApiMessage) => {
    if (!msg.text) return;
    try {
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(msg.text);
    } catch (e) { console.error(e) }
  }, []);

  const handleReplyToMessage = useCallback((message: ApiMessage) => {
    if (message.optimistic || message.type === 'call_log') return;
    const senderName = message.senderId === user?.uid ? 'Bạn' : title;
    const quotedText = [
      `__reply_to:${message.id}__`,
      `__reply_sender:${message.senderId}__`,
      `↪ ${senderName}: ${getMessageSnippet(message)}`,
      '',
    ].join('\n');
    setDraft(quotedText);
  }, [title, user?.uid]);

  const toggleMessageReaction = useCallback(async (message: ApiMessage, emoji: string) => {
    if (message.optimistic || message.type === 'call_log') return;
    try {
      const data = await api.patch<{ conversationId: string; message: ApiMessage }>(
        `/api/messages/${encodeURIComponent(message.id)}/reactions`,
        { conversationId: message.conversationId, emoji }
      );
      replaceMessage(data.message);
    } catch { /* ignore */ }
  }, [replaceMessage]);

  const toggleMessagePin = useCallback(async (message: ApiMessage) => {
    if (message.optimistic || !user?.uid) return;
    const pinned = !(message.pinnedBy?.includes(user.uid) ?? false);
    try {
      const data = await api.patch<{ conversationId: string; message: ApiMessage }>(
        `/api/messages/${encodeURIComponent(message.id)}/pin`,
        { conversationId: message.conversationId, pinned }
      );
      replaceMessage(data.message);
    } catch { /* ignore */ }
  }, [replaceMessage, user?.uid]);

  const recallMessageForEveryone = useCallback(async (message: ApiMessage) => {
    if (message.optimistic || message.senderId !== user?.uid) return;
    setDeletingMessageId(message.id);
    try {
      const data = await api.delete<{ conversationId: string; message: ApiMessage }>(
        `/api/messages/${encodeURIComponent(message.id)}/everyone`,
        { body: { conversationId: message.conversationId } }
      );
      replaceMessage(data.message);
    } catch { /* ignore */ } finally {
      setDeletingMessageId(null);
    }
  }, [replaceMessage, user?.uid]);

  const hideMessageForSelf = useCallback(async (message: ApiMessage) => {
    if (message.optimistic) return;
    try {
      await api.delete(`/api/messages/${encodeURIComponent(message.id)}/self`, {
        body: { conversationId: message.conversationId },
      });
      setMessages(prev => prev.filter(item => item.id !== message.id));
    } catch { /* ignore */ }
  }, []);

  const reportMessage = useCallback(async (message: ApiMessage) => {
    if (message.optimistic) return;
    try {
      await api.post(`/api/messages/${encodeURIComponent(message.id)}/report`, {
        conversationId: message.conversationId,
        reason: 'Nội dung không phù hợp',
      });
      Alert.alert('Đã gửi báo cáo', 'Surf sẽ xem xét tin nhắn này.');
    } catch {
      Alert.alert(t('error_title'), 'Không thể gửi báo cáo lúc này.');
    }
  }, [t]);

  const openMessageActions = useCallback((message: ApiMessage) => {
    setActionMessage(message);
  }, []);

  const poll = useCallback(async () => {
    if (appStateRef.current !== 'active') return;
    if (socketConnectedRef.current) return;
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
        if (fresh.length > 0) {
          // Cache new messages
          fresh.forEach(async (m) => {
            await messagesCache.addMessage(conversationId, {
              id: m.id,
              conversationId: m.conversationId,
              senderId: m.senderId,
              text: m.text,
              mediaUrl: m.mediaUrl || null,
              createdAt: m.createdAt,
              senderName: '',
              senderAvatarUrl: null,
            });
          });
          return [...fresh, ...prev];
        }
        return prev;
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

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current !== 'active';
      appStateRef.current = nextState;
      if (nextState === 'active' && wasBackground) {
        void loadMessages(true);
      }
    });

    return () => subscription.remove();
  }, [loadMessages]);

  useEffect(() => {
    if (isSearchActive) {
      const delay = setTimeout(() => {
        loadMessages(false);
      }, 500);
      return () => clearTimeout(delay);
    }
  }, [searchQuery, isSearchActive, loadMessages]);

  // ── Socket: typing indicators ───────────────────────────────────────────────

  useEffect(() => {
    if (selectedMessageId && !messages.some((message) => message.id === selectedMessageId)) {
      setSelectedMessageId(null);
    }
    if (reactionDetailsMessageId && !messages.some((message) => message.id === reactionDetailsMessageId)) {
      setReactionDetailsMessageId(null);
    }
  }, [messages, reactionDetailsMessageId, selectedMessageId]);

  useEffect(() => {
    void loadReadReceipts();
  }, [loadReadReceipts]);

  useEffect(() => {
    if (!user?.uid) return;
    connectSocket(user.uid);
    const socket = getSocket();
    socketConnectedRef.current = socket.connected;
    socket.emit('conversation:join', conversationId);

    const onSocketConnect = () => {
      socketConnectedRef.current = true;
      socket.emit('conversation:join', conversationId);
    };
    const onSocketDisconnect = () => {
      socketConnectedRef.current = false;
    };

    const onTypingStart = ({ userId: uid }: { conversationId: string; userId: string }) => {
      if (uid === user.uid) return;
      setPeerTyping(true);
      if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
      peerTypingTimerRef.current = setTimeout(() => setPeerTyping(false), 4000);
    };

    const onTypingStop = ({ userId: uid }: { conversationId: string; userId: string }) => {
      if (uid === user.uid) return;
      if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
      setPeerTyping(false);
    };
    const onTypingStatus = (payload: { conversationId: string; userId: string; isTyping?: boolean }) => {
      if (payload.conversationId !== conversationId) return;
      if (payload.isTyping) onTypingStart(payload);
      else onTypingStop(payload);
    };
    const onMessageNew = (payload: { conversationId?: string; message?: ApiMessage }) => {
      const message = payload.message;
      const targetConversationId = payload.conversationId || message?.conversationId;
      if (!message || targetConversationId !== conversationId) return;
      setMessages(prev => {
        if (prev.some(item => item.id === message.id)) return prev;
        return [
          message,
          ...prev.filter(item => !(item.optimistic && item.text === message.text && item.senderId === message.senderId)),
        ];
      });
      lastMessageIdRef.current = message.id;
      markRead(message.id, message.createdAt);
      if (message.senderId !== user.uid) setPeerTyping(false);
    };
    const onMessageSelfHidden = (payload: { conversationId: string; messageId: string }) => {
      if (payload.conversationId !== conversationId) return;
      setMessages(prev => prev.filter(message => message.id !== payload.messageId));
    };
    const onMessageUpdated = (payload: { conversationId: string; message: ApiMessage }) => {
      if (payload.conversationId !== conversationId || !payload.message?.id) return;
      replaceMessage(payload.message);
    };

    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('typing', onTypingStatus);
    socket.on('connect', onSocketConnect);
    socket.on('disconnect', onSocketDisconnect);
    socket.on('message:new', onMessageNew);
    socket.on('message:self-hidden', onMessageSelfHidden);
    socket.on('message:recalled', onMessageUpdated);
    socket.on('message:updated', onMessageUpdated);
    socket.on('message:reaction-updated', onMessageUpdated);

    return () => {
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('typing', onTypingStatus);
      socket.off('connect', onSocketConnect);
      socket.off('disconnect', onSocketDisconnect);
      socket.off('message:new', onMessageNew);
      socket.off('message:self-hidden', onMessageSelfHidden);
      socket.off('message:recalled', onMessageUpdated);
      socket.off('message:updated', onMessageUpdated);
      socket.off('message:reaction-updated', onMessageUpdated);
      socket.emit('conversation:leave', conversationId);
    };
  }, [conversationId, replaceMessage, user?.uid]);

  // ── Draft change with typing emit ──────────────────────────────────────────

  const handleDraftChange = useCallback((text: string) => {
    setDraft(text);
    if (!user?.uid) return;
    const socket = getSocket();
    if (text.trim()) {
      socket.emit('typing:start', { conversationId });
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = setTimeout(() => {
        socket.emit('typing:stop', { conversationId });
      }, 2500);
    } else {
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      socket.emit('typing:stop', { conversationId });
    }
  }, [conversationId, user?.uid]);

  // ── Pick & send image ───────────────────────────────────────────────────────

  const pickAndSendMedia = async (source: 'camera' | 'library') => {
    const isCamera = source === 'camera';
    if (isCamera) {
      const p = await ImagePicker.getCameraPermissionsAsync();
      if (!p.granted) {
        const r = await ImagePicker.requestCameraPermissionsAsync();
        if (!r.granted) { Alert.alert(t('permission_required'), t('camera_permission_required')); return; }
      }
    } else {
      const p = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!p.granted) {
        const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!r.granted) { Alert.alert(t('permission_required'), t('library_permission_required')); return; }
      }
    }
    const result = isCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const optimisticId = `opt_${Date.now()}`;
    const optimistic: ApiMessage = {
      id: optimisticId,
      conversationId,
      senderId: user?.uid ?? '',
      type: 'image',
      text: '',
      mediaUrl: asset.uri,
      createdAt: new Date().toISOString(),
      optimistic: true,
    };
    setMessages(prev => [optimistic, ...prev]);
    setSending(true);
    try {
      const url = await uploadImage(asset, { folder: 'surf/chat' });
      const data = await api.post<{ item: ApiMessage }>(
        `/api/conversations/${conversationId}/messages`,
        { mediaUrl: url, mediaType: 'image' }
      );
      const real = data.item;
      if (real?.id) {
        setMessages(prev => prev.map(m => m.id === optimisticId ? real : m));
        lastMessageIdRef.current = real.id;
        markRead(real.id, real.createdAt);
      } else {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      Alert.alert(t('error_title'), t('cannot_send_image'));
    } finally {
      setSending(false);
    }
  };

  const handlePickMedia = () => Alert.alert(t('send_image'), t('choose_source'), [
    { text: t('take_photo'), onPress: () => pickAndSendMedia('camera') },
    { text: t('photo_library'), onPress: () => pickAndSendMedia('library') },
    { text: t('cancel'), style: 'cancel' },
  ]);

  // ── Send message ───────────────────────────────────────────────────────────

  const handlePickFile = useCallback(async () => {
    if (sending || voiceBusy || recorderState.isRecording) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setSending(true);
      const optimisticId = `opt_${Date.now()}`;
      const optimistic: ApiMessage = {
        id: optimisticId,
        conversationId,
        senderId: user?.uid ?? '',
        type: 'file',
        text: '',
        mediaUrl: asset.uri,
        fileName: asset.name,
        createdAt: new Date().toISOString(),
        optimistic: true,
      };
      setMessages(prev => [optimistic, ...prev]);
      
      const fileUrl = await uploadFile(
        {
          uri: asset.uri,
          fileName: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
        },
        { folder: 'surf/chat/files' }
      );
      const data = await api.post<{ item: ApiMessage }>(
        `/api/conversations/${conversationId}/messages`,
        {
          mediaUrl: fileUrl,
          mediaType: 'file',
          fileName: asset.name,
        }
      );
      const real = data.item;
      if (real?.id) {
        setMessages(prev => prev.map(m => m.id === optimisticId ? real : m));
        lastMessageIdRef.current = real.id;
        markRead(real.id, real.createdAt);
      } else {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
      }
    } catch {
      Alert.alert(t('error_title'), 'Khong the gui tep. Vui long thu lai.');
    } finally {
      setSending(false);
    }
  }, [conversationId, recorderState.isRecording, sending, t, voiceBusy]);

  const stopAndSendVoice = useCallback(async () => {
    if (!recorderState.isRecording) return;
    setVoiceBusy(true);
    try {
      await recorder.stop();
      const voiceUri = recorder.uri || recorderState.url;
      if (!voiceUri) throw new Error('Missing voice uri');
      const fileName = `voice-${Date.now()}.m4a`;

      const optimisticId = `opt_${Date.now()}`;
      const optimistic: ApiMessage = {
        id: optimisticId,
        conversationId,
        senderId: user?.uid ?? '',
        type: 'audio',
        text: '',
        mediaUrl: voiceUri,
        fileName,
        createdAt: new Date().toISOString(),
        optimistic: true,
      };
      setMessages(prev => [optimistic, ...prev]);

      const audioUrl = await uploadFile(
        {
          uri: voiceUri,
          fileName,
          mimeType: 'audio/m4a',
        },
        { folder: 'surf/chat/audio' }
      );
      const data = await api.post<{ item: ApiMessage }>(
        `/api/conversations/${conversationId}/messages`,
        {
          mediaUrl: audioUrl,
          mediaType: 'audio',
          fileName,
        }
      );
      const real = data.item;
      if (real?.id) {
        setMessages(prev => prev.map(m => m.id === optimisticId ? real : m));
        lastMessageIdRef.current = real.id;
        markRead(real.id, real.createdAt);
      } else {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
      }
    } catch {
      Alert.alert(t('error_title'), 'Khong the gui tin nhan thoai. Vui long thu lai.');
    } finally {
      setVoiceBusy(false);
      void setAudioModeAsync({ allowsRecording: false });
    }
  }, [conversationId, recorder, recorderState.isRecording, recorderState.url, t]);

  const startVoiceRecording = useCallback(async () => {
    if (sending || voiceBusy) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('permission_required'), 'Can quyen micro de ghi am.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      Alert.alert(t('error_title'), 'Khong the bat dau ghi am.');
      void setAudioModeAsync({ allowsRecording: false });
    }
  }, [recorder, sending, t, voiceBusy]);

  const handleVoiceAction = useCallback(async () => {
    if (voiceBusy || sending) return;
    if (recorderState.isRecording) {
      await stopAndSendVoice();
      return;
    }
    await startVoiceRecording();
  }, [recorderState.isRecording, sending, startVoiceRecording, stopAndSendVoice, voiceBusy]);
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
      optimistic: true,
    };

    setDraft('');
    setSending(true);
    setMessages(prev => [optimistic, ...prev]);

    try {
      const socket = getSocket();
      socket.emit('typing:stop', { conversationId });
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);

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

  const renderReactions = (message: ApiMessage, isOwn: boolean) => {
    const groups = Object.entries(message.reactions ?? {})
      .map(([emoji, actors]) => ({ emoji, count: Object.keys(actors).length }))
      .filter(group => group.count > 0)
      .sort((a, b) => b.count - a.count);
    if (groups.length === 0) return null;
    const total = groups.reduce((sum, group) => sum + group.count, 0);
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setReactionDetailsMessageId(message.id)}
        style={[s.reactionPill, isOwn ? s.reactionOwn : s.reactionOther, { backgroundColor: C.card, borderColor: C.border }]}
      >
        {groups.slice(0, 2).map(group => <Text key={group.emoji} style={s.reactionEmoji}>{group.emoji}</Text>)}
        <Text style={[s.reactionCountText, { color: C.subtext }]}>{total}</Text>
      </TouchableOpacity>
    );
  };

  const renderMessageBody = (item: ApiMessage, isOwn: boolean, isRecalled: boolean, messageBodyText: string) => {
    if (isRecalled) {
      return (
        <Text style={[s.recalledText, { color: isOwn ? 'rgba(255,255,255,0.72)' : C.subtext }]}>
          {t('chat_recalled')}
        </Text>
      );
    }
    if (item.type === 'image' && item.mediaUrl) {
      return <Image source={{ uri: item.mediaUrl }} style={s.imgMsg} resizeMode="cover" />;
    }
    if (item.type === 'file' && item.mediaUrl) {
      return (
        <TouchableOpacity style={[s.fileMsgCard, { backgroundColor: isOwn ? 'rgba(255,255,255,0.15)' : C.card }]} onPress={() => Linking.openURL(item.mediaUrl!).catch(() => {})}>
          <View style={[s.fileIconBox, { backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(14, 165, 233, 0.1)' }]}>
            <Ionicons name="document-text" size={24} color={isOwn ? '#fff' : C.accent} />
          </View>
          <View style={s.fileInfo}>
            <Text style={[s.fileNameText, { color: isOwn ? '#fff' : C.text }]} numberOfLines={1}>
              {item.fileName || 'Tệp đính kèm'}
            </Text>
            <Text style={[s.fileSizeText, { color: isOwn ? 'rgba(255,255,255,0.7)' : C.subtext }]}>Nhấn để tải về</Text>
          </View>
        </TouchableOpacity>
      );
    }
    if (item.type === 'audio' && item.mediaUrl) {
      return (
        <TouchableOpacity style={[s.voicePlayerMsg, { backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : C.card }]} onPress={() => Linking.openURL(item.mediaUrl!).catch(() => {})}>
          <View style={[s.playBtn, { backgroundColor: isOwn ? '#fff' : C.accent }]}>
            <Ionicons name="play" size={16} color={isOwn ? C.accent : '#fff'} style={{ marginLeft: 2 }} />
          </View>
          <View style={s.waveform}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
              <View key={i} style={[s.waveBar, { height: 10 + Math.random() * 14, backgroundColor: isOwn ? 'rgba(255,255,255,0.8)' : C.subtext }]} />
            ))}
          </View>
          <Text style={[s.voiceTime, { color: isOwn ? '#fff' : C.subtext }]}>0:05</Text>
        </TouchableOpacity>
      );
    }
    if (item.type === 'call_log') {
      return (
        <View style={s.callLog}>
          <Ionicons name={item.callMode === 'video' ? 'videocam-outline' : 'call-outline'} size={18} color={isOwn ? '#fff' : C.accent} />
          <Text style={[s.msgText, { color: isOwn ? C.ownText : C.otherText }]}>
            {item.callOutcome === 'missed' ? 'Cuộc gọi nhỡ' : item.callOutcome === 'declined' ? 'Cuộc gọi bị từ chối' : 'Cuộc gọi'}
          </Text>
        </View>
      );
    }
    return (
      <LinkifiedText
        text={messageBodyText}
        style={[s.msgText, { color: isOwn ? C.ownText : C.otherText }]}
        linkColor={isOwn ? '#dbeafe' : C.accent}
      />
    );
  };

  const renderMessage = ({ item, index }: { item: ApiMessage; index: number }) => {
    const isOwn = item.senderId === user?.uid;
    const showDateHeader =
      index === messages.length - 1 ||
      new Date(messages[index + 1]?.createdAt).toDateString() !== new Date(item.createdAt).toDateString();

    const parsedReplyQuote = item.text ? parseReplyQuoteFromText(item.text) : null;
    const messageBodyText = parsedReplyQuote ? parsedReplyQuote.bodyText : stripReplyMetadata(item.text);
    const isRecalled = item.isRecalled || item.recalledForEveryone || messageBodyText === 'Tin nhắn đã được thu hồi';
    const isPinned = (item.pinnedBy?.length ?? 0) > 0;
    const hasReactions = Object.values(item.reactions ?? {}).some(group => Object.keys(group).length > 0);
    const isSelected = selectedMessageId === item.id;
    const isSeen = isOwn && seenMessageId === item.id;

    return (
      <>
        {showDateHeader && (
          <View style={s.dateHeader}>
            <Text style={[s.dateHeaderText, { color: C.subtext }]}>{formatDateHeader(item.createdAt, locale, t)}</Text>
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
                {item.senderId && <PresenceBadge uid={item.senderId} size="sm" style={{ borderColor: C.card }} />}
              </View>
          )}
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => setSelectedMessageId(item.id)}
            onLongPress={() => openMessageActions(item)}
            delayLongPress={260}
            style={[s.bubble, isOwn
              ? [s.bubbleOwn, { backgroundColor: C.ownBubble }]
              : [s.bubbleOther, { backgroundColor: C.otherBubble }],
              item.optimistic && s.optimistic,
              hasReactions && s.bubbleWithReaction,
              isSelected && [s.bubbleSelected, { borderColor: C.accent }],
            ]}
          >
            {isPinned && (
              <Text style={[s.pinnedText, { color: isOwn ? 'rgba(255,255,255,0.9)' : C.accent }]}>Đã ghim</Text>
            )}
            {parsedReplyQuote && !isRecalled && (
              <View style={[s.replyQuote, { backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(2,132,199,0.1)', borderLeftColor: isOwn ? '#fff' : C.accent }]}>
                <Text style={[s.replySender, { color: isOwn ? '#fff' : C.accent }]} numberOfLines={1}>
                  {parsedReplyQuote.senderId === user?.uid ? 'Bạn' : parsedReplyQuote.senderName}
                </Text>
                <Text style={[s.replySnippet, { color: isOwn ? 'rgba(255,255,255,0.86)' : C.subtext }]} numberOfLines={1}>
                  {parsedReplyQuote.snippet}
                </Text>
              </View>
            )}
            {renderMessageBody(item, isOwn, isRecalled, messageBodyText)}
            <Text style={[s.msgTime, { color: isOwn ? 'rgba(255,255,255,0.65)' : C.subtext }]}>
              {formatTime(item.createdAt, locale)}{item.editedAt ? ' · đã sửa' : ''}
            </Text>
            {deletingMessageId === item.id && (
              <Text style={[s.deletingText, { color: isOwn ? 'rgba(255,255,255,0.9)' : C.subtext }]}>Đang xử lý...</Text>
            )}
            {renderReactions(item, isOwn)}
          </TouchableOpacity>
          {isSeen ? <Text style={[s.seenText, { color: C.subtext }]}>Seen</Text> : null}
        </View>
      </>
    );
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  const composerReply = draft ? parseReplyQuoteFromText(draft) : null;
  const composerText = composerReply ? composerReply.bodyText : draft;
  const setComposerText = (text: string) => {
    if (!composerReply) {
      handleDraftChange(text);
      return;
    }
    const prefix = draft.slice(0, draft.length - composerReply.bodyText.length);
    handleDraftChange(`${prefix}${text}`);
  };
  const reactionDetailsRows = reactionDetailsMessage
    ? Object.entries(reactionDetailsMessage.reactions ?? {}).flatMap(([emoji, actors]) =>
        Object.values(actors).map((actor) => ({
          emoji,
          uid: actor.uid,
          name: actor.name,
        }))
      )
    : [];

  if (loading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <LinearGradient
          colors={scheme === 'dark' ? ['#08131a', '#0a2227', '#071218'] : ['#f4fbfb', '#e6f7f7', '#edf6fb']}
          style={StyleSheet.absoluteFillObject}
        />
        <GlassPanel style={[s.headerShell, { borderColor: C.border, backgroundColor: scheme === 'dark' ? 'rgba(13,22,28,0.86)' : 'rgba(255,255,255,0.88)' }]}>
          <View style={[s.header, { borderBottomColor: 'transparent', backgroundColor: 'transparent' }]}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: C.text }]}>{title}</Text>
            <View style={{ width: 24 }} />
          </View>
        </GlassPanel>
        <View style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      <LinearGradient
        colors={scheme === 'dark' ? ['#071318', '#0b2c31', '#071318'] : ['#f6fbfb', '#e9f8f7', '#eef6fb']}
        style={StyleSheet.absoluteFillObject}
      />
      <GlassPanel style={[s.headerShell, { borderColor: C.border, backgroundColor: scheme === 'dark' ? 'rgba(12,23,28,0.88)' : 'rgba(255,255,255,0.9)' }]}>
        <View style={[s.header, { borderBottomColor: 'transparent', backgroundColor: 'transparent' }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </TouchableOpacity>
          {isSearching ? (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
              <TextInput
                style={{ flex: 1, color: C.text, fontSize: 16, padding: 8, backgroundColor: C.card, borderRadius: 8 }}
                placeholder="Tìm kiếm..."
                placeholderTextColor={C.subtext}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              <TouchableOpacity
                onPress={() => {
                  setIsSearching(false);
                  setSearchQuery('');
                  setIsSearchActive(false);
                  setTimeout(() => loadMessages(), 100);
                }}
                style={{ paddingHorizontal: 10 }}
              >
                <Text style={{ color: C.accent }}>Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setIsSearchActive(true)}
                style={{ paddingHorizontal: 10 }}
              >
                <Text style={{ color: C.accent, fontWeight: 'bold' }}>Tìm</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={s.headerInfo}
                onPress={() => peerUid && navigation.navigate('Profile', { userId: peerUid })}
                activeOpacity={0.7}
              >
                <View style={{ position: 'relative' }}>
                    {peerAvatar ? (
                      <Image source={{ uri: peerAvatar }} style={s.headerAvatarLarge} />
                    ) : (
                      <View style={[s.headerAvatarLarge, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{(title || '?').charAt(0)}</Text>
                      </View>
                    )}
                    {peerUid && <PresenceBadge uid={peerUid} size="md" style={{ borderColor: C.card }} />}
                  </View>
                <TamaguiView flex={1} gap={6}>
                  <SoftTitle color={C.text} numberOfLines={1}>{title}</SoftTitle>
                  
                    <SoftMeta color={C.subtext}>
                      {peerTyping ? t('waves_typing_someone') : isMarketplaceThread ? (marketplaceTitle ?? 'Surf Market') : peerUid ? <PresenceBadge uid={peerUid} variant="text" style={{ color: C.subtext, fontSize: 12 }} /> : 'Waves conversation'}
                    </SoftMeta>
      
                </TamaguiView>
              </TouchableOpacity>
              <View style={[s.headerActions, { gap: 16 }]}>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setIsSearching(true)}>
                  <Ionicons name="search" size={24} color={C.text} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => navigation.navigate('Call' as any, { conversationId, peerUid, isHost: true, peerName: title, peerAvatar, mode: 'audio' })}>
                  <Ionicons name="call" size={24} color={C.text} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => navigation.navigate('Call' as any, { conversationId, peerUid, isHost: true, peerName: title, peerAvatar, mode: 'video' })}>
                  <Ionicons name="videocam" size={24} color={C.text} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => navigation.navigate('ChatInfo', { conversationId, title, peerUid, peerAvatar, conversationType: isMarketplaceThread ? 'marketplace' : 'dm', marketplaceTitle })}>
                  <Ionicons name="information-circle" size={24} color={C.text} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </GlassPanel>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <GlassPanel style={[s.messagesShell, { borderColor: C.border, backgroundColor: scheme === 'dark' ? 'rgba(7,24,28,0.78)' : 'rgba(255,255,255,0.58)' }]}>
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
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => {
                flatRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
              }, 250);
            }}
            ListHeaderComponent={peerTyping ? (
              <View style={[s.msgRow]}>
                <View style={s.msgAvatarWrap}>
                    {peerAvatar ? (
                      <Image source={{ uri: peerAvatar }} style={s.msgAvatar} />
                    ) : (
                      <View style={[s.msgAvatar, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{(title || '?').charAt(0)}</Text>
                      </View>
                    )}
                    {peerUid && <PresenceBadge uid={peerUid} size="sm" style={{ borderColor: C.card }} />}
                  </View>
                <View style={[s.bubble, s.bubbleOther, { backgroundColor: C.otherBubble }]}>
                  <TypingDots C={C} />
                </View>
              </View>
            ) : null}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={C.accent} style={{ paddingVertical: 12 }} /> : null}
            ListEmptyComponent={
              <View style={s.emptyChat}>
                <Ionicons name="chatbubble-outline" size={48} color={C.subtext} />
                <Text style={[s.emptyChatText, { color: C.subtext }]}>{t('chat_empty')}</Text>
              </View>
            }
          />
        </GlassPanel>

        {/* Composer */}
        <GlassPanel style={[s.composerShell, { borderColor: C.border, backgroundColor: scheme === 'dark' ? 'rgba(17,24,29,0.92)' : 'rgba(255,255,255,0.92)' }]}>
        <View style={[s.composer, { backgroundColor: 'transparent', borderTopColor: 'transparent', paddingBottom: insets.bottom || 10 }]}>
          {selectedMessage && (
            <View style={[s.contextCard, { backgroundColor: C.input, borderColor: C.border }]}>
              <View style={s.contextCardHeader}>
                <Text style={[s.contextTitle, { color: C.text }]} numberOfLines={1}>
                  {t('waves_selected_message')}
                </Text>
                <TouchableOpacity onPress={() => setSelectedMessageId(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={18} color={C.subtext} />
                </TouchableOpacity>
              </View>
              <Text style={[s.contextSnippet, { color: C.subtext }]} numberOfLines={2}>
                {getMessageSnippet(selectedMessage)}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.actionRow}>
                <TouchableOpacity
                  style={[s.actionChip, { backgroundColor: C.card, borderColor: C.border }]}
                  onPress={() => {
                    handleReplyToMessage(selectedMessage);
                    setSelectedMessageId(null);
                  }}
                >
                  <Ionicons name="return-up-back-outline" size={15} color={C.accent} />
                  <Text style={[s.actionChipText, { color: C.text }]}>{t('reply')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionChip, { backgroundColor: C.card, borderColor: C.border }]}
                  onPress={() => {
                    void toggleMessagePin(selectedMessage);
                  }}
                >
                  <Ionicons
                    name={(selectedMessage.pinnedBy?.length ?? 0) > 0 ? 'pricetag' : 'pricetag-outline'}
                    size={15}
                    color={C.accent}
                  />
                  <Text style={[s.actionChipText, { color: C.text }]}>
                    {(selectedMessage.pinnedBy?.length ?? 0) > 0 ? t('waves_unpin_message') : t('waves_pin_message')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionChip, { backgroundColor: C.card, borderColor: C.border }]}
                  onPress={() => setReactionDetailsMessageId(selectedMessage.id)}
                >
                  <Ionicons name="happy-outline" size={15} color={C.accent} />
                  <Text style={[s.actionChipText, { color: C.text }]}>{t('reactions')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionChip, { backgroundColor: C.card, borderColor: C.border }]}
                  onPress={() => openMessageActions(selectedMessage)}
                >
                  <Ionicons name="ellipsis-horizontal" size={15} color={C.accent} />
                  <Text style={[s.actionChipText, { color: C.text }]}>{t('waves_more_actions')}</Text>
                </TouchableOpacity>
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.emojiRow}>
                {MESSAGE_REACTION_OPTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={`${selectedMessage.id}-${emoji}`}
                    style={[s.emojiChip, { backgroundColor: C.card, borderColor: C.border }]}
                    onPress={() => void toggleMessageReaction(selectedMessage, emoji)}
                  >
                    <Text style={s.emojiChipText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          {isMarketplaceThread && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickReplyRow}>
              {marketplaceQuickReplies.map((reply) => (
                <TouchableOpacity
                  key={reply}
                  style={[s.quickReplyChip, { backgroundColor: C.input, borderColor: C.border }]}
                  onPress={() => setComposerText(reply)}
                >
                  <Text style={[s.quickReplyText, { color: C.text }]}>{reply}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {composerReply && (
            <View style={[s.composerReply, { backgroundColor: C.input, borderColor: C.border }]}>
              <View style={s.composerReplyText}>
                <Text style={[s.replySender, { color: C.accent }]} numberOfLines={1}>
                  Đang trả lời {composerReply.senderId === user?.uid ? 'Bạn' : composerReply.senderName}
                </Text>
                <Text style={[s.replySnippet, { color: C.subtext }]} numberOfLines={1}>{composerReply.snippet}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDraftChange(composerText)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={18} color={C.subtext} />
              </TouchableOpacity>
            </View>
          )}
          {recorderState.isRecording && (
            <View style={[s.voiceStatus, { backgroundColor: C.input, borderColor: C.border }]}>
              <View style={[s.voiceDot, { backgroundColor: '#ef4444' }]} />
              <Text style={[s.voiceStatusText, { color: C.text }]}>
                Đang ghi âm {formatVoiceDuration(recorderState.durationMillis)}
              </Text>
            </View>
          )}
          <View style={[s.composerActions, isComposerExpanded && { width: 40 }]}>
            {isComposerExpanded ? (
               <TouchableOpacity style={s.mediaBtn} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setIsComposerExpanded(false); }}>
                 <Ionicons name="chevron-forward" size={24} color={C.accent} />
               </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={s.mediaBtn} onPress={handlePickMedia} activeOpacity={0.7} disabled={sending || recorderState.isRecording || voiceBusy}>
                  <Ionicons name="image-outline" size={22} color={sending || recorderState.isRecording || voiceBusy ? C.border : C.subtext} />
                </TouchableOpacity>
                <TouchableOpacity style={s.mediaBtn} onPress={handlePickFile} activeOpacity={0.7} disabled={sending || recorderState.isRecording || voiceBusy}>
                  <Ionicons name="attach-outline" size={22} color={sending || recorderState.isRecording || voiceBusy ? C.border : C.subtext} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    s.mediaBtn,
                    recorderState.isRecording && [s.mediaBtnActive, { backgroundColor: 'rgba(239,68,68,0.12)' }],
                  ]}
                  onPress={handleVoiceAction}
                  activeOpacity={0.7}
                  disabled={sending || voiceBusy}
                >
                  {voiceBusy ? (
                    <ActivityIndicator size={16} color={C.accent} />
                  ) : (
                    <Ionicons
                      name={recorderState.isRecording ? 'stop-circle-outline' : 'mic-outline'}
                      size={22}
                      color={recorderState.isRecording ? '#ef4444' : sending ? C.border : C.subtext}
                    />
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
          <View style={[s.inputWrap, { backgroundColor: C.input, borderColor: C.inputBorder }]}>
            <TextInput
              style={[s.input, { color: C.text }]}
              placeholder={t('chat_placeholder')}
              placeholderTextColor={C.subtext}
              value={composerText}
              onChangeText={setComposerText}
              multiline
              maxLength={2000}
              returnKeyType="default"
              onFocus={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setIsComposerExpanded(true); }}
            />
          </View>
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: composerText.trim() ? C.accent : C.border }]}
            onPress={handleSend}
            disabled={!composerText.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size={16} color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
        </GlassPanel>
      </KeyboardAvoidingView>

      <Modal visible={showPinnedMessages} transparent animationType="slide" onRequestClose={() => setShowPinnedMessages(false)}>
        <View style={s.modalRoot}>
          <TouchableOpacity style={s.modalScrim} activeOpacity={1} onPress={() => setShowPinnedMessages(false)} />
          <View style={[s.modalCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[s.modalHeader, { borderBottomColor: C.border }]}>
              <Text style={[s.modalTitle, { color: C.text }]}>{t('waves_pinned_messages')}</Text>
              <TouchableOpacity onPress={() => setShowPinnedMessages(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={C.subtext} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalBody}>
              {pinnedMessages.length === 0 ? (
                <Text style={[s.modalEmptyText, { color: C.subtext }]}>{t('waves_no_pinned_messages')}</Text>
              ) : (
                pinnedMessages.map((message) => (
                  <TouchableOpacity
                    key={message.id}
                    style={[s.modalListItem, { borderBottomColor: C.border }]}
                    onPress={() => {
                      setShowPinnedMessages(false);
                      scrollToMessage(message.id);
                    }}
                  >
                    <Text style={[s.modalListTitle, { color: C.text }]}>
                      {message.senderId === user?.uid ? t('waves_you') : title}
                    </Text>
                    <Text style={[s.modalListSnippet, { color: C.subtext }]} numberOfLines={2}>
                      {getMessageSnippet(message)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={reactionDetailsMessage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionDetailsMessageId(null)}
      >
        <View style={s.modalRoot}>
          <TouchableOpacity style={s.modalScrim} activeOpacity={1} onPress={() => setReactionDetailsMessageId(null)} />
          <View style={[s.modalCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[s.modalHeader, { borderBottomColor: C.border }]}>
              <Text style={[s.modalTitle, { color: C.text }]}>{t('reactions')}</Text>
              <TouchableOpacity onPress={() => setReactionDetailsMessageId(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={C.subtext} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalBody}>
              {reactionDetailsRows.length === 0 ? (
                <Text style={[s.modalEmptyText, { color: C.subtext }]}>{t('no_reactions')}</Text>
              ) : (
                reactionDetailsRows.map((row) => (
                  <View key={`${reactionDetailsMessage?.id}-${row.emoji}-${row.uid}`} style={[s.reactionRow, { borderBottomColor: C.border }]}>
                    <Text style={s.reactionRowEmoji}>{row.emoji}</Text>
                    <Text style={[s.reactionRowText, { color: C.text }]}>
                      {row.uid === user?.uid ? t('waves_you') : row.name}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  headerShell: {
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, gap: 10,
  },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  headerAvatarLarge: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconBtn: { position: 'relative' },
  headerIconPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  statusPill: { gap: 8, alignSelf: 'flex-start' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  headerBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messagesShell: {
    flex: 1,
    marginHorizontal: 10,
    marginBottom: 10,
  },

  msgList: { paddingHorizontal: 12, paddingVertical: 8, gap: 2 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 2, gap: 6 },
  msgRowOwn: { flexDirection: 'row-reverse' },
  msgAvatarWrap: { marginBottom: 4 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },

  bubble: {
    maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9,
    paddingBottom: 5,
  },
  bubbleSelected: {
    borderWidth: 1.5,
  },
  bubbleOwn: { borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 },
  bubbleWithReaction: { marginBottom: 14 },
  optimistic: { opacity: 0.64 },
  seenText: { fontSize: 11, fontWeight: '700', marginHorizontal: 8, marginBottom: 2 },

  msgText: { fontSize: 15, lineHeight: 21 },
  recalledText: { fontSize: 14, fontStyle: 'italic' },
  msgTime: { fontSize: 10, marginTop: 3, textAlign: 'right' },
  imgMsg: { width: 200, height: 200, borderRadius: 12 },
  pinnedText: { fontSize: 10, fontWeight: '800', marginBottom: 3 },
  deletingText: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  replyQuote: {
    borderLeftWidth: 3,
    borderRadius: 12,
    marginBottom: 7,
    paddingHorizontal: 9,
    paddingVertical: 7,
    maxWidth: 220,
  },
  replySender: { fontSize: 12, fontWeight: '800' },
  replySnippet: { fontSize: 12, marginTop: 1 },
  fileMsg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  voicePlayerMsg: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, paddingRight: 12, borderRadius: 24, minWidth: 200 },
  playBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  waveform: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  waveBar: { width: 3, borderRadius: 2 },
  voiceTime: { fontSize: 12, fontWeight: '600' },
  fileMsgCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, minWidth: 220 },
  fileIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1 },
  fileNameText: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  fileSizeText: { fontSize: 12 },
  fileText: { flex: 1, fontSize: 14, fontWeight: '700' },
  callLog: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  callCard: {
    minWidth: 210,
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  callIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callTitle: { fontSize: 15, fontWeight: '800' },
  callSubtitle: { fontSize: 12, fontWeight: '600' },
  reactionPill: {
    position: 'absolute',
    bottom: -15,
    minHeight: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  reactionOwn: { right: 4 },
  reactionOther: { left: 4 },
  reactionEmoji: { fontSize: 13 },
  reactionCountText: { fontSize: 11, fontWeight: '700', marginLeft: 1 },

  dateHeader: { alignItems: 'center', marginVertical: 12 },
  dateHeaderText: { fontSize: 12, fontWeight: '500' },

  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 80 },
  emptyChatText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },

  composerShell: {
    marginHorizontal: 10,
    marginBottom: 10,
  },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, gap: 10,
    flexWrap: 'wrap',
  },
  contextCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    gap: 10,
  },
  contextCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  contextTitle: { fontSize: 13, fontWeight: '800' },
  contextSnippet: { fontSize: 13, lineHeight: 18 },
  actionRow: { gap: 8, paddingRight: 6 },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionChipText: { fontSize: 13, fontWeight: '700' },
  emojiRow: { gap: 8, paddingRight: 6 },
  emojiChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  emojiChipText: { fontSize: 16 },
  quickReplyRow: { gap: 8, paddingRight: 6 },
  quickReplyChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickReplyText: { fontSize: 13, fontWeight: '600' },
  composerReply: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  composerReplyText: { flex: 1, minWidth: 0 },
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
  mediaBtn: {
    width: 36, height: 42,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 18,
  },
  mediaBtnActive: { borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  voiceStatus: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  voiceStatusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  modalCard: {
    maxHeight: '72%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalBody: { paddingHorizontal: 18, paddingVertical: 8 },
  modalEmptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  modalListItem: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  modalListTitle: { fontSize: 14, fontWeight: '700' },
  modalListSnippet: { fontSize: 13, lineHeight: 18 },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reactionRowEmoji: { fontSize: 20 },
  reactionRowText: { fontSize: 14, fontWeight: '600' },
});



