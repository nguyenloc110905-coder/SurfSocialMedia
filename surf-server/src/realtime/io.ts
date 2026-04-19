import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

let io: Server | null = null;

export const initIo = (httpServer: HttpServer, corsOrigin: string[]) => {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
  });

  return io;
};

export const getIo = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized');
  }

  return io;
};
