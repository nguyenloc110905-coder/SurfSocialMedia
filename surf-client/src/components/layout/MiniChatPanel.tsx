import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { uploadFile, uploadImage } from '../../lib/cloudinary';
import { getSocket } from '../../lib/socket';
import { useAuthStore } from '../../stores/authStore';
import { useGlobalCall, type CallMode } from '../call/GlobalCallProvider';
import PresenceBadge from '../ui/PresenceBadge';
import { optimizeImageUrl } from '../../lib/image-cdn';

interface ConversationItem {
  id: string;
  type?: 'dm' | 'group';
  title?: string;
  marketplace?: MarketplaceConversationContext;
  peer: { uid: string; name: string; avatarUrl: string | null } | null;
  members?: { uid: string; name: string; avatarUrl: string | null }[];
  memberCount?: number;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
}

interface MarketplaceConversationContext {
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
}

interface UiMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type?: 'text' | 'image' | 'file' | 'audio' | 'call_log';
  text: string;
  mediaUrl?: string;
  fileName?: string;
  createdAt: string;
  editedAt?: string;
  recalledForEveryone?: boolean;
  optimistic?: boolean;
  forwardedFromMessageId?: string;
  forwardedFromConversationId?: string;
  pinnedBy?: string[];
  reactions?: MessageReactionsByEmoji;
  callMode?: CallMode;
  callOutcome?: 'completed' | 'missed' | 'declined' | 'busy' | 'failed' | 'ended' | 'started';
  durationSeconds?: number;
}

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

interface RealtimePayload {
  conversationId?: string;
  message: UiMessage;
  conversation?: {
    id: string;
    lastMessagePreview?: string;
    lastMessageAt?: string;
  };
}

interface TypingPayload {
  conversationId: string;
  userId: string;
  isTyping?: boolean;
}

interface MessageSelfHiddenPayload {
  conversationId: string;
  messageId: string;
}

interface MessageRecalledPayload {
  conversationId: string;
  message: UiMessage;
}

interface MessageUpdatedPayload {
  conversationId: string;
  message: UiMessage;
}

const URL_TOKEN_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
const TRAILING_URL_PUNCTUATION_PATTERN = /[.,!?;:)\]}]+$/;
const MESSAGE_REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const REPLY_PREFIX_PATTERN = /^↪\s*(.+?):\s*(.+)$/u;
const REPLY_TARGET_MARKER_PATTERN = /^__reply_to:([^\n]+)__$/;
const REPLY_TARGET_MARKER_INLINE_PATTERN = /__reply_to:[^\s]+__/g;
const REPLY_SENDER_MARKER_PATTERN = /^__reply_sender:([^\n]+)__$/;
const REPLY_SENDER_MARKER_INLINE_PATTERN = /__reply_sender:[^\s]+__/g;
const REPLY_TARGET_MARKER_LINE_PATTERN = /^__reply_to:[^\n]+__\n?/;
const REPLY_SENDER_MARKER_LINE_PATTERN = /^__reply_sender:[^\n]+__\n?/;

const normalizeLinkHref = (value: string) =>
  value.toLowerCase().startsWith('www.') ? `https://${value}` : value;

const splitUrlToken = (value: string) => {
  let url = value;
  let suffix = '';

  while (url && TRAILING_URL_PUNCTUATION_PATTERN.test(url)) {
    suffix = `${url.slice(-1)}${suffix}`;
    url = url.slice(0, -1);
  }

  return { url, suffix };
};

function LinkifiedMessageText({
  text,
  className,
  outgoing,
}: {
  text: string;
  className?: string;
  outgoing: boolean;
}) {
  const parts = [];
  const matcher = new RegExp(URL_TOKEN_PATTERN);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    const rawToken = match[0];
    const tokenStart = match.index;
    const { url, suffix } = splitUrlToken(rawToken);

    if (!url) continue;

    if (tokenStart > lastIndex) {
      parts.push(text.slice(lastIndex, tokenStart));
    }

    parts.push(
      <a
        key={`${tokenStart}-${url}`}
        href={normalizeLinkHref(url)}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        className={
          outgoing
            ? 'font-bold text-blue-950 underline decoration-blue-200 underline-offset-2 hover:text-blue-900 dark:text-sky-100 dark:decoration-sky-200'
            : 'font-semibold text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700 dark:text-sky-300 dark:decoration-sky-500'
        }
      >
        {url}
      </a>
    );

    if (suffix) {
      parts.push(suffix);
    }

    lastIndex = tokenStart + rawToken.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <p className={className}>{parts.length > 0 ? parts : text}</p>;
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
  const stripped = value
    .replace(REPLY_TARGET_MARKER_LINE_PATTERN, '')
    .replace(REPLY_SENDER_MARKER_LINE_PATTERN, '')
    .replace(REPLY_TARGET_MARKER_INLINE_PATTERN, ' ')
    .replace(REPLY_SENDER_MARKER_INLINE_PATTERN, ' ')
    .trim();
  if (!stripped) return '';

  const lines = stripped.split('\n');
  const firstLine = lines[0]?.trim() ?? '';
  const replyMatch = firstLine.match(REPLY_PREFIX_PATTERN);
  if (!replyMatch) return stripped;

  const body = lines.slice(1).join('\n').trim();
  if (body) return body;

  return unwrapReplyPrefix(replyMatch[2]);
}

function normalizeConversationPreview(value?: string | null) {
  if (!value) return '';

  return extractLatestChatContent(value).replace(/\s+/g, ' ').trim();
}

function stripReplyMetadata(value: string) {
  return value
    .replace(REPLY_TARGET_MARKER_LINE_PATTERN, '')
    .replace(REPLY_SENDER_MARKER_LINE_PATTERN, '')
    .replace(REPLY_TARGET_MARKER_INLINE_PATTERN, ' ')
    .replace(REPLY_SENDER_MARKER_INLINE_PATTERN, ' ')
    .trim();
}

function normalizeReplySnippetDisplay(value: string) {
  return unwrapReplyPrefix(value).replace(/\s+/g, ' ').trim();
}

function parseReplyQuoteFromText(text: string): ParsedReplyQuote | null {
  const source = text.trim();
  if (
    !source.startsWith('↪') &&
    !source.startsWith('__reply_to:') &&
    !source.startsWith('__reply_sender:')
  ) {
    return null;
  }

  const lines = source.split('\n');
  let targetMessageId: string | null = null;
  let senderId: string | null = null;

  const markerMatch = lines[0]?.match(REPLY_TARGET_MARKER_PATTERN);
  if (markerMatch) {
    targetMessageId = markerMatch[1].trim();
    lines.shift();
  }

  const senderMarkerMatch = lines[0]?.match(REPLY_SENDER_MARKER_PATTERN);
  if (senderMarkerMatch) {
    senderId = senderMarkerMatch[1].trim();
    lines.shift();
  }

  const [firstLine, ...restLines] = lines;
  if (!firstLine || !firstLine.startsWith('↪')) return null;

  const match = firstLine.match(REPLY_PREFIX_PATTERN);
  if (!match) return null;

  return {
    senderId,
    senderName: match[1].trim(),
    snippet: match[2].trim(),
    bodyText: restLines.join('\n').trim(),
    targetMessageId,
  };
}

