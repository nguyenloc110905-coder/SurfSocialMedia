import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let socket: Socket | null = null;
let _joinedUserId: string | null = null; // remember userId for reconnects

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false, // Manual connection khi user login
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket?.id);
      // Re-emit join on every connect/reconnect so server keeps presence up-to-date
      if (_joinedUserId) {
        socket!.emit('join', _joinedUserId);
        console.log('🔌 Re-joined user room after (re)connect:', _joinedUserId);
      }
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
  _joinedUserId = userId;
  const socket = getSocket();

  if (socket.connected) {
    socket.emit('join', userId);
    console.log('🔌 Joined user room:', userId);
  } else {
    socket.connect(); // 'connect' event will emit join via the listener above
  }
};

export const disconnectSocket = () => {
  if (socket?.connected) {
    socket.disconnect();
    console.log('🔌 Socket disconnected manually');
  }
};
