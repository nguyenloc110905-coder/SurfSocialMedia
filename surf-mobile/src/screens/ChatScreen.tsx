import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  Animated,
  Alert,
  Clipboard,
  Modal,
  Pressable,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { uploadImage, uploadRawFile, uploadVideo } from '@/lib/cloudinary';
import { connectSocket, getSocket } from '@/lib/socket';
import { useLanguage, useT } from '@/lib/i18n';
import { messagesCache, type CachedMessage } from '@/lib/cache';
import { useFriendStore, type FriendPerson } from '@/stores/friendStore';

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
  isForwarded?: boolean;
  isRecalled?: boolean;
  recalledForEveryone?: boolean;
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

function messageToCachedMessage(message: ApiMessage): CachedMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    text: message.text ?? '',
    mediaUrl: message.mediaUrl || null,
    fileName: message.fileName,
    createdAt: message.createdAt,
    senderName: '',
    senderAvatarUrl: null,
    editedAt: message.editedAt,
    isForwarded: message.isForwarded,
    isRecalled: message.isRecalled,
    recalledForEveryone: message.recalledForEveryone,
    pinnedBy: message.pinnedBy,
    reactions: message.reactions,
    callMode: message.callMode,
    callOutcome: message.callOutcome,
    durationSeconds: message.durationSeconds,
  };
}

function cachedMessageToApiMessage(message: CachedMessage): ApiMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type ?? (message.mediaUrl ? 'image' : 'text'),
    text: message.text ?? '',
    mediaUrl: message.mediaUrl ?? undefined,
    fileName: message.fileName,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    isForwarded: message.isForwarded,
    isRecalled: message.isRecalled,
    recalledForEveryone: message.recalledForEveryone,
    pinnedBy: message.pinnedBy,
    reactions: message.reactions as MessageReactionsByEmoji | undefined,
    callMode: message.callMode,
    callOutcome: message.callOutcome,
    durationSeconds: message.durationSeconds,
  };
}

function getMessageCreatedAtMs(message: ApiMessage): number {
  const timestamp = new Date(message.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function uniqueMessages(messages: ApiMessage[]): ApiMessage[] {
  const byId = new Map<string, ApiMessage>();
  messages.forEach(message => {
    if (!message?.id) return;
    const existing = byId.get(message.id);
    byId.set(message.id, existing ? { ...existing, ...message } : message);
  });

  return Array.from(byId.values()).sort(
    (a, b) => getMessageCreatedAtMs(b) - getMessageCreatedAtMs(a)
  );
}

function prependUniqueMessage(messages: ApiMessage[], message: ApiMessage): ApiMessage[] {
  return uniqueMessages([message, ...messages]);
}

function replaceOptimisticMessage(
  messages: ApiMessage[],
  optimisticId: string,
  realMessage: ApiMessage
): ApiMessage[] {
  return uniqueMessages([
    realMessage,
    ...messages.filter(message => message.id !== optimisticId && message.id !== realMessage.id),
  ]);
}

function mergeIncomingMessage(messages: ApiMessage[], incoming: ApiMessage): ApiMessage[] {
  const incomingMs = getMessageCreatedAtMs(incoming);
  let removedOptimistic = false;
  return uniqueMessages([
    incoming,
    ...messages.filter(message => {
      if (message.id === incoming.id) return false;
      if (removedOptimistic) return true;
      if (!message.id.startsWith('opt_')) return true;
      if (message.conversationId !== incoming.conversationId) return true;
      if (message.senderId !== incoming.senderId) return true;
      if (message.type !== incoming.type) return true;

      const messageMs = getMessageCreatedAtMs(message);
      const closeEnough = Math.abs(incomingMs - messageMs) < 30000;
      if (!closeEnough) return true;

      if (incoming.type === 'text') {
        const isMatch = (message.text ?? '') === (incoming.text ?? '');
        if (isMatch) removedOptimistic = true;
        return !isMatch;
      }

      if (incoming.type === 'image' || incoming.type === 'file' || incoming.type === 'audio') {
        const isMatch = incoming.type === 'image'
          ? true
          : (message.fileName ?? '') === (incoming.fileName ?? '');
        if (isMatch) removedOptimistic = true;
        return !isMatch;
      }

      return true;
    }),
  ]);
}

type InlineAudioPlayer = {
  play: () => void;
  pause: () => void;
  remove?: () => void;
  seekTo?: (seconds: number) => Promise<void>;
  playing?: boolean;
  paused?: boolean;
  isLoaded?: boolean;
  isBuffering?: boolean;
  currentTime?: number;
  duration?: number;
};

type InlineAudioPlaybackState = {
  messageId: string;
  url: string;
  playing: boolean;
  loading: boolean;
  currentTime: number;
  duration: number;
};

type ChatMember = {
  uid: string;
  name: string;
  avatarUrl: string | null;
};

type ReadReceiptItem = {
  userId: string;
  lastReadMessageId: string;
  lastReadMessageCreatedAt: string;
  lastReadAt: string | null;
};

type ReceiptAvatarMember = ChatMember & {
  seenAt: string | null;
};

type RecallAudience = 'everyone' | 'self';

type SharedLink = {
  url: string;
  hostname: string;
  label: string;
};

type SharedMediaItem = SharedLink & {
  mediaType: 'image' | 'video';
};

type MediaPreviewState = {
  url: string;
  title?: string;
};

type ForwardConversationItem = {
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
  lastMessagePreview: string | null;
};

type CreatedConversationItem = {
  id: string;
  type?: 'dm' | 'group';
  title?: string;
  peer?: ChatMember | null;
  members?: ChatMember[];
  memberCount?: number;
  muted?: boolean;
};

type DraftImageAttachment = {
  id: string;
  asset: ImagePickerAsset;
};

type InfoSectionKey = 'members' | 'media' | 'files' | 'links' | 'security';

// ── Theme ─────────────────────────────────────────────────────────────────────

const DARK = {
  bg: '#0f172a', card: '#111827', border: '#334155',
  text: '#e2e8f0', subtext: '#64748b', accent: '#0ea5e9',
  ownBubble: '#0ea5e9', otherBubble: '#1e293b',
  ownText: '#fff', otherText: '#e2e8f0',
  input: '#1e293b', inputBorder: '#334155', soft: '#0b1220',
};
const LIGHT = {
  bg: '#f8fafc', card: '#ffffff', border: '#e5edf5',
  text: '#1f2937', subtext: '#8ba0b7', accent: '#0ea5e9',
  ownBubble: '#0ea5e9', otherBubble: '#f1f7fb',
  ownText: '#fff', otherText: '#27364a',
  input: '#ffffff', inputBorder: '#dbe7f1', soft: '#eef6fb',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function formatAudioTime(seconds?: number): string {
  if (!Number.isFinite(seconds) || !seconds || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
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

const POLL_INTERVAL = 5000;
const DRAFT_IMAGE_ATTACHMENT_LIMIT = 6;
const MESSAGE_REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const REPORT_REASON_OPTIONS = [
  'Tin nhắn không phù hợp',
  'Spam hoặc lừa đảo',
  'Quấy rối hoặc xúc phạm',
  'Nội dung nhạy cảm',
];
const MARKETPLACE_QUICK_REPLIES = [
  'Có nhé. Bạn có thích không?',
  'Tôi sẽ báo cho bạn biết.',
  'Tiếc quá, hết hàng rồi bạn ạ.',
];
const REPLY_PREFIX_PATTERN = /^↪\s*(.+?):\s*(.+)$/u;
const REPLY_TARGET_MARKER_PATTERN = /^__reply_to:([^\n]+)__$/;
const REPLY_TARGET_MARKER_INLINE_PATTERN = /__reply_to:[^\s]+__/g;
const REPLY_SENDER_MARKER_PATTERN = /^__reply_sender:([^\n]+)__$/;
const REPLY_SENDER_MARKER_INLINE_PATTERN = /__reply_sender:[^\s]+__/g;
const REPLY_TARGET_MARKER_LINE_PATTERN = /^__reply_to:[^\n]+__\n?/;
const REPLY_SENDER_MARKER_LINE_PATTERN = /^__reply_sender:[^\n]+__\n?/;
const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"')]+)/gi;
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.m4v'];
const FILE_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.rar',
  '.txt',
  '.csv',
];

function makeOptimisticId(prefix = 'opt') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type ParsedReplyQuote = {
  messageId: string | null;
  senderId: string | null;
  senderName: string;
  snippet: string;
  bodyText: string;
};

function stripReplyMetadata(value: string): string {
  return (value ?? '')
    .replace(REPLY_TARGET_MARKER_LINE_PATTERN, '')
    .replace(REPLY_SENDER_MARKER_LINE_PATTERN, '')
    .replace(REPLY_TARGET_MARKER_INLINE_PATTERN, ' ')
    .replace(REPLY_SENDER_MARKER_INLINE_PATTERN, ' ')
    .trim();
}

function parseReplyQuoteFromText(text: string): ParsedReplyQuote | null {
  const source = text ?? '';
  if (!source.startsWith('__reply_to:') && !source.startsWith('__reply_sender:') && !source.startsWith('↪')) {
    return null;
  }

  const lines = source.split('\n');
  let cursor = 0;
  let messageId: string | null = null;
  let senderId: string | null = null;

  const targetMatch = lines[cursor]?.match(REPLY_TARGET_MARKER_PATTERN);
  if (targetMatch) {
    messageId = targetMatch[1] ?? null;
    cursor += 1;
  }

  const senderMatch = lines[cursor]?.match(REPLY_SENDER_MARKER_PATTERN);
  if (senderMatch) {
    senderId = senderMatch[1] ?? null;
    cursor += 1;
  }

  const firstLine = lines[cursor] ?? '';
  const replyMatch = firstLine.match(REPLY_PREFIX_PATTERN);
  if (!replyMatch) return null;

  const bodyText = stripReplyMetadata(lines.slice(cursor + 1).join('\n'));
  return {
    messageId,
    senderId,
    senderName: replyMatch[1]?.trim() || 'Tin nhắn',
    snippet: replyMatch[2]?.trim() || 'Tin nhắn',
    bodyText,
  };
}

function normalizeMessageBody(message: ApiMessage): string {
  const parsed = parseReplyQuoteFromText(message.text);
  return parsed ? parsed.bodyText : stripReplyMetadata(message.text);
}

function messageWasRecalled(message: ApiMessage): boolean {
  return Boolean(
    message.isRecalled ||
    message.recalledForEveryone ||
    normalizeMessageBody(message) === 'Tin nhắn đã được thu hồi'
  );
}

function getMessageSyncKey(message: ApiMessage): string {
  return JSON.stringify({
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    text: message.text ?? '',
    mediaUrl: message.mediaUrl ?? null,
    fileName: message.fileName ?? null,
    createdAt: message.createdAt,
    editedAt: message.editedAt ?? null,
    isForwarded: message.isForwarded ?? false,
    isRecalled: message.isRecalled ?? false,
    recalledForEveryone: message.recalledForEveryone ?? false,
    pinnedBy: message.pinnedBy ?? [],
    reactions: message.reactions ?? {},
    callMode: message.callMode ?? null,
    callOutcome: message.callOutcome ?? null,
    durationSeconds: message.durationSeconds ?? null,
  });
}

function formatMarketplacePrice(price?: number): string {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return 'Liên hệ';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price);
}

function fileExtensionFromUri(uri: string, fallback: string) {
  const clean = uri.split('?')[0] ?? '';
  return clean.includes('.') ? clean.split('.').pop()?.toLowerCase() || fallback : fallback;
}

function audioMimeFromUri(uri: string) {
  const ext = fileExtensionFromUri(uri, 'm4a');
  if (ext === '3gp') return 'audio/3gpp';
  if (ext === 'webm') return 'audio/webm';
  if (ext === 'mp3') return 'audio/mpeg';
  return 'audio/mp4';
}

function isPickedVideoAsset(asset: ImagePickerAsset) {
  return asset.type === 'video' || asset.mimeType?.startsWith('video/') || isVideoUrl(asset.uri);
}

function pickedMediaFileName(asset: ImagePickerAsset, fallbackPrefix: string) {
  if (asset.fileName) return asset.fileName;
  const fallbackExt = isPickedVideoAsset(asset) ? 'mp4' : 'jpg';
  const ext = fileExtensionFromUri(asset.uri, fallbackExt);
  return `${fallbackPrefix}-${Date.now()}.${ext}`;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeChatMembers(rawMembers: unknown[]): ChatMember[] {
  return rawMembers
    .map((raw): ChatMember | null => {
      if (!raw || typeof raw !== 'object') return null;
      const record = raw as Record<string, unknown>;
      const uid = typeof record.uid === 'string' ? record.uid.trim() : '';
      if (!uid) return null;
      const name = typeof record.name === 'string' && record.name.trim()
        ? record.name.trim()
        : 'Người dùng';
      const avatarUrl = typeof record.avatarUrl === 'string' && record.avatarUrl.trim()
        ? record.avatarUrl.trim()
        : null;
      return { uid, name, avatarUrl };
    })
    .filter((member): member is ChatMember => member != null);
}

function cleanSharedUrl(value: string) {
  return value.replace(/[.,!?;:)]+$/g, '');
}

function normalizeLinkUrl(value: string) {
  return value.toLowerCase().startsWith('www.') ? `https://${value}` : value;
}

function extractUrls(value: string) {
  return uniqueStrings((value.match(URL_PATTERN) ?? []).map(cleanSharedUrl));
}

function splitTextWithLinks(value: string) {
  const parts: Array<
    | { kind: 'text'; text: string }
    | { kind: 'link'; text: string; url: string; suffix: string }
  > = [];
  const matcher = new RegExp(URL_PATTERN);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(value)) !== null) {
    const rawToken = match[0];
    const tokenStart = match.index;
    const url = cleanSharedUrl(rawToken);
    if (!url) continue;

    if (tokenStart > lastIndex) {
      parts.push({ kind: 'text', text: value.slice(lastIndex, tokenStart) });
    }

    parts.push({
      kind: 'link',
      text: url,
      url: normalizeLinkUrl(url),
      suffix: rawToken.slice(url.length),
    });
    lastIndex = tokenStart + rawToken.length;
  }

  if (lastIndex < value.length) {
    parts.push({ kind: 'text', text: value.slice(lastIndex) });
  }

  return parts;
}

function getUrlPathname(value: string) {
  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return value.split('?')[0]?.toLowerCase() ?? value.toLowerCase();
  }
}

function getUrlHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value.replace(/^https?:\/\//, '').split('/')[0] || 'link';
  }
}

function buildSharedLink(url: string, label?: string): SharedLink {
  const hostname = getUrlHostname(url);
  return {
    url,
    hostname,
    label: label || hostname,
  };
}

function hasAnyExtension(value: string, extensions: string[]) {
  const pathname = getUrlPathname(value);
  return extensions.some(ext => pathname.endsWith(ext));
}

function isImageUrl(value: string) {
  return hasAnyExtension(value, IMAGE_EXTENSIONS) || value.includes('/image/upload/');
}

function isVideoUrl(value: string) {
  return hasAnyExtension(value, VIDEO_EXTENSIONS) || value.includes('/video/upload/');
}

function isFileUrl(value: string) {
  return hasAnyExtension(value, FILE_EXTENSIONS);
}

function getMediaTypeFromUrl(value: string): SharedMediaItem['mediaType'] | null {
  if (isImageUrl(value)) return 'image';
  if (isVideoUrl(value)) return 'video';
  return null;
}

// ── Typing dots ───────────────────────────────────────────────────────────────

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

