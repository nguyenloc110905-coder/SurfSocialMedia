import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';

type ConversationItem = {
  id: string;
  type: 'dm' | 'group';
  peer: { uid: string; name: string; avatarUrl: string | null } | null;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

type ApiMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'text';
  text: string;
  createdAt: string;
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

export default function Waves() {
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(true);
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
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
  const deferredQuery = useDeferredValue(query);
  const activeConversationIdRef = useRef<string | null>(null);
  const messagesBottomRef = useRef<HTMLDivElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const suppressAutoScrollRef = useRef(false);

  const filteredConversations = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase();
    if (!keyword) return conversations;
    return conversations.filter((item) => `${item.peer?.name ?? ''} ${item.lastMessagePreview ?? ''}`.toLowerCase().includes(keyword));
  }, [conversations, deferredQuery]);

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
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{totalUnread > 0 ? `${totalUnread} tin nhắn chưa đọc` : 'Realtime chat của Surf'}</p>
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
                    {filteredConversations.map((conversation) => (
                      <button key={conversation.id} type="button" onClick={() => selectConversation(conversation.id)} className={`flex w-full items-center gap-3 rounded-[26px] border px-4 py-4 text-left transition ${conversation.id === activeConversationId ? 'border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-white shadow-[0_20px_40px_-30px_rgba(8,145,178,0.4)] dark:border-cyan-900/50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900' : 'border-transparent bg-white/80 hover:border-cyan-100 hover:bg-cyan-50/60 dark:bg-slate-900/70 dark:hover:border-slate-700 dark:hover:bg-slate-900'}`}>
                        <WaveAvatar src={conversation.peer?.avatarUrl} name={conversation.peer?.name} className="h-14 w-14 rounded-2xl object-cover" fallbackClassName="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-surf-primary to-cyan-500 text-sm font-semibold text-white" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{conversation.peer?.name ?? 'Unknown Wave'}</p>
                            <span className="ml-auto shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">{formatListTime(conversation.lastMessageAt)}</span>
                          </div>
                          <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{conversation.lastMessagePreview ?? 'Bắt đầu cuộc trò chuyện mới'}</p>
                        </div>
                        {conversation.unreadCount > 0 && <span className="shrink-0 rounded-full bg-surf-primary px-2 py-1 text-[11px] font-semibold text-white">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}
                      </button>
                    ))}
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
                  <WaveAvatar src={activeConversation.peer?.avatarUrl} name={activeConversation.peer?.name} className="h-12 w-12 rounded-2xl object-cover" fallbackClassName="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-surf-primary to-cyan-500 text-sm font-semibold text-white" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-white">{activeConversation.peer?.name ?? 'Unknown Wave'}</h2>
                    <p className="truncate text-sm text-slate-500 dark:text-slate-400">Direct message · cập nhật realtime trên Surf Waves</p>
                  </div>
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
                            return (
                              <div key={message.id} className={`flex items-end gap-3 ${outgoing ? 'justify-end' : 'justify-start'}`}>
                                {!outgoing && <WaveAvatar src={activeConversation.peer?.avatarUrl} name={activeConversation.peer?.name} className="h-10 w-10 rounded-2xl object-cover" fallbackClassName="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-surf-primary to-cyan-500 text-xs font-semibold text-white" />}
                                <div className={`max-w-[82%] rounded-[26px] px-4 py-3 shadow-sm lg:max-w-[46rem] ${outgoing ? 'bg-gradient-to-r from-surf-primary to-cyan-500 text-white' : 'border border-cyan-100/80 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}>
                                  {!outgoing && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">{activeConversation.peer?.name}</p>}
                                  <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                                  <div className={`mt-2 text-[11px] ${outgoing ? 'text-cyan-50/90' : 'text-slate-400 dark:text-slate-500'}`}>{new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}</div>
                                </div>
                              </div>
                            );
                          })}
                          <div ref={messagesBottomRef} />
                        </div>
                      )}
                    </div>
                    {showInfo && activeConversation.peer && (
                      <aside className="hidden w-[320px] shrink-0 border-l border-cyan-100/80 bg-white/92 2xl:w-[340px] xl:flex xl:flex-col">
                        <div className="border-b border-cyan-100 px-6 py-5"><h3 className="text-xl font-semibold text-slate-900">Thông tin hội thoại</h3></div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
                          <WaveAvatar src={activeConversation.peer.avatarUrl} name={activeConversation.peer.name} className="mx-auto h-24 w-24 rounded-full border border-cyan-100 object-cover" fallbackClassName="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-2xl font-semibold text-white" />
                          <h4 className="mt-4 text-center text-3xl font-semibold text-slate-900">{activeConversation.peer.name}</h4>
                          <p className="mt-2 text-center text-sm text-slate-500">Direct message · Surf Waves</p>
                          <div className="mt-6 grid grid-cols-3 gap-3">
                            <button type="button" onClick={() => setMuteConversation((current) => !current)} className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3 text-center hover:bg-cyan-100/70"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 3a9 9 0 0 0-9 9h2a7 7 0 1 1 7 7v2a9 9 0 0 0 0-18Zm1 5h-2v5.41l3.3 3.3 1.4-1.42-2.7-2.7Z" /></svg></div><p className="mt-2 text-xs font-medium text-slate-700">{muteConversation ? 'Bật thông báo' : 'Tắt thông báo'}</p></button>
                            <button type="button" className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3 text-center hover:bg-cyan-100/70"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="m16 3 5 5-9 9H7v-5Zm-1.4 2.8L9 11.4V15h3.6l5.6-5.6Z" /></svg></div><p className="mt-2 text-xs font-medium text-slate-700">Ghim hội thoại</p></button>
                            <button type="button" className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-3 py-3 text-center hover:bg-cyan-100/70"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Zm-8 0c-.34 0-.72.02-1.12.06C4.01 14.28 1 15.44 1 18v2h4v-2c0-1.18.56-2.18 1.54-3A8.72 8.72 0 0 1 7 14Z" /></svg></div><p className="mt-2 text-xs font-medium text-slate-700">Tạo nhóm trò chuyện</p></button>
                          </div>
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
                    <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-slate-400 hover:bg-cyan-50 hover:text-surf-primary dark:hover:bg-slate-800 dark:hover:text-cyan-300"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 22a10 10 0 1 1 10-10 10 10 0 0 1-10 10Zm-4-8a4 4 0 0 0 8 0Zm1-4a1 1 0 1 0-1-1 1 1 0 0 0 1 1Zm6 0a1 1 0 1 0-1-1 1 1 0 0 0 1 1Z" /></svg></button>
                    <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Nhắn cho ${activeConversation.peer?.name ?? 'wave'}...`} className="h-12 w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-100" />
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
    </div>
  );
}
