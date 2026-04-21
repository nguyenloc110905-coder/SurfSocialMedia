import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';
import { uploadFile, uploadImage } from '../../lib/cloudinary';
import { getSocket } from '../../lib/socket';
import { useAuthStore } from '../../stores/authStore';
import PresenceBadge from '../ui/PresenceBadge';
import { optimizeImageUrl } from '../../lib/image-cdn';

interface ConversationItem {
  id: string;
  type?: 'dm' | 'group';
  title?: string;
  peer: { uid: string; name: string; avatarUrl: string | null } | null;
  members?: { uid: string; name: string; avatarUrl: string | null }[];
  memberCount?: number;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
}

interface UiMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type?: 'text' | 'image' | 'file' | 'audio';
  text: string;
  mediaUrl?: string;
  fileName?: string;
  createdAt: string;
  optimistic?: boolean;
}

interface RealtimePayload {
  conversationId: string;
  message: UiMessage;
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

const REPLY_PREFIX_PATTERN = /^↪\s*(.+?):\s*(.+)$/u;
const REPLY_TARGET_MARKER_INLINE_PATTERN = /__reply_to:[^\s]+__/g;
const REPLY_SENDER_MARKER_INLINE_PATTERN = /__reply_sender:[^\s]+__/g;
const REPLY_TARGET_MARKER_LINE_PATTERN = /^__reply_to:[^\n]+__\n?/;
const REPLY_SENDER_MARKER_LINE_PATTERN = /^__reply_sender:[^\n]+__\n?/;

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

function getConversationPreview(message: UiMessage) {
  const normalizedText = normalizeConversationPreview(message.text);
  if (normalizedText) return normalizedText;

  if (message.type === 'image') return 'Đã gửi ảnh';
  if (message.type === 'file') return message.fileName ? `Đã gửi ${message.fileName}` : 'Đã gửi tệp';
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
          <img src={optimizeImageUrl(src)} alt={name ?? ''} className="w-full h-full object-cover" />
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
  compact?: boolean;
}

export default function MiniChatPanel({ onClose, initialPeerId, compact }: Props) {
  const user = useAuthStore((s) => s.user);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  // Load conversation list
  useEffect(() => {
    api
      .get<{ items: ConversationItem[] }>('/api/conversations?limit=30')
      .then((data) => {
        const items = data.items ?? [];
        setConversations(items);
        // Auto-open conversation with initial peer
        if (initialPeerId) {
          const existing = items.find((c) => c.peer?.uid === initialPeerId);
          if (existing) {
            setActiveId(existing.id);
          } else {
            // Create DM then open
            api
              .post<{ item: { id: string } }>('/api/conversations', { peerUid: initialPeerId })
              .then((created) => {
                // Reload list to get full item
                return api.get<{ items: ConversationItem[] }>('/api/conversations?limit=30').then((fresh) => {
                  setConversations(fresh.items ?? []);
                  setActiveId(created.item.id);
                });
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [initialPeerId]);

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

  // Realtime socket — sound is handled globally by useMessageSound in App.tsx
  useEffect(() => {
    const socket = getSocket();
    const onMessageNew = (payload: RealtimePayload) => {
      const { conversationId, message } = payload;
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

    socket.on('message:new', onMessageNew);
    socket.on('message:self-hidden', onMessageSelfHidden);
    socket.on('message:recalled', onMessageRecalled);
    socket.on('message:updated', onMessageUpdated);
    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('message:self-hidden', onMessageSelfHidden);
      socket.off('message:recalled', onMessageRecalled);
      socket.off('message:updated', onMessageUpdated);
    };
  }, [activeId, user?.uid]);

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
      const data = await api.post<{ item: UiMessage }>(
        `/api/conversations/${activeId}/messages`,
        { text }
      );
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
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeId || uploading) return;
    e.target.value = '';
    setUploading(true);
    try {
      const url = await uploadImage(file, { folder: 'surf_chat' });
      await api.post(`/api/conversations/${activeId}/messages`, { mediaUrl: url, mediaType: 'image' });
    } catch { /* ignore */ }
    finally { setUploading(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeId || uploading) return;
    e.target.value = '';
    setUploading(true);
    try {
      const url = await uploadFile(file, { folder: 'surf_chat_files' });
      await api.post(`/api/conversations/${activeId}/messages`, { mediaUrl: url, mediaType: 'file', fileName: file.name });
    } catch { /* ignore */ }
    finally { setUploading(false); }
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
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return;
        setUploading(true);
        try {
          const url = await uploadImage(blob, { folder: 'surf_chat_audio' });
          await api.post(`/api/conversations/${activeId}/messages`, { mediaUrl: url, mediaType: 'audio' });
        } catch { /* ignore */ }
        finally { setUploading(false); }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch { /* mic permission denied */ }
  };

  return (
    <div className={`${compact ? 'w-[280px] h-[380px]' : 'w-[320px] h-[480px]'} bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl border border-gray-200/60 dark:border-slate-700/60 shadow-xl shadow-black/15 flex flex-col overflow-hidden`}>

      {/* Header */}
      <div className={`flex items-center gap-2 ${compact ? 'px-3 py-2' : 'px-4 py-3'} border-b border-gray-100 dark:border-slate-700/50 flex-shrink-0`}>
        {activeId && !compact ? (
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
              {activeConv.type === 'group' ? (
                <span className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /></svg>
                </span>
              ) : (
                <Avatar
                  src={activeConv.peer?.avatarUrl}
                  name={activeConv.peer?.name}
                  uid={activeConv.peer?.uid}
                  size="sm"
                  showPresence
                />
              )}
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {activeConv.type === 'group'
                    ? (activeConv.title ?? 'Nhóm')
                    : (activeConv.peer?.name ?? 'Chat')}
                </span>
                {activeConv.type !== 'group' && activeConv.peer?.uid && (
                  <PresenceBadge uid={activeConv.peer.uid} variant="label" className="mt-0.5" />
                )}
              </div>
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
      {!activeId && !compact ? (
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
            conversations.map((conv) => {
              const convName = conv.type === 'group' ? (conv.title ?? 'Nhóm') : (conv.peer?.name ?? 'Unknown');
              return (
              <button
                key={conv.id}
                onClick={() => setActiveId(conv.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
              >
                <div className="relative flex-shrink-0">
                  {conv.type === 'group' ? (
                    <span className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z" /></svg>
                    </span>
                  ) : (
                    <Avatar src={conv.peer?.avatarUrl} name={conv.peer?.name} />
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
                    <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-800 dark:text-gray-200'}`}>
                      {convName}
                    </span>
                    {conv.lastMessageAt && (
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0">
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-slate-500'}`}>
                    {normalizeConversationPreview(conv.lastMessagePreview) ||
                      'Bắt đầu cuộc trò chuyện'}
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
            {loadingMsgs ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">Đang tải...</div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Gửi tin nhắn đầu tiên!
              </div>
            ) : (
              messages.map((msg) => {
                const outgoing = msg.senderId === user?.uid;
                const msgType = msg.type ?? 'text';
                return (
                  <div key={msg.id} className={`flex items-end gap-2 ${outgoing ? 'justify-end' : 'justify-start'}`}>
                    {!outgoing && (
                      <Avatar
                        src={activeConv?.peer?.avatarUrl}
                        name={activeConv?.peer?.name}
                        uid={activeConv?.peer?.uid}
                        size="sm"
                      />
                    )}
                    <div className={`max-w-[70%] rounded-2xl px-3 py-2 ${outgoing
                      ? 'bg-gradient-to-br from-surf-primary to-cyan-500 text-white rounded-br-sm'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white rounded-bl-sm'
                    } ${msg.optimistic ? 'opacity-60' : ''}`}>
                      {msgType === 'image' && msg.mediaUrl ? (
                        <img src={optimizeImageUrl(msg.mediaUrl)} alt="image" className="max-w-full rounded-lg cursor-pointer" onClick={() => setLightboxUrl(optimizeImageUrl(msg.mediaUrl))} />
                      ) : msgType === 'audio' && msg.mediaUrl ? (
                        <audio controls src={msg.mediaUrl} className="max-w-full h-8" />
                      ) : msgType === 'file' && msg.mediaUrl ? (
                        <button type="button" onClick={() => downloadFile(msg.mediaUrl!, msg.fileName ?? 'file')} className={`flex items-center gap-1.5 text-sm underline ${outgoing ? 'text-white' : 'text-cyan-600 dark:text-cyan-400'}`}>
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          {msg.fileName ?? 'Tệp đính kèm'}
                        </button>
                      ) : (
                        <p className="text-sm leading-5 break-words">{msg.text}</p>
                      )}
                      {msg.text && msgType !== 'text' && <p className="text-sm leading-5 break-words mt-1">{msg.text}</p>}
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
            className={`flex items-center gap-1 ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'} border-t border-gray-100 dark:border-slate-700/50 flex-shrink-0`}
          >
            {/* Media buttons */}
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
            <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploading} title="Gửi ảnh"
              className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:text-cyan-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-40">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Gửi tệp"
              className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:text-cyan-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-40">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            </button>
            <button type="button" onClick={toggleRecording} disabled={uploading} title={recording ? 'Dừng ghi âm' : 'Ghi âm'}
              className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full transition-colors disabled:opacity-40 ${recording ? 'text-red-500 bg-red-50 dark:bg-red-900/30 animate-pulse' : 'text-gray-400 hover:text-cyan-500 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 9a1 1 0 01-1-1v-1.08A7.03 7.03 0 015 11H3a9.03 9.03 0 008 8.93V20a1 1 0 012 0v.93A9.03 9.03 0 0021 11h-2a7.03 7.03 0 01-6 6.92V19a1 1 0 01-1 1z" /></svg>
            </button>
            {uploading && <span className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}

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

      {/* Image lightbox — portal to body so it's truly fullscreen */}
      {lightboxUrl && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setLightboxUrl(null)}>
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <img src={optimizeImageUrl(lightboxUrl)} alt="preview" className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body
      )}
    </div>
  );
}
