import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import PresenceBadge from '@/components/ui/PresenceBadge';
import { uploadImage } from '@/lib/cloudinary';
import { optimizeImageUrl } from '@/lib/image-cdn';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';
import { useGlobalCall } from '@/components/call/GlobalCallProvider';

type ConversationItem = {
  id: string;
  type: 'dm' | 'group';
  title?: string;
  peer: { uid: string; name: string; avatarUrl: string | null } | null;
  members?: { uid: string; name: string; avatarUrl: string | null }[];
  memberCount?: number;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
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
  callMode?: 'audio' | 'video';
  callOutcome?:
    | 'completed'
    | 'missed'
    | 'declined'
    | 'busy'
    | 'failed'
    | 'ended'
    | 'started';
  durationSeconds?: number;
};

type UiMessage = ApiMessage & {
  optimistic?: boolean;
};

type RealtimePayload = {
  conversationId: string;
  message: ApiMessage;
};

type MessagePage = {
  items: ApiMessage[];
  nextCursor: string | null;
};

type ReadReceiptItem = {
  userId: string;
  lastReadMessageId: string;
  lastReadMessageCreatedAt: string;
  lastReadAt: string | null;
};

type ReadReceiptPayload = {
  conversationId: string;
  item: ReadReceiptItem;
};

type MessageSelfHiddenPayload = {
  conversationId: string;
  messageId: string;
};

type MessageRecalledPayload = {
  conversationId: string;
  message: ApiMessage;
};

type ReceiptAvatarMember = {
  uid: string;
  name: string;
  avatarUrl: string | null;
  seenAt: string | null;
};

type FriendDirectoryItem = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  mutualCount?: number;
};

type CallMode = 'audio' | 'video';

type CallInvitePayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  mode: CallMode;
};

type CallAcceptedPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  mode: CallMode;
};

type CallSignalPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  mode: CallMode;
  signal:
    | { type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }
    | { type: 'ice'; candidate: RTCIceCandidateInit };
};

type CallEndPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  reason?: string;
};

type IncomingCall = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  mode: CallMode;
};

type ActiveCall = {
  callId: string;
  conversationId: string;
  peerId: string;
  peerName: string;
  peerAvatarUrl: string | null;
  mode: CallMode;
  isOutgoing: boolean;
  status: 'outgoing' | 'connecting' | 'connected';
};

type RecallAudience = 'everyone' | 'self';
type MessageAction = 'edit' | 'recall' | 'forward' | 'pin' | 'report';

type SharedLink = { url: string; hostname: string; label: string };
type SectionKey = 'media' | 'files' | 'links' | 'security';

const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
const fileExtensions = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.rar',
  '.json',
  '.txt',
  '.csv',
  '.env',
];

const RECEIPT_FALLBACK_BUCKET_ID = '__receipt_tail__';

const sortConversations = (items: ConversationItem[]) =>
  [...items].sort(
    (a, b) =>
      (b.lastMessageAt ? +new Date(b.lastMessageAt) : 0) -
      (a.lastMessageAt ? +new Date(a.lastMessageAt) : 0)
  );

const initials = (value?: string | null) =>
  value
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'W';

const formatListTime = (value?: string | null) => {
  if (!value) return 'Mới';
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
};

const formatFullTime = (value?: string | null) => {
  if (!value) return 'Chưa có hoạt động';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
};

const startOfWeek = (value: Date) => {
  const date = new Date(value);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatSeenTime = (value?: string | null) => {
  if (!value) return 'không rõ thời gian';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'không rõ thời gian';

  const now = new Date();
  const time = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  const isSameDay = date.toDateString() === now.toDateString();
  if (isSameDay) return time;

  const isSameWeek = startOfWeek(date).getTime() === startOfWeek(now).getTime();
  if (isSameWeek) {
    const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(date);
    return `${weekday}, ${time}`;
  }

  const isSameMonth =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (isSameMonth) {
    const day = new Intl.DateTimeFormat('vi-VN', { day: '2-digit' }).format(date);
    return `ngày ${day}, ${time}`;
  }

  const isSameYear = date.getFullYear() === now.getFullYear();
  if (isSameYear) {
    const dayMonth = new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
    }).format(date);
    return `${dayMonth}, ${time}`;
  }

  const fullDate = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);

  return `${fullDate}, ${time}`;
};

const formatDuration = (durationSeconds?: number) => {
  if (!durationSeconds || durationSeconds <= 0) return '0 giây';

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  if (minutes > 0 && seconds > 0) return `${minutes} phút ${seconds} giây`;
  if (minutes > 0) return `${minutes} phút`;
  return `${seconds} giây`;
};

const getCallMetaLabel = (message: ApiMessage) => {
  const modeLabel = message.callMode === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
  if (
    message.callOutcome === 'completed' ||
    (message.callOutcome === 'ended' && !!message.durationSeconds)
  ) {
    return `${modeLabel} • ${formatDuration(message.durationSeconds)}`;
  }

  return modeLabel;
};

const getCallDisplayTitle = (
  message: ApiMessage,
  outgoing: boolean,
  isGroupConversation: boolean
) => {
  const modeLabel = message.callMode === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';

  switch (message.callOutcome) {
    case 'started':
      return isGroupConversation ? `${modeLabel} nhóm đã bắt đầu` : `${modeLabel} đã bắt đầu`;
    case 'completed':
      if (isGroupConversation) {
        return `${modeLabel} nhóm đã hoàn tất`;
      }
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
};

const getCallToneClasses = (message: ApiMessage) => {
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
      iconClassName: '',
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
    iconClassName: '',
  };
};

const unique = <T,>(items: T[]) => Array.from(new Set(items));
const extractUrls = (text: string): string[] => text.match(/https?:\/\/[^\s]+/g) ?? [];

const getUrlPathname = (value: string) => {
  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return '';
  }
};

const isImageUrl = (value: string) =>
  imageExtensions.some((ext) => getUrlPathname(value).endsWith(ext));
const isFileUrl = (value: string) =>
  fileExtensions.some((ext) => getUrlPathname(value).endsWith(ext));

const mergeMessages = (items: UiMessage[]) => {
  const byId = new Map(items.map((item) => [item.id, item]));
  return Array.from(byId.values()).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
};

const findLatestIncomingMessage = (items: UiMessage[], currentUserId?: string | null) => {
  if (!currentUserId) return null;

  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (items[i].senderId !== currentUserId) return items[i];
  }

  return null;
};

const replaceOptimisticMessage = (items: UiMessage[], realMessage: ApiMessage) => {
  let removed = false;

  return mergeMessages([
    ...items.filter((item) => {
      if (
        !removed &&
        item.optimistic &&
        item.conversationId === realMessage.conversationId &&
        item.senderId === realMessage.senderId &&
        item.text === realMessage.text
      ) {
        removed = true;
        return false;
      }
      return true;
    }),
    realMessage,
  ]);
};

