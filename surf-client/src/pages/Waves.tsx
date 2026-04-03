import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { uploadImage } from '@/lib/cloudinary';
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
  type: 'text' | 'image' | 'file' | 'audio'| 'call_log';
  text: string;
  mediaUrl?: string;
  fileName?: string;
  createdAt: string;
  callMode?: 'audio' | 'video';
  callOutcome?: 'completed' | 'missed' | 'declined' | 'busy' | 'failed' | 'ended';
  durationSeconds?: number;
};

type UiMessage = ApiMessage & {
  optimistic?: boolean;
};

type RealtimePayload = {
  message: ApiMessage;
  conversation: { id: string; lastMessagePreview: string; lastMessageAt: string };
};

type MessagePage = {
  items: ApiMessage[];
  nextCursor: string | null;
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

type SharedLink = { url: string; hostname: string; label: string };
type SectionKey = 'media' | 'files' | 'links' | 'security';

const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
const fileExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.json', '.txt', '.csv', '.env'];

const sortConversations = (items: ConversationItem[]) =>
  [...items].sort((a, b) => (b.lastMessageAt ? +new Date(b.lastMessageAt) : 0) - (a.lastMessageAt ? +new Date(a.lastMessageAt) : 0));

const initials = (value?: string | null) =>
  value?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'W';

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
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(value));
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
  if (message.callOutcome === 'completed') {
    return `${modeLabel} • ${formatDuration(message.durationSeconds)}`;
  }

  return modeLabel;
};

const getCallDisplayTitle = (message: ApiMessage, outgoing: boolean) => {
  const modeLabel = message.callMode === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';

  switch (message.callOutcome) {
    case 'completed':
      return outgoing ? `${modeLabel} đi` : `${modeLabel} đến`;
    case 'missed':
      return outgoing ? `${modeLabel} không được bắt máy` : 'Bạn bị nhỡ';
    case 'declined':
      return outgoing ? `${modeLabel} bị từ chối` : 'Bạn đã từ chối cuộc gọi';
    case 'busy':
      return outgoing ? 'Đối phương đang bận' : `${modeLabel} khi bạn đang bận`;
    case 'failed':
      return 'Không thể kết nối cuộc gọi';
    default:
      return outgoing ? `${modeLabel} đi` : `${modeLabel} đến`;
  }
};

