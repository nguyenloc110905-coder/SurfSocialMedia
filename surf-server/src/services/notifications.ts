import { notificationRepository } from '../repositories/notification.repository.js';
import {
  NOTIFICATION_ICON_BY_TYPE,
  type CreateNotificationInput,
  type ListNotificationsInput,
  type MarkNotificationReadResult,
  type NotificationDoc,
} from '../types/notification.js';

export type ApiNotification = Omit<NotificationDoc, 'createdAt' | 'readAt'> & {
  createdAt: string;
  readAt: string | null;
};

export const toApiNotification = (doc: NotificationDoc): ApiNotification => ({
  ...doc,
  createdAt: doc.createdAt.toISOString(),
  readAt: doc.readAt ? doc.readAt.toISOString() : null,
});

export const createNotification = async (
  input: CreateNotificationInput
): Promise<NotificationDoc> => {
  const iconKey = input.iconKey ?? NOTIFICATION_ICON_BY_TYPE[input.type];
  return notificationRepository.create({ ...input, iconKey });
};

export const listNotifications = async (
  input: ListNotificationsInput
): Promise<NotificationDoc[]> => {
  return notificationRepository.listByUser(input);
};

export const getUnreadNotificationCount = async (userId: string): Promise<number> => {
  return notificationRepository.countUnread(userId);
};

export const markNotificationRead = async (
  userId: string,
  notificationId: string
): Promise<MarkNotificationReadResult> => {
  const doc = await notificationRepository.getById(notificationId);
  if (!doc) return { ok: false, reason: 'not_found' };
  if (doc.userId !== userId) return { ok: false, reason: 'forbidden' };

  if (!doc.isRead) {
    await notificationRepository.markReadById(notificationId);
  }
  return { ok: true };
};

export const markAllNotificationsRead = async (userId: string, cap = 500): Promise<string[]> => {
  const pageSize = Math.max(1, cap);
  const updatedIds: string[] = [];

  // Query theo batch để tránh vượt giới hạn batch write của Firestore.
  while (true) {
    const ids = await notificationRepository.markAllReadByUser(userId, pageSize);
    if (ids.length === 0) break;
    updatedIds.push(...ids);
    if (ids.length < pageSize) break;
  }

  return updatedIds;
};