function isPlainDirectConversation(
  conversation: ConversationItem,
  peerId?: string | null
) {
  return (
    conversation.type !== 'group' &&
    !conversation.marketplace &&
    Boolean(peerId) &&
    conversation.peer?.uid === peerId
  );
}

function getConversationPreview(message: UiMessage) {
  if (message.type === 'call_log') return getCallMetaLabel(message);

  const normalizedText = normalizeConversationPreview(message.text);
  if (normalizedText) return normalizedText;

  if (message.type === 'image') return 'Đã gửi ảnh';
  if (message.type === 'file')
    return message.fileName ? `Đã gửi ${message.fileName}` : 'Đã gửi tệp';
  if (message.type === 'audio') return 'Đã gửi ghi âm';

  return 'Tin nhắn mới';
}

function getConversationListPreview(
  conversation: ConversationItem,
  message: UiMessage,
  currentUserId?: string | null
) {
  const preview = getConversationPreview(message);
  if (conversation.type !== 'group' || !preview) return preview;

  const senderLabel =
    message.senderId === currentUserId
      ? 'Bạn'
      : (conversation.members?.find((member) => member.uid === message.senderId)?.name ??
        'Thành viên');

  return `${senderLabel}: ${preview}`;
}

function getInitials(name: string) {
  const words = name.split(' ').filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(d);
}

function formatHoverTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const d = date.getDate();
  const mo = date.getMonth() + 1;
  const y = date.getFullYear();

  return `${h}:${m} ${d} Tháng ${mo}, ${y}`;
}

function formatDuration(durationSeconds?: number) {
  if (!durationSeconds || durationSeconds <= 0) return '0 giây';

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  if (minutes > 0 && seconds > 0) return `${minutes} phút ${seconds} giây`;
  if (minutes > 0) return `${minutes} phút`;
  return `${seconds} giây`;
}

function getCallMetaLabel(message: UiMessage) {
  const modeLabel = message.callMode === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
  if (
    message.callOutcome === 'completed' ||
    (message.callOutcome === 'ended' && !!message.durationSeconds)
  ) {
    return `${modeLabel} • ${formatDuration(message.durationSeconds)}`;
  }

  return modeLabel;
}

function getCallDisplayTitle(
  message: UiMessage,
  outgoing: boolean,
  isGroupConversation: boolean
) {
  const modeLabel = message.callMode === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';

  switch (message.callOutcome) {
    case 'started':
      return isGroupConversation ? `${modeLabel} nhóm đã bắt đầu` : `${modeLabel} đã bắt đầu`;
    case 'completed':
      if (isGroupConversation) return `${modeLabel} nhóm đã hoàn tất`;
      return outgoing ? `${modeLabel} đi` : `${modeLabel} đến`;
    case 'missed':
      return outgoing ? `${modeLabel} không được bắt máy` : 'Bạn bị nhỡ';
    case 'declined':
      return outgoing ? `${modeLabel} bị từ chối` : 'Bạn đã từ chối cuộc gọi';
    case 'busy':
      return outgoing ? 'Đối phương đang bận' : `${modeLabel} khi bạn đang bận`;
    case 'failed':
      return 'Không thể kết nối cuộc gọi';
    case 'ended':
      return isGroupConversation ? `${modeLabel} nhóm đã kết thúc` : `${modeLabel} đã kết thúc`;
    default:
      return outgoing ? `${modeLabel} đi` : `${modeLabel} đến`;
  }
}

function getCallToneClasses(message: UiMessage) {
  if (
    message.callOutcome === 'missed' ||
    message.callOutcome === 'declined' ||
    message.callOutcome === 'failed'
  ) {
    return {
      iconWrap: 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-300',
      title: 'text-red-500 dark:text-red-300',
      iconVariant: 'hangup' as const,
      iconPath: '',
    };
  }

  return {
    iconWrap: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/25 dark:text-cyan-300',
    title: 'text-slate-900 dark:text-slate-100',
    iconVariant: message.callMode === 'video' ? ('video' as const) : ('audio' as const),
    iconPath:
      message.callMode === 'video'
        ? 'M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z'
        : 'M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.7 11.7 0 0 0 3.68.59 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.48a1 1 0 0 1 1 1 11.7 11.7 0 0 0 .59 3.68 1 1 0 0 1-.25 1.01Z',
  };
}

function formatMarketplacePrice(price: number) {
  if (price === 0) return 'Miễn phí';
  return price.toLocaleString('vi-VN') + ' ₫';
}

function TypingDots({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label="...">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </span>
  );
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{label}</span>
      <TypingDots className="shrink-0" />
    </span>
  );
}

