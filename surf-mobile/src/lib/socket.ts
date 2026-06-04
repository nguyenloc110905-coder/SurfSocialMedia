import Constants from 'expo-constants';
import { io, type Socket } from 'socket.io-client';

function getSocketBase(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:4000`;
  }
  return 'http://localhost:4000';
}

const SOCKET_URL = getSocketBase();
console.log("SOCKET_URL =>", SOCKET_URL, "forced rebuild");

let socket: Socket | null = null;
let currentUserId: string | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      path: '/socket.io',
    });

    socket.on('connect', () => {
      if (currentUserId) {
        socket?.emit('join', currentUserId);
      }
    });

    socket.on('connect_error', (error) => {
      console.warn('Socket connection error:', error.message);
    });
  }

  return socket;
};

export const connectSocket = (userId: string) => {
  currentUserId = userId;
  const activeSocket = getSocket();

  if (activeSocket.connected) {
    activeSocket.emit('join', userId);
  } else {
    activeSocket.connect();
  }
};

export const disconnectSocket = () => {
  currentUserId = null;
  if (socket?.connected) {
    socket.disconnect();
  }
};
