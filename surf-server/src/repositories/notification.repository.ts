import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase-admin.js';
import {
  NOTIFICATION_ICON_BY_TYPE,
  type CreateNotificationInput,
  type ListNotificationsInput,
  type NotificationDoc,
} from '../types/notification.js';

const col = () => getDb().collection('notifications');

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
};

const mapNotificationDoc = (id: string, data: Record<string, unknown>): NotificationDoc => {
  const rawType = data.type;
  const type: NotificationDoc['type'] =
    typeof rawType === 'string' && rawType in NOTIFICATION_ICON_BY_TYPE
      ? (rawType as NotificationDoc['type'])
      : 'system';

  const rawIconKey = data.iconKey;
  const iconKeyValues = Object.values(NOTIFICATION_ICON_BY_TYPE);
  const iconKey: NotificationDoc['iconKey'] =
    typeof rawIconKey === 'string' &&
    iconKeyValues.includes(rawIconKey as NotificationDoc['iconKey'])
      ? (rawIconKey as NotificationDoc['iconKey'])
      : NOTIFICATION_ICON_BY_TYPE[type];

  return {
    id,
    userId: (data.userId as string) ?? '',
    type,
    iconKey,
    actorId: data.actorId as string | undefined,
    entityType: data.entityType as NotificationDoc['entityType'],
    entityId: data.entityId as string | undefined,
    message: (data.message as string) ?? '',
    isRead: Boolean(data.isRead),
    createdAt: toDate(data.createdAt) ?? new Date(),
    readAt: toDate(data.readAt),
  };
};

export const notificationRepository = {
  async create(input: CreateNotificationInput): Promise<NotificationDoc> {
    const ref = col().doc();
    await ref.set({
      userId: input.userId,
      type: input.type,
      iconKey: input.iconKey ?? NOTIFICATION_ICON_BY_TYPE[input.type],
      actorId: input.actorId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      message: input.message,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const snap = await ref.get();
    return mapNotificationDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async listByUser(input: ListNotificationsInput): Promise<NotificationDoc[]> {
    let query = col()
      .where('userId', '==', input.userId)
      .orderBy('createdAt', 'desc')
      .limit(input.limit);
    if (input.cursorMs) {
      query = query.startAfter(new Date(input.cursorMs));
    }

    const snap = await query.get();
    return snap.docs.map((doc) =>
      mapNotificationDoc(doc.id, doc.data() as Record<string, unknown>)
    );
  },

  async countUnread(userId: string): Promise<number> {
    const snap = await col().where('userId', '==', userId).where('isRead', '==', false).get();
    return snap.size;
  },

  async getById(notificationId: string): Promise<NotificationDoc | null> {
    const snap = await col().doc(notificationId).get();
    if (!snap.exists) return null;
    return mapNotificationDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async markReadById(notificationId: string): Promise<void> {
    await col().doc(notificationId).update({
      isRead: true,
      readAt: FieldValue.serverTimestamp(),
    });
  },

  async markAllReadByUser(userId: string, cap = 500): Promise<string[]> {
    const snap = await col()
      .where('userId', '==', userId)
      .where('isRead', '==', false)
      .limit(cap)
      .get();

    if (snap.empty) return [];

    const batch = getDb().batch();
    const ids: string[] = [];

    snap.docs.forEach((doc) => {
      ids.push(doc.id);
      batch.update(doc.ref, {
        isRead: true,
        readAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    return ids;
  },
};
