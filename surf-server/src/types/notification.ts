export type NotificationType =
  | 'friend_request'
  | 'friend_accept'
  | 'post_reaction'
  | 'comment'
  | 'mention'
  | 'share'
  | 'missed_call'
  | 'system';

export type NotificationIconKey =
  | 'user-plus'
  | 'user-check'
  | 'heart'
  | 'message-circle'
  | 'at-sign'
  | 'repeat'
  | 'phone-missed'
  | 'info';

export const NOTIFICATION_ICON_BY_TYPE: Record<NotificationType, NotificationIconKey> = {
  friend_request: 'user-plus',
  friend_accept: 'user-check',
  post_reaction: 'heart',
  comment: 'message-circle',
  mention: 'at-sign',
  share: 'repeat',
  missed_call: 'phone-missed',
  system: 'info',
};

export const NOTIFICATION_PREF_KEYS: NotificationType[] = [
  'friend_request',
  'friend_accept',
  'post_reaction',
  'comment',
  'mention',
  'share',
  'missed_call',
  'system',
];

export type NotificationPrefs = Record<NotificationType, boolean>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  friend_request: true,
  friend_accept: true,
  post_reaction: true,
  comment: true,
  mention: true,
  share: true,
  missed_call: true,
  system: true,
};

export const normalizeNotificationPrefs = (value: unknown): NotificationPrefs => {
  const normalized: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return normalized;

  const raw = value as Record<string, unknown>;
  for (const key of NOTIFICATION_PREF_KEYS) {
    if (typeof raw[key] === 'boolean') {
      normalized[key] = raw[key] as boolean;
    }
  }

  return normalized;
};

export type NotificationEntityType =
  | 'friend_request'
  | 'conversation'
  | 'group'
  | 'post'
  | 'comment'
  | 'system';

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
