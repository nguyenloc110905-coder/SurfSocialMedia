import { getIo } from '../io.js';
import { userRoom } from '../rooms.js';

export const emitFriendRequestReceived = (userId: string, payload: unknown) => {
  getIo().to(userRoom(userId)).emit('friendRequestReceived', payload);
};
