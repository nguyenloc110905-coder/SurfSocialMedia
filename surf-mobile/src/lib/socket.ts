import Constants from 'expo-constants';
import { io, type Socket } from 'socket.io-client';
import { Platform } from 'react-native';

function getDevServerHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (!hostUri) return null;

  try {
    const parsed = new URL(hostUri.includes('://') ? hostUri : `http://${hostUri}`);
    const nestedUrl = parsed.searchParams.get('url');
    if (nestedUrl) {
      return new URL(nestedUrl).hostname || null;
    }
    if (parsed.protocol.startsWith('exp')) return null;
    return parsed.hostname || null;
  } catch {
    const host = hostUri.split('/')[0].split(':')[0]?.trim();
    return host && host !== 'http' && host !== 'https' ? host : null;
  }
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function normalizeSocketUrl(url: string): string | null {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;

  try {
    const parsed = new URL(trimmedUrl);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) return null;

    if (Platform.OS === 'android' && isLoopbackHost(parsed.hostname)) {
      const devServerHost = getDevServerHost();
      parsed.hostname = devServerHost && !isLoopbackHost(devServerHost) ? devServerHost : '10.0.2.2';
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function getSocketBase(): string {
  const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
  const normalizedConfiguredApiUrl = configuredApiUrl ? normalizeSocketUrl(configuredApiUrl) : null;
  if (normalizedConfiguredApiUrl) {
    return normalizedConfiguredApiUrl;
  }

  const host = getDevServerHost();
  if (host && !isLoopbackHost(host)) {
    return `http://${host}:4000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4000';
  }

  return 'http://localhost:4000';
}

const SOCKET_URL = getSocketBase();

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
      transports: Platform.OS === 'android' ? ['polling'] : ['polling', 'websocket'],
    });

    socket.on('connect', () => {
      console.log('Socket connected:', SOCKET_URL);
      if (currentUserId) {
        socket?.emit('join', currentUserId);
      }
    });

    socket.on('connect_error', (error) => {
      console.warn(`Socket connection error (${SOCKET_URL}):`, error.message);
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
