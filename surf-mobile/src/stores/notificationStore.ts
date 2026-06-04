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
    createdAt?: string;
  };
  conversation?: {
    id?: string;
    lastMessagePreview?: string | null;
    lastMessageAt?: string | null;
  };
  mutedBy?: string[];
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

function messageToNotification(payload: RealtimeMessagePayload, currentUserId: string): NotificationItem | null {
  const message = payload?.message;
  const conversationId = message?.conversationId ?? payload?.conversation?.id;
  if (!message?.id || !conversationId || message.senderId === currentUserId) return null;

  const preview = payload.conversation?.lastMessagePreview ?? message.text ?? 'Tin nhắn mới';
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
  unreadCount: number;
  setItems: (items: NotificationItem[]) => void;
  setUnreadCount: (count: number) => void;
  upsertNotification: (item: NotificationItem) => void;
  upsertMessage: (payload: RealtimeMessagePayload, currentUserId: string) => void;
  upsertFriendRequest: (payload: FriendRequestPayload) => void;
  markItemRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
};

const countUnread = (items: NotificationItem[]): number =>
  items.filter((item) => !(item.read ?? item.isRead)).length;

const normalizeCount = (count: number): number =>
  Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],
  unreadCount: 0,
  setItems: (items) =>
    set((state) => {
      const merged = new Map<string, NotificationItem>();
      state.items.forEach((item) => merged.set(item.id, item));
      items.map(normalizeNotification).forEach((item) => merged.set(item.id, item));
      const nextItems = sortNotifications(Array.from(merged.values()));
      return { items: nextItems, unreadCount: countUnread(nextItems) };
    }),
  setUnreadCount: (count) => set({ unreadCount: normalizeCount(count) }),
  upsertNotification: (item) =>
    set((state) => {
      const items = upsert(state.items, item);
      return { items, unreadCount: countUnread(items) };
    }),
  upsertMessage: (payload, currentUserId) =>
    set((state) => {
      const notification = messageToNotification(payload, currentUserId);
      if (!notification) return state;
      const items = upsert(state.items, notification);
      return { items, unreadCount: countUnread(items) };
    }),
  upsertFriendRequest: (payload) =>
    set((state) => {
      const notification = friendRequestToNotification(payload);
      if (!notification) return state;
      const items = upsert(state.items, notification);
      return { items, unreadCount: countUnread(items) };
    }),
  markItemRead: (id) =>
    set((state) => {
      const items = state.items.map((item) => item.id === id ? { ...item, read: true, isRead: true } : item);
      return { items, unreadCount: countUnread(items) };
    }),
  markAllRead: () =>
    set((state) => ({
      items: state.items.map((item) => ({ ...item, read: true, isRead: true })),
      unreadCount: 0,
    })),
  clear: () => set({ items: [], unreadCount: 0 }),
}));
