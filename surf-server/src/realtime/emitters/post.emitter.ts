import { getIo } from '../io.js';
import { postRoom } from '../rooms.js';

export const emitCommentNew = (postId: string, payload: unknown) => {
  getIo().to(postRoom(postId)).emit('comment:new', payload);
};

export const emitPostReacted = (postId: string, payload: unknown) => {
  getIo().to(postRoom(postId)).emit('post:reacted', payload);
};