function WaveAvatar({
  src,
  uid,
  name,
  showPresence = false,
  presenceSize = 'md',
  className,
  fallbackClassName,
}: {
  src?: string | null;
  uid?: string | null;
  name?: string | null;
  showPresence?: boolean;
  presenceSize?: 'sm' | 'md' | 'lg';
  className: string;
  fallbackClassName: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolvedSrc = src && src !== failedSrc ? optimizeImageUrl(src) : null;

  return (
    <span className="relative inline-flex shrink-0 overflow-visible">
      {resolvedSrc ? (
        <img
          src={resolvedSrc}
          alt={name ?? 'Wave avatar'}
          className={className}
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        <div className={fallbackClassName}>{initials(name)}</div>
      )}
      {showPresence && uid && <PresenceBadge uid={uid} size={presenceSize} />}
    </span>
  );
}

function InfoSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-cyan-100 bg-white/95 shadow-[0_16px_36px_-28px_rgba(8,145,178,0.28)] dark:border-slate-700 dark:bg-slate-900/95">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
          {typeof count === 'number' && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{count} mục</p>
          )}
        </div>
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 text-slate-400 transition-transform dark:text-slate-500 ${open ? 'rotate-180' : ''}`}
          fill="currentColor"
        >
          <path d="m12 15.5-6-6 1.4-1.4L12 12.7l4.6-4.6L18 9.5Z" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-cyan-100 px-5 py-4 dark:border-slate-700">{children}</div>
      )}
    </section>
  );
}

async function downloadFile(url: string, fileName: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
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

export default function Waves() {
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [wavesRecording, setWavesRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [openedMessageActionId, setOpenedMessageActionId] = useState<string | null>(null);
  const [recallTargetMessage, setRecallTargetMessage] = useState<UiMessage | null>(null);
  const [recallAudience, setRecallAudience] = useState<RecallAudience>('everyone');
  const wavesImageInputRef = useRef<HTMLInputElement>(null);
  const wavesFileInputRef = useRef<HTMLInputElement>(null);
  const wavesRecorderRef = useRef<MediaRecorder | null>(null);
  const wavesAudioChunksRef = useRef<Blob[]>([]);
  const [wavesLightboxUrl, setWavesLightboxUrl] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [threads, setThreads] = useState<Record<string, UiMessage[]>>({});
  const [threadCursors, setThreadCursors] = useState<Record<string, string | null>>({});
  const [loadedThreads, setLoadedThreads] = useState<Record<string, boolean>>({});
  const [loadingThreads, setLoadingThreads] = useState<Record<string, boolean>>({});
  const [loadingMoreThreads, setLoadingMoreThreads] = useState<Record<string, boolean>>({});
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [muteConversation, setMuteConversation] = useState(false);
  const [hideConversation, setHideConversation] = useState(false);
  const [infoSections, setInfoSections] = useState<Record<SectionKey, boolean>>({
    media: true,
    files: true,
    links: true,
    security: true,
  });
  const [friends, setFriends] = useState<FriendDirectoryItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [showFriendDirectory, setShowFriendDirectory] = useState(false);
  const [openingFriendId, setOpeningFriendId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'groups'>('all');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [readReceiptsByConversation, setReadReceiptsByConversation] = useState<
    Record<string, Record<string, ReadReceiptItem>>
  >({});
  const deferredQuery = useDeferredValue(query);
  const activeConversationIdRef = useRef<string | null>(null);
  const messagesBottomRef = useRef<HTMLDivElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const suppressAutoScrollRef = useRef(false);
  const lastMarkedReadRef = useRef<Record<string, string>>({});
  const { startGroupCall, isBusy: isCallBusy } = useGlobalCall();

  const filteredConversations = useMemo(() => {
    let result = conversations;
    if (activeTab === 'unread') result = result.filter((item) => item.unreadCount > 0);
    else if (activeTab === 'groups') result = result.filter((item) => item.type === 'group');
    const keyword = deferredQuery.trim().toLowerCase();
    if (!keyword) return result;
    return result.filter((item) => {
      const name = item.type === 'group' ? (item.title ?? '') : (item.peer?.name ?? '');
      return `${name} ${item.lastMessagePreview ?? ''}`.toLowerCase().includes(keyword);
    });
  }, [conversations, deferredQuery, activeTab]);

  const filteredFriends = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase();
    if (!keyword) return friends;
    return friends.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [friends, deferredQuery]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );
  const activeMessages = activeConversationId ? (threads[activeConversationId] ?? []) : [];
  const totalUnread = conversations.reduce((sum, item) => sum + item.unreadCount, 0);
  const activeReceiptWindowKey =
    activeConversationId && activeMessages.length > 0
      ? `${activeConversationId}:${activeMessages[0]?.createdAt ?? ''}:${activeMessages[activeMessages.length - 1]?.createdAt ?? ''}`
      : null;
  const canCallActiveConversation =
    activeConversation?.type === 'group'
      ? (activeConversation.members?.length ?? 0) > 0
      : Boolean(activeConversation?.peer);
  const activeReceiptMembersByMessageId = useMemo(() => {
    if (!activeConversation) return {} as Record<string, ReceiptAvatarMember[]>;

    const participants =
      activeConversation.type === 'group'
        ? (activeConversation.members ?? [])
        : activeConversation.peer
          ? [activeConversation.peer]
          : [];
    const participantById = new Map(participants.map((member) => [member.uid, member]));
    const messageById = new Map(activeMessages.map((message) => [message.id, message]));
    const outgoingMessages = activeMessages.filter((message) => message.senderId === user?.uid);
    const buckets: Record<string, ReceiptAvatarMember[]> = {};

    Object.values(readReceiptsByConversation[activeConversation.id] ?? {})
      .sort(
        (a, b) =>
          (b.lastReadAt ? +new Date(b.lastReadAt) : 0) -
          (a.lastReadAt ? +new Date(a.lastReadAt) : 0)
      )
      .forEach((receipt) => {
        if (receipt.userId === user?.uid) return;

        const member = participantById.get(receipt.userId);
        if (!member) return;

        let anchorMessageId = RECEIPT_FALLBACK_BUCKET_ID;

        const exactMessage = messageById.get(receipt.lastReadMessageId);

        if (exactMessage && exactMessage.senderId === user?.uid) {
          anchorMessageId = receipt.lastReadMessageId;
        } else {
          const receiptCursorMs = new Date(receipt.lastReadMessageCreatedAt).getTime();
          if (Number.isFinite(receiptCursorMs)) {
            for (let index = outgoingMessages.length - 1; index >= 0; index -= 1) {
              const message = outgoingMessages[index];
              const messageCreatedAtMs = new Date(message.createdAt).getTime();
              if (messageCreatedAtMs <= receiptCursorMs) {
                anchorMessageId = message.id;
                break;
              }
            }
          }

          if (anchorMessageId === RECEIPT_FALLBACK_BUCKET_ID && outgoingMessages.length > 0) {
            // Fallback to the oldest visible outgoing message when the exact one is outside current page.
            anchorMessageId = outgoingMessages[0].id;
          }
        }

        const currentBucket = buckets[anchorMessageId] ?? [];
        if (currentBucket.some((item) => item.uid === member.uid) || currentBucket.length >= 3) {
          return;
        }

        currentBucket.push({
          uid: member.uid,
          name: member.name,
          avatarUrl: member.avatarUrl,
          seenAt: receipt.lastReadAt ?? receipt.lastReadMessageCreatedAt,
        });
        buckets[anchorMessageId] = currentBucket;
      });

    return buckets;
  }, [activeConversation, activeMessages, readReceiptsByConversation, user?.uid]);

  const mergeReadReceipts = useCallback((conversationId: string, items: ReadReceiptItem[]) => {
    if (items.length === 0) return;

    setReadReceiptsByConversation((current) => {
      const nextConversation = { ...(current[conversationId] ?? {}) };

      items.forEach((item) => {
        const previous = nextConversation[item.userId];
        if (
          previous &&
          new Date(previous.lastReadMessageCreatedAt).getTime() >
            new Date(item.lastReadMessageCreatedAt).getTime()
        ) {
          return;
        }

        nextConversation[item.userId] = item;
      });

      return {
        ...current,
        [conversationId]: nextConversation,
      };
    });
  }, []);

  const removeMessageFromThread = useCallback((conversationId: string, messageId: string) => {
    setThreads((current) => {
      const thread = current[conversationId];
      if (!thread) return current;

      const nextThread = thread.filter((item) => item.id !== messageId);
      if (nextThread.length === thread.length) return current;

      return {
        ...current,
        [conversationId]: nextThread,
      };
    });
  }, []);

  const replaceMessageInThread = useCallback((conversationId: string, message: UiMessage) => {
    setThreads((current) => {
      const thread = current[conversationId];
      if (!thread) return current;

      const hasMessage = thread.some((item) => item.id === message.id);
      if (!hasMessage) return current;

      return {
        ...current,
        [conversationId]: mergeMessages(
          thread.map((item) => (item.id === message.id ? { ...item, ...message } : item))
        ),
      };
    });
  }, []);

  const syncConversationPreviewWithMessage = useCallback(
    (conversationId: string, message: ApiMessage) => {
      setConversations((current) =>
        sortConversations(
          current.map((item) => {
            if (item.id !== conversationId) return item;

            const messageAt = +new Date(message.createdAt);
            const currentLastAt = item.lastMessageAt ? +new Date(item.lastMessageAt) : 0;

            if (messageAt < currentLastAt) return item;

            return {
              ...item,
              lastMessagePreview: message.text,
              lastMessageAt: message.createdAt,
            };
          })
        )
      );
    },
    []
  );

  const markConversationAsRead = useCallback(
    async (conversationId: string, items: UiMessage[]) => {
      if (!user?.uid) return;

      const lastIncomingMessage = findLatestIncomingMessage(items, user.uid);
      if (!lastIncomingMessage) return;

      const marker = `${lastIncomingMessage.id}:${lastIncomingMessage.createdAt}`;
      if (lastMarkedReadRef.current[conversationId] === marker) return;

      lastMarkedReadRef.current[conversationId] = marker;

      try {
        const data = await api.patch<{
          ok: true;
          count: number;
          item: ReadReceiptItem | null;
          conversationId: string;
        }>(`/api/messages/${encodeURIComponent(lastIncomingMessage.id)}/read`, {
          conversationId,
          lastReadMessageCreatedAt: lastIncomingMessage.createdAt,
        });

        const targetConversationId = data.conversationId || conversationId;

        setConversations((current) =>
          current.map((item) =>
            item.id === targetConversationId ? { ...item, unreadCount: 0 } : item
          )
        );

        if (data.item) {
          mergeReadReceipts(targetConversationId, [data.item]);
        }
      } catch {
        delete lastMarkedReadRef.current[conversationId];
      }
    },
    [mergeReadReceipts, user?.uid]
  );

  const handleDeleteMessageForSelf = useCallback(
    async (message: UiMessage) => {
      if (message.senderId !== user?.uid || deletingMessageId) return;

      setDeletingMessageId(message.id);
      try {
        const data = await api.delete<{
          ok: true;
          conversationId: string;
          messageId: string;
        }>(`/api/messages/${encodeURIComponent(message.id)}/self`, {
          conversationId: message.conversationId,
        });

        removeMessageFromThread(
          data.conversationId || message.conversationId,
          data.messageId || message.id
        );
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setDeletingMessageId((current) => (current === message.id ? null : current));
      }
    },
    [deletingMessageId, removeMessageFromThread, user?.uid]
  );

  const handleDeleteMessageForEveryone = useCallback(
    async (message: UiMessage) => {
      if (message.senderId !== user?.uid || deletingMessageId) return;

      setDeletingMessageId(message.id);
      try {
        const data = await api.delete<{
          ok: true;
          conversationId: string;
          message: ApiMessage;
        }>(`/api/messages/${encodeURIComponent(message.id)}/everyone`, {
          conversationId: message.conversationId,
        });

        const targetConversationId = data.conversationId || message.conversationId;
        replaceMessageInThread(targetConversationId, data.message);
        syncConversationPreviewWithMessage(targetConversationId, data.message);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setDeletingMessageId((current) => (current === message.id ? null : current));
      }
    },
    [deletingMessageId, replaceMessageInThread, syncConversationPreviewWithMessage, user?.uid]
  );

  const notifyComingSoon = useCallback((featureName: string) => {
    setError(`${featureName} sẽ sớm được cập nhật.`);
  }, []);

  const handleMessageAction = useCallback(
    (action: MessageAction, message: UiMessage) => {
      const isOwnMessage = message.senderId === user?.uid && !message.optimistic;
      setOpenedMessageActionId(null);

      switch (action) {
        case 'recall':
          if (!isOwnMessage) {
            setError('Bạn chỉ có thể thu hồi tin nhắn do mình gửi.');
            return;
          }
          setRecallAudience('everyone');
          setRecallTargetMessage(message);
          return;
        case 'edit':
          if (!isOwnMessage) {
            setError('Bạn chỉ có thể chỉnh sửa tin nhắn do mình gửi.');
            return;
          }
          notifyComingSoon('Chỉnh sửa tin nhắn');
          return;
        case 'forward':
          notifyComingSoon('Chuyển tiếp tin nhắn');
          return;
        case 'pin':
          notifyComingSoon('Ghim tin nhắn');
          return;
        case 'report':
          notifyComingSoon('Báo cáo tin nhắn');
          return;
        default:
          return;
      }
    },
    [notifyComingSoon, user?.uid]
  );

  const handleConfirmRecall = useCallback(async () => {
    if (!recallTargetMessage) return;

    if (recallAudience === 'everyone') {
      await handleDeleteMessageForEveryone(recallTargetMessage);
    } else {
      await handleDeleteMessageForSelf(recallTargetMessage);
    }

    setRecallTargetMessage(null);
  }, [
    handleDeleteMessageForEveryone,
    handleDeleteMessageForSelf,
    recallAudience,
    recallTargetMessage,
  ]);

  const closeRecallModal = useCallback(() => {
    if (deletingMessageId) return;
    setRecallTargetMessage(null);
  }, [deletingMessageId]);

  useEffect(() => {
    if (!openedMessageActionId) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (
        target.closest('[data-message-actions-menu]') ||
        target.closest('[data-message-actions-trigger]')
      ) {
        return;
      }

      setOpenedMessageActionId(null);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [openedMessageActionId]);

  useEffect(() => {
    setOpenedMessageActionId(null);
    setRecallTargetMessage(null);
  }, [activeConversationId]);

  useEffect(() => {
    if (!openedMessageActionId) return;
    if (!activeMessages.some((item) => item.id === openedMessageActionId)) {
      setOpenedMessageActionId(null);
    }
  }, [activeMessages, openedMessageActionId]);

  const renderMessageActions = (message: UiMessage, outgoing: boolean) => {
    const isOwnerMessage = message.senderId === user?.uid && !message.optimistic;

    return (
      <div className="relative mt-1 shrink-0">
        <button
          type="button"
          data-message-actions-trigger
          onClick={() => {
            setOpenedMessageActionId((current) => (current === message.id ? null : message.id));
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-100/80 bg-white/95 text-slate-500 shadow-sm transition hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
          aria-label="Mở tùy chọn tin nhắn"
          title="Mở tùy chọn tin nhắn"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M6 13a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
          </svg>
        </button>

        {openedMessageActionId === message.id && (
          <div
            data-message-actions-menu
            className={`absolute top-9 z-30 w-44 overflow-hidden rounded-2xl border border-cyan-100/80 bg-white/95 py-1 shadow-[0_26px_44px_-24px_rgba(8,145,178,0.45)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 ${outgoing ? 'right-0' : 'left-0'}`}
          >
            {(
              [
                ['edit', 'Chỉnh sửa'],
                ['recall', 'Thu hồi'],
                ['forward', 'Chuyển tiếp'],
                ['pin', 'Ghim'],
                ['report', 'Báo cáo'],
              ] as Array<[MessageAction, string]>
            ).map(([action, label]) => {
              const notAllowed = (action === 'edit' || action === 'recall') && !isOwnerMessage;

              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => {
                    handleMessageAction(action, message);
                  }}
                  className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm font-medium transition ${action === 'report' ? 'text-rose-500 hover:bg-rose-50/70 dark:hover:bg-rose-900/20' : 'text-slate-700 hover:bg-cyan-50/80 dark:text-slate-100 dark:hover:bg-slate-800/70'} ${notAllowed ? 'opacity-60' : ''}`}
                >
                  <span>{label}</span>
                  {notAllowed && <span className="text-[10px] text-slate-400">Chỉ của bạn</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderSeenReceipts = (members: ReceiptAvatarMember[]) => {
    if (members.length === 0) return null;

    const showSeenLabel = activeConversation?.type === 'dm';

    return (
      <div className="mt-1 flex flex-wrap items-center justify-end gap-1 px-1">
        {showSeenLabel && <span className="mr-1 text-[11px] font-medium text-slate-400">Seen</span>}
        {members.map((member) => (
          <div
            key={member.uid}
            title={`${member.name} đã xem lúc ${formatSeenTime(member.seenAt)}`}
          >
            <WaveAvatar
              src={member.avatarUrl}
              uid={member.uid}
              name={member.name}
              presenceSize="sm"
              className="h-5 w-5 rounded-full object-cover ring-2 ring-white dark:ring-slate-900"
              fallbackClassName="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-[9px] font-semibold text-white ring-2 ring-white dark:ring-slate-900"
            />
          </div>
        ))}
      </div>
    );
  };

  const startConversationCall = (mode: CallMode) => {
    if (!activeConversation || isCallBusy) return;

    if (activeConversation.type === 'group') {
      startGroupCall({
        conversationId: activeConversation.id,
        conversationTitle: activeConversation.title ?? 'Nhóm',
        memberIds: (activeConversation.members ?? []).map((member) => member.uid),
        mode,
      });
      return;
    }

    if (!activeConversation.peer) return;

    startGroupCall({
      conversationId: activeConversation.id,
      conversationTitle: activeConversation.peer.name,
      memberIds: [activeConversation.peer.uid],
      mode,
    });
  };

  const sharedLinks = useMemo<SharedLink[]>(() => {
    const urls = unique(activeMessages.flatMap((message) => extractUrls(message.text)));
    return urls.map((url) => {
      try {
        const parsed = new URL(url);
        const rawLabel = parsed.pathname.split('/').filter(Boolean).pop() ?? parsed.hostname;
        return { url, hostname: parsed.hostname, label: decodeURIComponent(rawLabel) };
      } catch {
        return { url, hostname: 'Unknown host', label: url };
      }
    });
  }, [activeMessages]);

  const sharedMedia = useMemo(
    () => sharedLinks.filter((item) => isImageUrl(item.url)),
    [sharedLinks]
  );
  const sharedFiles = useMemo(
    () => sharedLinks.filter((item) => isFileUrl(item.url)),
    [sharedLinks]
  );
  const sharedPages = useMemo(
    () => sharedLinks.filter((item) => !isImageUrl(item.url) && !isFileUrl(item.url)),
    [sharedLinks]
  );

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    const socket = getSocket();
    if (!activeConversationId) return;

    socket.emit('conversation:join', activeConversationId);
    return () => {
      socket.emit('conversation:leave', activeConversationId);
    };
  }, [activeConversationId]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.get<{ items: ConversationItem[] }>('/api/conversations?limit=30');
        const items = sortConversations(data.items ?? []);
        setConversations(items);
        setActiveConversationId((current) => current ?? items[0]?.id ?? null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const loadFriends = async () => {
      try {
        setFriendsLoading(true);
        const data = await api.get<{ friends: FriendDirectoryItem[] }>('/api/friends');
        setFriends(data.friends ?? []);
      } catch {
        setFriends([]);
      } finally {
        setFriendsLoading(false);
      }
    };

    void loadFriends();
  }, []);

  useEffect(() => {
    if (!activeConversationId) return;
    if (loadedThreads[activeConversationId]) return;
    let cancelled = false;

    const loadThread = async () => {
      try {
        setLoadingThreads((current) => ({ ...current, [activeConversationId]: true }));
        const data = await api.get<MessagePage>(
          `/api/conversations/${activeConversationId}/messages?limit=10`
        );
        if (cancelled) return;
        setThreads((current) => ({
          ...current,
          [activeConversationId]: mergeMessages(data.items ?? []),
        }));
        setThreadCursors((current) => ({
          ...current,
          [activeConversationId]: data.nextCursor ?? null,
        }));
        setLoadedThreads((current) => ({
          ...current,
          [activeConversationId]: true,
        }));
        setConversations((current) =>
          current.map((item) =>
            item.id === activeConversationId ? { ...item, unreadCount: 0 } : item
          )
        );
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled)
          setLoadingThreads((current) => ({ ...current, [activeConversationId]: false }));
      }
    };

    void loadThread();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, loadedThreads]);

  useEffect(() => {
    if (!activeConversationId) return;
    if (!loadedThreads[activeConversationId]) return;

    void markConversationAsRead(activeConversationId, activeMessages);
  }, [activeConversationId, activeMessages, loadedThreads, markConversationAsRead]);

  useEffect(() => {
    if (!activeConversationId || !activeReceiptWindowKey || activeMessages.length === 0) return;

    const lastMessage = activeMessages[activeMessages.length - 1];
    if (!lastMessage) return;

    let cancelled = false;

    const loadReadReceipts = async () => {
      try {
        const data = await api.get<{ items: ReadReceiptItem[] }>(
          `/api/conversations/${activeConversationId}/read-receipts?fromCreatedAt=${encodeURIComponent('1970-01-01T00:00:00.000Z')}&toCreatedAt=${encodeURIComponent(lastMessage.createdAt)}&limit=300`
        );
        if (cancelled) return;
        mergeReadReceipts(activeConversationId, data.items ?? []);
      } catch {
        return;
      }
    };

    void loadReadReceipts();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, activeMessages, activeReceiptWindowKey, mergeReadReceipts]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    if (suppressAutoScrollRef.current) {
      suppressAutoScrollRef.current = false;
      return;
    }

    requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'auto',
      });
    });
  }, [activeConversationId, activeMessages.length]);

  useEffect(() => {
    const socket = getSocket();
    const onMessageNew = (payload: RealtimePayload) => {
      setThreads((current) => ({
        ...current,
        [payload.message.conversationId]: replaceOptimisticMessage(
          current[payload.message.conversationId] ?? [],
          payload.message
        ),
      }));

      setConversations((current) =>
        sortConversations(
          current.map((item) => {
            if (item.id !== payload.conversationId) return item;
            const shouldIncreaseUnread =
              payload.message.senderId !== user?.uid && activeConversationIdRef.current !== item.id;
            return {
              ...item,
              lastMessagePreview: payload.message.text,
              lastMessageAt: payload.message.createdAt,
              unreadCount: shouldIncreaseUnread ? item.unreadCount + 1 : 0,
            };
          })
        )
      );
    };
    const onMessageRead = (payload: ReadReceiptPayload) => {
      mergeReadReceipts(payload.conversationId, [payload.item]);
    };
    const onMessageSelfHidden = (payload: MessageSelfHiddenPayload) => {
      removeMessageFromThread(payload.conversationId, payload.messageId);
    };
    const onMessageRecalled = (payload: MessageRecalledPayload) => {
      replaceMessageInThread(payload.conversationId, payload.message);
      syncConversationPreviewWithMessage(payload.conversationId, payload.message);
    };

    socket.on('message:new', onMessageNew);
    socket.on('message:read', onMessageRead);
    socket.on('message:self-hidden', onMessageSelfHidden);
    socket.on('message:recalled', onMessageRecalled);
    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('message:read', onMessageRead);
      socket.off('message:self-hidden', onMessageSelfHidden);
      socket.off('message:recalled', onMessageRecalled);
    };
  }, [
    mergeReadReceipts,
    removeMessageFromThread,
    replaceMessageInThread,
    syncConversationPreviewWithMessage,
    user?.uid,
  ]);

  const selectConversation = (id: string) => {
    setActiveConversationId(id);
    setMobileView('thread');
    setShowFriendDirectory(false);
    setConversations((current) =>
      current.map((item) => (item.id === id ? { ...item, unreadCount: 0 } : item))
    );
  };

  const openConversationWithFriend = async (friend: FriendDirectoryItem) => {
    try {
      setOpeningFriendId(friend.id);
      setError(null);

      const existing = conversations.find((item) => item.peer?.uid === friend.id);
      if (existing) {
        setQuery('');
        selectConversation(existing.id);
        return;
      }

      const created = await api.post<{ item: { id: string } }>('/api/conversations', {
        peerUid: friend.id,
      });
      const data = await api.get<{ items: ConversationItem[] }>('/api/conversations?limit=30');
      const items = sortConversations(data.items ?? []);
      setConversations(items);
      setQuery('');
      setShowFriendDirectory(false);
      setMobileView('thread');
      setActiveConversationId(
        created.item.id ?? items.find((item) => item.peer?.uid === friend.id)?.id ?? null
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpeningFriendId(null);
    }
  };

  const loadOlderMessages = async () => {
    if (!activeConversationId) return;
    const cursor = threadCursors[activeConversationId];
    if (
      !cursor ||
      loadingThreads[activeConversationId] ||
      loadingMoreThreads[activeConversationId]
    ) {
      return;
    }

    const viewport = messagesViewportRef.current;
    const previousHeight = viewport?.scrollHeight ?? 0;

    try {
      setLoadingMoreThreads((current) => ({ ...current, [activeConversationId]: true }));
      suppressAutoScrollRef.current = true;

      const data = await api.get<MessagePage>(
        `/api/conversations/${activeConversationId}/messages?limit=10&cursor=${encodeURIComponent(cursor)}`
      );

      setThreads((current) => ({
        ...current,
        [activeConversationId]: mergeMessages([
          ...(data.items ?? []),
          ...(current[activeConversationId] ?? []),
        ]),
      }));
      setThreadCursors((current) => ({
        ...current,
        [activeConversationId]: data.nextCursor ?? null,
      }));

      requestAnimationFrame(() => {
        const nextViewport = messagesViewportRef.current;
        if (!nextViewport) return;
        nextViewport.scrollTop = nextViewport.scrollHeight - previousHeight;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMoreThreads((current) => ({ ...current, [activeConversationId]: false }));
    }
  };

  const handleMessagesScroll = async () => {
    const viewport = messagesViewportRef.current;
    if (!viewport || viewport.scrollTop > 32) return;
    await loadOlderMessages();
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!activeConversationId || !text) return;

    const optimisticMessage: UiMessage = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId: activeConversationId,
      senderId: user?.uid ?? 'me',
      type: 'text',
      text,
      createdAt: new Date().toISOString(),
      optimistic: true,
    };

    try {
      setSending(true);
      setError(null);
      setThreads((current) => ({
        ...current,
        [activeConversationId]: mergeMessages([
          ...(current[activeConversationId] ?? []),
          optimisticMessage,
        ]),
      }));
      setConversations((current) =>
        sortConversations(
          current.map((item) =>
            item.id === activeConversationId
              ? {
                  ...item,
                  lastMessagePreview: text,
                  lastMessageAt: optimisticMessage.createdAt,
                  unreadCount: 0,
                }
              : item
          )
        )
      );
      setDraft('');

      const data = await api.post<{ item: ApiMessage }>(
        `/api/conversations/${activeConversationId}/messages`,
        { text }
      );
      setThreads((current) => ({
        ...current,
        [activeConversationId]: replaceOptimisticMessage(
          current[activeConversationId] ?? [],
          data.item
        ),
      }));
      setConversations((current) =>
        sortConversations(
          current.map((item) =>
            item.id === activeConversationId
              ? {
                  ...item,
                  lastMessagePreview: text,
                  lastMessageAt: data.item.createdAt,
                  unreadCount: 0,
                }
              : item
          )
        )
      );
    } catch (e) {
      setThreads((current) => ({
        ...current,
        [activeConversationId]: (current[activeConversationId] ?? []).filter(
          (item) => item.id !== optimisticMessage.id
        ),
      }));
      setDraft(text);
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleWavesImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversationId || uploading) return;
    e.target.value = '';
    setUploading(true);
    try {
      const url = await uploadImage(file, { folder: 'surf_chat' });
      await api.post(`/api/conversations/${activeConversationId}/messages`, {
        mediaUrl: url,
        mediaType: 'image',
      });
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
    }
  };

  const handleWavesFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversationId || uploading) return;
    e.target.value = '';
    setUploading(true);
    try {
      const url = await uploadImage(file, { folder: 'surf_chat_files' });
      await api.post(`/api/conversations/${activeConversationId}/messages`, {
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

  const toggleWavesRecording = async () => {
    if (wavesRecording) {
      wavesRecorderRef.current?.stop();
      setWavesRecording(false);
      return;
    }
    if (!activeConversationId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      wavesAudioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) wavesAudioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(wavesAudioChunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return;
        setUploading(true);
        try {
          const url = await uploadImage(blob, { folder: 'surf_chat_audio' });
          await api.post(`/api/conversations/${activeConversationId}/messages`, {
            mediaUrl: url,
            mediaType: 'audio',
          });
        } catch {
          /* ignore */
        } finally {
          setUploading(false);
        }
      };
      wavesRecorderRef.current = recorder;
      recorder.start();
      setWavesRecording(true);
    } catch {
      /* mic permission denied */
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupTitle.trim() || selectedGroupMembers.length === 0) return;
    try {
      setCreatingGroup(true);
      setError(null);
      const created = await api.post<{ item: { id: string } }>('/api/conversations/group', {
        title: newGroupTitle.trim(),
        memberIds: selectedGroupMembers,
      });
      const data = await api.get<{ items: ConversationItem[] }>('/api/conversations?limit=30');
      const items = sortConversations(data.items ?? []);
      setConversations(items);
      setShowCreateGroup(false);
      setNewGroupTitle('');
      setSelectedGroupMembers([]);
      setActiveTab('groups');
      setActiveConversationId(created.item.id ?? null);
      setMobileView('thread');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleInviteMembers = async (memberIds: string[]) => {
    if (!activeConversationId || memberIds.length === 0) return;
    try {
      setError(null);
      await api.post(`/api/conversations/${activeConversationId}/members`, { memberIds });
      const data = await api.get<{ items: ConversationItem[] }>('/api/conversations?limit=30');
      setConversations(sortConversations(data.items ?? []));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleSection = (key: SectionKey) => {
    setInfoSections((current) => ({ ...current, [key]: !current[key] }));
  };

  const recallingCurrentTarget = recallTargetMessage
    ? deletingMessageId === recallTargetMessage.id
    : false;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden lg:px-2">
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-none border border-cyan-100/70 bg-white/90 shadow-[0_28px_70px_-34px_rgba(8,145,178,0.35)] sm:rounded-[28px] dark:border-slate-700/70 dark:bg-slate-900/85">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.22),_transparent_46%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.16),_transparent_34%)]" />
        <div className="relative z-10 flex h-full min-h-0 w-full overflow-hidden">
          <section
            className={`absolute inset-0 z-10 flex min-h-0 flex-col border-r border-cyan-100/80 bg-white/80 transition-transform duration-300 ease-out dark:border-slate-700/80 dark:bg-slate-900/60 md:relative md:inset-auto md:z-auto md:w-[340px] md:translate-x-0 xl:w-[360px] ${mobileView === 'thread' ? '-translate-x-full' : 'translate-x-0'}`}
          >
            <div className="shrink-0 border-b border-cyan-100/80 bg-white/90 px-5 py-5 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/90">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-600/80 dark:text-cyan-300">
                Waves
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Messages
              </h1>
              {totalUnread > 0 && (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {totalUnread} tin nhắn chưa đọc
                </p>
              )}
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-cyan-100 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/50">
                {showFriendDirectory && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowFriendDirectory(false);
                      setQuery('');
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-100 bg-white text-slate-500 transition hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    aria-label="Quay lại danh sách chat"
                    title="Quay lại danh sách chat"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6z" />
                    </svg>
                  </button>
                )}
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-400" fill="currentColor">
                  <path d="M10 2a8 8 0 1 0 4.9 14.32l4.39 4.39 1.41-1.41-4.39-4.39A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z" />
                </svg>
                <input
                  value={query}
                  onFocus={() => setShowFriendDirectory(true)}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={showFriendDirectory ? 'Tìm trong danh bạ bạn bè' : 'Search messages'}
                  className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-100"
                />
              </div>
              <div className="mt-3 flex items-center gap-1">
                {(
                  [
                    ['all', 'Tất cả'],
                    ['unread', 'Chưa đọc'],
                    ['groups', 'Nhóm'],
                  ] as const
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab);
                      setShowFriendDirectory(false);
                    }}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${activeTab === tab ? 'bg-gradient-to-r from-surf-primary to-cyan-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                  >
                    {label}
                  </button>
                ))}
                {activeTab === 'groups' && (
                  <button
                    type="button"
                    onClick={() => setShowCreateGroup(true)}
                    className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-surf-primary to-cyan-500 text-white shadow-sm transition hover:opacity-90"
                    title="Tạo nhóm mới"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {showFriendDirectory ? (
                <>
                  <div className="px-3 pb-4 pt-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Danh bạ của bạn
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Chọn một người bạn để mở hoặc tạo cuộc trò chuyện trực tiếp.
                    </p>
                  </div>
                  {friendsLoading && (
                    <div className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                      Đang tải danh bạ bạn bè...
                    </div>
                  )}
                  {!friendsLoading && filteredFriends.length === 0 && (
                    <div className="mx-3 rounded-[28px] border border-dashed border-cyan-200 bg-cyan-50/60 px-6 py-8 text-center dark:border-slate-700 dark:bg-slate-900/60">
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        Không tìm thấy người bạn phù hợp
                      </p>
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Thử tìm tên khác hoặc mở trang bạn bè để kết nối thêm.
                      </p>
                    </div>
                  )}
                  <div className="space-y-1">
                    {filteredFriends.map((friend) => {
                      const linkedConversation = conversations.find(
                        (item) => item.peer?.uid === friend.id
                      );
                      return (
                        <button
                          key={friend.id}
                          type="button"
                          onClick={() => {
                            void openConversationWithFriend(friend);
                          }}
                          className="flex w-full items-center gap-3 rounded-[22px] px-3 py-3 text-left transition hover:bg-cyan-50/80"
                        >
                          <WaveAvatar
                            src={friend.avatarUrl}
                            uid={friend.id}
                            name={friend.name}
                            showPresence
                            presenceSize="md"
                            className="h-12 w-12 rounded-full object-cover"
                            fallbackClassName="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-sm font-semibold text-white"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                              {friend.name}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                              {linkedConversation
                                ? 'Mở lại cuộc trò chuyện hiện có'
                                : friend.mutualCount
                                  ? `${friend.mutualCount} bạn chung`
                                  : 'Bắt đầu cuộc trò chuyện mới'}
                            </p>
                          </div>
                          {openingFriendId === friend.id ? (
                            <div className="h-5 w-5 rounded-full border-2 border-cyan-200 border-t-cyan-500 animate-spin" />
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5 text-slate-300"
                              fill="currentColor"
                            >
                              <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  {loading && (
                    <div className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                      Đang tải conversations...
                    </div>
                  )}
                  {!loading && filteredConversations.length === 0 && (
                    <div className="mx-3 mt-8 rounded-[28px] border border-dashed border-cyan-200 bg-cyan-50/60 px-6 py-8 text-center dark:border-slate-700 dark:bg-slate-900/60">
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        Chưa có cuộc trò chuyện nào
                      </p>
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Tạo DM từ hồ sơ hoặc bạn bè rồi quay lại Waves.
                      </p>
                      <Link
                        to="/feed/friends"
                        className="mt-5 inline-flex items-center rounded-2xl bg-gradient-to-r from-surf-primary to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white"
                      >
                        Mở trang bạn bè
                      </Link>
                    </div>
                  )}
                  <div className="space-y-2">
                    {filteredConversations.map((conversation) => {
                      const displayName =
                        conversation.type === 'group'
                          ? (conversation.title ?? 'Nhóm')
                          : (conversation.peer?.name ?? 'Unknown Wave');
                      const avatarSrc =
                        conversation.type === 'group' ? undefined : conversation.peer?.avatarUrl;
                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => selectConversation(conversation.id)}
                          className={`flex w-full items-center gap-3 rounded-[26px] border px-4 py-4 text-left transition ${conversation.id === activeConversationId ? 'border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-white shadow-[0_20px_40px_-30px_rgba(8,145,178,0.4)] dark:border-cyan-900/50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900' : 'border-transparent bg-white/80 hover:border-cyan-100 hover:bg-cyan-50/60 dark:bg-slate-900/70 dark:hover:border-slate-700 dark:hover:bg-slate-900'}`}
                        >
                          {conversation.type === 'group' ? (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-sm font-semibold text-white">
                              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
                              </svg>
                            </div>
                          ) : (
                            <WaveAvatar
                              src={avatarSrc}
                              uid={conversation.peer?.uid}
                              name={displayName}
                              showPresence
                              presenceSize="md"
                              className="h-14 w-14 rounded-2xl object-cover"
                              fallbackClassName="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-surf-primary to-cyan-500 text-sm font-semibold text-white"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                {displayName}
                              </p>
                              {conversation.type === 'group' && conversation.memberCount && (
                                <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:bg-violet-900/40 dark:text-violet-300">
                                  {conversation.memberCount}
                                </span>
                              )}
                              <span className="ml-auto shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">
                                {formatListTime(conversation.lastMessageAt)}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                              {conversation.lastMessagePreview ?? 'Bắt đầu cuộc trò chuyện mới'}
                            </p>
                          </div>
                          {conversation.unreadCount > 0 && (
                            <span className="shrink-0 rounded-full bg-surf-primary px-2 py-1 text-[11px] font-semibold text-white">
                              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
          <section
            className={`absolute inset-0 z-20 flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(236,254,255,0.7),rgba(255,255,255,0.94))] transition-transform duration-300 ease-out dark:bg-[linear-gradient(180deg,rgba(8,47,73,0.2),rgba(15,23,42,0.96))] md:relative md:inset-auto md:z-auto md:flex-[1_1_0%] md:translate-x-0 ${mobileView === 'list' ? 'translate-x-full' : 'translate-x-0'}`}
          >
            {activeConversation ? (
              <>
                <div className="flex shrink-0 items-center gap-3 border-b border-cyan-100/80 bg-white/70 px-4 py-4 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/40 sm:px-6">
                  <button
                    type="button"
                    onClick={() => setMobileView('list')}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 md:hidden"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6z" />
                    </svg>
                  </button>
                  {activeConversation.type === 'group' ? (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
                      </svg>
                    </div>
                  ) : (
                    <WaveAvatar
                      src={activeConversation.peer?.avatarUrl}
                      uid={activeConversation.peer?.uid}
                      name={activeConversation.peer?.name}
                      showPresence
                      presenceSize="md"
                      className="h-12 w-12 rounded-2xl object-cover"
                      fallbackClassName="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-surf-primary to-cyan-500 text-sm font-semibold text-white"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-white">
                      {activeConversation.type === 'group'
                        ? (activeConversation.title ?? 'Nhóm')
                        : (activeConversation.peer?.name ?? 'Unknown Wave')}
                    </h2>
                    {activeConversation.type === 'dm' && activeConversation.peer?.uid && (
                      <PresenceBadge
                        uid={activeConversation.peer.uid}
                        variant="label"
                        className="mt-1"
                      />
                    )}
                    {activeConversation.type === 'group' && activeConversation.memberCount && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {activeConversation.memberCount} thành viên
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      startConversationCall('audio');
                    }}
                    disabled={!canCallActiveConversation || isCallBusy}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-200/80 bg-white text-slate-600 transition hover:border-cyan-300 hover:text-surf-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    title="Gọi thoại"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.7 11.7 0 0 0 3.68.59 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.48a1 1 0 0 1 1 1 11.7 11.7 0 0 0 .59 3.68 1 1 0 0 1-.25 1.01Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      startConversationCall('video');
                    }}
                    disabled={!canCallActiveConversation || isCallBusy}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-200/80 bg-white text-slate-600 transition hover:border-cyan-300 hover:text-surf-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    title="Gọi video"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInfo((current) => !current)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-200/80 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M11 7h2v2h-2zm0 4h2v6h-2zM12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z" />
                    </svg>
                  </button>
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                  <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
                    <div
                      ref={messagesViewportRef}
                      onScroll={() => {
                        void handleMessagesScroll();
                      }}
                      className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6"
                    >
                      {error && (
                        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                          {error}
                        </div>
                      )}
                      {loadingThreads[activeConversation.id] && activeMessages.length === 0 ? (
                        <div className="mx-auto mt-10 max-w-lg rounded-[32px] border border-cyan-100 bg-white/90 px-8 py-10 text-center dark:border-slate-700 dark:bg-slate-900/80">
                          <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">
                            Đang tải lịch sử tin nhắn
                          </h3>
                          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                            Waves đang lấy toàn bộ tín hiệu gần nhất của cuộc trò chuyện này.
                          </p>
                        </div>
                      ) : activeMessages.length === 0 ? (
                        <div className="mx-auto mt-10 max-w-lg rounded-[32px] border border-cyan-100 bg-white/90 px-8 py-10 text-center dark:border-slate-700 dark:bg-slate-900/80">
                          <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">
                            Bắt đầu Wave mới
                          </h3>
                          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                            Khung chat đã sẵn sàng. Gửi tin nhắn đầu tiên để cuộc trò chuyện bắt đầu
                            realtime.
                          </p>
                        </div>
                      ) : (
                        <div className="flex min-h-full w-full min-w-0 flex-col justify-end gap-4 pb-4">
                          {loadingMoreThreads[activeConversation.id] && (
                            <div className="mx-auto rounded-full border border-cyan-100 bg-white/90 px-4 py-2 text-xs font-medium text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              Đang tải thêm 10 tin nhắn cũ...
                            </div>
                          )}
                          {!loadingMoreThreads[activeConversation.id] &&
                            threadCursors[activeConversation.id] && (
                              <div className="mx-auto rounded-full bg-slate-100/90 px-4 py-2 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                Cuộn lên để tải thêm tin nhắn cũ
                              </div>
                            )}
                          {activeMessages.map((message) => {
                            const outgoing = message.senderId === user?.uid;
                            const senderMember =
                              activeConversation.type === 'group'
                                ? activeConversation.members?.find(
                                    (m) => m.uid === message.senderId
                                  )
                                : null;
                            const senderName =
                              activeConversation.type === 'group'
                                ? (senderMember?.name ?? 'Unknown')
                                : (activeConversation.peer?.name ?? 'Unknown');
                            const senderAvatar =
                              activeConversation.type === 'group'
                                ? (senderMember?.avatarUrl ?? undefined)
                                : activeConversation.peer?.avatarUrl;
                            const senderUid =
                              activeConversation.type === 'group'
                                ? (senderMember?.uid ?? null)
                                : (activeConversation.peer?.uid ?? null);
                            const callTone = getCallToneClasses(message);
                            const receiptMembers = outgoing
                              ? (activeReceiptMembersByMessageId[message.id] ?? []).filter(
                                  (member) => member.uid !== message.senderId
                                )
                              : [];

                            if (message.type === 'call_log') {
                              return (
                                <div
                                  key={message.id}
                                  className={`flex items-end gap-3 ${outgoing ? 'justify-end' : 'justify-start'}`}
                                >
                                  {!outgoing && (
                                    <WaveAvatar
                                      src={senderAvatar}
                                      uid={senderUid}
                                      name={senderName}
                                      presenceSize="sm"
                                      className="h-10 w-10 rounded-2xl object-cover"
                                      fallbackClassName="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-surf-primary to-cyan-500 text-xs font-semibold text-white"
                                    />
                                  )}
                                  <div
                                    className={`flex max-w-[18.5rem] flex-col ${outgoing ? 'items-end' : 'items-start'}`}
                                  >
                                    <div
                                      className={`flex items-start gap-2 ${outgoing ? 'flex-row-reverse' : ''}`}
                                    >
                                      <div
                                        className={`w-full rounded-[22px] border px-3.5 py-2.5 shadow-[0_16px_40px_-32px_rgba(8,145,178,0.45)] ${
                                          outgoing
                                            ? 'border-cyan-200 bg-cyan-50/95 dark:border-cyan-900/60 dark:bg-cyan-950/35'
                                            : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/95'
                                        }`}
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
                                              <svg
                                                viewBox="0 0 24 24"
                                                className={`h-[18px] w-[18px] ${callTone.iconClassName ?? ''}`}
                                                fill="currentColor"
                                              >
                                                <path d={callTone.iconPath} />
                                              </svg>
                                            )}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <p
                                              className={`text-[15px] font-semibold leading-6 ${callTone.title}`}
                                            >
                                              {getCallDisplayTitle(
                                                message,
                                                outgoing,
                                                activeConversation.type === 'group'
                                              )}
                                            </p>
                                            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-300">
                                              {getCallMetaLabel(message)}
                                            </p>
                                            <div className="mt-2 border-t border-slate-100 pt-2 text-xs font-medium text-slate-400 dark:border-slate-700/80 dark:text-slate-500">
                                              {new Intl.DateTimeFormat('vi-VN', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                day: '2-digit',
                                                month: '2-digit',
                                              }).format(new Date(message.createdAt))}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                startConversationCall(message.callMode ?? 'audio');
                                              }}
                                              disabled={!canCallActiveConversation || isCallBusy}
                                              className="mt-2 inline-flex h-9 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 px-3.5 text-sm font-semibold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200 dark:hover:bg-cyan-900/45"
                                            >
                                              Gọi lại
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                      {renderMessageActions(message, outgoing)}
                                    </div>
                                    {renderSeenReceipts(receiptMembers)}
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={message.id}
                                className={`flex items-end gap-3 ${outgoing ? 'justify-end' : 'justify-start'}`}
                              >
                                {!outgoing && (
                                  <WaveAvatar
                                    src={senderAvatar}
                                    uid={senderUid}
                                    name={senderName}
                                    presenceSize="sm"
                                    className="h-10 w-10 rounded-2xl object-cover"
                                    fallbackClassName="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-surf-primary to-cyan-500 text-xs font-semibold text-white"
                                  />
                                )}
                                <div
                                  className={`flex flex-col ${outgoing ? 'items-end' : 'items-start'}`}
                                >
                                  <div
                                    className={`flex items-start gap-2 ${outgoing ? 'flex-row-reverse' : ''}`}
                                  >
                                    <div
                                      className={`max-w-[82%] rounded-[26px] px-4 py-3 shadow-sm lg:max-w-[46rem] ${outgoing ? 'bg-gradient-to-r from-surf-primary to-cyan-500 text-white' : 'border border-cyan-100/80 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}
                                    >
                                      {!outgoing && (
                                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
                                          {senderName}
                                        </p>
                                      )}
                                      {message.type === 'image' && message.mediaUrl ? (
                                        <img
                                          src={optimizeImageUrl(message.mediaUrl)}
                                          alt="image"
                                          className="max-w-[300px] rounded-2xl cursor-pointer"
                                          onClick={() =>
                                            setWavesLightboxUrl(optimizeImageUrl(message.mediaUrl!))
                                          }
                                        />
                                      ) : message.type === 'audio' && message.mediaUrl ? (
                                        <audio
                                          controls
                                          src={message.mediaUrl}
                                          className="max-w-full"
                                        />
                                      ) : message.type === 'file' && message.mediaUrl ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            downloadFile(
                                              message.mediaUrl!,
                                              message.fileName ?? 'file'
                                            )
                                          }
                                          className={`flex items-center gap-2 underline ${outgoing ? 'text-white' : 'text-cyan-600 dark:text-cyan-400'}`}
                                        >
                                          <svg
                                            className="w-5 h-5 flex-shrink-0"
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
                                          {message.fileName ?? 'Tệp đính kèm'}
                                        </button>
                                      ) : (
                                        <p className="whitespace-pre-wrap text-sm leading-6">
                                          {message.text}
                                        </p>
                                      )}
                                      {message.text && message.type !== 'text' && (
                                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                                          {message.text}
                                        </p>
                                      )}
                                      <div
                                        className={`mt-2 text-[11px] ${outgoing ? 'text-cyan-50/90' : 'text-slate-400 dark:text-slate-500'}`}
                                      >
                                        {new Intl.DateTimeFormat('vi-VN', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        }).format(new Date(message.createdAt))}
                                      </div>
                                      {deletingMessageId === message.id && (
                                        <p
                                          className={`mt-1 text-[11px] font-medium ${outgoing ? 'text-cyan-50/95' : 'text-slate-400'}`}
                                        >
                                          Đang xử lý thu hồi...
                                        </p>
                                      )}
                                    </div>
                                    {renderMessageActions(message, outgoing)}
                                  </div>
                                  {renderSeenReceipts(receiptMembers)}
                                </div>
                              </div>
                            );
                          })}
                          {renderSeenReceipts(
                            activeReceiptMembersByMessageId[RECEIPT_FALLBACK_BUCKET_ID] ?? []
                          )}
                          <div ref={messagesBottomRef} />
                        </div>
                      )}
                    </div>
                    {showInfo &&
                      (activeConversation.peer || activeConversation.type === 'group') && (
                        <aside className="hidden w-[320px] shrink-0 border-l border-cyan-100/80 bg-white/92 dark:border-slate-700/80 dark:bg-slate-900/95 2xl:w-[340px] xl:flex xl:flex-col">
                          <div className="border-b border-cyan-100 px-6 py-5 dark:border-slate-700">
                            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                              Thông tin hội thoại
                            </h3>
                          </div>
                          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
                            {activeConversation.type === 'group' ? (
                              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                                <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor">
                                  <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
                                </svg>
                              </div>
                            ) : (
                              <WaveAvatar
                                src={activeConversation.peer!.avatarUrl}
                                uid={activeConversation.peer!.uid}
                                name={activeConversation.peer!.name}
                                showPresence
                                presenceSize="lg"
                                className="mx-auto h-24 w-24 rounded-full border border-cyan-100 object-cover dark:border-slate-700"
                                fallbackClassName="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-2xl font-semibold text-white"
                              />
                            )}
                            <h4 className="mt-4 text-center text-3xl font-semibold text-slate-900 dark:text-slate-100">
                              {activeConversation.type === 'group'
                                ? (activeConversation.title ?? 'Nhóm')
                                : activeConversation.peer!.name}
                            </h4>
                            {activeConversation.type === 'group' &&
                              activeConversation.memberCount && (
                                <p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
                                  {activeConversation.memberCount} thành viên
                                </p>
                              )}

                            <div className="mt-6 grid grid-cols-3 gap-3">
                              <button
                                type="button"
                                onClick={() => setMuteConversation((current) => !current)}
                                className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3 text-center hover:bg-cyan-100/70 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:bg-slate-700/80"
                              >
                                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm dark:bg-slate-900 dark:text-cyan-300">
                                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                                    <path d="M12 3a9 9 0 0 0-9 9h2a7 7 0 1 1 7 7v2a9 9 0 0 0 0-18Zm1 5h-2v5.41l3.3 3.3 1.4-1.42-2.7-2.7Z" />
                                  </svg>
                                </div>
                                <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                                  {muteConversation ? 'Bật thông báo' : 'Tắt thông báo'}
                                </p>
                              </button>
                              <button
                                type="button"
                                className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3 text-center hover:bg-cyan-100/70 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:bg-slate-700/80"
                              >
                                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm dark:bg-slate-900 dark:text-cyan-300">
                                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                                    <path d="m16 3 5 5-9 9H7v-5Zm-1.4 2.8L9 11.4V15h3.6l5.6-5.6Z" />
                                  </svg>
                                </div>
                                <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                                  Ghim hội thoại
                                </p>
                              </button>
                              {activeConversation.type === 'group' ? (
                                <button
                                  type="button"
                                  onClick={() => setShowCreateGroup(true)}
                                  className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3 text-center hover:bg-cyan-100/70 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:bg-slate-700/80"
                                >
                                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm dark:bg-slate-900 dark:text-violet-300">
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-5 w-5"
                                      fill="currentColor"
                                    >
                                      <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2Zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" />
                                    </svg>
                                  </div>
                                  <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                                    Mời thành viên
                                  </p>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3 text-center hover:bg-cyan-100/70 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:bg-slate-700/80"
                                >
                                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm dark:bg-slate-900 dark:text-cyan-300">
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-5 w-5"
                                      fill="currentColor"
                                    >
                                      <path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Zm-8 0c-.34 0-.72.02-1.12.06C4.01 14.28 1 15.44 1 18v2h4v-2c0-1.18.56-2.18 1.54-3A8.72 8.72 0 0 1 7 14Z" />
                                    </svg>
                                  </div>
                                  <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                                    Tạo nhóm trò chuyện
                                  </p>
                                </button>
                              )}
                            </div>

                            {activeConversation.type === 'group' && activeConversation.members && (
                              <div className="mt-6 rounded-3xl border border-cyan-100 bg-white/95 p-5 shadow-[0_16px_36px_-28px_rgba(8,145,178,0.28)] dark:border-slate-700 dark:bg-slate-900/95">
                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                  Thành viên ({activeConversation.memberCount})
                                </p>
                                <div className="mt-3 space-y-2">
                                  {activeConversation.members.map((member) => (
                                    <div key={member.uid} className="flex items-center gap-3">
                                      <WaveAvatar
                                        src={member.avatarUrl}
                                        uid={member.uid}
                                        name={member.name}
                                        showPresence
                                        presenceSize="sm"
                                        className="h-9 w-9 rounded-full object-cover"
                                        fallbackClassName="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-xs font-semibold text-white"
                                      />
                                      <p className="truncate text-sm text-slate-700 dark:text-slate-200">
                                        {member.name}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="mt-6 space-y-4">
                              <div className="rounded-3xl border border-cyan-100 bg-white/95 p-5 shadow-[0_16px_36px_-28px_rgba(8,145,178,0.28)] dark:border-slate-700 dark:bg-slate-900/95">
                                <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                                  <span>Danh sách nhắc hẹn</span>
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                    0
                                  </span>
                                </div>
                                <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                                  <span>Nhóm chung</span>
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                    0
                                  </span>
                                </div>
                                <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                                  <p className="text-xs uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
                                    Last signal
                                  </p>
                                  <p className="mt-2 font-medium text-slate-900 dark:text-slate-100">
                                    {formatFullTime(activeConversation.lastMessageAt)}
                                  </p>
                                  <p className="mt-2 text-slate-500 dark:text-slate-400">
                                    {activeConversation.lastMessagePreview ??
                                      'Chưa có tín hiệu mới trong thread này.'}
                                  </p>
                                </div>
                              </div>

                              <InfoSection
                                title="Ảnh/Video"
                                count={sharedMedia.length}
                                open={infoSections.media}
                                onToggle={() => toggleSection('media')}
                              >
                                {sharedMedia.length > 0 ? (
                                  <div className="grid grid-cols-3 gap-3">
                                    {sharedMedia.slice(0, 6).map((item) => (
                                      <a
                                        key={item.url}
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="overflow-hidden rounded-2xl border border-cyan-100 bg-white dark:border-slate-700 dark:bg-slate-900"
                                      >
                                        <img
                                          src={optimizeImageUrl(item.url)}
                                          alt={item.label}
                                          className="h-24 w-full object-cover"
                                        />
                                      </a>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Chưa có ảnh hoặc video nào được chia sẻ.
                                  </p>
                                )}
                              </InfoSection>

                              <InfoSection
                                title="File"
                                count={sharedFiles.length}
                                open={infoSections.files}
                                onToggle={() => toggleSection('files')}
                              >
                                {sharedFiles.length > 0 ? (
                                  <div className="space-y-3">
                                    {sharedFiles.slice(0, 4).map((item) => (
                                      <a
                                        key={item.url}
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 hover:bg-cyan-100/70 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:bg-slate-700/80"
                                      >
                                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-cyan-600 shadow-sm dark:bg-slate-900 dark:text-cyan-300">
                                          <svg
                                            viewBox="0 0 24 24"
                                            className="h-5 w-5"
                                            fill="currentColor"
                                          >
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8Zm0 1.5L19.5 9H14Z" />
                                          </svg>
                                        </div>
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                            {item.label}
                                          </p>
                                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {item.hostname}
                                          </p>
                                        </div>
                                      </a>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Chưa có tệp nào được chia sẻ.
                                  </p>
                                )}
                              </InfoSection>

                              <InfoSection
                                title="Link"
                                count={sharedPages.length}
                                open={infoSections.links}
                                onToggle={() => toggleSection('links')}
                              >
                                {sharedPages.length > 0 ? (
                                  <div className="space-y-3">
                                    {sharedPages.slice(0, 5).map((item) => (
                                      <a
                                        key={item.url}
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-start gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 hover:bg-cyan-100/70 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:bg-slate-700/80"
                                      >
                                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-cyan-600 shadow-sm dark:bg-slate-900 dark:text-cyan-300">
                                          <svg
                                            viewBox="0 0 24 24"
                                            className="h-5 w-5"
                                            fill="currentColor"
                                          >
                                            <path d="M3.9 12a5 5 0 0 1 1.47-3.54l2.12-2.12a5 5 0 0 1 7.07 7.07l-1.06 1.06-1.41-1.41 1.06-1.06a3 3 0 1 0-4.24-4.24L6.79 9.88a3 3 0 1 0 4.24 4.24l.53-.53 1.41 1.41-.53.53A5 5 0 0 1 3.9 12Zm6.54.71 3.15-3.15 1.41 1.41-3.15 3.15Z" />
                                          </svg>
                                        </div>
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                            {item.label}
                                          </p>
                                          <p className="mt-1 truncate text-xs text-cyan-600 dark:text-cyan-300">
                                            {item.hostname}
                                          </p>
                                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                            {item.url}
                                          </p>
                                        </div>
                                      </a>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Chưa có liên kết nào trong cuộc trò chuyện này.
                                  </p>
                                )}
                              </InfoSection>

                              <InfoSection
                                title="Thiết lập bảo mật"
                                open={infoSections.security}
                                onToggle={() => toggleSection('security')}
                              >
                                <div className="space-y-4 text-sm text-slate-700 dark:text-slate-200">
                                  <div className="flex items-center justify-between rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                                    <div>
                                      <p className="font-medium">Tin nhắn tự xóa</p>
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        Hiện đang để Không bao giờ
                                      </p>
                                    </div>
                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                      Off
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setHideConversation((current) => !current)}
                                    className="flex w-full items-center justify-between rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 text-left dark:border-slate-700 dark:bg-slate-800/70"
                                  >
                                    <div>
                                      <p className="font-medium">Ẩn trò chuyện</p>
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        Che thread này khỏi danh sách nhanh
                                      </p>
                                    </div>
                                    <span
                                      className={`relative h-6 w-11 rounded-full transition ${hideConversation ? 'bg-cyan-500' : 'bg-slate-300'}`}
                                    >
                                      <span
                                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${hideConversation ? 'left-[22px]' : 'left-0.5'}`}
                                      />
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    className="flex w-full items-center justify-between rounded-2xl bg-red-500/10 px-4 py-3 text-left text-red-600 hover:bg-red-500/15 dark:text-red-300"
                                  >
                                    <span className="font-medium">Xóa lịch sử trò chuyện</span>
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-5 w-5"
                                      fill="currentColor"
                                    >
                                      <path d="M6 7h12l-1 14H7Zm3-3h6l1 2H8Z" />
                                    </svg>
                                  </button>
                                </div>
                              </InfoSection>
                            </div>
                          </div>
                        </aside>
                      )}
                  </div>
                </div>
                <form
                  onSubmit={handleSend}
                  className="shrink-0 border-t border-cyan-100/80 bg-white/90 px-4 py-4 dark:border-slate-700/80 dark:bg-slate-900/90 sm:px-6"
                >
                  <div className="flex items-center gap-3 rounded-[28px] border border-cyan-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950/80">
                    <input
                      ref={wavesImageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleWavesImageUpload}
                    />
                    <input
                      ref={wavesFileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleWavesFileUpload}
                    />
                    <button
                      type="button"
                      onClick={() => wavesImageInputRef.current?.click()}
                      disabled={uploading}
                      title="Gửi ảnh"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-slate-400 hover:bg-cyan-50 hover:text-surf-primary dark:hover:bg-slate-800 dark:hover:text-cyan-300 disabled:opacity-40"
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => wavesFileInputRef.current?.click()}
                      disabled={uploading}
                      title="Gửi tệp"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-slate-400 hover:bg-cyan-50 hover:text-surf-primary dark:hover:bg-slate-800 dark:hover:text-cyan-300 disabled:opacity-40"
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={toggleWavesRecording}
                      disabled={uploading}
                      title={wavesRecording ? 'Dừng ghi âm' : 'Ghi âm'}
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl disabled:opacity-40 ${wavesRecording ? 'text-red-500 bg-red-50 dark:bg-red-900/30 animate-pulse' : 'text-slate-400 hover:bg-cyan-50 hover:text-surf-primary dark:hover:bg-slate-800 dark:hover:text-cyan-300'}`}
                    >
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 9a1 1 0 01-1-1v-1.08A7.03 7.03 0 015 11H3a9.03 9.03 0 008 8.93V20a1 1 0 012 0v.93A9.03 9.03 0 0021 11h-2a7.03 7.03 0 01-6 6.92V19a1 1 0 01-1 1z" />
                      </svg>
                    </button>
                    {uploading && (
                      <span className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    )}
                    <input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={`Nhắn cho ${activeConversation.type === 'group' ? (activeConversation.title ?? 'nhóm') : (activeConversation.peer?.name ?? 'wave')}...`}
                      className="h-12 w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-surf-primary to-cyan-500 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {sending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6">
                <div className="max-w-xl rounded-[32px] border border-cyan-100 bg-white/90 px-8 py-10 text-center dark:border-slate-700 dark:bg-slate-900/80">
                  <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">
                    Waves workspace
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Route này đã được thay placeholder bằng giao diện chat theo tông xanh của Surf.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {recallTargetMessage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={() => {
            closeRecallModal();
          }}
        >
          <div
            className="w-full max-w-2xl rounded-[24px] border border-cyan-100/80 bg-white/95 shadow-[0_36px_64px_-36px_rgba(8,145,178,0.5)] dark:border-slate-700 dark:bg-slate-900/95"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-cyan-100/70 px-6 py-4 dark:border-slate-700">
              <h3 className="text-center text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">
                Bạn muốn thu hồi tin nhắn này ở phía ai?
              </h3>
              <button
                type="button"
                onClick={() => {
                  closeRecallModal();
                }}
                className="ml-4 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                aria-label="Đóng hộp thoại thu hồi"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="m13.41 12 4.3-4.29-1.42-1.42L12 10.59l-4.29-4.3-1.42 1.42 4.3 4.29-4.3 4.29 1.42 1.42L12 13.41l4.29 4.3 1.42-1.42Z" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <button
                type="button"
                onClick={() => {
                  setRecallAudience('everyone');
                }}
                className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${recallAudience === 'everyone' ? 'border-cyan-400 bg-cyan-50/80 dark:border-cyan-500 dark:bg-cyan-900/20' : 'border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/60 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500 dark:hover:bg-slate-800/80'}`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${recallAudience === 'everyone' ? 'border-cyan-500' : 'border-slate-400 dark:border-slate-500'}`}
                >
                  <span
                    className={`h-3 w-3 rounded-full ${recallAudience === 'everyone' ? 'bg-cyan-500' : 'bg-transparent'}`}
                  />
                </span>
                <span>
                  <span className="block text-lg font-semibold text-slate-900 dark:text-white">
                    Thu hồi với mọi người
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Tin nhắn này sẽ bị thu hồi với mọi người trong đoạn chat. Những người khác có
                    thể đã xem hoặc chuyển tiếp tin nhắn đó. Tin nhắn đã thu hồi vẫn có thể bị báo
                    cáo.
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRecallAudience('self');
                }}
                className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${recallAudience === 'self' ? 'border-cyan-400 bg-cyan-50/80 dark:border-cyan-500 dark:bg-cyan-900/20' : 'border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/60 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500 dark:hover:bg-slate-800/80'}`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${recallAudience === 'self' ? 'border-cyan-500' : 'border-slate-400 dark:border-slate-500'}`}
                >
                  <span
                    className={`h-3 w-3 rounded-full ${recallAudience === 'self' ? 'bg-cyan-500' : 'bg-transparent'}`}
                  />
                </span>
                <span>
                  <span className="block text-lg font-semibold text-slate-900 dark:text-white">
                    Thu hồi với bạn
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Tin nhắn này sẽ bị gỡ khỏi thiết bị của bạn, nhưng vẫn hiển thị với các thành
                    viên khác trong đoạn chat.
                  </span>
                </span>
              </button>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-cyan-100/70 px-6 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  closeRecallModal();
                }}
                className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirmRecall();
                }}
                disabled={recallingCurrentTarget}
                className="rounded-2xl bg-gradient-to-r from-surf-primary to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {recallingCurrentTarget ? 'Đang gỡ...' : 'Gỡ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => {
            setShowCreateGroup(false);
            setNewGroupTitle('');
            setSelectedGroupMembers([]);
          }}
        >
          <div
            className="w-full max-w-md rounded-[28px] border border-cyan-100 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            {activeConversation?.type === 'group' && activeTab !== 'groups' ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Mời thành viên vào {activeConversation.title}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Chọn bạn bè để thêm vào nhóm
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Tạo nhóm mới
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Đặt tên và chọn thành viên ban đầu
                </p>
                <input
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                  placeholder="Tên nhóm..."
                  className="mt-4 w-full rounded-2xl border border-cyan-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-cyan-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </>
            )}

            <div className="mt-4 max-h-60 space-y-1 overflow-y-auto">
              {friends
                .filter((f) => {
                  if (activeConversation?.type === 'group' && activeTab !== 'groups') {
                    return !activeConversation.members?.some((m) => m.uid === f.id);
                  }
                  return true;
                })
                .map((friend) => {
                  const selected = selectedGroupMembers.includes(friend.id);
                  return (
                    <button
                      key={friend.id}
                      type="button"
                      onClick={() =>
                        setSelectedGroupMembers((current) =>
                          selected
                            ? current.filter((id) => id !== friend.id)
                            : [...current, friend.id]
                        )
                      }
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${selected ? 'bg-cyan-50 ring-1 ring-cyan-300 dark:bg-slate-800 dark:ring-cyan-700' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <WaveAvatar
                        src={friend.avatarUrl}
                        uid={friend.id}
                        name={friend.name}
                        showPresence
                        presenceSize="sm"
                        className="h-10 w-10 rounded-full object-cover"
                        fallbackClassName="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-xs font-semibold text-white"
                      />
                      <span className="flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                        {friend.name}
                      </span>
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${selected ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-300 dark:border-slate-600'}`}
                      >
                        {selected && (
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                            <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateGroup(false);
                  setNewGroupTitle('');
                  setSelectedGroupMembers([]);
                }}
                className="rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Hủy
              </button>
              {activeConversation?.type === 'group' && activeTab !== 'groups' ? (
                <button
                  type="button"
                  disabled={selectedGroupMembers.length === 0}
                  onClick={() => {
                    void handleInviteMembers(selectedGroupMembers).then(() => {
                      setShowCreateGroup(false);
                      setSelectedGroupMembers([]);
                    });
                  }}
                  className="rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Mời ({selectedGroupMembers.length})
                </button>
              ) : (
                <button
                  type="button"
                  disabled={
                    creatingGroup || !newGroupTitle.trim() || selectedGroupMembers.length === 0
                  }
                  onClick={() => {
                    void handleCreateGroup();
                  }}
                  className="rounded-2xl bg-gradient-to-r from-surf-primary to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {creatingGroup ? 'Đang tạo...' : `Tạo nhóm (${selectedGroupMembers.length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image lightbox — portal to body */}
      {wavesLightboxUrl &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setWavesLightboxUrl(null)}
          >
            <button
              onClick={() => setWavesLightboxUrl(null)}
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
              src={optimizeImageUrl(wavesLightboxUrl)}
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