function ActionRow({
  icon,
  label,
  color,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.actionRow, disabled && { opacity: 0.45 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[s.actionRowText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatScreen({ navigation, route }: Props) {
  const {
    conversationId,
    title,
    peerUid,
    peerName,
    peerAvatar,
    marketplace,
    muted: routeMuted,
    members: routeMembers,
    memberCount: routeMemberCount,
  } = route.params;
  console.log('=== CHAT SCREEN RENDER ===', conversationId);
  const scheme = useColorScheme();
  const t = useT();
  const language = useLanguage();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';
  const C = scheme === 'dark' ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const friends = useFriendStore(state => state.friends);
  const friendsLoading = useFriendStore(state => state.loading);
  const fetchFriends = useFriendStore(state => state.fetchFriends);

  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [readReceiptsByUser, setReadReceiptsByUser] = useState<Record<string, ReadReceiptItem>>({});
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftImageAttachments, setDraftImageAttachments] = useState<DraftImageAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioPlayback, setAudioPlayback] = useState<InlineAudioPlaybackState | null>(null);
  const [callingMode, setCallingMode] = useState<'audio' | 'video' | null>(null);
  const [typingUserExpirations, setTypingUserExpirations] = useState<Record<string, number>>({});
  const [selectedMessage, setSelectedMessage] = useState<ApiMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ApiMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ApiMessage | null>(null);
  const [recallTargetMessage, setRecallTargetMessage] = useState<ApiMessage | null>(null);
  const [recallAudience, setRecallAudience] = useState<RecallAudience>('everyone');
  const [reportTargetMessage, setReportTargetMessage] = useState<ApiMessage | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASON_OPTIONS[0]);
  const [messageActionLoadingId, setMessageActionLoadingId] = useState<string | null>(null);
  const [pinnedListOpen, setPinnedListOpen] = useState(false);
  const [reactionDetailsMessage, setReactionDetailsMessage] = useState<ApiMessage | null>(null);
  const [reactionDetailsFilter, setReactionDetailsFilter] = useState<string | null>(null);
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState<ApiMessage[]>([]);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState<string | null>(null);
  const [conversationInfoOpen, setConversationInfoOpen] = useState(false);
  const [infoSectionsOpen, setInfoSectionsOpen] = useState<Record<InfoSectionKey, boolean>>({
    members: true,
    media: true,
    files: false,
    links: false,
    security: false,
  });
  const [mediaPreview, setMediaPreview] = useState<MediaPreviewState | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ApiMessage | null>(null);
  const [forwardConversations, setForwardConversations] = useState<ForwardConversationItem[]>([]);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [forwardSendingId, setForwardSendingId] = useState<string | null>(null);
  const [loadedMembers, setLoadedMembers] = useState<ChatMember[]>([]);
  const [conversationMuted, setConversationMuted] = useState(Boolean(routeMuted));
  const [inviteMembersOpen, setInviteMembersOpen] = useState(false);
  const [memberPickerMode, setMemberPickerMode] = useState<'invite' | 'create'>('invite');
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [inviteSearch, setInviteSearch] = useState('');
  const [selectedInviteMemberIds, setSelectedInviteMemberIds] = useState<string[]>([]);
  const [inviteSending, setInviteSending] = useState(false);
  const isGroupConversation = !peerUid && !marketplace;

  const flatRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const callStartingRef = useRef(false);
  const audioRecorderRef = useRef<any>(null);
  const audioPlayerRef = useRef<InlineAudioPlayer | null>(null);
  const audioStatusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingUserTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const conversationMembers = useMemo<ChatMember[]>(() => {
    if (loadedMembers.length) return loadedMembers;
    if (routeMembers?.length) return routeMembers;
    return peerUid
      ? [{ uid: peerUid, name: peerName || title, avatarUrl: peerAvatar ?? null }]
      : [];
  }, [loadedMembers, peerAvatar, peerName, peerUid, routeMembers, title]);

  const conversationMemberById = useMemo(
    () => new Map(conversationMembers.map(member => [member.uid, member])),
    [conversationMembers]
  );

  const activeTypingUserIds = useMemo(
    () =>
      Object.entries(typingUserExpirations)
        .filter(([, expiresAt]) => expiresAt > Date.now())
        .map(([uid]) => uid),
    [typingUserExpirations]
  );

  const getTypingUserName = useCallback((uid: string) => {
    if (isGroupConversation) {
      return conversationMemberById.get(uid)?.name ?? 'Thành viên';
    }
    if (uid === peerUid) return peerName || title;
    return peerName || 'Ai đó';
  }, [conversationMemberById, isGroupConversation, peerName, peerUid, title]);

  const typingText = useMemo(() => {
    const names = activeTypingUserIds.map(getTypingUserName).filter(Boolean);
    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]} đang nhập tin nhắn`;
    if (names.length === 2) return `${names[0]} và ${names[1]} đang nhập tin nhắn`;
    return `${names[0]} và ${names.length - 1} người khác đang nhập tin nhắn`;
  }, [activeTypingUserIds, getTypingUserName]);

  const firstTypingMember = useMemo<ChatMember | null>(() => {
    const uid = activeTypingUserIds[0];
    if (!uid) return null;
    return conversationMemberById.get(uid) ?? {
      uid,
      name: getTypingUserName(uid),
      avatarUrl: uid === peerUid ? peerAvatar ?? null : null,
    };
  }, [activeTypingUserIds, conversationMemberById, getTypingUserName, peerAvatar, peerUid]);

  const headerSubtitle = marketplace
    ? `${peerUid ? 'Surf Market' : ''}${marketplace.location ? ` · ${marketplace.location}` : ''}`.trim() || 'Surf Market'
    : typingText || null;

  const fetchConversationMembers = useCallback(async (): Promise<ChatMember[]> => {
    const data = await api.get<{ members?: unknown[] }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/members`
    );

    return normalizeChatMembers(Array.isArray(data.members) ? data.members : []);
  }, [conversationId]);

  useEffect(() => {
    if (routeMembers?.length) {
      setLoadedMembers([]);
      return;
    }

    let cancelled = false;
    setLoadedMembers([]);

    void fetchConversationMembers()
      .then(members => {
        if (!cancelled) setLoadedMembers(members);
      })
      .catch(() => {
        if (!cancelled) setLoadedMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchConversationMembers, routeMembers?.length]);

  useEffect(() => {
    setConversationMuted(Boolean(routeMuted));
    setDraft('');
    setDraftImageAttachments([]);
    setReplyTarget(null);
    setEditingMessage(null);
  }, [conversationId, routeMuted]);

  const existingMemberIds = useMemo(() => {
    const ids = new Set(conversationMembers.map(member => member.uid));
    if (user?.uid) ids.add(user.uid);
    return ids;
  }, [conversationMembers, user?.uid]);

  const createGroupExcludedMemberIds = useMemo(() => {
    const ids = new Set<string>();
    if (user?.uid) ids.add(user.uid);
    if (peerUid) ids.add(peerUid);
    return ids;
  }, [peerUid, user?.uid]);

  const memberPickerExcludedIds = memberPickerMode === 'create'
    ? createGroupExcludedMemberIds
    : existingMemberIds;

  const availableInviteFriends = useMemo(() => {
    const query = inviteSearch.trim().toLowerCase();
    return friends
      .filter(friend => !memberPickerExcludedIds.has(friend.id))
      .filter(friend => !query || friend.name.toLowerCase().includes(query));
  }, [friends, inviteSearch, memberPickerExcludedIds]);

  useEffect(() => {
    if (!inviteMembersOpen) return;
    void fetchFriends();
  }, [fetchFriends, inviteMembersOpen]);

  const openInviteMembersSheet = useCallback(() => {
    if (!isGroupConversation) return;
    setMemberPickerMode('invite');
    setConversationInfoOpen(false);
    setNewGroupTitle('');
    setInviteSearch('');
    setSelectedInviteMemberIds([]);
    setInviteMembersOpen(true);
  }, [isGroupConversation]);

  const openCreateGroupSheet = useCallback(() => {
    if (!peerUid || marketplace) return;
    setMemberPickerMode('create');
    setConversationInfoOpen(false);
    setNewGroupTitle('');
    setInviteSearch('');
    setSelectedInviteMemberIds([]);
    setInviteMembersOpen(true);
  }, [marketplace, peerUid]);

  const closeInviteMembersSheet = useCallback(() => {
    if (inviteSending) return;
    setInviteMembersOpen(false);
    setMemberPickerMode('invite');
    setNewGroupTitle('');
    setInviteSearch('');
    setSelectedInviteMemberIds([]);
  }, [inviteSending]);

  const toggleInviteMember = useCallback((friend: FriendPerson) => {
    setSelectedInviteMemberIds(current =>
      current.includes(friend.id)
        ? current.filter(id => id !== friend.id)
        : [...current, friend.id]
    );
  }, []);

  const submitInviteMembers = useCallback(async () => {
    if (selectedInviteMemberIds.length === 0 || inviteSending) return;

    setInviteSending(true);
    try {
      if (memberPickerMode === 'create') {
        const groupName = newGroupTitle.trim();
        if (!groupName || !peerUid) return;

        const participantIds = uniqueStrings([peerUid, ...selectedInviteMemberIds]);
        const created = await api.post<{ item?: CreatedConversationItem }>('/api/conversations/group', {
          groupName,
          participants: participantIds,
        });
        const createdItem = created.item;
        if (!createdItem?.id) throw new Error('missing_created_conversation');

        const fallbackMembers: ChatMember[] = [
          ...(user?.uid
            ? [{
                uid: user.uid,
                name: user.displayName || user.email?.split('@')[0] || 'Bạn',
                avatarUrl: user.photoURL ?? null,
              }]
            : []),
          { uid: peerUid, name: peerName || title, avatarUrl: peerAvatar ?? null },
          ...friends
            .filter(friend => selectedInviteMemberIds.includes(friend.id))
            .map(friend => ({
              uid: friend.id,
              name: friend.name,
              avatarUrl: friend.avatarUrl ?? null,
            })),
        ];

        let members = createdItem.members?.length ? createdItem.members : fallbackMembers;
        try {
          const data = await api.get<{ members?: unknown[] }>(
            `/api/conversations/${encodeURIComponent(createdItem.id)}/members`
          );
          const fetchedMembers = normalizeChatMembers(Array.isArray(data.members) ? data.members : []);
          if (fetchedMembers.length > 0) members = fetchedMembers;
        } catch {
          // Fallback members are enough for the new chat header until the next refresh.
        }

        setInviteMembersOpen(false);
        setMemberPickerMode('invite');
        setNewGroupTitle('');
        setInviteSearch('');
        setSelectedInviteMemberIds([]);
        navigation.replace('Chat', {
          conversationId: createdItem.id,
          title: createdItem.title || groupName,
          peerUid: null,
          peerName: null,
          peerAvatar: null,
          muted: Boolean(createdItem.muted),
          members,
          memberCount: createdItem.memberCount ?? members.length,
          marketplace: null,
        });
        return;
      }

      await api.post(`/api/conversations/${encodeURIComponent(conversationId)}/members`, {
        memberIds: selectedInviteMemberIds,
      });
      const members = await fetchConversationMembers();
      setLoadedMembers(members);
      setInviteMembersOpen(false);
      setInviteSearch('');
      setSelectedInviteMemberIds([]);
      Alert.alert('Đã mời thành viên', 'Bạn bè đã được thêm vào nhóm.');
    } catch {
      Alert.alert(
        memberPickerMode === 'create' ? 'Không thể tạo nhóm' : 'Không thể mời thành viên',
        'Vui lòng thử lại sau.'
      );
    } finally {
      setInviteSending(false);
    }
  }, [
    conversationId,
    fetchConversationMembers,
    friends,
    inviteSending,
    memberPickerMode,
    navigation,
    newGroupTitle,
    peerAvatar,
    peerName,
    peerUid,
    selectedInviteMemberIds,
    title,
    user?.displayName,
    user?.email,
    user?.photoURL,
    user?.uid,
  ]);

  const toggleConversationMute = useCallback(async () => {
    const nextMuted = !conversationMuted;
    setConversationMuted(nextMuted);
    try {
      await api.patch(`/api/conversations/${encodeURIComponent(conversationId)}/mute`, {
        muted: nextMuted,
      });
    } catch {
      setConversationMuted(!nextMuted);
      Alert.alert('Không thể cập nhật thông báo', 'Vui lòng thử lại sau.');
    }
  }, [conversationId, conversationMuted]);

  const deleteConversationHistory = useCallback(() => {
    Alert.alert(
      'Xóa lịch sử trò chuyện?',
      'Cuộc trò chuyện sẽ bị ẩn khỏi hộp thư của bạn. Người khác vẫn có thể còn thấy lịch sử của họ.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/conversations/${encodeURIComponent(conversationId)}`);
              await messagesCache.clearConversation(conversationId);
              setConversationInfoOpen(false);
              navigation.goBack();
            } catch {
              Alert.alert('Không thể xóa lịch sử', 'Vui lòng thử lại sau.');
            }
          },
        },
      ]
    );
  }, [conversationId, navigation]);

  const replaceMessage = useCallback((conversationIdValue: string, nextMessage: ApiMessage) => {
    setMessages(prev =>
      uniqueMessages(prev.map(message =>
          message.conversationId === conversationIdValue && message.id === nextMessage.id
            ? { ...message, ...nextMessage }
            : message
        ))
    );
    void messagesCache.addMessage(conversationIdValue, messageToCachedMessage(nextMessage));
  }, []);

  const removeMessage = useCallback((messageId: string, conversationIdValue = conversationId) => {
    setMessages(prev => prev.filter(message => message.id !== messageId));
    void messagesCache.removeMessage(conversationIdValue, messageId);
  }, [conversationId]);

  const mergeReadReceipts = useCallback((items: ReadReceiptItem[]) => {
    if (items.length === 0) return;

    setReadReceiptsByUser(prev => {
      const next = { ...prev };
      items.forEach(item => {
        const previous = next[item.userId];
        if (
          previous &&
          new Date(previous.lastReadMessageCreatedAt).getTime() >
            new Date(item.lastReadMessageCreatedAt).getTime()
        ) {
          return;
        }
        next[item.userId] = item;
      });
      return next;
    });
  }, []);

  const getSenderNameForMessage = useCallback((message: ApiMessage) => {
    if (message.senderId === user?.uid) return 'Bạn';
    return conversationMemberById.get(message.senderId)?.name || peerName || title || 'Người dùng';
  }, [conversationMemberById, peerName, title, user?.uid]);

  const getSenderAvatarForMessage = useCallback((message: ApiMessage) => {
    if (message.senderId === user?.uid) return user?.photoURL ?? null;
    return conversationMemberById.get(message.senderId)?.avatarUrl ?? peerAvatar ?? null;
  }, [conversationMemberById, peerAvatar, user?.photoURL, user?.uid]);

  const getReplySnippet = useCallback((message: ApiMessage) => {
    if (messageWasRecalled(message)) return 'Tin nhắn đã được thu hồi';
    if (message.type === 'image') return 'Hình ảnh';
    if (message.type === 'file') return message.fileName || 'Tệp đính kèm';
    if (message.type === 'audio') return 'Tin nhắn thoại';
    if (message.type === 'call_log') return message.text || 'Cuộc gọi';
    return normalizeMessageBody(message).replace(/\s+/g, ' ').trim() || 'Tin nhắn';
  }, []);

  const buildReplyPrefixText = useCallback((message: ApiMessage) => {
    return [
      `__reply_to:${message.id}__`,
      `__reply_sender:${message.senderId}__`,
      `↪ ${getSenderNameForMessage(message)}: ${getReplySnippet(message)}`,
    ].join('\n');
  }, [getReplySnippet, getSenderNameForMessage]);

  const getLatestMessageSnapshot = useCallback((message?: ApiMessage | null) => {
    if (!message) return null;
    return messages.find(item => item.id === message.id) ?? message;
  }, [messages]);

  const getActiveReplyTarget = useCallback(() => {
    const latest = getLatestMessageSnapshot(replyTarget);
    if (!latest || latest.type === 'call_log' || messageWasRecalled(latest)) return null;
    return latest;
  }, [getLatestMessageSnapshot, replyTarget]);

  const getActiveEditingMessage = useCallback(() => {
    const latest = getLatestMessageSnapshot(editingMessage);
    if (!latest || latest.senderId !== user?.uid || latest.type !== 'text' || messageWasRecalled(latest)) {
      return null;
    }
    return latest;
  }, [editingMessage, getLatestMessageSnapshot, user?.uid]);

  const getForwardConversationTitle = useCallback((item: ForwardConversationItem) => {
    return item.marketplace?.title
      || (item.type === 'group' ? item.title : item.peer?.name)
      || 'Cuộc trò chuyện';
  }, []);

  const getForwardConversationAvatar = useCallback((item: ForwardConversationItem) => {
    return item.marketplace?.imageUrl ?? (item.type === 'dm' ? item.peer?.avatarUrl ?? null : null);
  }, []);

  const applyMarketplaceQuickReply = useCallback((reply: string) => {
    setEditingMessage(null);
    setReplyTarget(null);
    setDraft(reply);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // ── Load messages ──────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (silent = false) => {
    try {
      // Load from cache first
      console.log('📦 Loading messages from cache for conversation:', conversationId);
      const cached = await messagesCache.getMessages(conversationId);
      console.log('📦 Cached messages:', cached?.length || 0);

      let hasCache = false;
      if (cached && cached.length > 0) {
        const cachedMessages = uniqueMessages(cached.map(cachedMessageToApiMessage));
        setMessages(cachedMessages);
        hasCache = true;
        setLoading(false); // Stop loading immediately when cache loaded
      } else {
        if (!silent) setLoading(true); // Only show loading if no cache
      }

      // Fetch from API (only if online)
      try {
        const data = await api.get<{ items: ApiMessage[]; nextCursor: string | null }>(
          `/api/conversations/${conversationId}/messages?limit=30`
        );
        const items = uniqueMessages(
          (data.items ?? []).filter((m): m is ApiMessage => m != null && typeof m.id === 'string')
        );
        setMessages(items);
        setNextCursor(data.nextCursor ?? null);

        // Update cache with fresh data
        const cachedMessages: CachedMessage[] = items.map(messageToCachedMessage);
        await messagesCache.setMessages(conversationId, cachedMessages);
        console.log('💾 Cached', items.length, 'messages');

        if (items.length > 0) {
          const newest = items[0];
          if (newest.id !== lastMessageIdRef.current) {
            lastMessageIdRef.current = newest.id;
            markRead(newest.id, newest.createdAt);
          }
        }
      } catch (apiError) {
        console.log('❌ API error (offline?):', apiError);
        // If offline and we have cache, keep showing cached data
        if (hasCache) {
          console.log('✅ Using cached data, offline mode');
          return;
        }
        throw apiError;
      }
    } catch (e) {
      console.log('❌ Load messages error:', e);
    } finally {
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
      const older = (data.items ?? [])
        .filter((message): message is ApiMessage => Boolean(message?.id))
        .reverse();
      setMessages(prev => {
        const existingIds = new Set(prev.map(message => message.id));
        const combined = uniqueMessages([...prev, ...older.filter(message => !existingIds.has(message.id))]);
        void messagesCache.setMessages(conversationId, combined.map(messageToCachedMessage));
        return combined;
      });
      setNextCursor(data.nextCursor ?? null);
    } catch { /* ignore */ } finally {
      setLoadingMore(false);
    }
  }, [conversationId, nextCursor, loadingMore]);

  useEffect(() => {
    if (!messageSearchOpen) return;

    const query = messageSearchQuery.trim();
    if (!query) {
      setMessageSearchResults([]);
      setMessageSearchLoading(false);
      setMessageSearchError(null);
      return;
    }

    let active = true;
    setMessageSearchLoading(true);
    setMessageSearchError(null);
    const timer = setTimeout(() => {
      api.get<{ items: ApiMessage[] }>(
        `/api/conversations/${conversationId}/messages?q=${encodeURIComponent(query)}&limit=20`
      )
        .then((data) => {
          if (!active) return;
          setMessageSearchResults(
            (data.items ?? []).filter((message): message is ApiMessage =>
              Boolean(message?.id)
            )
          );
        })
        .catch(() => {
          if (!active) return;
          setMessageSearchError('Không thể tìm tin nhắn. Vui lòng thử lại sau.');
          setMessageSearchResults([]);
        })
        .finally(() => {
          if (active) setMessageSearchLoading(false);
        });
    }, 260);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [conversationId, messageSearchOpen, messageSearchQuery]);

  const closeMessageSearch = useCallback(() => {
    setMessageSearchOpen(false);
    setMessageSearchQuery('');
    setMessageSearchResults([]);
    setMessageSearchLoading(false);
    setMessageSearchError(null);
  }, []);

  const toggleInfoSection = useCallback((section: InfoSectionKey) => {
    setInfoSectionsOpen(current => ({
      ...current,
      [section]: !current[section],
    }));
  }, []);

  const scrollToMessageIndex = useCallback((index: number, messageId: string) => {
    setHighlightedMessageId(messageId);
    setTimeout(() => {
      flatRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    }, 80);
    setTimeout(() => {
      setHighlightedMessageId(current => (current === messageId ? null : current));
    }, 1700);
  }, []);

  const openMessageFromSearch = useCallback((message: ApiMessage) => {
    setMessageSearchOpen(false);
    setMessageSearchQuery('');
    setMessageSearchResults([]);
    setMessageSearchError(null);

    const existingIndex = messages.findIndex(item => item.id === message.id);
    if (existingIndex >= 0) {
      scrollToMessageIndex(existingIndex, message.id);
      return;
    }

    const nextMessages = uniqueMessages([...messages, message]);
    setMessages(nextMessages);
    void messagesCache.setMessages(conversationId, nextMessages.map(messageToCachedMessage));

    const nextIndex = nextMessages.findIndex(item => item.id === message.id);
    if (nextIndex >= 0) {
      scrollToMessageIndex(nextIndex, message.id);
    }
  }, [conversationId, messages, scrollToMessageIndex]);

  const jumpToReplyTarget = useCallback(async (quote: ParsedReplyQuote) => {
    const targetId = quote.messageId;
    if (!targetId) {
      Alert.alert('Không thể mở tin gốc', 'Tin nhắn cũ này không có mã tham chiếu.');
      return;
    }

    let loadedMessages = messages;
    let targetIndex = loadedMessages.findIndex(message => message.id === targetId);
    let cursor = nextCursor;
    let pageCount = 0;

    try {
      while (targetIndex < 0 && cursor && pageCount < 5) {
        const data = await api.get<{ items: ApiMessage[]; nextCursor: string | null }>(
          `/api/conversations/${conversationId}/messages?limit=30&cursor=${encodeURIComponent(cursor)}`
        );
        const older = (data.items ?? [])
          .filter((message): message is ApiMessage => Boolean(message?.id))
          .reverse();
        const existingIds = new Set(loadedMessages.map(message => message.id));
        loadedMessages = uniqueMessages([
          ...loadedMessages,
          ...older.filter(message => !existingIds.has(message.id)),
        ]);
        cursor = data.nextCursor ?? null;
        targetIndex = loadedMessages.findIndex(message => message.id === targetId);
        pageCount += 1;
      }

      if (loadedMessages.length !== messages.length) {
        setMessages(loadedMessages);
        void messagesCache.setMessages(conversationId, loadedMessages.map(messageToCachedMessage));
        setNextCursor(cursor);
      }

      if (targetIndex >= 0) {
        scrollToMessageIndex(targetIndex, targetId);
        return;
      }

      Alert.alert('Không tìm thấy tin gốc', 'Tin nhắn gốc chưa có trong đoạn hội thoại đã tải.');
    } catch {
      Alert.alert('Không thể mở tin gốc', 'Vui lòng thử lại sau.');
    }
  }, [conversationId, messages, nextCursor, scrollToMessageIndex]);

  // ── Mark as read ───────────────────────────────────────────────────────────

  const markRead = async (lastId: string, lastCreatedAt: string) => {
    try {
      await api.patch(`/api/conversations/${conversationId}/read`, {
        lastReadMessageId: lastId,
        lastReadMessageCreatedAt: lastCreatedAt,
      });
    } catch { /* ignore */ }
  };

  const newestMessageForReceipts = messages[0] ?? null;

  useEffect(() => {
    if (!newestMessageForReceipts) return;

    let cancelled = false;
    const loadReadReceipts = async () => {
      try {
        const data = await api.get<{ items: ReadReceiptItem[] }>(
          `/api/conversations/${conversationId}/read-receipts?fromCreatedAt=${encodeURIComponent('1970-01-01T00:00:00.000Z')}&toCreatedAt=${encodeURIComponent(newestMessageForReceipts.createdAt)}&limit=300`
        );
        if (!cancelled) mergeReadReceipts(data.items ?? []);
      } catch {
        // Read receipts are nice-to-have; do not interrupt chat loading.
      }
    };

    void loadReadReceipts();
    return () => {
      cancelled = true;
    };
  }, [conversationId, mergeReadReceipts, newestMessageForReceipts?.createdAt, newestMessageForReceipts?.id]);

  // ── Polling ────────────────────────────────────────────────────────────────

  const poll = useCallback(async () => {
    try {
      const data = await api.get<{ items: ApiMessage[]; nextCursor: string | null }>(
        `/api/conversations/${conversationId}/messages?limit=20`
      );
        const items = uniqueMessages(
          (data.items ?? []).filter((m): m is ApiMessage => m != null && typeof m.id === 'string')
        );
      if (items.length === 0) {
        setMessages(prev => {
          if (prev.length === 0) return prev;
          void messagesCache.setMessages(conversationId, []);
          return [];
        });
        setNextCursor(null);
        return;
      }
      const newest = items[0];
      const shouldMarkRead = newest.id !== lastMessageIdRef.current;
      if (shouldMarkRead) lastMessageIdRef.current = newest.id;
      const fetchedIds = new Set(items.map(message => message.id));
      const oldestFetchedMs = items.reduce((min, message) => {
        const timestamp = new Date(message.createdAt).getTime();
        return Number.isFinite(timestamp) ? Math.min(min, timestamp) : min;
      }, Number.POSITIVE_INFINITY);

      setMessages(prev => {
        const byId = new Map(prev.filter(m => m != null).map(m => [m.id, m]));
        let changed = false;

        items.forEach(message => {
          const existing = byId.get(message.id);
          if (!existing || getMessageSyncKey(existing) !== getMessageSyncKey(message)) {
            byId.set(message.id, existing ? { ...existing, ...message } : message);
            changed = true;
          }
        });

        if (Number.isFinite(oldestFetchedMs)) {
          byId.forEach((message, messageId) => {
            if (fetchedIds.has(messageId) || messageId.startsWith('opt_')) return;
            const timestamp = new Date(message.createdAt).getTime();
            if (Number.isFinite(timestamp) && timestamp >= oldestFetchedMs) {
              byId.delete(messageId);
              changed = true;
            }
          });
        }

        if (!changed) return prev;

        const next = uniqueMessages(Array.from(byId.values()));
        void messagesCache.setMessages(conversationId, next.map(messageToCachedMessage));
        return next;
      });
      if (shouldMarkRead) {
        markRead(newest.id, newest.createdAt);
      }
    } catch { /* ignore */ }
  }, [conversationId]);

  useEffect(() => {
    loadMessages();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadMessages, poll]);

  // ── Socket: typing indicators ───────────────────────────────────────────────

  useEffect(() => {
    if (!user?.uid) return;
    connectSocket(user.uid);
    const socket = getSocket();
    socket.emit('conversation:join', conversationId);

    const clearTypingUser = (uid: string) => {
      const timer = typingUserTimersRef.current[uid];
      if (timer) clearTimeout(timer);
      delete typingUserTimersRef.current[uid];
      setTypingUserExpirations(current => {
        if (!current[uid]) return current;
        const next = { ...current };
        delete next[uid];
        return next;
      });
    };

    const onTypingStart = ({ conversationId: targetConversationId, userId: uid }: { conversationId: string; userId: string }) => {
      if (targetConversationId !== conversationId || uid === user.uid) return;
      const expiresAt = Date.now() + 4000;
      setTypingUserExpirations(current => ({ ...current, [uid]: expiresAt }));
      const previous = typingUserTimersRef.current[uid];
      if (previous) clearTimeout(previous);
      typingUserTimersRef.current[uid] = setTimeout(() => clearTypingUser(uid), 4000);
    };

    const onTypingStop = ({ conversationId: targetConversationId, userId: uid }: { conversationId: string; userId: string }) => {
      if (targetConversationId !== conversationId || uid === user.uid) return;
      clearTypingUser(uid);
    };

    const onTypingStatus = (payload: { conversationId: string; userId: string; isTyping?: boolean }) => {
      if (payload?.isTyping) {
        onTypingStart(payload);
        return;
      }
      onTypingStop(payload);
    };

    const onMessageNew = (payload: {
      conversationId?: string;
      message?: ApiMessage;
    }) => {
      const message = payload?.message;
      const targetConversationId = payload?.conversationId ?? message?.conversationId;
      if (targetConversationId !== conversationId || !message?.id) return;
      if (message.senderId !== user.uid) clearTypingUser(message.senderId);
      setMessages(prev => mergeIncomingMessage(prev, message));
      void messagesCache.addMessage(conversationId, messageToCachedMessage(message));
      lastMessageIdRef.current = message.id;
      markRead(message.id, message.createdAt);
    };

    const onMessageUpdated = (payload: {
      conversationId?: string;
      message?: ApiMessage;
    }) => {
      const message = payload?.message;
      const targetConversationId = payload?.conversationId ?? message?.conversationId;
      if (targetConversationId !== conversationId || !message?.id) return;
      replaceMessage(targetConversationId, message);
    };

    const onMessageSelfHidden = (payload: {
      conversationId?: string;
      messageId?: string;
    }) => {
      if (payload?.conversationId !== conversationId || !payload.messageId) return;
      removeMessage(payload.messageId, conversationId);
    };

    const onMessageRead = (payload: {
      conversationId?: string;
      item?: ReadReceiptItem | null;
    }) => {
      if (payload?.conversationId !== conversationId || !payload.item) return;
      mergeReadReceipts([payload.item]);
    };

    socket.on('message:new', onMessageNew);
    socket.on('message:updated', onMessageUpdated);
    socket.on('message:recalled', onMessageUpdated);
    socket.on('message:reaction-updated', onMessageUpdated);
    socket.on('message:self-hidden', onMessageSelfHidden);
    socket.on('message:read', onMessageRead);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('typing', onTypingStatus);

    return () => {
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      Object.values(typingUserTimersRef.current).forEach(timer => clearTimeout(timer));
      typingUserTimersRef.current = {};
      setTypingUserExpirations({});
      socket.off('message:new', onMessageNew);
      socket.off('message:updated', onMessageUpdated);
      socket.off('message:recalled', onMessageUpdated);
      socket.off('message:reaction-updated', onMessageUpdated);
      socket.off('message:self-hidden', onMessageSelfHidden);
      socket.off('message:read', onMessageRead);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('typing', onTypingStatus);
      socket.emit('conversation:leave', conversationId);
    };
  }, [conversationId, mergeReadReceipts, removeMessage, replaceMessage, user?.uid]);

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

  const appendDraftToken = useCallback((token: string) => {
    if (editingMessage) return;
    const needsSpace = draft.trim().length > 0 && !draft.endsWith(' ');
    const next = `${draft}${needsSpace ? ' ' : ''}${token}`;
    handleDraftChange(next);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [draft, editingMessage, handleDraftChange]);

  const appendDraftImageAttachments = useCallback((assets: ImagePickerAsset[]) => {
    const mediaAssets = assets.filter((asset) =>
      asset.uri && (!asset.type || asset.type === 'image' || asset.type === 'video')
    );
    if (mediaAssets.length === 0) return;

    setDraftImageAttachments(prev => {
      const slots = Math.max(0, DRAFT_IMAGE_ATTACHMENT_LIMIT - prev.length);
      if (slots === 0) return prev;
      return [
        ...prev,
        ...mediaAssets.slice(0, slots).map((asset) => ({
          id: makeOptimisticId(isPickedVideoAsset(asset) ? 'draft_video' : 'draft_img'),
          asset,
        })),
      ];
    });
  }, []);

  const removeDraftImageAttachment = useCallback((id: string) => {
    setDraftImageAttachments(prev => prev.filter(item => item.id !== id));
  }, []);

  // ── Pick media attachments ──────────────────────────────────────────────────

  const pickImageAttachments = async (source: 'camera-photo' | 'camera-video' | 'library') => {
    const isCamera = source === 'camera-photo' || source === 'camera-video';
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
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: source === 'camera-video'
            ? 'videos'
            : 'images',
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.85,
          allowsMultipleSelection: true,
          selectionLimit: DRAFT_IMAGE_ATTACHMENT_LIMIT,
          orderedSelection: true,
        });
    if (result.canceled || !result.assets?.length) return;

    appendDraftImageAttachments(result.assets);
  };

  const handlePickMedia = () => Alert.alert(t('send_image'), t('choose_source'), [
    { text: t('take_photo'), onPress: () => pickImageAttachments('camera-photo') },
    { text: 'Quay video', onPress: () => pickImageAttachments('camera-video') },
    { text: t('photo_library'), onPress: () => pickImageAttachments('library') },
    { text: t('cancel'), style: 'cancel' },
  ]);

  const sendDraftImageAttachment = async (attachment: DraftImageAttachment, replyPrefix = '') => {
    const optimisticId = makeOptimisticId();
    const isVideo = isPickedVideoAsset(attachment.asset);
    const fileName = isVideo ? pickedMediaFileName(attachment.asset, 'surf-video') : undefined;
    const optimistic: ApiMessage = {
      id: optimisticId,
      conversationId,
      senderId: user?.uid ?? '',
      type: isVideo ? 'file' : 'image',
      text: replyPrefix,
      mediaUrl: attachment.asset.uri,
      fileName,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => prependUniqueMessage(prev, optimistic));
    try {
      const url = isVideo
        ? await uploadVideo(attachment.asset, { folder: 'surf/chat/videos' })
        : await uploadImage(attachment.asset, { folder: 'surf/chat/images' });
      const data = await api.post<{ item: ApiMessage }>(
        `/api/conversations/${conversationId}/messages`,
        {
          mediaUrl: url,
          mediaType: isVideo ? 'file' : 'image',
          fileName,
          text: replyPrefix || undefined,
        }
      );
      const real = data.item;
      if (real?.id) {
        setMessages(prev => replaceOptimisticMessage(prev, optimisticId, real));
        void messagesCache.addMessage(conversationId, messageToCachedMessage(real));
        lastMessageIdRef.current = real.id;
        markRead(real.id, real.createdAt);
      } else {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        throw new Error('missing_message_id');
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      throw new Error(isVideo ? 'cannot_send_video' : 'cannot_send_image');
    }
  };

  const sendRawMediaMessage = useCallback(async (
    localAsset: { uri: string; fileName: string; mimeType: string | null },
    mediaType: 'file' | 'audio',
    folder: string
  ) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const optimisticId = `opt_${Date.now()}`;
    const activeReplyTarget = getActiveReplyTarget();
    const replyPrefix = activeReplyTarget ? buildReplyPrefixText(activeReplyTarget) : '';
    const optimistic: ApiMessage = {
      id: optimisticId,
      conversationId,
      senderId: user?.uid ?? '',
      type: mediaType,
      text: replyPrefix,
      mediaUrl: localAsset.uri,
      fileName: localAsset.fileName,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => prependUniqueMessage(prev, optimistic));
    setSending(true);
    try {
      const url = await uploadRawFile({
        uri: localAsset.uri,
        fileName: localAsset.fileName,
        mimeType: localAsset.mimeType,
      }, { folder });
      const data = await api.post<{ item: ApiMessage }>(
        `/api/conversations/${conversationId}/messages`,
        { mediaUrl: url, mediaType, fileName: localAsset.fileName, text: replyPrefix || undefined }
      );
      const real = data.item;
      if (real?.id) {
        setMessages(prev => replaceOptimisticMessage(prev, optimisticId, real));
        void messagesCache.addMessage(conversationId, messageToCachedMessage(real));
        if (replyPrefix) setReplyTarget(null);
        lastMessageIdRef.current = real.id;
        markRead(real.id, real.createdAt);
      } else {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      Alert.alert(mediaType === 'audio' ? 'Không thể gửi ghi âm' : 'Không thể gửi tệp', 'Vui lòng thử lại sau.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [buildReplyPrefixText, conversationId, getActiveReplyTarget, user?.uid]);

  const handlePickFile = useCallback(async () => {
    if (sendingRef.current || editingMessage) return;
    try {
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      await sendRawMediaMessage({
        uri: asset.uri,
        fileName: asset.name || `surf-file-${Date.now()}`,
        mimeType: asset.mimeType ?? 'application/octet-stream',
      }, 'file', 'surf/chat/files');
    } catch {
      Alert.alert(
        'Chưa thể chọn tệp',
        'Tính năng gửi file cần cài lại Android development build sau khi thêm expo-document-picker.'
      );
    }
  }, [editingMessage, sendRawMediaMessage]);

  const startVoiceRecording = useCallback(async () => {
    if (sendingRef.current || editingMessage || recording) return;
    try {
      const Audio = await import('expo-audio');
      const currentPermission = await Audio.getRecordingPermissionsAsync();
      const permission = currentPermission.granted
        ? currentPermission
        : await Audio.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Cần quyền micro', 'Vui lòng cấp quyền micro để ghi âm.');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const recorder = new Audio.AudioModule.AudioRecorder(Audio.RecordingPresets.LOW_QUALITY);
      await recorder.prepareToRecordAsync();
      recorder.record();
      audioRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      Alert.alert(
        'Chưa thể ghi âm',
        'Tính năng ghi âm cần cài lại Android development build sau khi thêm expo-audio.'
      );
    }
  }, [editingMessage, recording]);

  const stopVoiceRecording = useCallback(async () => {
    const recorder = audioRecorderRef.current;
    if (!recorder || sendingRef.current) return;

    try {
      await recorder.stop();
      const uri = recorder.uri as string | null;
      audioRecorderRef.current = null;
      setRecording(false);

      try {
        const Audio = await import('expo-audio');
        await Audio.setAudioModeAsync({ allowsRecording: false });
      } catch {
        // Audio mode reset is best-effort.
      }

      if (!uri) {
        Alert.alert('Không có ghi âm', 'Không lấy được file ghi âm. Vui lòng thử lại.');
        return;
      }

      const ext = fileExtensionFromUri(uri, Platform.OS === 'android' ? '3gp' : 'm4a');
      await sendRawMediaMessage({
        uri,
        fileName: `voice-${Date.now()}.${ext}`,
        mimeType: audioMimeFromUri(uri),
      }, 'audio', 'surf/chat/audio');
    } catch {
      audioRecorderRef.current = null;
      setRecording(false);
      Alert.alert('Không thể gửi ghi âm', 'Vui lòng thử lại sau.');
    }
  }, [sendRawMediaMessage]);

  const toggleVoiceRecording = useCallback(() => {
    if (recording) {
      void stopVoiceRecording();
    } else {
      void startVoiceRecording();
    }
  }, [recording, startVoiceRecording, stopVoiceRecording]);

  const clearAudioStatusTimer = useCallback(() => {
    if (audioStatusTimerRef.current) {
      clearInterval(audioStatusTimerRef.current);
      audioStatusTimerRef.current = null;
    }
  }, []);

  const stopAudioPlayback = useCallback(() => {
    clearAudioStatusTimer();
    const player = audioPlayerRef.current;
    audioPlayerRef.current = null;
    if (player) {
      try {
        player.pause();
        player.remove?.();
      } catch {
        // Player can already be released by the native side.
      }
    }
    setAudioPlayback(null);
  }, [clearAudioStatusTimer]);

  const startAudioStatusTimer = useCallback(() => {
    clearAudioStatusTimer();
    audioStatusTimerRef.current = setInterval(() => {
      const player = audioPlayerRef.current;
      if (!player) return;

      const duration = Number(player.duration ?? 0);
      const currentTime = Number(player.currentTime ?? 0);
      const playing = Boolean(player.playing && !player.paused);
      const finished = duration > 0 && currentTime >= Math.max(0, duration - 0.15) && !playing;

      if (finished) {
        clearAudioStatusTimer();
        const seekPromise = player.seekTo?.(0);
        if (seekPromise?.catch) void seekPromise.catch(() => {});
      }

      setAudioPlayback(current => {
        if (!current) return current;
        return {
          ...current,
          playing: finished ? false : playing,
          loading: Boolean(player.isBuffering || !player.isLoaded),
          currentTime: finished ? 0 : Math.max(0, currentTime),
          duration: duration > 0 ? duration : current.duration,
        };
      });
    }, 250);
  }, [clearAudioStatusTimer]);

  const releaseCurrentAudioPlayer = useCallback(() => {
    clearAudioStatusTimer();
    const player = audioPlayerRef.current;
    audioPlayerRef.current = null;
    if (!player) return;
    try {
      player.pause();
      player.remove?.();
    } catch {
      // Player cleanup is best-effort.
    }
  }, [clearAudioStatusTimer]);

  const toggleAudioPlayback = useCallback(async (message: ApiMessage) => {
    const url = message.mediaUrl;
    if (!url || message.type !== 'audio') return;

    const existingPlayer = audioPlayerRef.current;
    if (audioPlayback?.messageId === message.id && existingPlayer) {
      if (audioPlayback.playing) {
        existingPlayer.pause();
        clearAudioStatusTimer();
        setAudioPlayback(current => current ? { ...current, playing: false, loading: false } : current);
      } else {
        existingPlayer.play();
        setAudioPlayback(current => current ? { ...current, playing: true, loading: false } : current);
        startAudioStatusTimer();
      }
      return;
    }

    releaseCurrentAudioPlayer();
    setAudioPlayback({
      messageId: message.id,
      url,
      playing: false,
      loading: true,
      currentTime: 0,
      duration: 0,
    });

    try {
      const Audio = await import('expo-audio');
      await Audio.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const player = Audio.createAudioPlayer(url, { updateInterval: 250 }) as InlineAudioPlayer;
      audioPlayerRef.current = player;
      player.play();
      setAudioPlayback({
        messageId: message.id,
        url,
        playing: true,
        loading: false,
        currentTime: Number(player.currentTime ?? 0),
        duration: Number(player.duration ?? 0),
      });
      startAudioStatusTimer();
    } catch {
      releaseCurrentAudioPlayer();
      setAudioPlayback(null);
      Alert.alert(
        'Chưa thể phát ghi âm',
        'Tính năng phát tin nhắn thoại cần cài lại Android development build sau khi thêm expo-audio.'
      );
    }
  }, [
    audioPlayback?.messageId,
    audioPlayback?.playing,
    clearAudioStatusTimer,
    releaseCurrentAudioPlayer,
    startAudioStatusTimer,
  ]);

  useEffect(() => {
    return () => {
      stopAudioPlayback();
    };
  }, [conversationId, stopAudioPlayback]);

  useEffect(() => {
    return () => {
      const recorder = audioRecorderRef.current;
      audioRecorderRef.current = null;
      if (recorder) {
        const stopPromise = recorder.stop?.();
        if (stopPromise?.catch) {
          void stopPromise.catch(() => {});
        }
      }
    };
  }, []);

  const closeMessageActions = useCallback(() => {
    setSelectedMessage(null);
  }, []);

  const openMessageActions = useCallback((message: ApiMessage) => {
    if (message.id.startsWith('opt_')) return;
    setSelectedMessage(message);
  }, []);

  const toggleMessageReaction = useCallback(async (message: ApiMessage, emoji: string) => {
    if (message.type === 'call_log' || messageWasRecalled(message)) return;
    setMessageActionLoadingId(message.id);
    try {
      const data = await api.patch<{ conversationId: string; message: ApiMessage }>(
        `/api/messages/${encodeURIComponent(message.id)}/reactions`,
        { conversationId: message.conversationId, emoji }
      );
      replaceMessage(data.conversationId, data.message);
      closeMessageActions();
    } catch {
      Alert.alert('Không thể thả cảm xúc', 'Vui lòng thử lại sau.');
    } finally {
      setMessageActionLoadingId(null);
    }
  }, [closeMessageActions, replaceMessage]);

  const toggleMessagePin = useCallback(async (message: ApiMessage) => {
    if (!user?.uid) return;
    const isPinned = message.pinnedBy?.includes(user.uid) ?? false;
    setMessageActionLoadingId(message.id);
    try {
      const data = await api.patch<{ conversationId: string; message: ApiMessage }>(
        `/api/messages/${encodeURIComponent(message.id)}/pin`,
        { conversationId: message.conversationId, pinned: !isPinned }
      );
      replaceMessage(data.conversationId, data.message);
      closeMessageActions();
    } catch {
      Alert.alert('Không thể cập nhật ghim', 'Vui lòng thử lại sau.');
    } finally {
      setMessageActionLoadingId(null);
    }
  }, [closeMessageActions, replaceMessage, user?.uid]);

  const startReplyToMessage = useCallback((message: ApiMessage) => {
    if (message.type === 'call_log' || messageWasRecalled(message)) return;
    setReplyTarget(message);
    setEditingMessage(null);
    closeMessageActions();
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [closeMessageActions]);

  const startEditMessage = useCallback((message: ApiMessage) => {
    if (message.senderId !== user?.uid || message.type !== 'text' || messageWasRecalled(message)) return;
    setEditingMessage(message);
    setReplyTarget(null);
    setDraftImageAttachments([]);
    setDraft(normalizeMessageBody(message));
    closeMessageActions();
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [closeMessageActions, user?.uid]);

  const getCopyableMessageContent = useCallback((message: ApiMessage) => {
    if (messageWasRecalled(message) || message.type === 'call_log') return '';
    const body = normalizeMessageBody(message).trim();

    if (message.type === 'text') return body;
    if (message.type === 'image') {
      return [body, message.mediaUrl].filter(Boolean).join('\n');
    }
    if (message.type === 'file') {
      return [body || message.fileName || 'Tệp đính kèm', message.mediaUrl].filter(Boolean).join('\n');
    }
    if (message.type === 'audio') {
      return [body || 'Tin nhắn thoại', message.mediaUrl].filter(Boolean).join('\n');
    }

    return body;
  }, []);

  const copyMessageContent = useCallback((message: ApiMessage) => {
    const content = getCopyableMessageContent(message);
    if (!content) return;
    Clipboard.setString(content);
    closeMessageActions();
    Alert.alert('Đã sao chép', 'Nội dung tin nhắn đã được sao chép.');
  }, [closeMessageActions, getCopyableMessageContent]);

  const openExternalUrl = useCallback((url: string, failureTitle = 'Không thể mở liên kết') => {
    Linking.openURL(url).catch(() => {
      Alert.alert(failureTitle, 'Vui lòng thử lại sau.');
    });
  }, []);

  const openMessageAttachment = useCallback((message: ApiMessage) => {
    if (!message.mediaUrl || messageWasRecalled(message)) return;

    closeMessageActions();

    if (message.type === 'image') {
      setMediaPreview({
        url: message.mediaUrl,
        title: getSenderNameForMessage(message),
      });
      return;
    }

    if (message.type === 'audio') {
      void toggleAudioPlayback(message);
      return;
    }

    if (message.type === 'file') {
      openExternalUrl(message.mediaUrl, 'Không thể mở tệp');
    }
  }, [closeMessageActions, getSenderNameForMessage, openExternalUrl, toggleAudioPlayback]);

  const openRecallOptions = useCallback((message: ApiMessage) => {
    closeMessageActions();
    const canRecallEveryone =
      message.senderId === user?.uid &&
      message.type !== 'call_log' &&
      !messageWasRecalled(message);
    setRecallAudience(canRecallEveryone ? 'everyone' : 'self');
    setRecallTargetMessage(message);
  }, [closeMessageActions, user?.uid]);

  const closeRecallOptions = useCallback(() => {
    if (recallTargetMessage && messageActionLoadingId === recallTargetMessage.id) return;
    setRecallTargetMessage(null);
    setRecallAudience('everyone');
  }, [messageActionLoadingId, recallTargetMessage]);

  const confirmRecallSelection = useCallback(async () => {
    const message = getLatestMessageSnapshot(recallTargetMessage);
    if (!message) return;

    const canRecallEveryone =
      message.senderId === user?.uid &&
      message.type !== 'call_log' &&
      !messageWasRecalled(message);
    const effectiveAudience: RecallAudience = recallAudience === 'everyone' && canRecallEveryone
      ? 'everyone'
      : 'self';

    setMessageActionLoadingId(message.id);
    try {
      if (effectiveAudience === 'everyone') {
        const data = await api.delete<{ conversationId: string; message: ApiMessage }>(
          `/api/messages/${encodeURIComponent(message.id)}/everyone`,
          { body: { conversationId: message.conversationId } }
        );
        replaceMessage(data.conversationId, data.message);
      } else {
        await api.delete(`/api/messages/${encodeURIComponent(message.id)}/self`, {
          body: { conversationId: message.conversationId },
        });
        removeMessage(message.id);
      }
      setRecallTargetMessage(null);
      setRecallAudience('everyone');
    } catch {
      Alert.alert(
        effectiveAudience === 'everyone' ? 'Không thể thu hồi' : 'Không thể gỡ tin nhắn',
        effectiveAudience === 'everyone'
          ? 'Bạn chỉ có thể thu hồi tin nhắn của mình.'
          : 'Vui lòng thử lại sau.'
      );
    } finally {
      setMessageActionLoadingId(null);
    }
  }, [getLatestMessageSnapshot, recallAudience, recallTargetMessage, removeMessage, replaceMessage, user?.uid]);

  const openReportOptions = useCallback((message: ApiMessage) => {
    closeMessageActions();
    setReportReason(REPORT_REASON_OPTIONS[0]);
    setReportTargetMessage(message);
  }, [closeMessageActions]);

  const closeReportOptions = useCallback(() => {
    if (reportTargetMessage && messageActionLoadingId === reportTargetMessage.id) return;
    setReportTargetMessage(null);
    setReportReason(REPORT_REASON_OPTIONS[0]);
  }, [messageActionLoadingId, reportTargetMessage]);

  const submitReportMessage = useCallback(async () => {
    const message = getLatestMessageSnapshot(reportTargetMessage);
    if (!message) return;

    const reason = reportReason.trim();
    if (!reason) {
      Alert.alert('Thiếu lý do', 'Vui lòng chọn hoặc nhập lý do báo cáo.');
      return;
    }

    setMessageActionLoadingId(message.id);
    try {
      await api.post(`/api/messages/${encodeURIComponent(message.id)}/report`, {
        conversationId: message.conversationId,
        reason,
      });
      setReportTargetMessage(null);
      setReportReason(REPORT_REASON_OPTIONS[0]);
      Alert.alert('Đã gửi báo cáo', 'Cảm ơn bạn đã giúp Surf an toàn hơn.');
    } catch {
      Alert.alert('Không thể báo cáo', 'Vui lòng thử lại sau.');
    } finally {
      setMessageActionLoadingId(null);
    }
  }, [getLatestMessageSnapshot, reportReason, reportTargetMessage]);

  const loadForwardConversations = useCallback(async () => {
    setForwardLoading(true);
    try {
      const data = await api.get<{ items: ForwardConversationItem[] }>('/api/conversations?limit=40');
      setForwardConversations((data.items ?? []).filter(item => Boolean(item.id)));
    } catch {
      Alert.alert('Không thể tải hội thoại', 'Vui lòng thử lại sau.');
    } finally {
      setForwardLoading(false);
    }
  }, []);

  const openForwardPicker = useCallback((message: ApiMessage) => {
    if (message.type === 'call_log' || messageWasRecalled(message)) return;
    setSelectedMessage(null);
    setForwardingMessage(message);
    if (forwardConversations.length === 0) {
      void loadForwardConversations();
    }
  }, [forwardConversations.length, loadForwardConversations]);

  const closeForwardPicker = useCallback(() => {
    if (forwardSendingId) return;
    setForwardingMessage(null);
  }, [forwardSendingId]);

  const forwardMessageToConversation = useCallback(async (targetConversation: ForwardConversationItem) => {
    const message = getLatestMessageSnapshot(forwardingMessage);
    if (!message || forwardSendingId) return;
    if (message.type === 'call_log' || messageWasRecalled(message)) {
      setForwardingMessage(null);
      Alert.alert('Không thể chuyển tiếp', 'Tin nhắn này không còn có thể chuyển tiếp.');
      return;
    }

    setForwardSendingId(targetConversation.id);
    try {
      const data = await api.post<{
        conversationId: string;
        message: ApiMessage;
      }>(`/api/messages/${encodeURIComponent(message.id)}/forward`, {
        conversationId: message.conversationId,
        targetConversationId: targetConversation.id,
      });

      if (data.message?.id && data.conversationId === conversationId) {
        setMessages(prev => prependUniqueMessage(prev, data.message));
        void messagesCache.addMessage(conversationId, messageToCachedMessage(data.message));
        lastMessageIdRef.current = data.message.id;
        markRead(data.message.id, data.message.createdAt);
      }

      setForwardingMessage(null);
      Alert.alert('Đã chuyển tiếp', `Tin nhắn đã được gửi tới ${getForwardConversationTitle(targetConversation)}.`);
    } catch {
      Alert.alert('Không thể chuyển tiếp', 'Tin nhắn này chưa thể chuyển tiếp. Vui lòng thử lại sau.');
    } finally {
      setForwardSendingId(null);
    }
  }, [conversationId, forwardSendingId, forwardingMessage, getForwardConversationTitle, getLatestMessageSnapshot]);

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = draft.trim();
    const pendingImages = draftImageAttachments;
    if (sendingRef.current || (!text && pendingImages.length === 0)) return;

    if (editingMessage) {
      if (!text) return;
      const target = getActiveEditingMessage();
      if (!target) {
        setEditingMessage(null);
        setDraft('');
        Alert.alert('Không thể sửa tin nhắn', 'Tin nhắn này không còn có thể sửa.');
        return;
      }
      sendingRef.current = true;
      setSending(true);
      try {
        const data = await api.patch<{ conversationId: string; message: ApiMessage }>(
          `/api/messages/${encodeURIComponent(target.id)}/edit`,
          { conversationId: target.conversationId, text }
        );
        replaceMessage(data.conversationId, data.message);
        setEditingMessage(null);
        setDraft('');
      } catch {
        Alert.alert('Không thể sửa tin nhắn', 'Vui lòng thử lại sau.');
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
      return;
    }

    const activeReplyTarget = getActiveReplyTarget();
    const replyPrefix = activeReplyTarget ? buildReplyPrefixText(activeReplyTarget) : '';
    const outboundText = text ? (replyPrefix ? `${replyPrefix}\n${text}` : text) : '';
    const optimisticId = outboundText ? makeOptimisticId() : null;

    setDraft('');
    setDraftImageAttachments([]);
    sendingRef.current = true;
    setSending(true);
    const pendingReplyTarget = activeReplyTarget;
    setReplyTarget(null);

    if (outboundText && optimisticId) {
      const optimistic: ApiMessage = {
        id: optimisticId,
        conversationId,
        senderId: user?.uid ?? '',
        type: 'text',
        text: outboundText,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => prependUniqueMessage(prev, optimistic));
    }

    let textSent = false;
    let sentImageCount = 0;
    let lastMediaSendErrorMessage = '';
    try {
      const socket = getSocket();
      socket.emit('typing:stop', { conversationId });
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);

      if (outboundText && optimisticId) {
        const data = await api.post<{ item: ApiMessage }>(
          `/api/conversations/${conversationId}/messages`,
          { text: outboundText }
        );
        const real = data.item;
        if (!real?.id) {
          setMessages(prev => prev.filter(m => m.id !== optimisticId));
          throw new Error('missing_message_id');
        }
        setMessages(prev => replaceOptimisticMessage(prev, optimisticId, real));
        void messagesCache.addMessage(conversationId, messageToCachedMessage(real));
        lastMessageIdRef.current = real.id;
        markRead(real.id, real.createdAt);
        textSent = true;
      }

      for (const attachment of pendingImages) {
        const imageReplyPrefix = !outboundText && sentImageCount === 0 ? replyPrefix : '';
        try {
          await sendDraftImageAttachment(attachment, imageReplyPrefix);
        } catch (error) {
          lastMediaSendErrorMessage = error instanceof Error ? error.message : 'cannot_send_media';
          throw error;
        }
        sentImageCount += 1;
      }
    } catch {
      if (optimisticId && !textSent) {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
      }
      if (!textSent) setDraft(text);
      const remainingImages = pendingImages.slice(sentImageCount);
      setDraftImageAttachments(remainingImages);
      const replyWasSent = Boolean((outboundText && textSent) || (!outboundText && sentImageCount > 0));
      if (!replyWasSent) {
        setReplyTarget(pendingReplyTarget);
      }
      const imageFailed = sentImageCount < pendingImages.length && (!outboundText || textSent);
      if (imageFailed) {
        Alert.alert(
          t('error_title'),
          lastMediaSendErrorMessage === 'cannot_send_video'
            ? 'Không thể gửi video. Vui lòng thử lại hoặc chọn video nhỏ hơn.'
            : t('cannot_send_image')
        );
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const appendRealMessage = (message?: ApiMessage | null) => {
    if (!message?.id) return;
    setMessages(prev => prependUniqueMessage(prev, message));
    void messagesCache.addMessage(conversationId, messageToCachedMessage(message));
    lastMessageIdRef.current = message.id;
    markRead(message.id, message.createdAt);
  };

  const createCallLog = async (
    mode: 'audio' | 'video',
    outcome: 'started' | 'ended' | 'failed',
    durationSeconds?: number
  ) => {
    try {
      const data = await api.post<{ item: ApiMessage }>(
        `/api/conversations/${conversationId}/call-log`,
        { mode, outcome, durationSeconds }
      );
      appendRealMessage(data.item);
    } catch {
      // Logging must not block opening or closing the call room.
    }
  };

  const groupCallParticipantIds = useMemo(
    () =>
      isGroupConversation
        ? conversationMembers
            .map(member => member.uid)
            .filter(uid => uid && uid !== user?.uid)
        : [],
    [conversationMembers, isGroupConversation, user?.uid]
  );
  const canStartCall = Boolean(peerUid) || groupCallParticipantIds.length > 0;

  const startCall = async (mode: 'audio' | 'video') => {
    if (!canStartCall || callingMode || callStartingRef.current) return;
    callStartingRef.current = true;
    setCallingMode(mode);
    setTimeout(() => {
      callStartingRef.current = false;
      setCallingMode(null);
    }, 1200);

    if (!peerUid && isGroupConversation) {
      navigation.navigate('Call', {
        conversationId,
        peerUid: null,
        peerName: title || 'Cuộc gọi nhóm',
        peerAvatar: null,
        mode,
        callKind: 'group',
        direction: 'outgoing',
        conversationTitle: title || 'Cuộc gọi nhóm',
        participantIds: groupCallParticipantIds,
      });
      return;
    }

    if (!peerUid) {
      callStartingRef.current = false;
      setCallingMode(null);
      return;
    }
    navigation.navigate('Call', {
      conversationId,
      peerUid,
      peerName: peerName || title,
      peerAvatar,
      mode,
      callKind: 'direct',
    });
  };

  const pinnedMessages = messages.filter(message => user?.uid && message.pinnedBy?.includes(user.uid));
  const latestPinnedMessage = pinnedMessages[0] ?? null;

  useEffect(() => {
    const visibleMessageIds = new Set(messages.map(message => message.id));

    if (selectedMessage && !visibleMessageIds.has(selectedMessage.id)) {
      setSelectedMessage(null);
    }

    if (reactionDetailsMessage && !visibleMessageIds.has(reactionDetailsMessage.id)) {
      setReactionDetailsMessage(null);
      setReactionDetailsFilter(null);
    }

    if (replyTarget) {
      const latestReplyTarget = messages.find(message => message.id === replyTarget.id);
      if (!latestReplyTarget || messageWasRecalled(latestReplyTarget)) {
        setReplyTarget(null);
      } else if (getMessageSyncKey(latestReplyTarget) !== getMessageSyncKey(replyTarget)) {
        setReplyTarget(latestReplyTarget);
      }
    }

    if (editingMessage) {
      const latestEditingMessage = messages.find(message => message.id === editingMessage.id);
      if (!latestEditingMessage || latestEditingMessage.type !== 'text' || messageWasRecalled(latestEditingMessage)) {
        setEditingMessage(null);
        setDraft('');
      } else if (getMessageSyncKey(latestEditingMessage) !== getMessageSyncKey(editingMessage)) {
        setEditingMessage(latestEditingMessage);
      }
    }

    if (forwardingMessage && !forwardSendingId) {
      const latestForwardingMessage = messages.find(message => message.id === forwardingMessage.id);
      if (!latestForwardingMessage || latestForwardingMessage.type === 'call_log' || messageWasRecalled(latestForwardingMessage)) {
        setForwardingMessage(null);
      } else if (getMessageSyncKey(latestForwardingMessage) !== getMessageSyncKey(forwardingMessage)) {
        setForwardingMessage(latestForwardingMessage);
      }
    }

    if (
      recallTargetMessage &&
      !visibleMessageIds.has(recallTargetMessage.id) &&
      messageActionLoadingId !== recallTargetMessage.id
    ) {
      setRecallTargetMessage(null);
      setRecallAudience('everyone');
    }

    if (
      reportTargetMessage &&
      !visibleMessageIds.has(reportTargetMessage.id) &&
      messageActionLoadingId !== reportTargetMessage.id
    ) {
      setReportTargetMessage(null);
      setReportReason(REPORT_REASON_OPTIONS[0]);
    }

    if (pinnedListOpen && pinnedMessages.length === 0) {
      setPinnedListOpen(false);
    }
  }, [
    forwardingMessage,
    forwardSendingId,
    editingMessage,
    messageActionLoadingId,
    messages,
    pinnedListOpen,
    pinnedMessages.length,
    reactionDetailsMessage,
    recallTargetMessage,
    reportTargetMessage,
    replyTarget,
    selectedMessage,
  ]);

  const readReceiptMembersByMessageId = useMemo(() => {
    const messageById = new Map(messages.map(message => [message.id, message]));
    const outgoingMessages = messages.filter(message => message.senderId === user?.uid);
    const buckets: Record<string, ReceiptAvatarMember[]> = {};

    Object.values(readReceiptsByUser)
      .sort(
        (a, b) =>
          (b.lastReadAt ? +new Date(b.lastReadAt) : 0) -
          (a.lastReadAt ? +new Date(a.lastReadAt) : 0)
      )
      .forEach(receipt => {
        if (receipt.userId === user?.uid) return;
        const member = conversationMemberById.get(receipt.userId);
        if (!member) return;

        let anchorMessageId: string | null = null;
        const exactMessage = messageById.get(receipt.lastReadMessageId);
        if (exactMessage && exactMessage.senderId === user?.uid) {
          anchorMessageId = exactMessage.id;
        } else {
          const receiptCursorMs = new Date(receipt.lastReadMessageCreatedAt).getTime();
          if (Number.isFinite(receiptCursorMs)) {
            for (const message of outgoingMessages) {
              const messageCreatedAtMs = new Date(message.createdAt).getTime();
              if (messageCreatedAtMs <= receiptCursorMs) {
                anchorMessageId = message.id;
                break;
              }
            }
          }
        }

        if (!anchorMessageId) return;
        const currentBucket = buckets[anchorMessageId] ?? [];
        if (currentBucket.some(item => item.uid === member.uid) || currentBucket.length >= 3) return;

        currentBucket.push({
          ...member,
          seenAt: receipt.lastReadAt ?? receipt.lastReadMessageCreatedAt,
        });
        buckets[anchorMessageId] = currentBucket;
      });

    return buckets;
  }, [conversationMemberById, messages, readReceiptsByUser, user?.uid]);
  const sharedLinks = useMemo<SharedLink[]>(() => {
    const urls = uniqueStrings(
      messages
        .filter(message => !messageWasRecalled(message))
        .flatMap(message => extractUrls(normalizeMessageBody(message)))
    );
    return urls.map(url => buildSharedLink(url));
  }, [messages]);
  const sharedMedia = useMemo<SharedMediaItem[]>(() => {
    const byUrl = new Map<string, SharedMediaItem>();

    messages.forEach(message => {
      if (messageWasRecalled(message)) return;
      if (!message.mediaUrl) return;
      if (message.type === 'image') {
        byUrl.set(message.mediaUrl, {
          ...buildSharedLink(message.mediaUrl, 'Ảnh đã gửi'),
          mediaType: 'image',
        });
      } else if (message.type === 'file' && isVideoUrl(message.mediaUrl)) {
        byUrl.set(message.mediaUrl, {
          ...buildSharedLink(message.mediaUrl, message.fileName ?? 'Video đã gửi'),
          mediaType: 'video',
        });
      }
    });

    sharedLinks.forEach(item => {
      const mediaType = getMediaTypeFromUrl(item.url);
      if (mediaType) byUrl.set(item.url, { ...item, mediaType });
    });

    return Array.from(byUrl.values());
  }, [messages, sharedLinks]);
  const sharedFiles = useMemo<SharedLink[]>(() => {
    const byUrl = new Map<string, SharedLink>();

    messages.forEach(message => {
      if (messageWasRecalled(message)) return;
      if (message.type !== 'file' || !message.mediaUrl) return;
      if (isImageUrl(message.mediaUrl) || isVideoUrl(message.mediaUrl)) return;
      byUrl.set(message.mediaUrl, buildSharedLink(message.mediaUrl, message.fileName ?? 'Tệp đã gửi'));
    });

    sharedLinks.forEach(item => {
      if (isFileUrl(item.url) && !getMediaTypeFromUrl(item.url)) {
        byUrl.set(item.url, item);
      }
    });

    return Array.from(byUrl.values());
  }, [messages, sharedLinks]);
  const sharedPages = useMemo(
    () => sharedLinks.filter(item => !getMediaTypeFromUrl(item.url) && !isFileUrl(item.url)),
    [sharedLinks]
  );
  const selectedMessageSource = selectedMessage
    ? messages.find(message => message.id === selectedMessage.id) ?? selectedMessage
    : null;
  const recallTargetSource = getLatestMessageSnapshot(recallTargetMessage);
  const forwardingMessageSource = getLatestMessageSnapshot(forwardingMessage);
  const reportTargetSource = getLatestMessageSnapshot(reportTargetMessage);
  const reactionDetailsSource = reactionDetailsMessage
    ? messages.find(message => message.id === reactionDetailsMessage.id) ?? reactionDetailsMessage
    : null;
  const composerReplyTarget = getActiveReplyTarget();
  const composerEditingMessage = getActiveEditingMessage();
  const canSubmitComposer = Boolean(draft.trim()) || (!composerEditingMessage && draftImageAttachments.length > 0);

  const getReactionGroups = (message: ApiMessage) =>
    Object.entries(message.reactions ?? {})
      .map(([emoji, usersById]) => ({ emoji, count: Object.keys(usersById).length }))
      .filter(group => group.count > 0)
      .sort((a, b) => b.count - a.count);

  const getReactionActors = (message: ApiMessage, filterEmoji: string | null = null) =>
    Object.entries(message.reactions ?? {})
      .flatMap(([emoji, usersById]) => {
        if (filterEmoji && emoji !== filterEmoji) return [];
        return Object.values(usersById).map(actor => ({ ...actor, emoji }));
      })
      .filter(actor => Boolean(actor.uid));

  const getMyReactionEmoji = (message: ApiMessage) => {
    if (!user?.uid) return null;
    const entry = Object.entries(message.reactions ?? {}).find(([, usersById]) =>
      Boolean(usersById[user.uid])
    );
    return entry?.[0] ?? null;
  };

  const renderReactionSummary = (message: ApiMessage, isOwn: boolean) => {
    const groups = getReactionGroups(message);
    if (groups.length === 0) return null;
    const total = groups.reduce((sum, group) => sum + group.count, 0);
    return (
      <TouchableOpacity
        style={[s.reactionBadge, isOwn ? s.reactionBadgeOwn : s.reactionBadgeOther]}
        activeOpacity={0.8}
        onPress={() => {
          setReactionDetailsFilter(null);
          setReactionDetailsMessage(message);
        }}
      >
        {groups.slice(0, 2).map(group => (
          <Text key={`${message.id}-${group.emoji}`} style={s.reactionEmoji}>{group.emoji}</Text>
        ))}
        <Text style={[s.reactionCount, { color: C.subtext }]}>{total}</Text>
      </TouchableOpacity>
    );
  };

  const renderSeenReceipts = (members: ReceiptAvatarMember[]) => {
    if (members.length === 0) return null;

    return (
      <View style={s.seenReceiptRow}>
        {peerUid && members.length === 1 ? (
          <Text style={[s.seenReceiptLabel, { color: C.subtext }]}>Đã xem</Text>
        ) : null}
        {members.map(member => (
          member.avatarUrl ? (
            <Image
              key={`seen-${member.uid}`}
              source={{ uri: member.avatarUrl }}
              style={[s.seenReceiptAvatar, { borderColor: C.bg }]}
            />
          ) : (
            <View
              key={`seen-${member.uid}`}
              style={[s.seenReceiptAvatarFallback, { backgroundColor: C.accent, borderColor: C.bg }]}
            >
              <Text style={s.seenReceiptInitial}>{(member.name || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )
        ))}
      </View>
    );
  };

  const renderAudioMessage = (message: ApiMessage, isOwn: boolean) => {
    const isActive = audioPlayback?.messageId === message.id;
    const playing = Boolean(isActive && audioPlayback?.playing);
    const loadingAudio = Boolean(isActive && audioPlayback?.loading);
    const currentTime = isActive ? audioPlayback?.currentTime ?? 0 : 0;
    const duration = isActive
      ? audioPlayback?.duration ?? 0
      : message.durationSeconds ?? 0;
    const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
    const timeLabel = duration > 0
      ? `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`
      : 'Tin nhắn thoại';

    return (
      <View style={s.voiceMessage}>
        <View style={[
          s.voicePlayButton,
          { backgroundColor: isOwn ? 'rgba(255,255,255,0.20)' : C.soft },
        ]}>
          {loadingAudio ? (
            <ActivityIndicator size={16} color={isOwn ? '#fff' : C.accent} />
          ) : (
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={17}
              color={isOwn ? '#fff' : C.accent}
            />
          )}
        </View>
        <View style={s.voiceCopy}>
          <View style={[
            s.voiceTrack,
            { backgroundColor: isOwn ? 'rgba(255,255,255,0.20)' : C.border },
          ]}>
            <View
              style={[
                s.voiceTrackFill,
                {
                  width: `${progress * 100}%`,
                  backgroundColor: isOwn ? '#fff' : C.accent,
                },
              ]}
            />
          </View>
          <Text style={[
            s.voiceMeta,
            { color: isOwn ? 'rgba(255,255,255,0.76)' : C.subtext },
          ]}>
            {playing ? 'Đang phát' : timeLabel}
          </Text>
        </View>
      </View>
    );
  };

  const renderMessageTextContent = (text: string, isOwn: boolean) => {
    const parts = splitTextWithLinks(text);
    if (parts.length === 0) {
      return <Text style={[s.msgText, { color: isOwn ? C.ownText : C.otherText }]}>{text}</Text>;
    }

    return (
      <Text style={[s.msgText, { color: isOwn ? C.ownText : C.otherText }]}>
        {parts.map((part, index) => {
          if (part.kind === 'text') return part.text;
          return (
            <Text
              key={`msg-link-${index}-${part.url}`}
              style={[
                s.msgLink,
                { color: isOwn ? '#e0f2fe' : C.accent },
              ]}
              onPress={() => {
                openExternalUrl(part.url);
              }}
            >
              {part.text}
              {part.suffix}
            </Text>
          );
        })}
      </Text>
    );
  };

  const renderSelectedMessageActions = () => {
    const message = selectedMessageSource;
    if (!message) return null;

    const isOwn = message.senderId === user?.uid;
    const isPinned = Boolean(user?.uid && message.pinnedBy?.includes(user.uid));
    const isRecalled = messageWasRecalled(message);
    const isCallLog = message.type === 'call_log';
    const supportsQuickInteractions = message.type !== 'call_log' && !isRecalled;
    const canEdit = isOwn && message.type === 'text' && !isRecalled;
    const canRecall = isOwn && !isCallLog && !isRecalled;
    const canForward = message.type !== 'call_log' && !isRecalled;
    const canCopy = Boolean(getCopyableMessageContent(message));
    const canPin = !isCallLog && (!isRecalled || isPinned);
    const canOpenAttachment = Boolean(
      message.mediaUrl &&
        !isRecalled &&
        (message.type === 'image' || message.type === 'file' || message.type === 'audio')
    );
    const attachmentAction =
      message.type === 'image'
        ? { icon: 'image-outline' as const, label: 'Xem ảnh' }
        : message.type === 'audio'
          ? { icon: 'play-circle-outline' as const, label: 'Phát ghi âm' }
          : { icon: 'document-text-outline' as const, label: 'Mở tệp' };
    const canCallAgain = isCallLog && canStartCall && !isRecalled;
    const canReport = !isOwn && !isCallLog && !isRecalled;
    const recallActionLabel = canRecall ? 'Gỡ / thu hồi' : 'Gỡ phía tôi';
    const hasReactions = getReactionGroups(message).length > 0;
    const myReactionEmoji = getMyReactionEmoji(message);
    const loading = messageActionLoadingId === message.id;
    const previewText = isRecalled
      ? 'Tin nhắn đã được thu hồi'
      : message.type === 'image'
        ? 'Hình ảnh'
        : normalizeMessageBody(message) || message.text || 'Tin nhắn';

    return (
      <Modal visible transparent animationType="fade" onRequestClose={closeMessageActions}>
        <Pressable style={s.modalBackdrop} onPress={closeMessageActions}>
          <Pressable style={[s.actionSheet, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.actionHandle} />
            <Text style={[s.actionTitle, { color: C.text }]} numberOfLines={1}>
              {getSenderNameForMessage(message)}
            </Text>
            <Text style={[s.actionPreview, { color: C.subtext }]} numberOfLines={2}>
              {previewText}
            </Text>

            {supportsQuickInteractions && (
              <View style={[s.reactionPicker, { backgroundColor: C.soft }]}>
                {MESSAGE_REACTION_OPTIONS.map(emoji => {
                  const selected = myReactionEmoji === emoji;
                  return (
                    <TouchableOpacity
                      key={`reaction-${message.id}-${emoji}`}
                      style={[
                        s.reactionButton,
                        selected && {
                          backgroundColor: C.card,
                          borderColor: C.accent,
                        },
                      ]}
                      disabled={loading}
                      onPress={() => toggleMessageReaction(message, emoji)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.reactionButtonText, selected && s.reactionButtonTextSelected]}>
                        {emoji}
                      </Text>
                      {selected ? <View style={[s.reactionSelectedDot, { backgroundColor: C.accent }]} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={s.actionList}>
              {canCallAgain && (
                <ActionRow
                  icon={message.callMode === 'video' ? 'videocam-outline' : 'call-outline'}
                  label="Gọi lại"
                  color={C.text}
                  onPress={() => {
                    closeMessageActions();
                    void startCall(message.callMode ?? 'audio');
                  }}
                  disabled={Boolean(callingMode)}
                />
              )}
              {supportsQuickInteractions && (
                <ActionRow
                  icon="return-up-back-outline"
                  label="Trả lời"
                  color={C.text}
                  onPress={() => startReplyToMessage(message)}
                />
              )}
              {canOpenAttachment && (
                <ActionRow
                  icon={attachmentAction.icon}
                  label={attachmentAction.label}
                  color={C.text}
                  onPress={() => openMessageAttachment(message)}
                />
              )}
              {canPin && (
                <ActionRow
                  icon={isPinned ? 'bookmark' : 'bookmark-outline'}
                  label={isPinned ? 'Bỏ ghim' : 'Ghim'}
                  color={C.text}
                  onPress={() => toggleMessagePin(message)}
                  disabled={loading}
                />
              )}
              {canForward && (
                <ActionRow
                  icon="arrow-redo-outline"
                  label="Chuyển tiếp"
                  color={C.text}
                  onPress={() => openForwardPicker(message)}
                  disabled={loading}
                />
              )}
              {canCopy && (
                <ActionRow
                  icon="copy-outline"
                  label="Sao chép"
                  color={C.text}
                  onPress={() => copyMessageContent(message)}
                  disabled={loading}
                />
              )}
              {hasReactions && (
                <ActionRow
                  icon="happy-outline"
                  label="Xem biểu cảm"
                  color={C.text}
                  onPress={() => {
                    closeMessageActions();
                    setReactionDetailsFilter(null);
                    setReactionDetailsMessage(message);
                  }}
                />
              )}
              {canEdit && (
                <ActionRow
                  icon="create-outline"
                  label="Sửa tin nhắn"
                  color={C.text}
                  onPress={() => startEditMessage(message)}
                />
              )}
              <ActionRow
                icon="trash-outline"
                label={recallActionLabel}
                color="#ef4444"
                onPress={() => openRecallOptions(message)}
                disabled={loading}
              />
              {canReport && (
                <ActionRow
                  icon="flag-outline"
                  label="Báo cáo"
                  color="#ef4444"
                  onPress={() => openReportOptions(message)}
                  disabled={loading}
                />
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderRecallOptionsModal = () => {
    const message = recallTargetSource;
    if (!message) return null;

    const canRecallEveryone =
      message.senderId === user?.uid &&
      message.type !== 'call_log' &&
      !messageWasRecalled(message);
    const loading = messageActionLoadingId === message.id;
    const selectedAudience: RecallAudience = recallAudience === 'everyone' && canRecallEveryone
      ? 'everyone'
      : 'self';

    const renderRecallOption = (
      audience: RecallAudience,
      icon: keyof typeof Ionicons.glyphMap,
      titleText: string,
      description: string
    ) => {
      const selected = selectedAudience === audience;
      return (
        <TouchableOpacity
          style={[
            s.recallOption,
            {
              borderColor: selected ? C.accent : C.border,
              backgroundColor: selected ? C.soft : C.card,
            },
          ]}
          activeOpacity={0.78}
          disabled={loading}
          onPress={() => setRecallAudience(audience)}
        >
          <View style={[
            s.recallRadio,
            { borderColor: selected ? C.accent : C.subtext },
          ]}>
            {selected ? <View style={[s.recallRadioDot, { backgroundColor: C.accent }]} /> : null}
          </View>
          <View style={[s.pinnedRowIcon, { backgroundColor: C.soft }]}>
            <Ionicons name={icon} size={18} color={audience === 'everyone' ? '#ef4444' : C.accent} />
          </View>
          <View style={s.recallOptionCopy}>
            <Text style={[s.recallOptionTitle, { color: C.text }]} numberOfLines={1}>
              {titleText}
            </Text>
            <Text style={[s.recallOptionText, { color: C.subtext }]} numberOfLines={3}>
              {description}
            </Text>
          </View>
        </TouchableOpacity>
      );
    };

    return (
      <Modal visible transparent animationType="fade" onRequestClose={closeRecallOptions}>
        <Pressable style={s.modalBackdrop} onPress={closeRecallOptions}>
          <Pressable style={[s.forwardSheet, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.actionHandle} />
            <View style={s.forwardHeader}>
              <View style={s.forwardHeaderCopy}>
                <Text style={[s.sheetTitle, { color: C.text }]}>Gỡ tin nhắn</Text>
                <Text style={[s.sheetSubtitle, { color: C.subtext }]} numberOfLines={2}>
                  {getSenderNameForMessage(message)}: {messageWasRecalled(message) ? 'Tin nhắn đã được thu hồi' : getReplySnippet(message)}
                </Text>
              </View>
              <TouchableOpacity style={[s.forwardCloseBtn, { backgroundColor: C.soft }]} onPress={closeRecallOptions} disabled={loading}>
                <Ionicons name="close" size={18} color={C.subtext} />
              </TouchableOpacity>
            </View>

            <View style={s.recallOptionList}>
              {canRecallEveryone ? renderRecallOption(
                'everyone',
                'refresh-outline',
                'Thu hồi với mọi người',
                'Tin nhắn sẽ biến mất khỏi đoạn chat của tất cả thành viên.'
              ) : null}
              {renderRecallOption(
                'self',
                'trash-outline',
                'Gỡ phía tôi',
                'Tin nhắn chỉ bị xóa khỏi danh sách chat của bạn, người khác vẫn nhìn thấy nếu chưa bị thu hồi.'
              )}
            </View>

            <View style={[s.recallFooter, { borderTopColor: C.border }]}>
              <TouchableOpacity
                style={[s.recallCancel, { backgroundColor: C.soft }]}
                activeOpacity={0.78}
                disabled={loading}
                onPress={closeRecallOptions}
              >
                <Text style={[s.recallCancelText, { color: C.text }]}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.recallSubmit, { backgroundColor: '#ef4444' }]}
                activeOpacity={0.82}
                disabled={loading}
                onPress={() => {
                  void confirmRecallSelection();
                }}
              >
                {loading ? (
                  <ActivityIndicator size={16} color="#fff" />
                ) : (
                  <Text style={s.recallSubmitText}>
                    {selectedAudience === 'everyone' ? 'Thu hồi' : 'Gỡ'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderReportMessageModal = () => {
    const message = reportTargetSource;
    if (!message) return null;

    const loading = messageActionLoadingId === message.id;
    const canSubmit = reportReason.trim().length > 0 && !loading;

    return (
      <Modal visible transparent animationType="fade" onRequestClose={closeReportOptions}>
        <Pressable style={s.modalBackdrop} onPress={closeReportOptions}>
          <Pressable style={[s.forwardSheet, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.actionHandle} />
            <View style={s.forwardHeader}>
              <View style={s.forwardHeaderCopy}>
                <Text style={[s.sheetTitle, { color: C.text }]}>Báo cáo tin nhắn</Text>
                <Text style={[s.sheetSubtitle, { color: C.subtext }]} numberOfLines={2}>
                  {getSenderNameForMessage(message)}: {messageWasRecalled(message) ? 'Tin nhắn đã được thu hồi' : getReplySnippet(message)}
                </Text>
              </View>
              <TouchableOpacity style={[s.forwardCloseBtn, { backgroundColor: C.soft }]} onPress={closeReportOptions} disabled={loading}>
                <Ionicons name="close" size={18} color={C.subtext} />
              </TouchableOpacity>
            </View>

            <View style={s.reportReasonGrid}>
              {REPORT_REASON_OPTIONS.map(reason => {
                const selected = reportReason.trim() === reason;
                return (
                  <TouchableOpacity
                    key={`report-reason-${reason}`}
                    style={[
                      s.reportReasonChip,
                      {
                        borderColor: selected ? C.accent : C.border,
                        backgroundColor: selected ? C.soft : C.card,
                      },
                    ]}
                    activeOpacity={0.78}
                    disabled={loading}
                    onPress={() => setReportReason(reason)}
                  >
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={selected ? C.accent : C.subtext}
                    />
                    <Text style={[s.reportReasonText, { color: selected ? C.accent : C.text }]}>
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[s.reportInputBox, { backgroundColor: C.soft, borderColor: C.border }]}>
              <Ionicons name="create-outline" size={17} color={C.subtext} />
              <TextInput
                style={[s.reportInput, { color: C.text }]}
                value={reportReason}
                onChangeText={setReportReason}
                placeholder="Nhập lý do khác..."
                placeholderTextColor={C.subtext}
                multiline
                maxLength={240}
                editable={!loading}
              />
            </View>

            <View style={[s.recallFooter, { borderTopColor: C.border }]}>
              <TouchableOpacity
                style={[s.recallCancel, { backgroundColor: C.soft }]}
                activeOpacity={0.78}
                disabled={loading}
                onPress={closeReportOptions}
              >
                <Text style={[s.recallCancelText, { color: C.text }]}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.recallSubmit, { backgroundColor: canSubmit ? '#ef4444' : C.border }]}
                activeOpacity={0.82}
                disabled={!canSubmit}
                onPress={() => {
                  void submitReportMessage();
                }}
              >
                {loading ? (
                  <ActivityIndicator size={16} color="#fff" />
                ) : (
                  <Text style={s.recallSubmitText}>Báo cáo</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderForwardPicker = () => {
    const message = forwardingMessageSource;
    if (!message) return null;

    const previewText = message.type === 'image'
      ? 'Hình ảnh'
      : normalizeMessageBody(message) || message.text || 'Tin nhắn';

    return (
      <Modal visible transparent animationType="fade" onRequestClose={closeForwardPicker}>
        <Pressable style={s.modalBackdrop} onPress={closeForwardPicker}>
          <Pressable style={[s.forwardSheet, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.actionHandle} />
            <View style={s.forwardHeader}>
              <View style={s.forwardHeaderCopy}>
                <Text style={[s.actionTitle, { color: C.text }]}>Chuyển tiếp</Text>
                <Text style={[s.actionPreview, { color: C.subtext }]} numberOfLines={1}>
                  {previewText}
                </Text>
              </View>
              <TouchableOpacity style={[s.forwardCloseBtn, { backgroundColor: C.soft }]} onPress={closeForwardPicker}>
                <Ionicons name="close" size={18} color={C.subtext} />
              </TouchableOpacity>
            </View>

            {forwardLoading ? (
              <View style={s.forwardLoading}>
                <ActivityIndicator color={C.accent} />
                <Text style={[s.forwardLoadingText, { color: C.subtext }]}>Đang tải hội thoại...</Text>
              </View>
            ) : (
              <FlatList
                data={forwardConversations}
                keyExtractor={item => item.id}
                style={s.forwardList}
                contentContainerStyle={s.forwardListContent}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <View style={s.forwardEmpty}>
                    <Ionicons name="chatbubbles-outline" size={34} color={C.subtext} />
                    <Text style={[s.forwardEmptyText, { color: C.subtext }]}>Chưa có hội thoại để chuyển tiếp</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const titleText = getForwardConversationTitle(item);
                  const avatar = getForwardConversationAvatar(item);
                  const sendingToThis = forwardSendingId === item.id;

                  return (
                    <TouchableOpacity
                      style={[s.forwardRow, { borderBottomColor: C.border }]}
                      activeOpacity={0.76}
                      disabled={Boolean(forwardSendingId)}
                      onPress={() => forwardMessageToConversation(item)}
                    >
                      {avatar ? (
                        <Image source={{ uri: avatar }} style={s.forwardAvatar} />
                      ) : (
                        <View style={[s.forwardAvatarFallback, { backgroundColor: item.type === 'group' ? '#6366f1' : C.accent }]}>
                          {item.type === 'group' ? (
                            <Ionicons name="people" size={21} color="#fff" />
                          ) : (
                            <Text style={s.forwardAvatarInitial}>
                              {titleText.charAt(0).toUpperCase()}
                            </Text>
                          )}
                        </View>
                      )}
                      <View style={s.forwardRowCopy}>
                        <Text style={[s.forwardRowTitle, { color: C.text }]} numberOfLines={1}>
                          {titleText}
                        </Text>
                        <Text style={[s.forwardRowSub, { color: C.subtext }]} numberOfLines={1}>
                          {item.marketplace ? 'Surf Market' : item.lastMessagePreview || 'Bắt đầu trò chuyện'}
                        </Text>
                      </View>
                      <View style={[s.forwardSendBtn, { backgroundColor: sendingToThis ? C.border : C.accent }]}>
                        {sendingToThis ? (
                          <ActivityIndicator size={14} color="#fff" />
                        ) : (
                          <Ionicons name="send" size={15} color="#fff" />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderPinnedMessagesModal = () => {
    if (!pinnedListOpen) return null;

    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setPinnedListOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setPinnedListOpen(false)}>
          <Pressable style={[s.utilitySheet, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.actionHandle} />
            <View style={s.sheetTitleRow}>
              <View style={s.sheetTitleCopy}>
                <Text style={[s.sheetTitle, { color: C.text }]}>Tin nhắn đã ghim</Text>
                <Text style={[s.sheetSubtitle, { color: C.subtext }]}>
                  {pinnedMessages.length} tin trong cuộc trò chuyện này
                </Text>
              </View>
              <TouchableOpacity style={[s.forwardCloseBtn, { backgroundColor: C.soft }]} onPress={() => setPinnedListOpen(false)}>
                <Ionicons name="close" size={18} color={C.subtext} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={pinnedMessages}
              keyExtractor={item => `pinned-${item.id}`}
              style={s.utilityList}
              contentContainerStyle={s.utilityListContent}
              ListEmptyComponent={
                <View style={s.utilityEmpty}>
                  <Ionicons name="bookmark-outline" size={34} color={C.subtext} />
                  <Text style={[s.utilityEmptyText, { color: C.subtext }]}>Chưa có tin nhắn ghim</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isOwn = item.senderId === user?.uid;
                return (
                  <TouchableOpacity
                    style={[s.pinnedRow, { borderBottomColor: C.border }]}
                    activeOpacity={0.76}
                    onPress={() => {
                      setPinnedListOpen(false);
                      const index = messages.findIndex(message => message.id === item.id);
                      if (index >= 0) {
                        scrollToMessageIndex(index, item.id);
                      }
                    }}
                  >
                    <View style={[s.pinnedRowIcon, { backgroundColor: C.soft }]}>
                      <Ionicons name="bookmark" size={16} color={C.accent} />
                    </View>
                    <View style={s.pinnedRowCopy}>
                      <Text style={[s.pinnedRowTitle, { color: C.text }]} numberOfLines={1}>
                        {isOwn ? 'Bạn' : getSenderNameForMessage(item)}
                      </Text>
                      <Text style={[s.pinnedRowText, { color: C.subtext }]} numberOfLines={2}>
                        {messageWasRecalled(item) ? 'Tin nhắn đã được thu hồi' : getReplySnippet(item)}
                      </Text>
                    </View>
                    <Text style={[s.pinnedRowTime, { color: C.subtext }]}>{formatTime(item.createdAt, locale)}</Text>
                    <TouchableOpacity
                      style={[s.pinnedRowUnpin, { backgroundColor: C.soft }]}
                      activeOpacity={0.76}
                      disabled={messageActionLoadingId === item.id}
                      onPress={(event) => {
                        event.stopPropagation?.();
                        void toggleMessagePin(item);
                      }}
                    >
                      {messageActionLoadingId === item.id ? (
                        <ActivityIndicator size={14} color={C.accent} />
                      ) : (
                        <Ionicons name="bookmark-outline" size={16} color={C.accent} />
                      )}
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderReactionDetailsModal = () => {
    const message = reactionDetailsSource;
    if (!message) return null;

    const groups = getReactionGroups(message);
    const actors = getReactionActors(message, reactionDetailsFilter);
    if (groups.length === 0) return null;

    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => {
          setReactionDetailsMessage(null);
          setReactionDetailsFilter(null);
        }}
      >
        <Pressable
          style={s.modalBackdrop}
          onPress={() => {
            setReactionDetailsMessage(null);
            setReactionDetailsFilter(null);
          }}
        >
          <Pressable style={[s.utilitySheet, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.actionHandle} />
            <View style={s.sheetTitleRow}>
              <View style={s.sheetTitleCopy}>
                <Text style={[s.sheetTitle, { color: C.text }]}>Biểu cảm</Text>
                <Text style={[s.sheetSubtitle, { color: C.subtext }]} numberOfLines={1}>
                  {getReplySnippet(message)}
                </Text>
              </View>
              <TouchableOpacity
                style={[s.forwardCloseBtn, { backgroundColor: C.soft }]}
                onPress={() => {
                  setReactionDetailsMessage(null);
                  setReactionDetailsFilter(null);
                }}
              >
                <Ionicons name="close" size={18} color={C.subtext} />
              </TouchableOpacity>
            </View>

            <View style={s.reactionFilterRow}>
              <TouchableOpacity
                style={[
                  s.reactionFilterChip,
                  { borderColor: reactionDetailsFilter === null ? C.accent : C.border, backgroundColor: reactionDetailsFilter === null ? C.soft : 'transparent' },
                ]}
                onPress={() => setReactionDetailsFilter(null)}
                activeOpacity={0.76}
              >
                <Text style={[s.reactionFilterText, { color: reactionDetailsFilter === null ? C.accent : C.subtext }]}>
                  Tất cả
                </Text>
              </TouchableOpacity>
              {groups.map(group => (
                <TouchableOpacity
                  key={`reaction-detail-filter-${group.emoji}`}
                  style={[
                    s.reactionFilterChip,
                    { borderColor: reactionDetailsFilter === group.emoji ? C.accent : C.border, backgroundColor: reactionDetailsFilter === group.emoji ? C.soft : 'transparent' },
                  ]}
                  onPress={() => setReactionDetailsFilter(group.emoji)}
                  activeOpacity={0.76}
                >
                  <Text style={s.reactionFilterEmoji}>{group.emoji}</Text>
                  <Text style={[s.reactionFilterText, { color: reactionDetailsFilter === group.emoji ? C.accent : C.subtext }]}>
                    {group.count}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <FlatList
              data={actors}
              keyExtractor={item => `${item.uid}-${item.emoji}`}
              style={s.utilityList}
              contentContainerStyle={s.utilityListContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.reactionActorRow, { borderBottomColor: C.border }]}
                  activeOpacity={item.uid === user?.uid ? 0.76 : 1}
                  disabled={item.uid !== user?.uid || messageActionLoadingId === message.id}
                  onPress={() => {
                    if (item.uid !== user?.uid) return;
                    if (reactionDetailsFilter === item.emoji) setReactionDetailsFilter(null);
                    void toggleMessageReaction(message, item.emoji);
                  }}
                >
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={s.reactionActorAvatar} />
                  ) : (
                    <View style={[s.reactionActorAvatarFallback, { backgroundColor: C.accent }]}>
                      <Text style={s.reactionActorInitial}>
                        {(item.uid === user?.uid ? 'B' : item.name || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={s.reactionActorCopy}>
                    <Text style={[s.reactionActorName, { color: C.text }]} numberOfLines={1}>
                      {item.uid === user?.uid ? 'Bạn' : item.name || 'Người dùng'}
                    </Text>
                    {item.uid === user?.uid ? (
                      <Text style={[s.reactionActorHint, { color: C.subtext }]}>
                        Chạm để gỡ biểu cảm
                      </Text>
                    ) : null}
                  </View>
                  {messageActionLoadingId === message.id && item.uid === user?.uid ? (
                    <ActivityIndicator size={18} color={C.accent} />
                  ) : (
                    <Text style={s.reactionActorEmoji}>{item.emoji}</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderMessageSearchModal = () => {
    if (!messageSearchOpen) return null;

    const query = messageSearchQuery.trim();
    const showError = query.length > 0 && !messageSearchLoading && Boolean(messageSearchError);
    const showEmpty = query.length > 0 && !messageSearchLoading && !messageSearchError && messageSearchResults.length === 0;

    return (
      <Modal visible transparent animationType="fade" onRequestClose={closeMessageSearch}>
        <Pressable style={s.modalBackdrop} onPress={closeMessageSearch}>
          <Pressable style={[s.utilitySheet, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.actionHandle} />
            <View style={s.sheetTitleRow}>
              <View style={s.sheetTitleCopy}>
                <Text style={[s.sheetTitle, { color: C.text }]}>Tìm trong cuộc trò chuyện</Text>
                <Text style={[s.sheetSubtitle, { color: C.subtext }]}>Tìm nội dung, file hoặc tin đã gửi</Text>
              </View>
              <TouchableOpacity style={[s.forwardCloseBtn, { backgroundColor: C.soft }]} onPress={closeMessageSearch}>
                <Ionicons name="close" size={18} color={C.subtext} />
              </TouchableOpacity>
            </View>

            <View style={[s.searchBox, { backgroundColor: C.soft, borderColor: C.border }]}>
              <Ionicons name="search" size={17} color={C.subtext} />
              <TextInput
                style={[s.searchInput, { color: C.text }]}
                value={messageSearchQuery}
                onChangeText={setMessageSearchQuery}
                placeholder="Nhập từ khóa..."
                placeholderTextColor={C.subtext}
                autoFocus
                returnKeyType="search"
              />
              {messageSearchQuery ? (
                <TouchableOpacity
                  style={s.searchClearButton}
                  activeOpacity={0.75}
                  onPress={() => {
                    setMessageSearchQuery('');
                    setMessageSearchResults([]);
                    setMessageSearchError(null);
                  }}
                >
                  <Ionicons name="close-circle" size={18} color={C.subtext} />
                </TouchableOpacity>
              ) : null}
              {messageSearchLoading ? <ActivityIndicator size={16} color={C.accent} /> : null}
            </View>

            <FlatList
              data={messageSearchResults}
              keyExtractor={item => `search-${item.id}`}
              style={s.utilityList}
              contentContainerStyle={s.utilityListContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                query.length === 0 ? (
                  <View style={s.utilityEmpty}>
                    <Ionicons name="search-outline" size={34} color={C.subtext} />
                    <Text style={[s.utilityEmptyText, { color: C.subtext }]}>Nhập từ khóa để tìm tin nhắn</Text>
                  </View>
                ) : showError ? (
                  <View style={s.utilityEmpty}>
                    <Ionicons name="alert-circle-outline" size={34} color="#ef4444" />
                    <Text style={[s.utilityEmptyText, { color: '#ef4444' }]}>
                      {messageSearchError}
                    </Text>
                  </View>
                ) : showEmpty ? (
                  <View style={s.utilityEmpty}>
                    <Ionicons name="file-tray-outline" size={34} color={C.subtext} />
                    <Text style={[s.utilityEmptyText, { color: C.subtext }]}>Không tìm thấy kết quả</Text>
                  </View>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.searchResultRow, { borderBottomColor: C.border }]}
                  activeOpacity={0.76}
                  onPress={() => openMessageFromSearch(item)}
                >
                  <View style={[s.searchResultIcon, { backgroundColor: C.soft }]}>
                    <Ionicons
                      name={item.type === 'image' ? 'image-outline' : item.type === 'file' ? 'document-text-outline' : item.type === 'audio' ? 'mic-outline' : 'chatbubble-outline'}
                      size={17}
                      color={C.accent}
                    />
                  </View>
                  <View style={s.searchResultCopy}>
                    <Text style={[s.searchResultTitle, { color: C.text }]} numberOfLines={1}>
                      {getSenderNameForMessage(item)}
                    </Text>
                    <Text style={[s.searchResultText, { color: C.subtext }]} numberOfLines={2}>
                      {messageWasRecalled(item) ? 'Tin nhắn đã được thu hồi' : getReplySnippet(item)}
                    </Text>
                  </View>
                  <Text style={[s.searchResultTime, { color: C.subtext }]}>{formatTime(item.createdAt, locale)}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderConversationInfoModal = () => {
    if (!conversationInfoOpen) return null;

    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setConversationInfoOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setConversationInfoOpen(false)}>
          <Pressable style={[s.utilitySheet, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.actionHandle} />
            <View style={s.sheetTitleRow}>
              <View style={s.sheetTitleCopy}>
                <Text style={[s.sheetTitle, { color: C.text }]}>Thông tin trò chuyện</Text>
                <Text style={[s.sheetSubtitle, { color: C.subtext }]} numberOfLines={1}>{title}</Text>
              </View>
              <TouchableOpacity style={[s.forwardCloseBtn, { backgroundColor: C.soft }]} onPress={() => setConversationInfoOpen(false)}>
                <Ionicons name="close" size={18} color={C.subtext} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={[{ key: 'content' }]}
              keyExtractor={item => item.key}
              style={s.utilityList}
              contentContainerStyle={s.infoContent}
              renderItem={() => (
                <View style={s.infoSections}>
                  <View style={[s.infoHero, { backgroundColor: C.soft, borderColor: C.border }]}>
                    {peerAvatar ? (
                      <Image source={{ uri: peerAvatar }} style={s.infoAvatar} />
                    ) : (
                      <View style={[s.infoAvatarFallback, { backgroundColor: C.accent }]}>
                        <Text style={s.infoAvatarInitial}>{(title || '?').charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={s.infoHeroCopy}>
                      <Text style={[s.infoHeroTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
                      <Text style={[s.infoHeroSub, { color: C.subtext }]} numberOfLines={1}>
                        {isGroupConversation
                          ? `${routeMemberCount ?? conversationMembers.length} thành viên`
                          : peerName || 'Cuộc trò chuyện Surf'}
                      </Text>
                    </View>
                  </View>

                  <View style={s.infoActionGrid}>
                    <TouchableOpacity
                      style={[s.infoActionButton, { backgroundColor: C.soft, borderColor: C.border }]}
                      activeOpacity={0.78}
                      onPress={toggleConversationMute}
                    >
                      <View style={[s.infoActionIcon, { backgroundColor: C.card }]}>
                        <Ionicons
                          name={conversationMuted ? 'notifications-outline' : 'notifications-off-outline'}
                          size={19}
                          color={C.accent}
                        />
                      </View>
                      <Text style={[s.infoActionText, { color: C.text }]} numberOfLines={2}>
                        {conversationMuted ? 'Bật thông báo' : 'Tắt thông báo'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.infoActionButton, { backgroundColor: C.soft, borderColor: C.border }]}
                      activeOpacity={0.78}
                      onPress={() => {
                        setConversationInfoOpen(false);
                        setMessageSearchOpen(true);
                      }}
                    >
                      <View style={[s.infoActionIcon, { backgroundColor: C.card }]}>
                        <Ionicons name="search-outline" size={19} color={C.accent} />
                      </View>
                      <Text style={[s.infoActionText, { color: C.text }]} numberOfLines={2}>
                        Tìm tin nhắn
                      </Text>
                    </TouchableOpacity>
                    {isGroupConversation ? (
                      <TouchableOpacity
                        style={[s.infoActionButton, { backgroundColor: C.soft, borderColor: C.border }]}
                        activeOpacity={0.78}
                        onPress={openInviteMembersSheet}
                      >
                        <View style={[s.infoActionIcon, { backgroundColor: C.card }]}>
                          <Ionicons name="person-add-outline" size={19} color={C.accent} />
                        </View>
                        <Text style={[s.infoActionText, { color: C.text }]} numberOfLines={2}>
                          Mời
                        </Text>
                      </TouchableOpacity>
                    ) : !marketplace && peerUid ? (
                      <TouchableOpacity
                        style={[s.infoActionButton, { backgroundColor: C.soft, borderColor: C.border }]}
                        activeOpacity={0.78}
                        onPress={openCreateGroupSheet}
                      >
                        <View style={[s.infoActionIcon, { backgroundColor: C.card }]}>
                          <Ionicons name="people-outline" size={19} color={C.accent} />
                        </View>
                        <Text style={[s.infoActionText, { color: C.text }]} numberOfLines={2}>
                          Tạo nhóm
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[s.infoActionButton, { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.28)' }]}
                      activeOpacity={0.78}
                      onPress={deleteConversationHistory}
                    >
                      <View style={[s.infoActionIcon, { backgroundColor: 'rgba(239,68,68,0.14)' }]}>
                        <Ionicons name="trash-outline" size={19} color="#ef4444" />
                      </View>
                      <Text style={[s.infoActionText, { color: '#ef4444' }]} numberOfLines={2}>
                        Xóa lịch sử
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {isGroupConversation && conversationMembers.length > 0 ? (
                    <View style={s.infoSectionBlock}>
                      <TouchableOpacity
                        style={s.infoSectionTitleRow}
                        activeOpacity={0.78}
                        onPress={() => toggleInfoSection('members')}
                      >
                        <Text style={[s.infoSectionTitle, { color: C.text }]}>
                          Thành viên
                        </Text>
                        <View style={s.infoSectionMeta}>
                          <Text style={[s.infoSectionCount, { color: C.accent }]}>
                            {routeMemberCount ?? conversationMembers.length}
                          </Text>
                          <Ionicons
                            name={infoSectionsOpen.members ? 'chevron-up' : 'chevron-down'}
                            size={17}
                            color={C.subtext}
                          />
                        </View>
                      </TouchableOpacity>
                      {infoSectionsOpen.members ? (
                        <View style={[s.memberListCard, { backgroundColor: C.soft, borderColor: C.border }]}>
                          {conversationMembers.map(member => (
                            <TouchableOpacity
                              key={`group-member-${member.uid}`}
                              style={[s.memberRow, { borderBottomColor: C.border }]}
                              activeOpacity={0.78}
                              onPress={() => {
                                setConversationInfoOpen(false);
                                navigation.navigate('Profile', { userId: member.uid });
                              }}
                            >
                              {member.avatarUrl ? (
                                <Image source={{ uri: member.avatarUrl }} style={s.memberAvatar} />
                              ) : (
                                <View style={[s.memberAvatarFallback, { backgroundColor: C.accent }]}>
                                  <Text style={s.memberAvatarInitial}>{(member.name || '?').charAt(0).toUpperCase()}</Text>
                                </View>
                              )}
                              <Text style={[s.memberName, { color: C.text }]} numberOfLines={1}>
                                {member.name}
                              </Text>
                              <Ionicons name="chevron-forward" size={16} color={C.subtext} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : (
                        <Text style={[s.infoEmptyText, { color: C.subtext }]}>
                          Chạm để xem danh sách thành viên.
                        </Text>
                      )}
                    </View>
                  ) : null}

                  <View style={s.infoSectionBlock}>
                    <TouchableOpacity
                      style={s.infoSectionTitleRow}
                      activeOpacity={0.78}
                      onPress={() => toggleInfoSection('media')}
                    >
                      <Text style={[s.infoSectionTitle, { color: C.text }]}>Ảnh & video</Text>
                      <View style={s.infoSectionMeta}>
                        <Text style={[s.infoSectionCount, { color: C.accent }]}>{sharedMedia.length}</Text>
                        <Ionicons
                          name={infoSectionsOpen.media ? 'chevron-up' : 'chevron-down'}
                          size={17}
                          color={C.subtext}
                        />
                      </View>
                    </TouchableOpacity>
                    {infoSectionsOpen.media ? (
                      sharedMedia.length > 0 ? (
                        <View style={s.sharedMediaGrid}>
                          {sharedMedia.slice(0, 6).map(item => (
                            <TouchableOpacity
                              key={`shared-media-${item.url}`}
                              style={[s.sharedMediaTile, { backgroundColor: C.soft }]}
                              activeOpacity={0.82}
                              onPress={() => {
                                if (item.mediaType === 'image') {
                                  setConversationInfoOpen(false);
                                  setMediaPreview({ url: item.url, title: item.label });
                                } else {
                                  openExternalUrl(item.url, 'Không thể mở video');
                                }
                              }}
                            >
                              {item.mediaType === 'image' ? (
                                <Image source={{ uri: item.url }} style={s.sharedMediaImage} resizeMode="cover" />
                              ) : (
                                <View style={s.sharedVideoTile}>
                                  <Ionicons name="play-circle" size={34} color="#fff" />
                                </View>
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : (
                        <Text style={[s.infoEmptyText, { color: C.subtext }]}>Chưa có ảnh hoặc video nào.</Text>
                      )
                    ) : (
                      <Text style={[s.infoEmptyText, { color: C.subtext }]}>Chạm để xem media đã chia sẻ.</Text>
                    )}
                  </View>

                  <View style={s.infoSectionBlock}>
                    <TouchableOpacity
                      style={s.infoSectionTitleRow}
                      activeOpacity={0.78}
                      onPress={() => toggleInfoSection('files')}
                    >
                      <Text style={[s.infoSectionTitle, { color: C.text }]}>File</Text>
                      <View style={s.infoSectionMeta}>
                        <Text style={[s.infoSectionCount, { color: C.accent }]}>{sharedFiles.length}</Text>
                        <Ionicons
                          name={infoSectionsOpen.files ? 'chevron-up' : 'chevron-down'}
                          size={17}
                          color={C.subtext}
                        />
                      </View>
                    </TouchableOpacity>
                    {infoSectionsOpen.files ? (
                      sharedFiles.length > 0 ? (
                        sharedFiles.slice(0, 5).map(item => (
                          <TouchableOpacity
                            key={`shared-file-${item.url}`}
                            style={[s.sharedRow, { backgroundColor: C.soft, borderColor: C.border }]}
                            activeOpacity={0.78}
                            onPress={() => openExternalUrl(item.url, 'Không thể mở tệp')}
                          >
                            <View style={[s.sharedRowIcon, { backgroundColor: C.card }]}>
                              <Ionicons name="document-text-outline" size={18} color={C.accent} />
                            </View>
                            <View style={s.sharedRowCopy}>
                              <Text style={[s.sharedRowTitle, { color: C.text }]} numberOfLines={1}>{item.label}</Text>
                              <Text style={[s.sharedRowSub, { color: C.subtext }]} numberOfLines={1}>{item.hostname}</Text>
                            </View>
                          </TouchableOpacity>
                        ))
                      ) : (
                        <Text style={[s.infoEmptyText, { color: C.subtext }]}>Chưa có tệp nào được chia sẻ.</Text>
                      )
                    ) : (
                      <Text style={[s.infoEmptyText, { color: C.subtext }]}>Chạm để xem file đã chia sẻ.</Text>
                    )}
                  </View>

                  <View style={s.infoSectionBlock}>
                    <TouchableOpacity
                      style={s.infoSectionTitleRow}
                      activeOpacity={0.78}
                      onPress={() => toggleInfoSection('links')}
                    >
                      <Text style={[s.infoSectionTitle, { color: C.text }]}>Link</Text>
                      <View style={s.infoSectionMeta}>
                        <Text style={[s.infoSectionCount, { color: C.accent }]}>{sharedPages.length}</Text>
                        <Ionicons
                          name={infoSectionsOpen.links ? 'chevron-up' : 'chevron-down'}
                          size={17}
                          color={C.subtext}
                        />
                      </View>
                    </TouchableOpacity>
                    {infoSectionsOpen.links ? (
                      sharedPages.length > 0 ? (
                        sharedPages.slice(0, 5).map(item => (
                          <TouchableOpacity
                            key={`shared-link-${item.url}`}
                            style={[s.sharedRow, { backgroundColor: C.soft, borderColor: C.border }]}
                            activeOpacity={0.78}
                            onPress={() => openExternalUrl(item.url)}
                          >
                            <View style={[s.sharedRowIcon, { backgroundColor: C.card }]}>
                              <Ionicons name="link-outline" size={18} color={C.accent} />
                            </View>
                            <View style={s.sharedRowCopy}>
                              <Text style={[s.sharedRowTitle, { color: C.text }]} numberOfLines={1}>{item.label}</Text>
                              <Text style={[s.sharedRowSub, { color: C.subtext }]} numberOfLines={1}>{item.url}</Text>
                            </View>
                          </TouchableOpacity>
                        ))
                      ) : (
                        <Text style={[s.infoEmptyText, { color: C.subtext }]}>Chưa có liên kết nào.</Text>
                      )
                    ) : (
                      <Text style={[s.infoEmptyText, { color: C.subtext }]}>Chạm để xem liên kết đã chia sẻ.</Text>
                    )}
                  </View>

                  <View style={s.infoSectionBlock}>
                    <TouchableOpacity
                      style={s.infoSectionTitleRow}
                      activeOpacity={0.78}
                      onPress={() => toggleInfoSection('security')}
                    >
                      <Text style={[s.infoSectionTitle, { color: C.text }]}>Thiết lập bảo mật</Text>
                      <View style={s.infoSectionMeta}>
                        <Text style={[s.infoSectionCount, { color: C.subtext }]}>Off</Text>
                        <Ionicons
                          name={infoSectionsOpen.security ? 'chevron-up' : 'chevron-down'}
                          size={17}
                          color={C.subtext}
                        />
                      </View>
                    </TouchableOpacity>
                    {infoSectionsOpen.security ? (
                      <View style={[s.securityRow, { backgroundColor: C.soft, borderColor: C.border }]}>
                        <View style={[s.sharedRowIcon, { backgroundColor: C.card }]}>
                          <Ionicons name="timer-outline" size={18} color={C.accent} />
                        </View>
                        <View style={s.sharedRowCopy}>
                          <Text style={[s.sharedRowTitle, { color: C.text }]}>Tin nhắn tự xóa</Text>
                          <Text style={[s.sharedRowSub, { color: C.subtext }]}>Không bao giờ</Text>
                        </View>
                        <Text style={[s.securityBadge, { color: C.subtext, backgroundColor: C.card }]}>Off</Text>
                      </View>
                    ) : (
                      <Text style={[s.infoEmptyText, { color: C.subtext }]}>Chạm để xem thiết lập bảo mật.</Text>
                    )}
                  </View>
                </View>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderInviteMembersModal = () => {
    if (!inviteMembersOpen) return null;

    const creatingGroup = memberPickerMode === 'create';
    const submitDisabled =
      inviteSending ||
      selectedInviteMemberIds.length === 0 ||
      (creatingGroup && !newGroupTitle.trim());
    const nextGroupMemberCount = selectedInviteMemberIds.length + (peerUid ? 2 : 1);

    return (
      <Modal visible transparent animationType="fade" onRequestClose={closeInviteMembersSheet}>
        <Pressable style={s.modalBackdrop} onPress={closeInviteMembersSheet}>
          <Pressable style={[s.utilitySheet, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.actionHandle} />
            <View style={s.sheetTitleRow}>
              <View style={s.sheetTitleCopy}>
                <Text style={[s.sheetTitle, { color: C.text }]}>
                  {creatingGroup ? 'Tạo nhóm trò chuyện' : 'Mời thành viên'}
                </Text>
                <Text style={[s.sheetSubtitle, { color: C.subtext }]} numberOfLines={1}>
                  {creatingGroup
                    ? `Giữ ${peerName || title} trong nhóm và chọn thêm bạn bè`
                    : `Chọn bạn bè để thêm vào ${title}`}
                </Text>
              </View>
              <TouchableOpacity
                style={[s.forwardCloseBtn, { backgroundColor: C.soft }]}
                onPress={closeInviteMembersSheet}
                disabled={inviteSending}
              >
                <Ionicons name="close" size={18} color={C.subtext} />
              </TouchableOpacity>
            </View>

            {creatingGroup ? (
              <View style={[s.groupNameBox, { backgroundColor: C.soft, borderColor: C.border }]}>
                <Ionicons name="people" size={17} color={C.subtext} />
                <TextInput
                  style={[s.groupNameInput, { color: C.text }]}
                  value={newGroupTitle}
                  onChangeText={setNewGroupTitle}
                  placeholder="Tên nhóm..."
                  placeholderTextColor={C.subtext}
                  returnKeyType="next"
                />
              </View>
            ) : null}

            <View style={[s.searchBox, { backgroundColor: C.soft, borderColor: C.border }]}>
              <Ionicons name="search" size={17} color={C.subtext} />
              <TextInput
                style={[s.searchInput, { color: C.text }]}
                value={inviteSearch}
                onChangeText={setInviteSearch}
                placeholder="Tìm bạn bè..."
                placeholderTextColor={C.subtext}
                returnKeyType="search"
              />
              {friendsLoading ? <ActivityIndicator size={16} color={C.accent} /> : null}
            </View>

            <FlatList
              data={availableInviteFriends}
              keyExtractor={item => `invite-friend-${item.id}`}
              style={s.inviteList}
              contentContainerStyle={s.inviteListContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={s.utilityEmpty}>
                  <Ionicons name="people-outline" size={34} color={C.subtext} />
                  <Text style={[s.utilityEmptyText, { color: C.subtext }]}>
                    {friendsLoading
                      ? 'Đang tải bạn bè...'
                      : inviteSearch.trim()
                        ? 'Không tìm thấy bạn bè phù hợp'
                        : creatingGroup
                          ? 'Không còn bạn bè nào để thêm vào nhóm'
                          : 'Không còn bạn bè nào để mời'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const selected = selectedInviteMemberIds.includes(item.id);
                return (
                  <TouchableOpacity
                    style={[s.inviteRow, { borderBottomColor: C.border }]}
                    activeOpacity={0.78}
                    disabled={inviteSending}
                    onPress={() => toggleInviteMember(item)}
                  >
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={s.memberAvatar} />
                    ) : (
                      <View style={[s.memberAvatarFallback, { backgroundColor: C.accent }]}>
                        <Text style={s.memberAvatarInitial}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={s.inviteRowCopy}>
                      <Text style={[s.memberName, { color: C.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {typeof item.mutualCount === 'number' && item.mutualCount > 0 ? (
                        <Text style={[s.inviteSub, { color: C.subtext }]} numberOfLines={1}>
                          {item.mutualCount} bạn chung
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        s.inviteCheck,
                        {
                          borderColor: selected ? C.accent : C.border,
                          backgroundColor: selected ? C.accent : 'transparent',
                        },
                      ]}
                    >
                      {selected ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            <View style={[s.inviteFooter, { borderTopColor: C.border }]}>
              <Text style={[s.inviteCount, { color: C.subtext }]}>
                {creatingGroup
                  ? `${nextGroupMemberCount} thành viên trong nhóm`
                  : `${selectedInviteMemberIds.length} đã chọn`}
              </Text>
              <TouchableOpacity
                style={[
                  s.inviteSubmit,
                  { backgroundColor: submitDisabled ? C.border : C.accent },
                ]}
                activeOpacity={0.82}
                disabled={submitDisabled}
                onPress={submitInviteMembers}
              >
                {inviteSending ? (
                  <ActivityIndicator size={16} color="#fff" />
                ) : (
                  <>
                    <Ionicons name={creatingGroup ? 'people' : 'person-add'} size={17} color="#fff" />
                    <Text style={s.inviteSubmitText}>{creatingGroup ? 'Tạo nhóm' : 'Mời'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderMediaPreviewModal = () => {
    if (!mediaPreview) return null;

    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setMediaPreview(null)}>
        <View style={s.mediaPreviewBackdrop}>
          <TouchableOpacity
            style={s.mediaPreviewClose}
            activeOpacity={0.8}
            onPress={() => setMediaPreview(null)}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={s.mediaPreviewHeader}>
            <Text style={s.mediaPreviewTitle} numberOfLines={1}>
              {mediaPreview.title ?? 'Ảnh'}
            </Text>
            <TouchableOpacity
              style={s.mediaPreviewOpen}
              activeOpacity={0.8}
              onPress={() => openExternalUrl(mediaPreview.url, 'Không thể mở ảnh')}
            >
              <Ionicons name="open-outline" size={18} color="#fff" />
              <Text style={s.mediaPreviewOpenText}>Mở</Text>
            </TouchableOpacity>
          </View>
          <Pressable style={s.mediaPreviewBody} onPress={() => setMediaPreview(null)}>
            <Pressable style={s.mediaPreviewFrame}>
              <Image source={{ uri: mediaPreview.url }} style={s.mediaPreviewImage} resizeMode="contain" />
            </Pressable>
          </Pressable>
        </View>
      </Modal>
    );
  };

  // ── Render message ─────────────────────────────────────────────────────────

  const renderMessage = ({ item, index }: { item: ApiMessage; index: number }) => {
    const isOwn = item.senderId === user?.uid;
    const showDateHeader =
      index === messages.length - 1 ||
      new Date(messages[index + 1]?.createdAt).toDateString() !== new Date(item.createdAt).toDateString();

    const isRecalled = messageWasRecalled(item);
    const isCallLog = item.type === 'call_log';
    const parsedReplyQuote = item.text ? parseReplyQuoteFromText(item.text) : null;
    const bodyText = parsedReplyQuote ? parsedReplyQuote.bodyText : normalizeMessageBody(item);
    const isPinned = Boolean(user?.uid && item.pinnedBy?.includes(user.uid));
    const canOpenAttachment = Boolean(
      item.mediaUrl &&
        !isRecalled &&
        (item.type === 'image' || item.type === 'file' || item.type === 'audio')
    );
    const receiptMembers = isOwn ? (readReceiptMembersByMessageId[item.id] ?? []) : [];
    const isHighlighted = highlightedMessageId === item.id;
    const senderName = getSenderNameForMessage(item);
    const senderAvatar = getSenderAvatarForMessage(item);
    const showSenderLabel = !isOwn && (Boolean(marketplace) || !peerUid || conversationMembers.length > 2);

    return (
      <>
        {showDateHeader && (
          <View style={s.dateHeader}>
            <Text style={[s.dateHeaderText, { color: C.subtext }]}>{formatDateHeader(item.createdAt, locale, t)}</Text>
          </View>
        )}
        {isCallLog ? (
          <View style={s.callLogWrap}>
            <TouchableOpacity
              style={[s.callLogPill, { backgroundColor: C.soft, borderColor: C.border }]}
              activeOpacity={canStartCall ? 0.78 : 1}
              delayLongPress={260}
              onPress={() => {
                if (canStartCall) void startCall(item.callMode ?? 'audio');
              }}
              onLongPress={() => openMessageActions(item)}
            >
              <Ionicons
                name={item.callMode === 'video' ? 'videocam-outline' : 'call-outline'}
                size={14}
                color={C.accent}
              />
              <Text style={[s.callLogText, { color: C.subtext }]} numberOfLines={1}>
                {item.text}
              </Text>
              {canStartCall ? (
                <Text style={[s.callLogRetryText, { color: C.accent }]}>Gọi lại</Text>
              ) : null}
            </TouchableOpacity>
          </View>
        ) : (
        <View style={[s.msgRow, isOwn && s.msgRowOwn]}>
          {!isOwn && (
            <TouchableOpacity
              style={s.msgAvatarWrap}
              activeOpacity={0.78}
              onPress={() => navigation.navigate('Profile', { userId: item.senderId })}
            >
              {senderAvatar ? (
                <Image source={{ uri: senderAvatar }} style={s.msgAvatar} />
              ) : (
                <View style={[s.msgAvatar, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{(senderName || '?').charAt(0)}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          <View style={[s.msgStack, isOwn && s.msgStackOwn]}>
            {showSenderLabel ? (
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => navigation.navigate('Profile', { userId: item.senderId })}
              >
                <Text style={[s.senderLabel, { color: C.subtext }]} numberOfLines={1}>
                  {senderName}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[s.bubble, isOwn
                ? [s.bubbleOwn, { backgroundColor: C.ownBubble }]
                : [s.bubbleOther, { backgroundColor: C.otherBubble }],
                isHighlighted && { borderWidth: 2, borderColor: C.accent }
              ]}
              activeOpacity={0.86}
              delayLongPress={260}
              onPress={() => {
                if (canOpenAttachment) {
                  openMessageAttachment(item);
                }
              }}
              onLongPress={() => openMessageActions(item)}
            >
              {isPinned && (
                <View style={s.pinLine}>
                  <Ionicons name="bookmark" size={11} color={isOwn ? 'rgba(255,255,255,0.86)' : C.accent} />
                  <Text style={[s.pinText, { color: isOwn ? 'rgba(255,255,255,0.80)' : C.accent }]}>Đã ghim</Text>
                </View>
              )}
              {item.isForwarded && !isRecalled && (
                <Text style={[s.forwardedText, { color: isOwn ? 'rgba(255,255,255,0.70)' : C.subtext }]}>
                  Đã chuyển tiếp
                </Text>
              )}
              {parsedReplyQuote && !isRecalled && (
                <TouchableOpacity
                  style={[s.replyQuote, { backgroundColor: isOwn ? 'rgba(255,255,255,0.16)' : C.card }]}
                  activeOpacity={0.78}
                  onPress={() => {
                    void jumpToReplyTarget(parsedReplyQuote);
                  }}
                >
                  <Text style={[s.replyQuoteSender, { color: isOwn ? '#fff' : C.accent }]} numberOfLines={1}>
                    {parsedReplyQuote.senderName}
                  </Text>
                  <Text style={[s.replyQuoteText, { color: isOwn ? 'rgba(255,255,255,0.78)' : C.subtext }]} numberOfLines={1}>
                    {parsedReplyQuote.snippet}
                  </Text>
                </TouchableOpacity>
              )}
              {isRecalled ? (
                <Text style={[s.recalledText, { color: isOwn ? 'rgba(255,255,255,0.6)' : C.subtext }]}>
                  {t('chat_recalled')}
                </Text>
              ) : item.type === 'image' && item.mediaUrl ? (
                <Image source={{ uri: item.mediaUrl }} style={s.imgMsg} resizeMode="cover" />
              ) : item.type === 'file' && item.mediaUrl ? (
                isVideoUrl(item.mediaUrl) ? (
                  <View style={s.videoAttachment}>
                    <View style={s.videoAttachmentPreview}>
                      <Ionicons name="play" size={30} color="#fff" />
                    </View>
                    <Text style={[s.videoAttachmentTitle, { color: isOwn ? C.ownText : C.otherText }]} numberOfLines={1}>
                      {item.fileName || 'Video'}
                    </Text>
                    <Text style={[s.attachmentSub, { color: isOwn ? 'rgba(255,255,255,0.72)' : C.subtext }]}>
                      Chạm để mở video
                    </Text>
                  </View>
                ) : (
                  <View style={s.attachmentRow}>
                    <View style={s.attachmentIcon}>
                      <Ionicons name="document-attach-outline" size={20} color={isOwn ? '#fff' : C.accent} />
                    </View>
                    <View style={s.attachmentCopy}>
                      <Text style={[s.attachmentTitle, { color: isOwn ? C.ownText : C.otherText }]} numberOfLines={1}>
                        {item.fileName || 'Tệp đính kèm'}
                      </Text>
                      <Text style={[s.attachmentSub, { color: isOwn ? 'rgba(255,255,255,0.72)' : C.subtext }]}>
                        Chạm để mở
                      </Text>
                    </View>
                  </View>
                )
              ) : item.type === 'audio' && item.mediaUrl ? (
                renderAudioMessage(item, isOwn)
              ) : (
                renderMessageTextContent(bodyText, isOwn)
              )}
              <Text style={[s.msgTime, { color: isOwn ? 'rgba(255,255,255,0.65)' : C.subtext }]}>
                {formatTime(item.createdAt, locale)}{item.editedAt ? ' · đã sửa' : ''}
              </Text>
            </TouchableOpacity>
            {renderReactionSummary(item, isOwn)}
            {renderSeenReceipts(receiptMembers)}
          </View>
        </View>
        )}
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
          <View style={s.headerCopy}>
            <Text style={[s.headerTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
            {headerSubtitle ? (
              <Text style={[s.headerSub, { color: typingText ? C.accent : C.subtext }]} numberOfLines={1}>
                {headerSubtitle}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
        <View style={s.headerActions}>
          <TouchableOpacity
            style={[s.headerIconBtn, { backgroundColor: C.soft }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => setConversationInfoOpen(true)}
          >
            <Ionicons name="information-circle-outline" size={21} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.headerIconBtn, { backgroundColor: C.soft }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => setMessageSearchOpen(true)}
          >
            <Ionicons name="search-outline" size={20} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.headerIconBtn, { backgroundColor: C.soft }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => startCall('audio')}
            disabled={!canStartCall || Boolean(callingMode)}
          >
            {callingMode === 'audio' ? (
              <ActivityIndicator size={16} color={C.accent} />
            ) : (
              <Ionicons name="call-outline" size={20} color={C.text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.headerIconBtn, { backgroundColor: C.soft }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => startCall('video')}
            disabled={!canStartCall || Boolean(callingMode)}
          >
            {callingMode === 'video' ? (
              <ActivityIndicator size={16} color={C.accent} />
            ) : (
              <Ionicons name="videocam-outline" size={21} color={C.text} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {latestPinnedMessage ? (
        <TouchableOpacity
          style={[s.pinnedBar, { backgroundColor: C.card, borderBottomColor: C.border }]}
          activeOpacity={0.82}
          onPress={() => {
            if (pinnedMessages.length === 1) {
              const index = messages.findIndex(message => message.id === latestPinnedMessage.id);
              if (index >= 0) scrollToMessageIndex(index, latestPinnedMessage.id);
              return;
            }
            setPinnedListOpen(true);
          }}
        >
          <View style={[s.pinnedIcon, { backgroundColor: C.soft }]}>
            <Ionicons name="bookmark" size={15} color={C.accent} />
          </View>
          <View style={s.pinnedCopy}>
            <Text style={[s.pinnedTitle, { color: C.text }]}>Tin nhắn đã ghim</Text>
            <Text style={[s.pinnedText, { color: C.subtext }]} numberOfLines={1}>
              {getSenderNameForMessage(latestPinnedMessage)}: {getReplySnippet(latestPinnedMessage)}
            </Text>
          </View>
          <Text style={[s.pinnedCount, { color: C.accent }]}>{pinnedMessages.length}</Text>
        </TouchableOpacity>
      ) : null}

      {marketplace ? (
        <View style={[s.marketCard, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          <TouchableOpacity
            style={[s.marketSummary, { backgroundColor: C.soft, borderColor: C.border }]}
            activeOpacity={0.82}
            onPress={() => navigation.navigate('MarketplaceDetail', { listingId: marketplace.listingId })}
          >
            {marketplace.imageUrl ? (
              <Image source={{ uri: marketplace.imageUrl }} style={s.marketImage} />
            ) : (
              <View style={[s.marketImage, { backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="bag-outline" size={20} color={C.subtext} />
              </View>
            )}
            <View style={s.marketCopy}>
              <Text style={[s.marketTitle, { color: C.text }]} numberOfLines={1}>
                {marketplace.title}
              </Text>
              <Text style={[s.marketPrice, { color: C.accent }]} numberOfLines={1}>
                {formatMarketplacePrice(marketplace.price)}
              </Text>
              <Text style={[s.marketLocation, { color: C.subtext }]} numberOfLines={1}>
                {marketplace.location || 'Surf Market'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.subtext} />
          </TouchableOpacity>
          {user?.uid && marketplace.sellerId === user.uid ? (
            <View style={s.marketQuickReplies}>
              <Text style={[s.marketQuickTitle, { color: C.subtext }]}>Trả lời nhanh</Text>
              <View style={s.marketQuickGrid}>
                {MARKETPLACE_QUICK_REPLIES.map(reply => (
                  <TouchableOpacity
                    key={reply}
                    style={[s.marketQuickChip, { backgroundColor: C.soft, borderColor: C.border }]}
                    activeOpacity={0.78}
                    onPress={() => applyMarketplaceQuickReply(reply)}
                  >
                    <Text style={[s.marketQuickText, { color: C.text }]} numberOfLines={1}>
                      {reply}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

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
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              flatRef.current?.scrollToIndex({
                index: info.index,
                animated: true,
                viewPosition: 0.5,
              });
            }, 260);
          }}
          ListHeaderComponent={typingText ? (
            <View style={[s.msgRow]}>
              <View style={s.msgAvatarWrap}>
                {firstTypingMember?.avatarUrl ? (
                  <Image source={{ uri: firstTypingMember.avatarUrl }} style={s.msgAvatar} />
                ) : (
                  <View style={[s.msgAvatar, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                      {(firstTypingMember?.name || peerName || title || '?').charAt(0)}
                    </Text>
                  </View>
                )}
              </View>
              <View style={[s.bubble, s.bubbleOther, { backgroundColor: C.otherBubble }]}>
                {isGroupConversation && firstTypingMember ? (
                  <Text style={[s.typingName, { color: C.subtext }]} numberOfLines={1}>
                    {typingText}
                  </Text>
                ) : null}
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

        {/* Composer */}
        <View style={[s.composer, { backgroundColor: C.card, borderTopColor: C.border, paddingBottom: insets.bottom || 10 }]}>
          {(composerReplyTarget || composerEditingMessage) && (
            <View style={[s.composerContext, { backgroundColor: C.soft, borderColor: C.border }]}>
              <View style={s.composerContextCopy}>
                <Text style={[s.composerContextTitle, { color: C.accent }]}>
                  {composerEditingMessage ? 'Đang sửa tin nhắn' : `Đang trả lời ${composerReplyTarget ? getSenderNameForMessage(composerReplyTarget) : ''}`}
                </Text>
                <Text style={[s.composerContextText, { color: C.subtext }]} numberOfLines={1}>
                  {composerEditingMessage ? normalizeMessageBody(composerEditingMessage) : composerReplyTarget ? getReplySnippet(composerReplyTarget) : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={s.composerContextClose}
                onPress={() => {
                  setReplyTarget(null);
                  setEditingMessage(null);
                  if (composerEditingMessage) {
                    setDraft('');
                    setDraftImageAttachments([]);
                  }
                }}
              >
                <Ionicons name="close" size={18} color={C.subtext} />
              </TouchableOpacity>
            </View>
          )}
          {!composerEditingMessage ? (
            <View style={s.composerTools}>
              <TouchableOpacity
                style={[s.composerToolBtn, { backgroundColor: C.soft }]}
                onPress={handlePickFile}
                disabled={sending}
                activeOpacity={0.75}
              >
                <Ionicons name="document-attach-outline" size={18} color={sending ? C.border : C.accent} />
                <Text style={[s.composerToolText, { color: sending ? C.border : C.accent }]}>File</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.composerToolBtn,
                  { backgroundColor: recording ? '#fee2e2' : C.soft },
                ]}
                onPress={toggleVoiceRecording}
                disabled={sending}
                activeOpacity={0.75}
              >
                <Ionicons name={recording ? 'stop-circle' : 'mic-outline'} size={19} color={recording ? '#ef4444' : sending ? C.border : C.accent} />
                <Text style={[s.composerToolText, { color: recording ? '#ef4444' : sending ? C.border : C.accent }]}>
                  {recording ? 'Dừng' : 'Ghi âm'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.composerToolBtn, { backgroundColor: C.soft }]}
                onPress={() => appendDraftToken('😊')}
                disabled={sending}
                activeOpacity={0.75}
              >
                <Ionicons name="happy-outline" size={19} color={sending ? C.border : C.accent} />
                <Text style={[s.composerToolText, { color: sending ? C.border : C.accent }]}>Emoji</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.composerToolBtn, { backgroundColor: C.soft }]}
                onPress={() => appendDraftToken('🙂')}
                disabled={sending}
                activeOpacity={0.75}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={sending ? C.border : C.accent} />
                <Text style={[s.composerToolText, { color: sending ? C.border : C.accent }]}>Sticker</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.composerToolBtn, { backgroundColor: C.soft }]}
                onPress={() => appendDraftToken('GIF')}
                disabled={sending}
                activeOpacity={0.75}
              >
                <Text style={[s.composerGifText, { color: sending ? C.border : C.accent }]}>GIF</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {!composerEditingMessage && draftImageAttachments.length > 0 ? (
            <View style={[s.draftImageTray, { backgroundColor: C.soft, borderColor: C.border }]}>
              <FlatList
                horizontal
                data={draftImageAttachments}
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.draftImageListContent}
                renderItem={({ item, index }) => (
                  <View style={s.draftImageItem}>
                    {isPickedVideoAsset(item.asset) ? (
                      <View style={s.draftVideoPreview}>
                        <Ionicons name="play-circle" size={26} color="#fff" />
                        <Text style={s.draftVideoText} numberOfLines={1}>
                          {item.asset.fileName || 'Video'}
                        </Text>
                      </View>
                    ) : (
                      <Image source={{ uri: item.asset.uri }} style={s.draftImagePreview} />
                    )}
                    {draftImageAttachments.length > 1 ? (
                      <View style={s.draftImageIndex}>
                        <Text style={s.draftImageIndexText}>{index + 1}</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={s.draftImageRemove}
                      onPress={() => removeDraftImageAttachment(item.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              />
            </View>
          ) : null}
          <View style={s.composerInputRow}>
            <TouchableOpacity style={s.mediaBtn} onPress={handlePickMedia} activeOpacity={0.7} disabled={sending || Boolean(composerEditingMessage)}>
              <Ionicons name="image-outline" size={24} color={sending || composerEditingMessage ? C.border : C.subtext} />
            </TouchableOpacity>
            <View style={[s.inputWrap, { backgroundColor: C.input, borderColor: C.inputBorder }]}>
              <TextInput
                ref={inputRef}
                style={[s.input, { color: C.text }]}
                placeholder={composerEditingMessage ? 'Sửa tin nhắn...' : t('chat_placeholder')}
                placeholderTextColor={C.subtext}
                value={draft}
                onChangeText={handleDraftChange}
                multiline
                maxLength={2000}
                returnKeyType="default"
              />
            </View>
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: canSubmitComposer ? C.accent : C.border }]}
              onPress={handleSend}
              disabled={!canSubmitComposer || sending}
              activeOpacity={0.8}
            >
              {sending ? (
                <ActivityIndicator size={16} color="#fff" />
              ) : (
                <Ionicons name={composerEditingMessage ? 'checkmark' : 'send'} size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      {renderSelectedMessageActions()}
      {renderRecallOptionsModal()}
      {renderReportMessageModal()}
      {renderForwardPicker()}
      {renderPinnedMessagesModal()}
      {renderReactionDetailsModal()}
      {renderMessageSearchModal()}
      {renderConversationInfoModal()}
      {renderInviteMembersModal()}
      {renderMediaPreviewModal()}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  headerSub: { marginTop: 1, fontSize: 11, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  msgList: { paddingHorizontal: 12, paddingVertical: 10, gap: 2 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 2, gap: 6 },
  msgRowOwn: { flexDirection: 'row-reverse' },
  msgAvatarWrap: { marginBottom: 4 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden' },
  msgStack: { maxWidth: '78%', alignItems: 'flex-start' },
  msgStackOwn: { alignItems: 'flex-end' },
  senderLabel: { marginLeft: 3, marginBottom: 3, maxWidth: 210, fontSize: 11, fontWeight: '800' },

  bubble: {
    maxWidth: '100%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9,
    paddingBottom: 6,
  },
  bubbleOwn: { borderBottomRightRadius: 8 },
  bubbleOther: { borderBottomLeftRadius: 8 },

  msgText: { fontSize: 15, lineHeight: 21 },
  msgLink: { fontWeight: '900', textDecorationLine: 'underline' },
  typingName: { maxWidth: 210, fontSize: 11, fontWeight: '800' },
  recalledText: { fontSize: 14, fontStyle: 'italic' },
  msgTime: { fontSize: 10, marginTop: 3, textAlign: 'right' },
  imgMsg: { width: 214, height: 214, borderRadius: 14 },
  videoAttachment: { width: 214, gap: 6 },
  videoAttachmentPreview: {
    height: 128,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  videoAttachmentTitle: { fontSize: 13, fontWeight: '900' },
  attachmentRow: { minWidth: 190, maxWidth: 240, flexDirection: 'row', alignItems: 'center', gap: 10 },
  attachmentIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  attachmentCopy: { flex: 1, minWidth: 0 },
  attachmentTitle: { fontSize: 14, fontWeight: '900' },
  attachmentSub: { marginTop: 2, fontSize: 11, fontWeight: '700' },
  voiceMessage: {
    minWidth: 202,
    maxWidth: 246,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voicePlayButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceCopy: { flex: 1, minWidth: 0, gap: 7 },
  voiceTrack: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  voiceTrackFill: {
    height: '100%',
    borderRadius: 999,
  },
  voiceMeta: { fontSize: 11, fontWeight: '800' },
  forwardedText: { marginBottom: 4, fontSize: 11, fontWeight: '700' },
  pinLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  pinText: { fontSize: 10, fontWeight: '800' },
  replyQuote: {
    minWidth: 140,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 7,
  },
  replyQuoteSender: { fontSize: 11, fontWeight: '800' },
  replyQuoteText: { marginTop: 2, fontSize: 11, fontWeight: '600' },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 7,
    marginTop: -5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#dbeafe',
    shadowColor: '#0284c7',
    shadowOpacity: 0.12,
    shadowRadius: 7,
    elevation: 2,
  },
  reactionBadgeOwn: { marginRight: 7, alignSelf: 'flex-end' },
  reactionBadgeOther: { marginLeft: 7, alignSelf: 'flex-start' },
  reactionEmoji: { fontSize: 13, lineHeight: 16 },
  reactionCount: { marginLeft: 2, fontSize: 10, fontWeight: '800' },
  seenReceiptRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: 3,
    paddingRight: 3,
  },
  seenReceiptLabel: { marginRight: 2, fontSize: 10, fontWeight: '800' },
  seenReceiptAvatar: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5 },
  seenReceiptAvatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seenReceiptInitial: { color: '#fff', fontSize: 8, fontWeight: '900' },
  callLogWrap: { alignItems: 'center', marginVertical: 7 },
  callLogPill: {
    maxWidth: '82%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  callLogText: { fontSize: 12, fontWeight: '700' },
  callLogRetryText: { marginLeft: 2, fontSize: 12, fontWeight: '900' },

  dateHeader: { alignItems: 'center', marginVertical: 12 },
  dateHeaderText: { fontSize: 12, fontWeight: '500' },
  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pinnedIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pinnedCopy: { flex: 1, minWidth: 0 },
  pinnedTitle: { fontSize: 12, fontWeight: '900' },
  pinnedText: { marginTop: 1, fontSize: 11, fontWeight: '700' },
  pinnedCount: { fontSize: 12, fontWeight: '900' },
  marketCard: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  marketSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 8,
  },
  marketImage: { width: 48, height: 48, borderRadius: 14 },
  marketCopy: { flex: 1, minWidth: 0 },
  marketTitle: { fontSize: 13, fontWeight: '900' },
  marketPrice: { marginTop: 2, fontSize: 12, fontWeight: '900' },
  marketLocation: { marginTop: 2, fontSize: 11, fontWeight: '700' },
  marketQuickReplies: { gap: 6 },
  marketQuickTitle: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0 },
  marketQuickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  marketQuickChip: {
    maxWidth: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  marketQuickText: { fontSize: 11, fontWeight: '800' },

  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 80 },
  emptyChatText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },

  composer: {
    paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  composerTools: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  composerToolBtn: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  composerToolText: { fontSize: 11, fontWeight: '900' },
  composerGifText: { fontSize: 12, fontWeight: '900', letterSpacing: 0 },
  draftImageTray: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingVertical: 8,
    minHeight: 92,
  },
  draftImageListContent: {
    paddingHorizontal: 8,
    gap: 8,
  },
  draftImageItem: {
    width: 76,
    height: 76,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  draftImagePreview: {
    width: '100%',
    height: '100%',
  },
  draftVideoPreview: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  draftVideoText: {
    maxWidth: '100%',
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  draftImageRemove: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.78)',
  },
  draftImageIndex: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,165,233,0.92)',
    paddingHorizontal: 5,
  },
  draftImageIndexText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  composerInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  composerContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  composerContextCopy: { flex: 1, minWidth: 0 },
  composerContextTitle: { fontSize: 12, fontWeight: '900' },
  composerContextText: { marginTop: 2, fontSize: 11, fontWeight: '700' },
  composerContextClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  inputWrap: {
    flex: 1, borderRadius: 26, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 9 : 5,
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
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.42)',
  },
  actionSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  actionHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 12,
  },
  actionTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center' },
  actionPreview: { marginTop: 4, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  reactionPicker: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 22,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  reactionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactionButtonText: { fontSize: 25 },
  reactionButtonTextSelected: { transform: [{ scale: 1.08 }] },
  reactionSelectedDot: {
    position: 'absolute',
    bottom: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  actionList: { marginTop: 12, borderRadius: 18, overflow: 'hidden' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  actionRowText: { fontSize: 15, fontWeight: '800' },
  forwardSheet: {
    maxHeight: '76%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
  },
  forwardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  forwardHeaderCopy: { flex: 1, minWidth: 0 },
  forwardCloseBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  forwardLoading: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 10 },
  forwardLoadingText: { fontSize: 13, fontWeight: '700' },
  forwardList: { marginTop: 12 },
  forwardListContent: { paddingBottom: 8 },
  forwardRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  forwardAvatar: { width: 46, height: 46, borderRadius: 23 },
  forwardAvatarFallback: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  forwardAvatarInitial: { color: '#fff', fontSize: 17, fontWeight: '900' },
  forwardRowCopy: { flex: 1, minWidth: 0 },
  forwardRowTitle: { fontSize: 15, fontWeight: '900' },
  forwardRowSub: { marginTop: 3, fontSize: 12, fontWeight: '700' },
  forwardSendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  forwardEmpty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 9 },
  forwardEmptyText: { fontSize: 13, fontWeight: '700' },
  recallOptionList: { marginTop: 16, gap: 10 },
  recallOption: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  recallRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  recallRadioDot: { width: 10, height: 10, borderRadius: 5 },
  recallOptionCopy: { flex: 1, minWidth: 0 },
  recallOptionTitle: { fontSize: 15, fontWeight: '900' },
  recallOptionText: { marginTop: 4, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  recallFooter: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  recallCancel: {
    minWidth: 88,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  recallCancelText: { fontSize: 14, fontWeight: '900' },
  recallSubmit: {
    minWidth: 104,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  recallSubmitText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  reportReasonGrid: { marginTop: 16, gap: 8 },
  reportReasonChip: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  reportReasonText: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '800' },
  reportInputBox: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  reportInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 92,
    fontSize: 14,
    fontWeight: '700',
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: 'top',
  },
  utilitySheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetTitleCopy: { flex: 1, minWidth: 0 },
  sheetTitle: { fontSize: 17, fontWeight: '900' },
  sheetSubtitle: { marginTop: 3, fontSize: 12, fontWeight: '700' },
  utilityList: { marginTop: 12 },
  utilityListContent: { paddingBottom: 8 },
  utilityEmpty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 9 },
  utilityEmptyText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  pinnedRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  pinnedRowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pinnedRowCopy: { flex: 1, minWidth: 0 },
  pinnedRowTitle: { fontSize: 14, fontWeight: '900' },
  pinnedRowText: { marginTop: 3, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  pinnedRowTime: { fontSize: 11, fontWeight: '700' },
  pinnedRowUnpin: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  reactionFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  reactionFilterChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  reactionFilterEmoji: { fontSize: 16, lineHeight: 19 },
  reactionFilterText: { fontSize: 12, fontWeight: '900' },
  reactionActorRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  reactionActorAvatar: { width: 42, height: 42, borderRadius: 21 },
  reactionActorAvatarFallback: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  reactionActorInitial: { color: '#fff', fontSize: 15, fontWeight: '900' },
  reactionActorCopy: { flex: 1, minWidth: 0 },
  reactionActorName: { fontSize: 14, fontWeight: '900' },
  reactionActorHint: { marginTop: 2, fontSize: 11, fontWeight: '700' },
  reactionActorEmoji: { fontSize: 22 },
  searchBox: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    marginTop: 14,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '700', paddingVertical: Platform.OS === 'ios' ? 10 : 6 },
  searchClearButton: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  groupNameBox: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    marginTop: 14,
  },
  groupNameInput: { flex: 1, fontSize: 15, fontWeight: '800', paddingVertical: Platform.OS === 'ios' ? 10 : 7 },
  searchResultRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  searchResultIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  searchResultCopy: { flex: 1, minWidth: 0 },
  searchResultTitle: { fontSize: 14, fontWeight: '900' },
  searchResultText: { marginTop: 3, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  searchResultTime: { fontSize: 11, fontWeight: '700' },
  infoContent: { paddingBottom: 14 },
  infoSections: { gap: 18 },
  infoHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 12,
  },
  infoAvatar: { width: 54, height: 54, borderRadius: 27 },
  infoAvatarFallback: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  infoAvatarInitial: { color: '#fff', fontSize: 22, fontWeight: '900' },
  infoHeroCopy: { flex: 1, minWidth: 0 },
  infoHeroTitle: { fontSize: 16, fontWeight: '900' },
  infoHeroSub: { marginTop: 3, fontSize: 12, fontWeight: '700' },
  infoActionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoActionButton: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  infoActionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  infoActionText: { minHeight: 32, textAlign: 'center', fontSize: 11, lineHeight: 16, fontWeight: '900' },
  infoSectionBlock: { gap: 9 },
  infoSectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoSectionMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  infoSectionTitle: { fontSize: 15, fontWeight: '900' },
  infoSectionCount: { fontSize: 12, fontWeight: '900' },
  memberListCard: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
  },
  memberRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  memberAvatar: { width: 38, height: 38, borderRadius: 19 },
  memberAvatarFallback: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  memberAvatarInitial: { color: '#fff', fontSize: 14, fontWeight: '900' },
  memberName: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '900' },
  inviteList: { marginTop: 12, maxHeight: 330 },
  inviteListContent: { paddingBottom: 8 },
  inviteRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  inviteRowCopy: { flex: 1, minWidth: 0 },
  inviteSub: { marginTop: 2, fontSize: 11, fontWeight: '700' },
  inviteCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteFooter: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  inviteCount: { flex: 1, fontSize: 12, fontWeight: '800' },
  inviteSubmit: {
    minWidth: 104,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 21,
    paddingHorizontal: 16,
  },
  inviteSubmitText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  infoEmptyText: { fontSize: 12, fontWeight: '700', lineHeight: 18 },
  sharedMediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sharedMediaTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  sharedMediaImage: { width: '100%', height: '100%' },
  sharedVideoTile: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
  sharedRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 8,
  },
  sharedRowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sharedRowCopy: { flex: 1, minWidth: 0 },
  sharedRowTitle: { fontSize: 13, fontWeight: '900' },
  sharedRowSub: { marginTop: 2, fontSize: 11, fontWeight: '700' },
  securityRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  securityBadge: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: '900' },
  mediaPreviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  mediaPreviewClose: {
    position: 'absolute',
    zIndex: 2,
    top: 18,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.72)',
  },
  mediaPreviewHeader: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 12,
    paddingRight: 68,
  },
  mediaPreviewTitle: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '800' },
  mediaPreviewOpen: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 11,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  mediaPreviewOpenText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  mediaPreviewBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingBottom: 24 },
  mediaPreviewFrame: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  mediaPreviewImage: { width: '100%', height: '100%' },
});
