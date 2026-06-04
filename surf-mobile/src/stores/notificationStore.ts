import { create } from 'zustand';

export type NotificationItem = {
  id: string;
  type: string;
  actorId?: string;
  actorName?: string;
  actorPhoto?: string | null;
  actorPhotoURL?: string | null;
  postId?: string;
  postSnippet?: string;
  commentSnippet?: string;
  reaction?: string;
  requestId?: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  conversationId?: string;
  read?: boolean;
  isRead?: boolean;
  createdAt?: { _seconds?: number; seconds?: number } | string | number | null;
};

export type RealtimeMessagePayload = {
  message?: {
    id?: string;
    senderId?: string;
    conversationId?: string;
    text?: string | null;
    type?: string;
    fileName?: string | null;
    isRecalled?: boolean;
    recalledForEveryone?: boolean;
    createdAt?: string;
  };
  conversation?: {
    id?: string;
    lastMessagePreview?: string | null;
    lastMessageAt?: string | null;
  };
};

export type FriendRequestPayload = {
  id?: string;
  fromUid?: string;
  name?: string;
  avatarUrl?: string | null;
};

export function notificationTimeMs(createdAt: NotificationItem['createdAt']): number {
  if (!createdAt) return 0;
  if (typeof createdAt === 'number') return createdAt > 10_000_000_000 ? createdAt : createdAt * 1000;
  if (typeof createdAt === 'string') return new Date(createdAt).getTime();
  return (createdAt._seconds ?? createdAt.seconds ?? 0) * 1000;
}

export function normalizeNotification(item: NotificationItem): NotificationItem {
  const entityType = typeof item.entityType === 'string' ? item.entityType : undefined;
  const entityId = typeof item.entityId === 'string' ? item.entityId : undefined;
  const read = typeof item.read === 'boolean' ? item.read : Boolean(item.isRead);

  return {
    ...item,
    read,
    isRead: read,
    actorPhoto: item.actorPhoto ?? item.actorPhotoURL ?? null,
    postId: item.postId ?? (entityType === 'post' ? entityId : undefined),
    conversationId:
      item.conversationId ??
      ((entityType === 'conversation' || entityType === 'chat') ? entityId : undefined),
  };
}

function sortNotifications(items: NotificationItem[]): NotificationItem[] {
  return [...items].sort((a, b) => notificationTimeMs(b.createdAt) - notificationTimeMs(a.createdAt));
}

function upsert(items: NotificationItem[], item: NotificationItem): NotificationItem[] {
  const normalized = normalizeNotification(item);
  const requestId = normalized.requestId ?? normalized.entityId;
  const withoutDuplicate = items.filter((current) => {
    if (current.id === normalized.id) return false;
    if (normalized.type !== 'friend_request' || !requestId) return true;
    const currentRequestId = current.requestId ?? current.entityId;
    return current.type !== 'friend_request' || currentRequestId !== requestId;
  });
  return sortNotifications([normalized, ...withoutDuplicate]);
}

function trimMessagePreview(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function stripReplyMetadata(value: string): string {
  return value
    .replace(/^__reply_to:[^\n]+__\n?/u, '')
    .replace(/^__reply_sender:[^\n]+__\n?/u, '')
    .replace(/__reply_to:[^\s]+__/gu, ' ')
    .replace(/__reply_sender:[^\s]+__/gu, ' ')
    .replace(/^↪\s*.+?:\s*.+\n/u, '')
    .trim();
}

function messagePreview(payload: RealtimeMessagePayload): string {
  const message = payload.message;
  const serverPreview = payload.conversation?.lastMessagePreview;
  if (serverPreview) return trimMessagePreview(serverPreview);
  if (!message) return 'Tin nhắn mới';
  if (message.isRecalled || message.recalledForEveryone) return 'Tin nhắn đã được thu hồi';

  const text = stripReplyMetadata(message.text ?? '');
  if (text) return trimMessagePreview(text);
  if (message.type === 'image') return '📷 Hình ảnh';
  if (message.type === 'audio') return '🎤 Tin nhắn thoại';
  if (message.type === 'file') return message.fileName ? `📎 ${message.fileName}` : '📎 Tệp đính kèm';
  if (message.type === 'call_log') return trimMessagePreview(message.text ?? 'Cuộc gọi Surf');
  return 'Tin nhắn mới';
}

function messageToNotification(payload: RealtimeMessagePayload, currentUserId: string): NotificationItem | null {
  const message = payload?.message;
  const conversationId = message?.conversationId ?? payload?.conversation?.id;
  if (!message?.id || !conversationId || message.senderId === currentUserId) return null;

  const preview = messagePreview(payload);
  return normalizeNotification({
    id: `message-${message.id}`,
    type: 'message',
    actorId: message.senderId,
    actorName: 'Tin nhắn',
    message: preview ? `Bạn có tin nhắn mới: ${preview}` : 'Bạn có tin nhắn mới',
    conversationId,
    read: false,
    isRead: false,
    createdAt: message.createdAt ?? payload.conversation?.lastMessageAt ?? new Date().toISOString(),
  });
}

function friendRequestToNotification(payload: FriendRequestPayload): NotificationItem | null {
  if (!payload?.id) return null;

  const name = payload.name ?? 'Ai đó';
  return normalizeNotification({
    id: `fr-${payload.id}`,
    type: 'friend_request',
    actorId: payload.fromUid,
    actorName: name,
    actorPhoto: payload.avatarUrl ?? null,
    requestId: payload.id,
    message: `${name} đã gửi lời mời kết bạn cho bạn.`,
    read: false,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

type NotificationState = {
  items: NotificationItem[];
  setItems: (items: NotificationItem[]) => void;
  upsertNotification: (item: NotificationItem) => void;
  upsertMessage: (payload: RealtimeMessagePayload, currentUserId: string) => void;
  upsertFriendRequest: (payload: FriendRequestPayload) => void;
  markItemRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
};

export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],
  setItems: (items) =>
    set((state) => {
      const merged = new Map<string, NotificationItem>();
      state.items.forEach((item) => merged.set(item.id, item));
      items.map(normalizeNotification).forEach((item) => merged.set(item.id, item));
      return { items: sortNotifications(Array.from(merged.values())) };
    }),
  upsertNotification: (item) => set((state) => ({ items: upsert(state.items, item) })),
  upsertMessage: (payload, currentUserId) =>
    set((state) => {
      const notification = messageToNotification(payload, currentUserId);
      return notification ? { items: upsert(state.items, notification) } : state;
    }),
  upsertFriendRequest: (payload) =>
    set((state) => {
      const notification = friendRequestToNotification(payload);
      return notification ? { items: upsert(state.items, notification) } : state;
    }),
  markItemRead: (id) =>
    set((state) => ({
      items: state.items.map((item) => item.id === id ? { ...item, read: true, isRead: true } : item),
    })),
  markAllRead: () =>
    set((state) => ({
      items: state.items.map((item) => ({ ...item, read: true, isRead: true })),
    })),
  clear: () => set({ items: [] }),
}));
