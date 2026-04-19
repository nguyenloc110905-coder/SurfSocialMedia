import { getIo } from '../io.js';
import { userRoom } from '../rooms.js';

export const emitMessageNew = (userId: string, payload: unknown) => {
  getIo().to(userRoom(userId)).emit('message:new', payload);
};

export const emitMessageUnreadCount = (userId: string, count: number) => {
  getIo().to(userRoom(userId)).emit('message:unread-count', { count });
};
