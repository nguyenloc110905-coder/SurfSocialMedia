import { getIo } from '../io.js';
import { conversationRoom, userRoom } from '../rooms.js';

export const emitMessageNew = (userId: string, payload: unknown) => {
  getIo().to(userRoom(userId)).emit('message:new', payload);
};

export const emitMessageUnreadCount = (userId: string, count: number) => {
  getIo().to(userRoom(userId)).emit('message:unread-count', { count });
};

export const emitMessageRead = (conversationId: string, payload: unknown) => {
  getIo().to(conversationRoom(conversationId)).emit('message:read', payload);
};

export const emitMessageSelfHidden = (userId: string, payload: unknown) => {
  getIo().to(userRoom(userId)).emit('message:self-hidden', payload);
};

export const emitMessageRecalled = (conversationId: string, payload: unknown) => {
  getIo().to(conversationRoom(conversationId)).emit('message:recalled', payload);
};
