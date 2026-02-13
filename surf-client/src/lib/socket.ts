import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false, // Manual connection khi user login
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket?.id);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('🔌 Socket connection error:', error);
    });
  }

  return socket;
};

export const connectSocket = (userId: string) => {
  const socket = getSocket();
  
  if (socket.connected) {
    // Đã connect rồi, join ngay
    socket.emit('join', userId);
    console.log('🔌 Joined user room:', userId);
  } else {
    // Chưa connect, đợi connect xong mới join
    socket.once('connect', () => {
      socket.emit('join', userId);
      console.log('🔌 Joined user room:', userId);
    });
    socket.connect();
  }
};

export const disconnectSocket = () => {
  if (socket?.connected) {
    socket.disconnect();
    console.log('🔌 Socket disconnected manually');
  }
};
