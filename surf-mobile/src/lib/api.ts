import { auth } from '@/lib/firebase/auth';
import Constants from 'expo-constants';

// Tự lấy IP từ Metro bundler — không cần sửa khi đổi WiFi
function getApiBase(): string {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0]; // chỉ lấy IP, bỏ port Metro
    return `http://${host}:4000`;
  }
  return process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
}

const API_BASE = getApiBase();

type RequestOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  headers?: Record<string, string>;
  requireAuth?: boolean;
};

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (options.requireAuth !== false && auth.currentUser) {
    const token = await auth.currentUser.getIdToken();
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? 'Request failed');
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, opts?: Partial<RequestOptions>) =>
    request<T>(path, { method: 'GET', ...opts }),
  post: <T>(path: string, body?: unknown, opts?: Partial<RequestOptions>) =>
    request<T>(path, { method: 'POST', body, ...opts }),
  patch: <T>(path: string, body?: unknown, opts?: Partial<RequestOptions>) =>
    request<T>(path, { method: 'PATCH', body, ...opts }),
  delete: <T>(path: string, opts?: Partial<RequestOptions>) =>
    request<T>(path, { method: 'DELETE', ...opts }),
};
