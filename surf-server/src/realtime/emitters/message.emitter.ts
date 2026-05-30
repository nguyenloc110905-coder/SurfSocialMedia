import { getIo } from '../io.js';
import { conversationRoom, userRoom } from '../rooms.js';

export const emitMessageNew = (userId: string, payload: unknown) => {
  getIo().to(userRoom(userId)).emit('message:new', payload);
};

export const emitMessageNewToConversation = (conversationId: string, payload: unknown) => {
  getIo().to(conversationRoom(conversationId)).emit('message:new', payload);
};

export const emitMessageNewToTargets = (
  userIds: string[],
  conversationId: string,
  payload: unknown
) => {
  const io = getIo();
  const targets = Array.from(new Set(userIds.filter(Boolean)));
  let operator = io.to(conversationRoom(conversationId));

  targets.forEach((userId) => {
    operator = operator.to(userRoom(userId));
  });

  operator.emit('message:new', payload);
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

export const emitMessageReactionUpdated = (conversationId: string, payload: unknown) => {
  getIo().to(conversationRoom(conversationId)).emit('message:reaction-updated', payload);
};

export const emitMessageUpdated = (conversationId: string, payload: unknown) => {
  getIo().to(conversationRoom(conversationId)).emit('message:updated', payload);
};
