import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAuthStore } from '../../stores/authStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { formatLastSeen } from '../../lib/utils/lastSeen';

interface ConversationItem {
  id: string;
  peer: { uid: string; name: string; avatarUrl: string | null } | null;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
}

interface UiMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  optimistic?: boolean;
}

interface RealtimePayload {
  message: UiMessage;
  conversation: { id: string; lastMessagePreview: string; lastMessageAt: string };
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

function Avatar({ src, name, size = 'md' }: { src?: string | null; name?: string | null; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <span className={`${cls} rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center bg-gradient-to-br from-surf-primary to-cyan-500 text-white font-semibold`}>
      {src
        ? <img src={src} alt={name ?? ''} className="w-full h-full object-cover" />
        : <span>{name ? getInitials(name) : '?'}</span>
      }
    </span>
  );
}

/** Presence badge overlaid on avatar corner */
function ConvPresenceBadge({ uid }: { uid: string }) {
  const isOnline = usePresenceStore((s) => s.onlineUsers.has(uid));
  const lastSeenTs = usePresenceStore((s) => s.lastSeen.get(uid));

  if (isOnline) {
    return (
      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800" />
    );
  }
  if (lastSeenTs == null) return null;
  const { label, gray } = formatLastSeen(lastSeenTs);
  if (gray) {
    return (
      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-gray-400 dark:bg-slate-500 border-2 border-white dark:border-slate-800" />
    );
  }
  return (
    <span className="absolute -bottom-1 -right-1 bg-gray-700 dark:bg-slate-600 text-white text-[9px] font-semibold leading-none px-1 py-0.5 rounded-full border border-white dark:border-slate-800 whitespace-nowrap">
      {label}
    </span>
  );
}

interface Props {
  onClose: () => void;
}

export default function MiniChatPanel({ onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  // Load conversation list
  useEffect(() => {
    api
      .get<{ items: ConversationItem[] }>('/api/conversations?limit=30')
      .then((data) => setConversations(data.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c))
    );
  }, [activeId]);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input
  useEffect(() => {
    if (activeId) setTimeout(() => inputRef.current?.focus(), 100);
  }, [activeId]);

  // Realtime socket
  useEffect(() => {
    const socket = getSocket();
    const handler = (payload: RealtimePayload) => {
      const { message, conversation } = payload;
      // Update messages if in this conversation
      if (message.conversationId === activeId) {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === message.id);
          if (exists) return prev;
          return [...prev.filter((m) => !(m.optimistic && m.text === message.text && m.senderId === message.senderId)), message];
        });
      }
      // Update conversation preview
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversation.id
            ? {
                ...c,
                lastMessagePreview: conversation.lastMessagePreview,
                lastMessageAt: conversation.lastMessageAt,
                unreadCount: c.id === activeId ? 0 : c.unreadCount + 1,
              }
            : c
        )
      );
    };
    socket.on('message:new', handler);
    return () => { socket.off('message:new', handler); };
  }, [activeId]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!activeId || !text || sending) return;

    const optimistic: UiMessage = {
      id: `temp-${Date.now()}`,
      conversationId: activeId,
      senderId: user?.uid ?? '',
      text,
      createdAt: new Date().toISOString(),
      optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    setSending(true);
    try {
      const data = await api.post<{ item: UiMessage; conversation: RealtimePayload['conversation'] }>(
        `/api/conversations/${activeId}/messages`,
        { text }
      );
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? data.item : m)));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? { ...c, lastMessagePreview: data.conversation.lastMessagePreview, lastMessageAt: data.conversation.lastMessageAt }
            : c
        )
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-[320px] h-[480px] bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl border border-gray-200/60 dark:border-slate-700/60 shadow-xl shadow-black/15 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-slate-700/50 flex-shrink-0">
        {activeId ? (
          <button
            onClick={() => setActiveId(null)}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        ) : null}

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {activeConv ? (
            <>
              <Avatar src={activeConv.peer?.avatarUrl} name={activeConv.peer?.name} size="sm" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {activeConv.peer?.name ?? 'Chat'}
              </span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 text-cyan-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">WAVES Chat</span>
            </>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      {!activeId ? (
        /* ── Conversation list ── */
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">Đang tải...</div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
              <svg className="w-10 h-10 text-gray-200 dark:text-slate-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
              <p className="text-sm text-gray-500 dark:text-slate-400">Chưa có cuộc trò chuyện nào</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveId(conv.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
              >
                <div className="relative flex-shrink-0">
                  <Avatar src={conv.peer?.avatarUrl} name={conv.peer?.name} />
                  {conv.unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-cyan-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                      {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                    </span>
                  )}
                  {conv.peer?.uid && conv.unreadCount === 0 && (
                    <ConvPresenceBadge uid={conv.peer.uid} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-800 dark:text-gray-200'}`}>
                      {conv.peer?.name ?? 'Unknown'}
                    </span>
                    {conv.lastMessageAt && (
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0">
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-slate-500'}`}>
                    {conv.lastMessagePreview ?? 'Bắt đầu cuộc trò chuyện'}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        /* ── Message thread ── */
        <>
          <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-3 flex flex-col gap-2">
            {loadingMsgs ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">Đang tải...</div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Gửi tin nhắn đầu tiên!
              </div>
            ) : (
              messages.map((msg) => {
                const outgoing = msg.senderId === user?.uid;
                return (
                  <div key={msg.id} className={`flex items-end gap-2 ${outgoing ? 'justify-end' : 'justify-start'}`}>
                    {!outgoing && (
                      <Avatar src={activeConv?.peer?.avatarUrl} name={activeConv?.peer?.name} size="sm" />
                    )}
                    <div className={`max-w-[70%] rounded-2xl px-3 py-2 ${outgoing
                      ? 'bg-gradient-to-br from-surf-primary to-cyan-500 text-white rounded-br-sm'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white rounded-bl-sm'
                    } ${msg.optimistic ? 'opacity-60' : ''}`}>
                      <p className="text-sm leading-5 break-words">{msg.text}</p>
                      <p className={`text-[10px] mt-1 text-right ${outgoing ? 'text-cyan-100/80' : 'text-gray-400 dark:text-slate-400'}`}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 dark:border-slate-700/50 flex-shrink-0"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Nhắn cho ${activeConv?.peer?.name ?? ''}...`}
              className="flex-1 min-w-0 h-9 px-3 rounded-full bg-gray-100 dark:bg-slate-700 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-cyan-400/50 transition"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </form>
        </>
      )}
    </div>
  );
}
