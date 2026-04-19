import { io, Socket } from 'socket.io-client';

const runtimeHost =
  typeof window !== 'undefined' ? window.location.hostname : 'localhost';

const resolveSocketUrl = () => {
  const envBase = import.meta.env.VITE_API_URL;
  const useDevProxy =
    import.meta.env.DEV &&
    (!envBase || envBase.includes('localhost') || envBase.includes('127.0.0.1'));

  if (useDevProxy) {
    return typeof window !== 'undefined' ? window.location.origin : undefined;
  }

  if (!envBase) return `http://${runtimeHost}:4000`;

  try {
    const parsed = new URL(envBase);
    const isLocalDevHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    const isRemoteClient = runtimeHost !== 'localhost' && runtimeHost !== '127.0.0.1';

    if (isLocalDevHost && isRemoteClient) {
      parsed.hostname = runtimeHost;
      return parsed.toString().replace(/\/$/, '');
    }

    return envBase;
  } catch {
    return envBase;
  }
};

const SOCKET_URL = resolveSocketUrl();

let socket: Socket | null = null;
let currentUserId: string | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false, // Manual connection khi user login
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      path: '/socket.io',
    });

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket?.id);
      if (currentUserId) {
        socket?.emit('join', currentUserId);
        console.log('🔌 Joined user room:', currentUserId);
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
  // _joinedUserId = userId;
  const socket = getSocket();
  currentUserId = userId;

  if (socket.connected) {
    socket.emit('join', userId);
    console.log('🔌 Joined user room:', userId);
  } else {
    socket.connect();
  }
};

export const disconnectSocket = () => {
  currentUserId = null;
  if (socket?.connected) {
    socket.disconnect();
    console.log('🔌 Socket disconnected manually');
  }
};