async function downloadFile(url: string, fileName: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Download failed with status ${res.status}`);
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (
      contentType.includes('text/html') ||
      contentType.includes('application/json') ||
      contentType.includes('application/xml') ||
      contentType.includes('text/xml')
    ) {
      throw new Error(`Invalid file response content-type: ${contentType}`);
    }

    const blob = await res.blob();
    if (blob.size === 0) {
      throw new Error('Downloaded file is empty');
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
}

function Avatar({
  src,
  name,
  uid,
  size = 'md',
  showPresence = false,
}: {
  src?: string | null;
  name?: string | null;
  uid?: string | null;
  size?: 'sm' | 'md';
  showPresence?: boolean;
}) {
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <span className="relative inline-flex flex-shrink-0 overflow-visible">
      <span
        className={`${cls} rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-surf-primary to-cyan-500 text-white font-semibold`}
      >
        {src ? (
          <img
            src={optimizeImageUrl(src)}
            alt={name ?? ''}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{name ? getInitials(name) : '?'}</span>
        )}
      </span>
      {showPresence && uid && <PresenceBadge uid={uid} size={size === 'sm' ? 'sm' : 'md'} />}
    </span>
  );
}

interface Props {
  onClose: () => void;
  initialPeerId?: string | null;
  initialConversationId?: string | null;
  initialConversation?: ConversationItem | null;
  compact?: boolean;
}

export default function MiniChatPanel({
  onClose,
  initialPeerId,
  initialConversationId,
  initialConversation,
  compact,
}: Props) {
  const user = useAuthStore((s) => s.user);
  const { startCall, startGroupCall, isBusy: isCallBusy } = useGlobalCall();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState('');
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [openedMessageActionId, setOpenedMessageActionId] = useState<string | null>(null);
  const [openedReactionMessageId, setOpenedReactionMessageId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeTypingConversationRef = useRef<string | null>(null);
  const typingStopTimeoutRef = useRef<number | null>(null);
  const typingClearTimeoutsRef = useRef<Record<string, number>>({});

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const activeMarketplace = activeConv?.marketplace;
  const marketplaceQuickReplies = [
    'Có nhé. Bạn có thích không?',
    'Tôi sẽ báo cho bạn biết.',
    'Tiếc quá, hết hàng rồi bạn ạ.',
  ];
  const typingText =
    typingUserIds.length > 0 && activeConv
      ? `${typingUserIds
          .map((uid) =>
            activeConv.type === 'group'
              ? (activeConv.members?.find((member) => member.uid === uid)?.name ?? 'Thành viên')
              : (activeConv.peer?.name ?? 'Ai đó')
          )
          .slice(0, 2)
          .join(' và ')}${
          typingUserIds.length > 2 ? ` và ${typingUserIds.length - 2} người khác` : ''
        } đang nhập tin nhắn`
      : '';
  const canCallActiveConversation =
    activeConv?.type === 'group'
      ? (activeConv.members?.length ?? 0) > 0
      : Boolean(activeConv?.peer);

  const startConversationCall = useCallback(
    (mode: CallMode) => {
      if (!activeConv || isCallBusy) return;

      if (activeConv.type === 'group') {
        startGroupCall({
          conversationId: activeConv.id,
          conversationTitle: activeConv.title ?? 'Nhóm',
          memberIds: (activeConv.members ?? []).map((member) => member.uid),
          mode,
        });
        return;
      }

      if (!activeConv.peer) return;

      startCall({
        conversationId: activeConv.id,
        peerId: activeConv.peer.uid,
        peerName: activeConv.peer.name,
        peerAvatarUrl: activeConv.peer.avatarUrl,
        mode,
      });
    },
    [activeConv, isCallBusy, startCall, startGroupCall]
  );

  const getSenderNameForMessage = useCallback(
    (message: UiMessage) => {
      if (message.senderId === user?.uid) {
        return user.displayName ?? user.email?.split('@')[0] ?? 'Bạn';
      }

      if (activeConv?.type === 'group') {
        return (
          activeConv.members?.find((member) => member.uid === message.senderId)?.name ??
          'Thành viên'
        );
      }

      return activeConv?.peer?.name ?? 'Người dùng';
    },
    [activeConv, user?.displayName, user?.email, user?.uid]
  );

  const getReplyQuoteSenderLabel = useCallback(
    (quote: ParsedReplyQuote) => {
      const senderIdFromTarget = quote.targetMessageId
        ? (messages.find((item) => item.id === quote.targetMessageId)?.senderId ?? null)
        : null;
      const resolvedSenderId = quote.senderId ?? senderIdFromTarget;

      if (!resolvedSenderId) return quote.senderName;
      if (resolvedSenderId === user?.uid) return 'Bạn';

      if (activeConv?.type === 'group') {
        return (
          activeConv.members?.find((member) => member.uid === resolvedSenderId)?.name ??
          quote.senderName
        );
      }

      return activeConv?.peer?.name ?? quote.senderName;
    },
    [activeConv, messages, user?.uid]
  );

  const getReplySnippet = useCallback((message: UiMessage) => {
    if (message.type === 'image') return 'đã gửi một ảnh';
    if (message.type === 'audio') return 'đã gửi một đoạn ghi âm';
    if (message.type === 'file') {
      return message.fileName ? `[File] ${message.fileName}` : '[File] tệp đính kèm';
    }
    if (message.type === 'call_log') return getCallMetaLabel(message);

    const normalized = extractLatestChatContent(message.text).replace(/\s+/g, ' ').trim();
    if (!normalized) return 'tin nhắn';

    return normalized.length > 90 ? `${normalized.slice(0, 90)}...` : normalized;
  }, []);

  const handleReplyToMessage = useCallback(
    (message: UiMessage) => {
      if (message.optimistic || message.type === 'call_log') return;

      const quotedText = [
        `__reply_to:${message.id}__`,
        `__reply_sender:${message.senderId}__`,
        `↪ ${getSenderNameForMessage(message)}: ${getReplySnippet(message)}`,
        '',
      ].join('\n');

      setDraft(quotedText);
      setOpenedMessageActionId(null);
      setOpenedReactionMessageId(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [getReplySnippet, getSenderNameForMessage]
  );

  const replaceMessage = useCallback((conversationId: string, nextMessage: UiMessage) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.conversationId === conversationId && message.id === nextMessage.id
          ? { ...message, ...nextMessage }
          : message
      )
    );
  }, []);

  const toggleMessageReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const target = messages.find((message) => message.id === messageId);
      if (!target || target.optimistic || target.type === 'call_log') return;

      setOpenedReactionMessageId(null);
      try {
        const data = await api.patch<{ conversationId: string; message: UiMessage }>(
          `/api/messages/${encodeURIComponent(messageId)}/reactions`,
          {
            conversationId: target.conversationId,
            emoji,
          }
        );
        replaceMessage(data.conversationId, data.message);
      } catch {
        // Keep the mini chat quiet; Waves will still receive realtime updates if the request succeeds.
      }
    },
    [messages, replaceMessage]
  );

  const recallMessageForEveryone = useCallback(
    async (message: UiMessage) => {
      if (message.optimistic || message.senderId !== user?.uid) return;

      setOpenedMessageActionId(null);
      setDeletingMessageId(message.id);
      try {
        const data = await api.delete<{ conversationId: string; message: UiMessage }>(
          `/api/messages/${encodeURIComponent(message.id)}/everyone`,
          {
            conversationId: message.conversationId,
          }
        );
        replaceMessage(data.conversationId, data.message);
      } catch {
        // ignore
      } finally {
        setDeletingMessageId(null);
      }
    },
    [replaceMessage, user?.uid]
  );

  const hideMessageForSelf = useCallback(async (message: UiMessage) => {
    if (message.optimistic) return;

    setOpenedMessageActionId(null);
    try {
      await api.delete(`/api/messages/${encodeURIComponent(message.id)}/self`, {
        conversationId: message.conversationId,
      });
      setMessages((prev) => prev.filter((item) => item.id !== message.id));
    } catch {
      // ignore
    }
  }, []);

  const toggleMessagePin = useCallback(
    async (message: UiMessage) => {
      if (message.optimistic || !user?.uid) return;

      const isPinned = message.pinnedBy?.includes(user.uid) ?? false;
      setOpenedMessageActionId(null);
      try {
        const data = await api.patch<{ conversationId: string; message: UiMessage }>(
          `/api/messages/${encodeURIComponent(message.id)}/pin`,
          {
            conversationId: message.conversationId,
            pinned: !isPinned,
          }
        );
        replaceMessage(data.conversationId, data.message);
      } catch {
        // ignore
      }
    },
    [replaceMessage, user?.uid]
  );

  const clearTypingUser = useCallback((userId: string) => {
    const timeoutId = typingClearTimeoutsRef.current[userId];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete typingClearTimeoutsRef.current[userId];
    }
    setTypingUserIds((prev) => prev.filter((id) => id !== userId));
  }, []);

  const scheduleTypingAutoClear = useCallback(
    (userId: string) => {
      const previousTimeoutId = typingClearTimeoutsRef.current[userId];
      if (previousTimeoutId) {
        window.clearTimeout(previousTimeoutId);
      }
      typingClearTimeoutsRef.current[userId] = window.setTimeout(() => {
        clearTypingUser(userId);
      }, 3000);
    },
    [clearTypingUser]
  );

  const emitTypingStop = useCallback(
    (conversationId?: string | null) => {
      const targetConversationId = conversationId ?? activeTypingConversationRef.current;
      if (typingStopTimeoutRef.current) {
        window.clearTimeout(typingStopTimeoutRef.current);
        typingStopTimeoutRef.current = null;
      }
      if (!targetConversationId || !user?.uid) return;

      getSocket().emit('typing:stop', { conversationId: targetConversationId });
      if (activeTypingConversationRef.current === targetConversationId) {
        activeTypingConversationRef.current = null;
      }
    },
    [user?.uid]
  );

  const emitTypingStart = useCallback(() => {
    if (!activeId || !user?.uid) return;

    const socket = getSocket();
    const previousConversationId = activeTypingConversationRef.current;
    if (previousConversationId && previousConversationId !== activeId) {
      socket.emit('typing:stop', { conversationId: previousConversationId });
    }

    socket.emit('typing:start', { conversationId: activeId });
    activeTypingConversationRef.current = activeId;

    if (typingStopTimeoutRef.current) {
      window.clearTimeout(typingStopTimeoutRef.current);
    }
    typingStopTimeoutRef.current = window.setTimeout(() => {
      emitTypingStop(activeId);
    }, 1600);
  }, [activeId, emitTypingStop, user?.uid]);

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value);
      if (value.trim()) {
        emitTypingStart();
      } else {
        emitTypingStop(activeId);
      }
    },
    [activeId, emitTypingStart, emitTypingStop]
  );

  // Load conversation list
  useEffect(() => {
    api
      .get<{ items: ConversationItem[] }>('/api/conversations?limit=30')
      .then((data) => {
        const items = initialConversation
          ? [
              initialConversation,
              ...(data.items ?? []).filter((item) => item.id !== initialConversation.id),
            ]
          : (data.items ?? []);
        setConversations(items);
        if (initialConversationId) {
          setActiveId(initialConversationId);
          return;
        }
        // Auto-open conversation with initial peer
        if (initialPeerId) {
          const existing = items.find((c) => isPlainDirectConversation(c, initialPeerId));
          if (existing) {
            setActiveId(existing.id);
          } else {
            // Create DM then open
            api
              .post<{ item: ConversationItem }>('/api/conversations', { peerUid: initialPeerId })
              .then((created) => {
                // Reload list to get full item
                return api
                  .get<{ items: ConversationItem[] }>('/api/conversations?limit=30')
                  .then((fresh) => {
                    setConversations([
                      created.item,
                      ...(fresh.items ?? []).filter((item) => item.id !== created.item.id),
                    ]);
                    setActiveId(created.item.id);
                  });
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [initialConversation, initialConversationId, initialPeerId]);

  // Load messages when conversation selected
  useEffect(() => {
    if (!activeId) return;
    setMessages([]);
    setLoadingMsgs(true);
    api
      .get<{ items: UiMessage[] }>(`/api/conversations/${activeId}/messages?limit=20`)
      .then((data) => setMessages([...(data.items ?? [])]))
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));

    // Mark read
    api.patch(`/api/conversations/${activeId}/read`).catch(() => {});
    setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c)));
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const socket = getSocket();
    socket.emit('conversation:join', activeId);
    setTypingUserIds([]);

    return () => {
      emitTypingStop(activeId);
      socket.emit('conversation:leave', activeId);
      setTypingUserIds([]);
    };
  }, [activeId, emitTypingStop]);

  useEffect(() => {
    return () => {
      emitTypingStop();
      Object.values(typingClearTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      typingClearTimeoutsRef.current = {};
    };
  }, [emitTypingStop]);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUserIds.length]);

  // Focus input
  useEffect(() => {
    if (activeId) setTimeout(() => inputRef.current?.focus(), 100);
  }, [activeId]);

  // Realtime socket — sound is handled globally by useMessageSound in App.tsx
  useEffect(() => {
    const socket = getSocket();
    const onMessageNew = (payload: RealtimePayload) => {
      const { message } = payload;
      const conversationId =
        payload.conversationId || payload.message?.conversationId || payload.conversation?.id;
      if (!conversationId || !message) return;

      if (message.senderId !== user?.uid) {
        clearTypingUser(message.senderId);
      }
      // Update messages if in this conversation
      if (message.conversationId === activeId) {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === message.id);
          if (exists) return prev;
          return [
            ...prev.filter(
              (m) => !(m.optimistic && m.text === message.text && m.senderId === message.senderId)
            ),
            message,
          ];
        });
      }
      // Update conversation preview
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessagePreview: getConversationListPreview(c, message, user?.uid),
                lastMessageAt: message.createdAt,
                unreadCount: c.id === activeId ? 0 : c.unreadCount + 1,
              }
            : c
        )
      );
    };
    const onMessageSelfHidden = (payload: MessageSelfHiddenPayload) => {
      if (payload.conversationId !== activeId) return;
      setMessages((prev) => prev.filter((message) => message.id !== payload.messageId));
    };
    const onMessageRecalled = (payload: MessageRecalledPayload) => {
      if (payload.conversationId === activeId) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === payload.message.id ? { ...message, ...payload.message } : message
          )
        );
      }

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== payload.conversationId) return conversation;

          const messageAt = +new Date(payload.message.createdAt);
          const currentAt = conversation.lastMessageAt ? +new Date(conversation.lastMessageAt) : 0;
          if (messageAt < currentAt) return conversation;

          return {
            ...conversation,
            lastMessagePreview: getConversationListPreview(
              conversation,
              payload.message,
              user?.uid
            ),
            lastMessageAt: payload.message.createdAt,
          };
        })
      );
    };

    const onMessageUpdated = (payload: MessageUpdatedPayload) => {
      if (payload.conversationId === activeId) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === payload.message.id ? { ...message, ...payload.message } : message
          )
        );
      }

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== payload.conversationId) return conversation;

          const messageAt = +new Date(payload.message.createdAt);
          const currentAt = conversation.lastMessageAt ? +new Date(conversation.lastMessageAt) : 0;
          if (messageAt < currentAt) return conversation;

          return {
            ...conversation,
            lastMessagePreview: getConversationListPreview(
              conversation,
              payload.message,
              user?.uid
            ),
            lastMessageAt: payload.message.createdAt,
          };
        })
      );
    };

    const onMessageReactionUpdated = (payload: MessageUpdatedPayload) => {
      if (payload.conversationId !== activeId) return;
      replaceMessage(payload.conversationId, payload.message);
    };

    const onTypingStart = (payload: TypingPayload) => {
      if (payload.conversationId !== activeId || !payload.userId || payload.userId === user?.uid) {
        return;
      }

      setTypingUserIds((prev) =>
        prev.includes(payload.userId) ? prev : [...prev, payload.userId]
      );
      scheduleTypingAutoClear(payload.userId);
    };

    const onTypingStop = (payload: TypingPayload) => {
      if (payload.conversationId !== activeId || !payload.userId || payload.userId === user?.uid) {
        return;
      }
      clearTypingUser(payload.userId);
    };
    const onTypingStatus = (payload: TypingPayload) => {
      if (payload?.isTyping) {
        onTypingStart(payload);
        return;
      }
      onTypingStop(payload);
    };

    socket.on('message:new', onMessageNew);
    socket.on('message:self-hidden', onMessageSelfHidden);
    socket.on('message:recalled', onMessageRecalled);
    socket.on('message:updated', onMessageUpdated);
    socket.on('message:reaction-updated', onMessageReactionUpdated);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('typing', onTypingStatus);
    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('message:self-hidden', onMessageSelfHidden);
      socket.off('message:recalled', onMessageRecalled);
      socket.off('message:updated', onMessageUpdated);
      socket.off('message:reaction-updated', onMessageReactionUpdated);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('typing', onTypingStatus);
    };
  }, [activeId, clearTypingUser, replaceMessage, scheduleTypingAutoClear, user?.uid]);

  const sendTextMessage = async (text: string, restoreOnFail = false) => {
    if (!activeId || !text.trim() || sending) return;
    const normalizedText = text.trim();
    const optimistic: UiMessage = {
      id: `temp-${Date.now()}`,
      conversationId: activeId,
      senderId: user?.uid ?? '',
      text: normalizedText,
      createdAt: new Date().toISOString(),
      optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    emitTypingStop(activeId);
    setSending(true);
    try {
      const data = await api.post<{ item: UiMessage }>(`/api/conversations/${activeId}/messages`, {
        text: normalizedText,
      });
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? data.item : m)));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                lastMessagePreview:
                  getConversationListPreview(c, optimistic, user?.uid) || 'Tin nhắn mới',
                lastMessageAt: new Date().toISOString(),
              }
            : c
        )
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      if (restoreOnFail) setDraft(normalizedText);
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    await sendTextMessage(draft, true);
  };

  const appendDraft = (value: string) => {
    setDraft((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${value}`);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeId || uploading) return;
    e.target.value = '';
    setUploading(true);
    try {
      const url = await uploadImage(file, { folder: 'surf_chat' });
      await api.post(`/api/conversations/${activeId}/messages`, {
        mediaUrl: url,
        mediaType: 'image',
      });
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeId || uploading) return;
    e.target.value = '';
    setUploading(true);
    try {
      const url = await uploadFile(file, { folder: 'surf_chat_files' });
      await api.post(`/api/conversations/${activeId}/messages`, {
        mediaUrl: url,
        mediaType: 'file',
        fileName: file.name,
      });
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!activeId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return;
        setUploading(true);
        try {
          const url = await uploadImage(blob, { folder: 'surf_chat_audio' });
          await api.post(`/api/conversations/${activeId}/messages`, {
            mediaUrl: url,
            mediaType: 'audio',
          });
        } catch {
          /* ignore */
        } finally {
          setUploading(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      /* mic permission denied */
    }
  };

  const renderMessageReactions = (message: UiMessage, outgoing: boolean) => {
    if (message.type === 'call_log') return null;

    const reactionGroups = Object.entries(message.reactions ?? {})
      .map(([emoji, usersById]) => ({
        emoji,
        count: Object.keys(usersById).length,
      }))
      .filter((group) => group.count > 0)
      .sort((a, b) => b.count - a.count);

    if (reactionGroups.length === 0) return null;

    const totalReactionCount = reactionGroups.reduce((sum, group) => sum + group.count, 0);

    return (
      <div
        className={`absolute -bottom-3.5 z-20 inline-flex h-6 items-center gap-1 rounded-full border border-cyan-100/80 bg-white px-2 text-[11px] font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${
          outgoing ? 'right-1' : 'left-1'
        }`}
      >
        {reactionGroups.slice(0, 2).map((group) => (
          <span key={`${message.id}-${group.emoji}`} className="text-[13px] leading-none">
            {group.emoji}
          </span>
        ))}
        <span className="text-[11px] leading-none text-slate-500 dark:text-slate-300">
          {totalReactionCount}
        </span>
      </div>
    );
  };

  const renderMessageActions = (message: UiMessage, outgoing: boolean) => {
    if (message.optimistic) return null;

    const supportsQuickInteractions = message.type !== 'call_log';
    const isOwnerMessage = message.senderId === user?.uid;
    const actionPanelVisible =
      openedMessageActionId === message.id || openedReactionMessageId === message.id;

    return (
      <div
        className={`relative shrink-0 self-center transition-opacity duration-150 ${
          actionPanelVisible
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover/message-row:opacity-100 group-hover/message-row:pointer-events-auto group-focus-within/message-row:opacity-100 group-focus-within/message-row:pointer-events-auto'
        }`}
      >
        <div className={`flex items-center gap-1 ${outgoing ? 'flex-row-reverse' : ''}`}>
          {supportsQuickInteractions && (
            <button
              type="button"
              onClick={() => {
                setOpenedMessageActionId(null);
                setOpenedReactionMessageId((current) =>
                  current === message.id ? null : message.id
                );
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-100/80 bg-white/95 text-slate-500 shadow-sm transition hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
              title="Thả cảm xúc"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 17a7 7 0 1 1 7-7 7 7 0 0 1-7 7Zm-3-6a1.25 1.25 0 1 1-1.25-1.25A1.25 1.25 0 0 1 9 13Zm7 0a1.25 1.25 0 1 1-1.25-1.25A1.25 1.25 0 0 1 16 13Zm-4 3.25c-1.63 0-2.98-.88-3.54-2.2h7.08c-.56 1.32-1.91 2.2-3.54 2.2Z" />
              </svg>
            </button>
          )}

          {supportsQuickInteractions && (
            <button
              type="button"
              onClick={() => handleReplyToMessage(message)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-100/80 bg-white/95 text-slate-500 shadow-sm transition hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
              title="Trả lời"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M10.16 6.28a1 1 0 0 1 0 1.41L6.83 11H16a5 5 0 0 1 5 5v2a1 1 0 1 1-2 0v-2a3 3 0 0 0-3-3H6.83l3.33 3.31a1 1 0 1 1-1.41 1.42l-5-4.96a1 1 0 0 1 0-1.42l5-4.96a1 1 0 0 1 1.41-.11Z" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setOpenedReactionMessageId(null);
              setOpenedMessageActionId((current) => (current === message.id ? null : message.id));
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-100/80 bg-white/95 text-slate-500 shadow-sm transition hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
            title="Tùy chọn"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M6 13a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
            </svg>
          </button>
        </div>

        {supportsQuickInteractions && openedReactionMessageId === message.id && (
          <div
            className={`absolute top-9 z-30 inline-flex items-center gap-1 rounded-full border border-cyan-100/80 bg-white/95 p-1 shadow-[0_24px_42px_-26px_rgba(8,145,178,0.55)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 ${
              outgoing ? 'right-0' : 'left-0'
            }`}
          >
            {MESSAGE_REACTION_OPTIONS.map((emoji) => (
              <button
                key={`${message.id}-${emoji}`}
                type="button"
                onClick={() => {
                  void toggleMessageReaction(message.id, emoji);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[15px] transition hover:bg-cyan-50 dark:hover:bg-slate-800"
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {openedMessageActionId === message.id && (
          <div
            className={`absolute top-9 z-30 w-44 overflow-hidden rounded-2xl border border-cyan-100/80 bg-white/95 py-1 shadow-[0_26px_44px_-24px_rgba(8,145,178,0.45)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 ${
              outgoing ? 'right-0' : 'left-0'
            }`}
          >
            {supportsQuickInteractions && (
              <button
                type="button"
                onClick={() => handleReplyToMessage(message)}
                className="flex w-full items-center px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-cyan-50/80 dark:text-slate-100 dark:hover:bg-slate-800/70"
              >
                Trả lời
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void toggleMessagePin(message);
              }}
              className="flex w-full items-center px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-cyan-50/80 dark:text-slate-100 dark:hover:bg-slate-800/70"
            >
              {message.pinnedBy?.includes(user?.uid ?? '') ? 'Bỏ ghim' : 'Ghim'}
            </button>
            {isOwnerMessage && (
              <button
                type="button"
                onClick={() => {
                  void recallMessageForEveryone(message);
                }}
                className="flex w-full items-center px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-cyan-50/80 dark:text-slate-100 dark:hover:bg-slate-800/70"
              >
                Thu hồi
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void hideMessageForSelf(message);
              }}
              className="flex w-full items-center px-3.5 py-2.5 text-left text-sm font-medium text-rose-500 transition hover:bg-rose-50/70 dark:hover:bg-rose-900/20"
            >
              Gỡ phía tôi
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`${compact ? 'w-[360px] h-[520px]' : 'w-[360px] h-[540px]'} bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl border border-gray-200/60 dark:border-slate-700/60 shadow-xl shadow-black/15 flex flex-col overflow-hidden`}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-2 ${compact ? 'px-3 py-2' : 'px-4 py-3'} border-b border-gray-100 dark:border-slate-700/50 flex-shrink-0`}
      >
        {activeId && !compact ? (
          <button
            onClick={() => setActiveId(null)}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors flex-shrink-0"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        ) : null}

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {activeConv ? (
            <>
              {activeConv.type === 'group' ? (
                <span className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
                  </svg>
                </span>
              ) : (
                <Avatar
                  src={activeMarketplace?.imageUrl ?? activeConv.peer?.avatarUrl}
                  name={activeMarketplace?.title ?? activeConv.peer?.name}
                  uid={activeConv.peer?.uid}
                  size="sm"
                  showPresence={!activeMarketplace}
                />
              )}
              <div className="min-w-0">
                <span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white">
                  <span className="truncate">
                    {activeMarketplace
                      ? activeMarketplace.title
                      : activeConv.type === 'group'
                        ? (activeConv.title ?? 'Nhóm')
                        : (activeConv.peer?.name ?? 'Chat')}
                  </span>
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-cyan-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                  </svg>
                </span>
                {activeMarketplace ? (
                  <span className="mt-0.5 block truncate text-[11px] font-semibold text-cyan-600 dark:text-cyan-300">
                    {activeConv.peer?.name ?? 'Người mua'} · {formatMarketplacePrice(activeMarketplace.price)}
                  </span>
                ) : (
                  activeConv.type !== 'group' &&
                  activeConv.peer?.uid && (
                    <PresenceBadge uid={activeConv.peer.uid} variant="label" className="mt-0.5" />
                  )
                )}
              </div>
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4 text-cyan-500 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                WAVES Chat
              </span>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {activeConv && (
            <>
              <button
                type="button"
                onClick={() => startConversationCall('audio')}
                disabled={!canCallActiveConversation || isCallBusy}
                title="Gọi thoại"
                className="flex h-8 w-8 items-center justify-center rounded-full text-cyan-500 transition hover:bg-cyan-50 hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-cyan-900/25 dark:hover:text-cyan-300"
              >
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.7 11.7 0 0 0 3.68.59 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.48a1 1 0 0 1 1 1 11.7 11.7 0 0 0 .59 3.68 1 1 0 0 1-.25 1.01Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => startConversationCall('video')}
                disabled={!canCallActiveConversation || isCallBusy}
                title="Gọi video"
                className="flex h-8 w-8 items-center justify-center rounded-full text-cyan-500 transition hover:bg-cyan-50 hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-cyan-900/25 dark:hover:text-cyan-300"
              >
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
                </svg>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Thu nhỏ"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-200"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Đóng"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-200"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      {!activeId && !compact ? (
        /* ── Conversation list ── */
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
              Đang tải...
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
              <svg
                className="w-10 h-10 text-gray-200 dark:text-slate-600"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Chưa có cuộc trò chuyện nào
              </p>
            </div>
          ) : (
            conversations.map((conv) => {
              const convName =
                conv.marketplace?.title ??
                (conv.type === 'group' ? (conv.title ?? 'Nhóm') : (conv.peer?.name ?? 'Unknown'));
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                >
                  <div className="relative flex-shrink-0">
                    {conv.type === 'group' ? (
                      <span className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
                        </svg>
                      </span>
                    ) : (
                      <Avatar
                        src={conv.marketplace?.imageUrl ?? conv.peer?.avatarUrl}
                        name={convName}
                      />
                    )}
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-cyan-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                        {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                      </span>
                    )}
                    {conv.peer?.uid && conv.unreadCount === 0 && (
                      <PresenceBadge uid={conv.peer.uid} size="sm" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-800 dark:text-gray-200'}`}
                      >
                        {convName}
                      </span>
                      {conv.lastMessageAt && (
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0">
                          {formatTime(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-slate-500'}`}
                    >
                      {normalizeConversationPreview(conv.lastMessagePreview) ||
                        (conv.marketplace ? `${conv.peer?.name ?? 'Người mua'} · Surf Market` : 'Bắt đầu cuộc trò chuyện')}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : (
        /* ── Message thread ── */
        <>
          <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-3 flex flex-col gap-2">
            {activeMarketplace && (
              <div className="mb-2 rounded-2xl border border-cyan-100 bg-cyan-50/80 p-2.5 dark:border-slate-700 dark:bg-slate-900/70">
                <Link
                  to={`/feed/market/${activeMarketplace.listingId}`}
                  className="flex items-center gap-2.5"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white dark:bg-slate-800">
                    {activeMarketplace.imageUrl ? (
                      <img
                        src={optimizeImageUrl(activeMarketplace.imageUrl)}
                        alt={activeMarketplace.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-400">
                        Market
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-black text-slate-900 dark:text-white">
                      {activeMarketplace.title}
                    </div>
                    <div className="mt-0.5 text-[11px] font-bold text-cyan-700 dark:text-cyan-300">
                      {formatMarketplacePrice(activeMarketplace.price)}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">
                      {activeMarketplace.location || 'Surf Market'}
                    </div>
                  </div>
                </Link>
                {user?.uid === activeMarketplace.sellerId && (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      Trả lời nhanh
                    </div>
                    {marketplaceQuickReplies.map((reply) => (
                      <button
                        key={reply}
                        type="button"
                        onClick={() => setDraft(reply)}
                        className="block max-w-full truncate rounded-xl bg-white px-3 py-1.5 text-left text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-cyan-100 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {loadingMsgs ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Đang tải...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Gửi tin nhắn đầu tiên!
              </div>
            ) : (
              messages.map((msg) => {
                const outgoing = msg.senderId === user?.uid;
                const msgType = msg.type ?? 'text';
                const parsedReplyQuote = msg.text ? parseReplyQuoteFromText(msg.text) : null;
                const messageBodyText = parsedReplyQuote
                  ? parsedReplyQuote.bodyText
                  : stripReplyMetadata(msg.text);
                const isRecalled =
                  msg.recalledForEveryone || messageBodyText === 'Tin nhắn đã được thu hồi';
                const isPinned = Boolean(user?.uid && msg.pinnedBy?.includes(user.uid));
                const hoverTimeLabel = formatHoverTime(msg.createdAt);

                if (msgType === 'call_log') {
                  const callTone = getCallToneClasses(msg);

                  return (
                    <div
                      key={msg.id}
                      className={`group/message-row relative flex items-end gap-2 ${outgoing ? 'justify-end' : 'justify-start'}`}
                    >
                      {!outgoing && (
                        <Avatar
                          src={activeConv?.peer?.avatarUrl}
                          name={activeConv?.peer?.name}
                          uid={activeConv?.peer?.uid}
                          size="sm"
                        />
                      )}
                      <div className={`relative flex items-center gap-2 ${outgoing ? 'flex-row-reverse' : ''}`}>
                        {hoverTimeLabel && (
                          <div
                            className={`pointer-events-none absolute top-1/2 z-20 hidden -translate-y-1/2 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/message-row:opacity-100 md:flex ${
                              outgoing ? 'right-full mr-2' : 'left-full ml-2'
                            }`}
                          >
                            <span className="rounded-[14px] bg-slate-100/95 px-3 py-1.5 text-[12px] font-medium text-slate-600 shadow-sm backdrop-blur dark:bg-slate-800/95 dark:text-slate-300">
                              {hoverTimeLabel}
                            </span>
                          </div>
                        )}
                        <div
                          className={`max-w-[82%] rounded-[22px] border px-3.5 py-2.5 shadow-[0_16px_40px_-32px_rgba(8,145,178,0.45)] ${
                            outgoing
                              ? 'border-cyan-200 bg-cyan-50/95 dark:border-cyan-900/60 dark:bg-cyan-950/35'
                              : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/95'
                          } ${msg.optimistic ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${callTone.iconWrap}`}
                            >
                              {callTone.iconVariant === 'hangup' ? (
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-[18px] w-[18px]"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M4.5 15.5c4.7-3.2 10.3-3.2 15 0" />
                                  <path d="M7.2 15.2 6 18" />
                                  <path d="M16.8 15.2 18 18" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
                                  <path d={callTone.iconPath} />
                                </svg>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-[15px] font-semibold leading-6 ${callTone.title}`}>
                                {getCallDisplayTitle(
                                  msg,
                                  outgoing,
                                  activeConv?.type === 'group'
                                )}
                              </p>
                              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-300">
                                {getCallMetaLabel(msg)}
                              </p>
                              <div className="mt-2 border-t border-slate-100 pt-2 text-xs font-medium text-slate-400 dark:border-slate-700/80 dark:text-slate-500">
                                {new Intl.DateTimeFormat('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  day: '2-digit',
                                  month: '2-digit',
                                }).format(new Date(msg.createdAt))}
                              </div>
                              <button
                                type="button"
                                onClick={() => startConversationCall(msg.callMode ?? 'audio')}
                                disabled={!canCallActiveConversation || isCallBusy}
                                className="mt-2 inline-flex h-9 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 px-3.5 text-sm font-semibold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200 dark:hover:bg-cyan-900/45"
                              >
                                Gọi lại
                              </button>
                            </div>
                          </div>
                        </div>
                        {renderMessageActions(msg, outgoing)}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`group/message-row relative flex items-end gap-2 ${outgoing ? 'justify-end' : 'justify-start'}`}
                  >
                    {!outgoing && (
                      <Avatar
                        src={activeConv?.peer?.avatarUrl}
                        name={activeConv?.peer?.name}
                        uid={activeConv?.peer?.uid}
                        size="sm"
                      />
                    )}
                    <div className={`relative flex items-center gap-2 ${outgoing ? 'flex-row-reverse' : ''}`}>
                      {hoverTimeLabel && (
                        <div
                          className={`pointer-events-none absolute top-1/2 z-20 hidden -translate-y-1/2 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/message-row:opacity-100 md:flex ${
                            outgoing ? 'right-full mr-2' : 'left-full ml-2'
                          }`}
                        >
                          <span className="rounded-[14px] bg-slate-100/95 px-3 py-1.5 text-[12px] font-medium text-slate-600 shadow-sm backdrop-blur dark:bg-slate-800/95 dark:text-slate-300">
                            {hoverTimeLabel}
                          </span>
                        </div>
                      )}
                      <div
                        className={`relative max-w-[78%] rounded-2xl px-3 py-2 ${
                          outgoing
                            ? 'bg-gradient-to-br from-surf-primary to-cyan-500 text-white rounded-br-sm'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white rounded-bl-sm'
                        } ${msg.optimistic ? 'opacity-60' : ''} ${
                          Object.keys(msg.reactions ?? {}).length > 0 ? 'mb-3.5' : ''
                        }`}
                      >
                        {isPinned && (
                          <div className={`mb-1 text-[10px] font-semibold ${outgoing ? 'text-cyan-50/90' : 'text-cyan-600 dark:text-cyan-300'}`}>
                            Đã ghim
                          </div>
                        )}
                        {parsedReplyQuote && !isRecalled && (
                          <button
                            type="button"
                            title="Tin nhắn đang trả lời"
                            className={`mb-2 block w-full overflow-hidden rounded-xl border px-3 py-2 text-left ${
                              outgoing
                                ? 'border-white/60 bg-white/85 text-slate-800'
                                : 'border-orange-200/70 bg-[#fff4df] text-slate-700 dark:border-orange-300/40 dark:bg-[#3a2a13]/80 dark:text-slate-200'
                            }`}
                          >
                            <span className="block truncate text-xs font-semibold">
                              {getReplyQuoteSenderLabel(parsedReplyQuote)}
                            </span>
                            <span className="mt-0.5 block truncate text-[12px] opacity-80">
                              {normalizeReplySnippetDisplay(parsedReplyQuote.snippet)}
                            </span>
                          </button>
                        )}

                        {isRecalled ? (
                          <p className={`text-sm italic leading-5 ${outgoing ? 'text-cyan-50/90' : 'text-gray-500 dark:text-slate-300'}`}>
                            Tin nhắn đã được thu hồi
                          </p>
                        ) : msgType === 'image' && msg.mediaUrl ? (
                          <img
                            src={optimizeImageUrl(msg.mediaUrl)}
                            alt="image"
                            className="max-w-full rounded-lg cursor-pointer"
                            onClick={() => setLightboxUrl(optimizeImageUrl(msg.mediaUrl))}
                          />
                        ) : msgType === 'audio' && msg.mediaUrl ? (
                          <audio controls src={msg.mediaUrl} className="max-w-full h-8" />
                        ) : msgType === 'file' && msg.mediaUrl ? (
                          <button
                            type="button"
                            onClick={() => downloadFile(msg.mediaUrl!, msg.fileName ?? 'file')}
                            className={`flex items-center gap-1.5 text-sm underline ${outgoing ? 'text-white' : 'text-cyan-600 dark:text-cyan-400'}`}
                          >
                            <svg
                              className="w-4 h-4 flex-shrink-0"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                              />
                            </svg>
                            {msg.fileName ?? 'Tệp đính kèm'}
                          </button>
                        ) : messageBodyText ? (
                          <LinkifiedMessageText
                            text={messageBodyText}
                            outgoing={outgoing}
                            className="whitespace-pre-wrap text-sm leading-5 break-words"
                          />
                        ) : null}
                        {messageBodyText && !isRecalled && msgType !== 'text' && (
                          <LinkifiedMessageText
                            text={messageBodyText}
                            outgoing={outgoing}
                            className="mt-1 whitespace-pre-wrap text-sm leading-5 break-words"
                          />
                        )}
                        <p
                          className={`text-[10px] mt-1 text-right ${outgoing ? 'text-cyan-100/80' : 'text-gray-400 dark:text-slate-400'}`}
                        >
                          {formatTime(msg.createdAt)}
                          {msg.editedAt ? ' · đã sửa' : ''}
                        </p>
                        {deletingMessageId === msg.id && (
                          <p className={`mt-1 text-[11px] font-medium ${outgoing ? 'text-cyan-50/95' : 'text-slate-400'}`}>
                            Đang xử lý thu hồi...
                          </p>
                        )}
                        {renderMessageReactions(msg, outgoing)}
                      </div>
                      {renderMessageActions(msg, outgoing)}
                    </div>
                  </div>
                );
              })
            )}
            {typingUserIds.length > 0 && (
              <div className="flex items-end gap-2 justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-xs font-semibold leading-5 text-gray-500 dark:bg-slate-700 dark:text-slate-300">
                  <TypingIndicator label={typingText} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSend}
            className={`flex items-center gap-1.5 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'} border-t border-gray-100 dark:border-slate-700/50 flex-shrink-0`}
          >
            {/* Media buttons */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
            <button
              type="button"
              onClick={toggleRecording}
              disabled={uploading}
              title={recording ? 'Dừng ghi âm' : 'Ghi âm'}
              className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full transition-colors disabled:opacity-40 ${recording ? 'text-red-500 bg-red-50 dark:bg-red-900/30 animate-pulse' : 'text-cyan-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/25'}`}
            >
              <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 9a1 1 0 01-1-1v-1.08A7.03 7.03 0 015 11H3a9.03 9.03 0 008 8.93V20a1 1 0 012 0v.93A9.03 9.03 0 0021 11h-2a7.03 7.03 0 01-6 6.92V19a1 1 0 01-1 1z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploading}
              title="Gửi ảnh"
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-cyan-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/25 transition-colors disabled:opacity-40"
            >
              <svg
                className="w-[18px] h-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16l4.6-4.6a2 2 0 0 1 2.8 0L16 16m-2-2 1.6-1.6a2 2 0 0 1 2.8 0L20 14m-6-6h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => appendDraft('🙂')}
              disabled={uploading}
              title="Sticker"
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-cyan-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/25 transition-colors disabled:opacity-40"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m-8 8 3.5-3.5H18a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v6.5A3 3 0 0 0 6 16h.5L5 20Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => appendDraft('GIF')}
              disabled={uploading}
              title="GIF"
              className="h-8 min-w-8 flex-shrink-0 rounded-full px-1.5 text-[10px] font-black tracking-tight text-cyan-500 transition hover:bg-cyan-50 hover:text-cyan-600 disabled:opacity-40 dark:hover:bg-cyan-900/25"
            >
              GIF
            </button>
            {uploading && (
              <span className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}

            <div className="relative min-w-0 flex-1">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                onBlur={() => emitTypingStop(activeId)}
                placeholder={`Nhắn cho ${activeConv?.peer?.name ?? ''}...`}
                className="h-9 w-full min-w-0 rounded-full bg-gray-100 px-3 pr-10 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-cyan-400/50 dark:bg-slate-700 dark:text-gray-100 dark:placeholder:text-slate-500"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => appendDraft('😊')}
                title="Biểu cảm"
                className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-cyan-500 transition hover:bg-cyan-50 hover:text-cyan-600 dark:hover:bg-cyan-900/25"
              >
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.1} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 10h.01M15.5 10h.01M8.5 14.5c1.7 1.6 5.3 1.6 7 0" />
                </svg>
              </button>
            </div>
            {draft.trim() ? (
              <button
                type="submit"
                disabled={sending}
                title="Gửi"
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2Z" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void sendTextMessage('👍')}
                disabled={sending || !activeId}
                title="Gửi thích"
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-cyan-500 transition hover:bg-cyan-50 hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-cyan-900/25"
              >
                <svg className="w-[19px] h-[19px]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2 21h4V9H2v12Zm20-10a2 2 0 0 0-2-2h-6.3l.95-4.57.03-.32a1.5 1.5 0 0 0-.44-1.06L13.17 2 6.59 8.59A2 2 0 0 0 6 10v8a2 2 0 0 0 2 2h9a2 2 0 0 0 1.84-1.22l3.02-7.05A2 2 0 0 0 22 11Z" />
                </svg>
              </button>
            )}
          </form>
        </>
      )}

      {/* Image lightbox — portal to body so it's truly fullscreen */}
      {lightboxUrl &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setLightboxUrl(null)}
          >
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={optimizeImageUrl(lightboxUrl)}
              alt="preview"
              className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
