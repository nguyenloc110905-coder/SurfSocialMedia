export type NotificationType =
  | 'friend_request'
  | 'friend_accept'
  | 'post_reaction'
  | 'comment'
  | 'mention'
  | 'share'
  | 'system';

export type NotificationIconKey =
  | 'user-plus'
  | 'user-check'
  | 'heart'
  | 'message-circle'
  | 'at-sign'
  | 'repeat'
  | 'info';

export const NOTIFICATION_ICON_BY_TYPE: Record<NotificationType, NotificationIconKey> = {
  friend_request: 'user-plus',
  friend_accept: 'user-check',
  post_reaction: 'heart',
  comment: 'message-circle',
  mention: 'at-sign',
  share: 'repeat',
  system: 'info',
};

export type NotificationEntityType = 'friend_request' | 'conversation' | 'group' | 'system';

export type NotificationDoc = {
  id: string;
  userId: string;
  type: NotificationType;
  iconKey: NotificationIconKey;
  actorId?: string;
  entityType?: NotificationEntityType;
  entityId?: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  readAt?: Date;
};

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  iconKey?: NotificationIconKey;
  actorId?: string;
  entityType?: NotificationEntityType;
  entityId?: string;
  message: string;
};

export type ListNotificationsInput = {
  userId: string;
  limit: number;
  cursorMs?: number;
};

export type MarkNotificationReadResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'forbidden' };
