import { getIo } from '../io.js';
import { userRoom } from '../rooms.js';

export const emitNotificationNew = (userId: string, payload: unknown) => {
  getIo().to(userRoom(userId)).emit('notification:new', payload);
};

export const emitNotificationUnreadCount = (userId: string, count: number) => {
  getIo().to(userRoom(userId)).emit('notification:unread-count', { count });
};

export const emitNotificationRead = (userId: string, id: string) => {
  getIo().to(userRoom(userId)).emit('notification:read', { id });
};

export const emitNotificationReadAll = (userId: string, ids: string[]) => {
  getIo().to(userRoom(userId)).emit('notification:read-all', { ids });
};