const getCallToneClasses = (message: ApiMessage) => {
  if (message.callOutcome === 'missed' || message.callOutcome === 'declined' || message.callOutcome === 'failed') {
    return {
      iconWrap: 'bg-red-50 text-red-500',
      title: 'text-red-500',
      iconVariant: 'hangup' as const,
      iconPath: '',
      iconClassName: '',
    };
  }

  return {
    iconWrap: 'bg-cyan-50 text-cyan-600',
    title: 'text-slate-900',
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

const isImageUrl = (value: string) => imageExtensions.some((ext) => getUrlPathname(value).endsWith(ext));
const isFileUrl = (value: string) => fileExtensions.some((ext) => getUrlPathname(value).endsWith(ext));

const mergeMessages = (items: UiMessage[]) => {
  const byId = new Map(items.map((item) => [item.id, item]));
  return Array.from(byId.values()).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
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

function WaveAvatar({ src, name, className, fallbackClassName }: { src?: string | null; name?: string | null; className: string; fallbackClassName: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <div className={fallbackClassName}>{initials(name)}</div>;
  }

  return <img src={src} alt={name ?? 'Wave avatar'} className={className} onError={() => setFailed(true)} />;
}

function InfoSection({ title, count, open, onToggle, children }: { title: string; count?: number; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-cyan-100 bg-white/95 shadow-[0_16px_36px_-28px_rgba(8,145,178,0.28)]">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div>
          <h4 className="text-base font-semibold text-slate-900">{title}</h4>
          {typeof count === 'number' && <p className="mt-1 text-xs text-slate-400">{count} mục</p>}
        </div>
        <svg viewBox="0 0 24 24" className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor"><path d="m12 15.5-6-6 1.4-1.4L12 12.7l4.6-4.6L18 9.5Z" /></svg>
      </button>
      {open && <div className="border-t border-cyan-100 px-5 py-4">{children}</div>}
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
  const [infoSections, setInfoSections] = useState<Record<SectionKey, boolean>>({ media: true, files: true, links: true, security: true });
  const [friends, setFriends] = useState<FriendDirectoryItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [showFriendDirectory, setShowFriendDirectory] = useState(false);
  const [openingFriendId, setOpeningFriendId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'groups'>('all');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const activeConversationIdRef = useRef<string | null>(null);
  const messagesBottomRef = useRef<HTMLDivElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const suppressAutoScrollRef = useRef(false);
  const { startCall, isBusy: isCallBusy } = useGlobalCall();

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

  const activeConversation = useMemo(() => conversations.find((item) => item.id === activeConversationId) ?? null, [conversations, activeConversationId]);
  const activeMessages = activeConversationId ? threads[activeConversationId] ?? [] : [];
  const totalUnread = conversations.reduce((sum, item) => sum + item.unreadCount, 0);

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

  const sharedMedia = useMemo(() => sharedLinks.filter((item) => isImageUrl(item.url)), [sharedLinks]);
  const sharedFiles = useMemo(() => sharedLinks.filter((item) => isFileUrl(item.url)), [sharedLinks]);
  const sharedPages = useMemo(() => sharedLinks.filter((item) => !isImageUrl(item.url) && !isFileUrl(item.url)), [sharedLinks]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
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
    if (loadedThreads[activeConversationId]) {
      void api.patch(`/api/conversations/${activeConversationId}/read`).catch(() => undefined);
      return;
    }
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
          current.map((item) => (item.id === activeConversationId ? { ...item, unreadCount: 0 } : item))
        );
        void api.patch(`/api/conversations/${activeConversationId}/read`).catch(() => undefined);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoadingThreads((current) => ({ ...current, [activeConversationId]: false }));
      }
    };

    void loadThread();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, loadedThreads]);

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
    const notifAudio = new Audio('/notification-message.mp3');
    notifAudio.volume = 0.5;
    const onMessageNew = (payload: RealtimePayload) => {
      // Phát chuông nếu tin nhắn từ người khác
      if (payload.message.senderId !== user?.uid) {
        notifAudio.currentTime = 0;
        notifAudio.play().catch(() => {});
      }

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
            if (item.id !== payload.conversation.id) return item;
            const shouldIncreaseUnread = payload.message.senderId !== user?.uid && activeConversationIdRef.current !== item.id;
            return {
              ...item,
              lastMessagePreview: payload.conversation.lastMessagePreview,
              lastMessageAt: payload.conversation.lastMessageAt,
              unreadCount: shouldIncreaseUnread ? item.unreadCount + 1 : 0,
            };
          })
        )
      );
    };

    socket.on('message:new', onMessageNew);
    return () => {
      socket.off('message:new', onMessageNew);
    };
  }, [user?.uid]);

  const selectConversation = (id: string) => {
    setActiveConversationId(id);
    setMobileView('thread');
    setShowFriendDirectory(false);
    setConversations((current) => current.map((item) => (item.id === id ? { ...item, unreadCount: 0 } : item)));
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
      setActiveConversationId(created.item.id ?? items.find((item) => item.peer?.uid === friend.id)?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpeningFriendId(null);
    }
  };

  const loadOlderMessages = async () => {
    if (!activeConversationId) return;
    const cursor = threadCursors[activeConversationId];
    if (!cursor || loadingThreads[activeConversationId] || loadingMoreThreads[activeConversationId]) {
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

      const data = await api.post<{ item: ApiMessage; conversation: RealtimePayload['conversation'] }>(`/api/conversations/${activeConversationId}/messages`, { text });
      setThreads((current) => ({
        ...current,
        [activeConversationId]: replaceOptimisticMessage(current[activeConversationId] ?? [], data.item),
      }));
      setConversations((current) =>
        sortConversations(
          current.map((item) =>
            item.id === activeConversationId
              ? { ...item, lastMessagePreview: data.conversation.lastMessagePreview, lastMessageAt: data.conversation.lastMessageAt, unreadCount: 0 }
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
      await api.post(`/api/conversations/${activeConversationId}/messages`, { mediaUrl: url, mediaType: 'image' });
    } catch { /* ignore */ }
    finally { setUploading(false); }
  };

  const handleWavesFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversationId || uploading) return;
    e.target.value = '';
    setUploading(true);
    try {
      const url = await uploadImage(file, { folder: 'surf_chat_files' });
      await api.post(`/api/conversations/${activeConversationId}/messages`, { mediaUrl: url, mediaType: 'file', fileName: file.name });
    } catch { /* ignore */ }
    finally { setUploading(false); }
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
      recorder.ondataavailable = (ev) => { if (ev.data.size > 0) wavesAudioChunksRef.current.push(ev.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(wavesAudioChunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return;
        setUploading(true);
        try {
          const url = await uploadImage(blob, { folder: 'surf_chat_audio' });
          await api.post(`/api/conversations/${activeConversationId}/messages`, { mediaUrl: url, mediaType: 'audio' });
        } catch { /* ignore */ }
        finally { setUploading(false); }
      };
      wavesRecorderRef.current = recorder;
      recorder.start();
      setWavesRecording(true);
    } catch { /* mic permission denied */ }
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

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden lg:px-2">
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-none border border-cyan-100/70 bg-white/90 shadow-[0_28px_70px_-34px_rgba(8,145,178,0.35)] sm:rounded-[28px] dark:border-slate-700/70 dark:bg-slate-900/85">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.22),_transparent_46%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.16),_transparent_34%)]" />
        <div className="relative z-10 flex h-full min-h-0 w-full overflow-hidden">
          <section className={`absolute inset-0 z-10 flex min-h-0 flex-col border-r border-cyan-100/80 bg-white/80 transition-transform duration-300 ease-out dark:border-slate-700/80 dark:bg-slate-900/60 md:relative md:inset-auto md:z-auto md:w-[340px] md:translate-x-0 xl:w-[360px] ${mobileView === 'thread' ? '-translate-x-full' : 'translate-x-0'}`}>
            <div className="shrink-0 border-b border-cyan-100/80 bg-white/90 px-5 py-5 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/90">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-600/80 dark:text-cyan-300">Waves</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Messages</h1>
              {totalUnread > 0 && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{totalUnread} tin nhắn chưa đọc</p>}
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-cyan-100 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/50">
                {showFriendDirectory && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowFriendDirectory(false);
                      setQuery('');
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-100 bg-white text-slate-500 transition hover:bg-cyan-50"
                    aria-label="Quay lại danh sách chat"
                    title="Quay lại danh sách chat"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6z" />
                    </svg>
                  </button>
                )}
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-400" fill="currentColor"><path d="M10 2a8 8 0 1 0 4.9 14.32l4.39 4.39 1.41-1.41-4.39-4.39A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z" /></svg>
                <input
                  value={query}
                  onFocus={() => setShowFriendDirectory(true)}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={showFriendDirectory ? 'Tìm trong danh bạ bạn bè' : 'Search messages'}
                  className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-100"
                />
              </div>
              <div className="mt-3 flex items-center gap-1">
                {([['all', 'Tất cả'], ['unread', 'Chưa đọc'], ['groups', 'Nhóm']] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => { setActiveTab(tab); setShowFriendDirectory(false); }}
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
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" /></svg>
                  </button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {showFriendDirectory ? (
                <>
                  <div className="px-3 pb-4 pt-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Danh bạ của bạn</p>
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
                      <p className="text-base font-semibold text-slate-900 dark:text-white">Không tìm thấy người bạn phù hợp</p>
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Thử tìm tên khác hoặc mở trang bạn bè để kết nối thêm.
                      </p>
                    </div>
                  )}
                  <div className="space-y-1">
                    {filteredFriends.map((friend) => {
                      const linkedConversation = conversations.find((item) => item.peer?.uid === friend.id);
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
                            name={friend.name}
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
                            <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-300" fill="currentColor">
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
                  {loading && <div className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">Đang tải conversations...</div>}
                  {!loading && filteredConversations.length === 0 && (
                    <div className="mx-3 mt-8 rounded-[28px] border border-dashed border-cyan-200 bg-cyan-50/60 px-6 py-8 text-center dark:border-slate-700 dark:bg-slate-900/60">
                      <p className="text-base font-semibold text-slate-900 dark:text-white">Chưa có cuộc trò chuyện nào</p>
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Tạo DM từ hồ sơ hoặc bạn bè rồi quay lại Waves.</p>
                      <Link to="/feed/friends" className="mt-5 inline-flex items-center rounded-2xl bg-gradient-to-r from-surf-primary to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white">Mở trang bạn bè</Link>
                    </div>
                  )}
                  <div className="space-y-2">
                    {filteredConversations.map((conversation) => {
                      const displayName = conversation.type === 'group' ? (conversation.title ?? 'Nhóm') : (conversation.peer?.name ?? 'Unknown Wave');
                      const avatarSrc = conversation.type === 'group' ? undefined : conversation.peer?.avatarUrl;
                      return (
                      <button key={conversation.id} type="button" onClick={() => selectConversation(conversation.id)} className={`flex w-full items-center gap-3 rounded-[26px] border px-4 py-4 text-left transition ${conversation.id === activeConversationId ? 'border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-white shadow-[0_20px_40px_-30px_rgba(8,145,178,0.4)] dark:border-cyan-900/50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900' : 'border-transparent bg-white/80 hover:border-cyan-100 hover:bg-cyan-50/60 dark:bg-slate-900/70 dark:hover:border-slate-700 dark:hover:bg-slate-900'}`}>
                        {conversation.type === 'group' ? (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-sm font-semibold text-white">
                            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /></svg>
                          </div>
                        ) : (
                          <WaveAvatar src={avatarSrc} name={displayName} className="h-14 w-14 rounded-2xl object-cover" fallbackClassName="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-surf-primary to-cyan-500 text-sm font-semibold text-white" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{displayName}</p>
                            {conversation.type === 'group' && conversation.memberCount && <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:bg-violet-900/40 dark:text-violet-300">{conversation.memberCount}</span>}
                            <span className="ml-auto shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">{formatListTime(conversation.lastMessageAt)}</span>
                          </div>
                          <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{conversation.lastMessagePreview ?? 'Bắt đầu cuộc trò chuyện mới'}</p>
                        </div>
                        {conversation.unreadCount > 0 && <span className="shrink-0 rounded-full bg-surf-primary px-2 py-1 text-[11px] font-semibold text-white">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}
                      </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
          <section className={`absolute inset-0 z-20 flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(236,254,255,0.7),rgba(255,255,255,0.94))] transition-transform duration-300 ease-out dark:bg-[linear-gradient(180deg,rgba(8,47,73,0.2),rgba(15,23,42,0.96))] md:relative md:inset-auto md:z-auto md:flex-[1_1_0%] md:translate-x-0 ${mobileView === 'list' ? 'translate-x-full' : 'translate-x-0'}`}>
            {activeConversation ? (
              <>
                <div className="flex shrink-0 items-center gap-3 border-b border-cyan-100/80 bg-white/70 px-4 py-4 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/40 sm:px-6">
                  <button type="button" onClick={() => setMobileView('list')} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200 bg-white text-slate-600 md:hidden"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6z" /></svg></button>
                  {activeConversation.type === 'group' ? (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /></svg>
                    </div>
                  ) : (
                    <WaveAvatar src={activeConversation.peer?.avatarUrl} name={activeConversation.peer?.name} className="h-12 w-12 rounded-2xl object-cover" fallbackClassName="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-surf-primary to-cyan-500 text-sm font-semibold text-white" />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-white">{activeConversation.type === 'group' ? (activeConversation.title ?? 'Nhóm') : (activeConversation.peer?.name ?? 'Unknown Wave')}</h2>
                    {activeConversation.type === 'group' && activeConversation.memberCount && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{activeConversation.memberCount} thành viên</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeConversation.peer) return;
                      startCall({
                        conversationId: activeConversation.id,
                        peerId: activeConversation.peer.uid,
                        peerName: activeConversation.peer.name,
                        peerAvatarUrl: activeConversation.peer.avatarUrl,
                        mode: 'audio',
                      });
                    }}
                    disabled={!activeConversation.peer || isCallBusy}
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
                      if (!activeConversation.peer) return;
                      startCall({
                        conversationId: activeConversation.id,
                        peerId: activeConversation.peer.uid,
                        peerName: activeConversation.peer.name,
                        peerAvatarUrl: activeConversation.peer.avatarUrl,
                        mode: 'video',
                      });
                    }}
                    disabled={!activeConversation.peer || isCallBusy}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-200/80 bg-white text-slate-600 transition hover:border-cyan-300 hover:text-surf-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    title="Gọi video"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
                    </svg>
                  </button>
                  <button type="button" onClick={() => setShowInfo((current) => !current)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-200/80 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M11 7h2v2h-2zm0 4h2v6h-2zM12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z" /></svg></button>
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
                      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
                      {loadingThreads[activeConversation.id] && activeMessages.length === 0 ? (
                        <div className="mx-auto mt-10 max-w-lg rounded-[32px] border border-cyan-100 bg-white/90 px-8 py-10 text-center dark:border-slate-700 dark:bg-slate-900/80">
                          <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">Đang tải lịch sử tin nhắn</h3>
                          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Waves đang lấy toàn bộ tín hiệu gần nhất của cuộc trò chuyện này.</p>
                        </div>
                      ) : activeMessages.length === 0 ? (
                        <div className="mx-auto mt-10 max-w-lg rounded-[32px] border border-cyan-100 bg-white/90 px-8 py-10 text-center dark:border-slate-700 dark:bg-slate-900/80">
                          <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">Bắt đầu Wave mới</h3>
                          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Khung chat đã sẵn sàng. Gửi tin nhắn đầu tiên để cuộc trò chuyện bắt đầu realtime.</p>
                        </div>
                      ) : (
                        <div className="flex min-h-full w-full min-w-0 flex-col justify-end gap-4 pb-4">
                          {loadingMoreThreads[activeConversation.id] && (
                            <div className="mx-auto rounded-full border border-cyan-100 bg-white/90 px-4 py-2 text-xs font-medium text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              Đang tải thêm 10 tin nhắn cũ...
                            </div>
                          )}
                          {!loadingMoreThreads[activeConversation.id] && threadCursors[activeConversation.id] && (
                            <div className="mx-auto rounded-full bg-slate-100/90 px-4 py-2 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                              Cuộn lên để tải thêm tin nhắn cũ
                            </div>
                          )}
                          {activeMessages.map((message) => {
                            const outgoing = message.senderId === user?.uid;
                            const senderMember = activeConversation.type === 'group' ? activeConversation.members?.find((m) => m.uid === message.senderId) : null;
                            const senderName = activeConversation.type === 'group' ? (senderMember?.name ?? 'Unknown') : activeConversation.peer?.name;
                            const senderAvatar = activeConversation.type === 'group' ? (senderMember?.avatarUrl ?? undefined) : activeConversation.peer?.avatarUrl;
                            const callTone = getCallToneClasses(message);

                            if (message.type === 'call_log') {
                              return (
                                <div
                                  key={message.id}
                                  className={`flex items-end gap-3 ${outgoing ? 'justify-end' : 'justify-start'}`}
                                >
                                  {!outgoing && (
                                    <WaveAvatar
                                      src={activeConversation.peer?.avatarUrl}
                                      name={activeConversation.peer?.name}
                                      className="h-10 w-10 rounded-2xl object-cover"
                                      fallbackClassName="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-surf-primary to-cyan-500 text-xs font-semibold text-white"
                                    />
                                  )}
                                  <div
                                    className={`w-full max-w-[16.5rem] rounded-[22px] border px-3.5 py-2.5 shadow-[0_16px_40px_-32px_rgba(8,145,178,0.45)] ${
                                      outgoing
                                        ? 'border-cyan-200 bg-cyan-50/95'
                                        : 'border-slate-200 bg-white'
                                    }`}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${callTone.iconWrap}`}>
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
                                          <svg viewBox="0 0 24 24" className={`h-[18px] w-[18px] ${callTone.iconClassName ?? ''}`} fill="currentColor">
                                            <path d={callTone.iconPath} />
                                          </svg>
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className={`text-[15px] font-semibold leading-6 ${callTone.title}`}>
                                          {getCallDisplayTitle(message, outgoing)}
                                        </p>
                                        <p className="mt-0.5 text-sm text-slate-500">{getCallMetaLabel(message)}</p>
                                        <div className="mt-2 border-t border-slate-100 pt-2 text-xs font-medium text-slate-400">
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
                                            if (!activeConversation.peer || isCallBusy) return;
                                            startCall({
                                              conversationId: activeConversation.id,
                                              peerId: activeConversation.peer.uid,
                                              peerName: activeConversation.peer.name,
                                              peerAvatarUrl: activeConversation.peer.avatarUrl,
                                              mode: message.callMode ?? 'audio',
                                            });
                                          }}
                                          disabled={!activeConversation.peer || isCallBusy}
                                          className="mt-2 inline-flex h-9 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 px-3.5 text-sm font-semibold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          Gọi lại
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div key={message.id} className={`flex items-end gap-3 ${outgoing ? 'justify-end' : 'justify-start'}`}>
                                {!outgoing && <WaveAvatar src={senderAvatar} name={senderName} className="h-10 w-10 rounded-2xl object-cover" fallbackClassName="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-surf-primary to-cyan-500 text-xs font-semibold text-white" />}
                                <div className={`max-w-[82%] rounded-[26px] px-4 py-3 shadow-sm lg:max-w-[46rem] ${outgoing ? 'bg-gradient-to-r from-surf-primary to-cyan-500 text-white' : 'border border-cyan-100/80 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}>
                                  {!outgoing && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">{senderName}</p>}
                                  {message.type === 'image' && message.mediaUrl ? (
                                    <img src={message.mediaUrl} alt="image" className="max-w-[300px] rounded-2xl cursor-pointer" onClick={() => setWavesLightboxUrl(message.mediaUrl!)} />
                                  ) : message.type === 'audio' && message.mediaUrl ? (
                                    <audio controls src={message.mediaUrl} className="max-w-full" />
                                  ) : message.type === 'file' && message.mediaUrl ? (
                                    <button type="button" onClick={() => downloadFile(message.mediaUrl!, message.fileName ?? 'file')} className={`flex items-center gap-2 underline ${outgoing ? 'text-white' : 'text-cyan-600 dark:text-cyan-400'}`}>
                                      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                      {message.fileName ?? 'Tệp đính kèm'}
                                    </button>
                                  ) : (
                                    <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                                  )}
                                  {message.text && message.type !== 'text' && <p className="whitespace-pre-wrap text-sm leading-6 mt-1">{message.text}</p>}
                                  <div className={`mt-2 text-[11px] ${outgoing ? 'text-cyan-50/90' : 'text-slate-400 dark:text-slate-500'}`}>{new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}</div>
                                </div>
                              </div>
                            );
                          })}
                          <div ref={messagesBottomRef} />
                        </div>
                      )}
                    </div>
                    {showInfo && (activeConversation.peer || activeConversation.type === 'group') && (
                      <aside className="hidden w-[320px] shrink-0 border-l border-cyan-100/80 bg-white/92 2xl:w-[340px] xl:flex xl:flex-col">
                        <div className="border-b border-cyan-100 px-6 py-5"><h3 className="text-xl font-semibold text-slate-900">Thông tin hội thoại</h3></div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
                          {activeConversation.type === 'group' ? (
                            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                              <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /></svg>
                            </div>
                          ) : (
                            <WaveAvatar src={activeConversation.peer!.avatarUrl} name={activeConversation.peer!.name} className="mx-auto h-24 w-24 rounded-full border border-cyan-100 object-cover" fallbackClassName="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-2xl font-semibold text-white" />
                          )}
                          <h4 className="mt-4 text-center text-3xl font-semibold text-slate-900">{activeConversation.type === 'group' ? (activeConversation.title ?? 'Nhóm') : activeConversation.peer!.name}</h4>
                          {activeConversation.type === 'group' && activeConversation.memberCount && (
                            <p className="mt-1 text-center text-sm text-slate-500">{activeConversation.memberCount} thành viên</p>
                          )}

                          <div className="mt-6 grid grid-cols-3 gap-3">
                            <button type="button" onClick={() => setMuteConversation((current) => !current)} className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3 text-center hover:bg-cyan-100/70"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 3a9 9 0 0 0-9 9h2a7 7 0 1 1 7 7v2a9 9 0 0 0 0-18Zm1 5h-2v5.41l3.3 3.3 1.4-1.42-2.7-2.7Z" /></svg></div><p className="mt-2 text-xs font-medium text-slate-700">{muteConversation ? 'Bật thông báo' : 'Tắt thông báo'}</p></button>
                            <button type="button" className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3 text-center hover:bg-cyan-100/70"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="m16 3 5 5-9 9H7v-5Zm-1.4 2.8L9 11.4V15h3.6l5.6-5.6Z" /></svg></div><p className="mt-2 text-xs font-medium text-slate-700">Ghim hội thoại</p></button>
                            {activeConversation.type === 'group' ? (
                              <button type="button" onClick={() => setShowCreateGroup(true)} className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3 text-center hover:bg-cyan-100/70"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2Zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /></svg></div><p className="mt-2 text-xs font-medium text-slate-700">Mời thành viên</p></button>
                            ) : (
                              <button type="button" className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3 text-center hover:bg-cyan-100/70"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Zm-8 0c-.34 0-.72.02-1.12.06C4.01 14.28 1 15.44 1 18v2h4v-2c0-1.18.56-2.18 1.54-3A8.72 8.72 0 0 1 7 14Z" /></svg></div><p className="mt-2 text-xs font-medium text-slate-700">Tạo nhóm trò chuyện</p></button>
                            )}
                          </div>

                          {activeConversation.type === 'group' && activeConversation.members && (
                            <div className="mt-6 rounded-3xl border border-cyan-100 bg-white/95 p-5 shadow-[0_16px_36px_-28px_rgba(8,145,178,0.28)]">
                              <p className="text-sm font-semibold text-slate-700">Thành viên ({activeConversation.memberCount})</p>
                              <div className="mt-3 space-y-2">
                                {activeConversation.members.map((member) => (
                                  <div key={member.uid} className="flex items-center gap-3">
                                    <WaveAvatar src={member.avatarUrl} name={member.name} className="h-9 w-9 rounded-full object-cover" fallbackClassName="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-xs font-semibold text-white" />
                                    <p className="truncate text-sm text-slate-700">{member.name}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mt-6 space-y-4">
                            <div className="rounded-3xl border border-cyan-100 bg-white/95 p-5 shadow-[0_16px_36px_-28px_rgba(8,145,178,0.28)]">
                              <div className="flex items-center justify-between text-sm text-slate-600"><span>Danh sách nhắc hẹn</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">0</span></div>
                              <div className="mt-4 flex items-center justify-between text-sm text-slate-600"><span>Nhóm chung</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">0</span></div>
                              <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 text-sm text-slate-600">
                                <p className="text-xs uppercase tracking-[0.18em] text-cyan-600">Last signal</p>
                                <p className="mt-2 font-medium text-slate-900">{formatFullTime(activeConversation.lastMessageAt)}</p>
                                <p className="mt-2 text-slate-500">{activeConversation.lastMessagePreview ?? 'Chưa có tín hiệu mới trong thread này.'}</p>
                              </div>
                            </div>

                            <InfoSection title="Ảnh/Video" count={sharedMedia.length} open={infoSections.media} onToggle={() => toggleSection('media')}>
                              {sharedMedia.length > 0 ? (
                                <div className="grid grid-cols-3 gap-3">
                                  {sharedMedia.slice(0, 6).map((item) => (
                                    <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-2xl border border-cyan-100 bg-white"><img src={item.url} alt={item.label} className="h-24 w-full object-cover" /></a>
                                  ))}
                                </div>
                              ) : <p className="text-sm text-slate-500">Chưa có ảnh hoặc video nào được chia sẻ.</p>}
                            </InfoSection>

                            <InfoSection title="File" count={sharedFiles.length} open={infoSections.files} onToggle={() => toggleSection('files')}>
                              {sharedFiles.length > 0 ? (
                                <div className="space-y-3">
                                  {sharedFiles.slice(0, 4).map((item) => (
                                    <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 hover:bg-cyan-100/70">
                                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-cyan-600 shadow-sm"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8Zm0 1.5L19.5 9H14Z" /></svg></div>
                                      <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{item.label}</p><p className="mt-1 text-xs text-slate-500">{item.hostname}</p></div>
                                    </a>
                                  ))}
                                </div>
                              ) : <p className="text-sm text-slate-500">Chưa có tệp nào được chia sẻ.</p>}
                            </InfoSection>

                            <InfoSection title="Link" count={sharedPages.length} open={infoSections.links} onToggle={() => toggleSection('links')}>
                              {sharedPages.length > 0 ? (
                                <div className="space-y-3">
                                  {sharedPages.slice(0, 5).map((item) => (
                                    <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 hover:bg-cyan-100/70">
                                      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-cyan-600 shadow-sm"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M3.9 12a5 5 0 0 1 1.47-3.54l2.12-2.12a5 5 0 0 1 7.07 7.07l-1.06 1.06-1.41-1.41 1.06-1.06a3 3 0 1 0-4.24-4.24L6.79 9.88a3 3 0 1 0 4.24 4.24l.53-.53 1.41 1.41-.53.53A5 5 0 0 1 3.9 12Zm6.54.71 3.15-3.15 1.41 1.41-3.15 3.15Z" /></svg></div>
                                      <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{item.label}</p><p className="mt-1 truncate text-xs text-cyan-600">{item.hostname}</p><p className="mt-1 truncate text-xs text-slate-500">{item.url}</p></div>
                                    </a>
                                  ))}
                                </div>
                              ) : <p className="text-sm text-slate-500">Chưa có liên kết nào trong cuộc trò chuyện này.</p>}
                            </InfoSection>

                            <InfoSection title="Thiết lập bảo mật" open={infoSections.security} onToggle={() => toggleSection('security')}>
                              <div className="space-y-4 text-sm text-slate-700">
                                <div className="flex items-center justify-between rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3"><div><p className="font-medium">Tin nhắn tự xóa</p><p className="mt-1 text-xs text-slate-500">Hiện đang để Không bao giờ</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">Off</span></div>
                                <button type="button" onClick={() => setHideConversation((current) => !current)} className="flex w-full items-center justify-between rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 text-left"><div><p className="font-medium">Ẩn trò chuyện</p><p className="mt-1 text-xs text-slate-500">Che thread này khỏi danh sách nhanh</p></div><span className={`relative h-6 w-11 rounded-full transition ${hideConversation ? 'bg-cyan-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${hideConversation ? 'left-[22px]' : 'left-0.5'}`} /></span></button>
                                <button type="button" className="flex w-full items-center justify-between rounded-2xl bg-red-500/10 px-4 py-3 text-left text-red-300 hover:bg-red-500/15"><span className="font-medium">Xóa lịch sử trò chuyện</span><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M6 7h12l-1 14H7Zm3-3h6l1 2H8Z" /></svg></button>
                              </div>
                            </InfoSection>
                          </div>
                        </div>
                      </aside>
                    )}
                  </div>
                </div>
                <form onSubmit={handleSend} className="shrink-0 border-t border-cyan-100/80 bg-white/90 px-4 py-4 dark:border-slate-700/80 dark:bg-slate-900/90 sm:px-6">
                  <div className="flex items-center gap-3 rounded-[28px] border border-cyan-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                    <input ref={wavesImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleWavesImageUpload} />
                    <input ref={wavesFileInputRef} type="file" className="hidden" onChange={handleWavesFileUpload} />
                    <button type="button" onClick={() => wavesImageInputRef.current?.click()} disabled={uploading} title="Gửi ảnh" className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-slate-400 hover:bg-cyan-50 hover:text-surf-primary dark:hover:bg-slate-800 dark:hover:text-cyan-300 disabled:opacity-40">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </button>
                    <button type="button" onClick={() => wavesFileInputRef.current?.click()} disabled={uploading} title="Gửi tệp" className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-slate-400 hover:bg-cyan-50 hover:text-surf-primary dark:hover:bg-slate-800 dark:hover:text-cyan-300 disabled:opacity-40">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    </button>
                    <button type="button" onClick={toggleWavesRecording} disabled={uploading} title={wavesRecording ? 'Dừng ghi âm' : 'Ghi âm'} className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl disabled:opacity-40 ${wavesRecording ? 'text-red-500 bg-red-50 dark:bg-red-900/30 animate-pulse' : 'text-slate-400 hover:bg-cyan-50 hover:text-surf-primary dark:hover:bg-slate-800 dark:hover:text-cyan-300'}`}>
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 9a1 1 0 01-1-1v-1.08A7.03 7.03 0 015 11H3a9.03 9.03 0 008 8.93V20a1 1 0 012 0v.93A9.03 9.03 0 0021 11h-2a7.03 7.03 0 01-6 6.92V19a1 1 0 01-1 1z" /></svg>
                    </button>
                    {uploading && <span className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                    <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Nhắn cho ${activeConversation.type === 'group' ? (activeConversation.title ?? 'nhóm') : (activeConversation.peer?.name ?? 'wave')}...`} className="h-12 w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-100" />
                    <button type="submit" disabled={sending || !draft.trim()} className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-surf-primary to-cyan-500 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{sending ? 'Sending...' : 'Send'}</button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6"><div className="max-w-xl rounded-[32px] border border-cyan-100 bg-white/90 px-8 py-10 text-center dark:border-slate-700 dark:bg-slate-900/80"><h2 className="text-3xl font-semibold text-slate-900 dark:text-white">Waves workspace</h2><p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Route này đã được thay placeholder bằng giao diện chat theo tông xanh của Surf.</p></div></div>
            )}
          </section>
        </div>
      </div>

      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowCreateGroup(false); setNewGroupTitle(''); setSelectedGroupMembers([]); }}>
          <div className="w-full max-w-md rounded-[28px] border border-cyan-100 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            {activeConversation?.type === 'group' && activeTab !== 'groups' ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Mời thành viên vào {activeConversation.title}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Chọn bạn bè để thêm vào nhóm</p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Tạo nhóm mới</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Đặt tên và chọn thành viên ban đầu</p>
                <input
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                  placeholder="Tên nhóm..."
                  className="mt-4 w-full rounded-2xl border border-cyan-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-cyan-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </>
            )}

            <div className="mt-4 max-h-60 space-y-1 overflow-y-auto">
              {friends.filter((f) => {
                if (activeConversation?.type === 'group' && activeTab !== 'groups') {
                  return !activeConversation.members?.some((m) => m.uid === f.id);
                }
                return true;
              }).map((friend) => {
                const selected = selectedGroupMembers.includes(friend.id);
                return (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => setSelectedGroupMembers((current) => selected ? current.filter((id) => id !== friend.id) : [...current, friend.id])}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${selected ? 'bg-cyan-50 ring-1 ring-cyan-300 dark:bg-slate-800 dark:ring-cyan-700' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    <WaveAvatar src={friend.avatarUrl} name={friend.name} className="h-10 w-10 rounded-full object-cover" fallbackClassName="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-xs font-semibold text-white" />
                    <span className="flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">{friend.name}</span>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${selected ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                      {selected && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowCreateGroup(false); setNewGroupTitle(''); setSelectedGroupMembers([]); }}
                className="rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Hủy
              </button>
              {activeConversation?.type === 'group' && activeTab !== 'groups' ? (
                <button
                  type="button"
                  disabled={selectedGroupMembers.length === 0}
                  onClick={() => { void handleInviteMembers(selectedGroupMembers).then(() => { setShowCreateGroup(false); setSelectedGroupMembers([]); }); }}
                  className="rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Mời ({selectedGroupMembers.length})
                </button>
              ) : (
                <button
                  type="button"
                  disabled={creatingGroup || !newGroupTitle.trim() || selectedGroupMembers.length === 0}
                  onClick={() => { void handleCreateGroup(); }}
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
      {wavesLightboxUrl && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setWavesLightboxUrl(null)}>
          <button onClick={() => setWavesLightboxUrl(null)} className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <img src={wavesLightboxUrl} alt="preview" className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body
      )}
    </div>
  );
}
