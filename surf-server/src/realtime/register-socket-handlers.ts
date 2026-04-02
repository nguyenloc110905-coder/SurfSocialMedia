import type { Server } from 'socket.io';
import { registerCallHandlers } from './handlers/call.handlers.js';
import { postRoom, userRoom } from './rooms.js';

export const registerSocketHandlers = (io: Server) => {
  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    socket.on('join', (userId: string) => {
      socket.join(userRoom(userId));
      const room = io.sockets.adapter.rooms.get(userRoom(userId));
      const roomSize = room ? room.size : 0;
      console.log(`👤 User ${userId} joined their room (${roomSize} clients in room)`);
    });

    socket.on('post:join', (postId: string) => {
      socket.join(postRoom(postId));
    });

    socket.on('post:leave', (postId: string) => {
      socket.leave(postRoom(postId));
    });

    registerCallHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
    });
  });
};
