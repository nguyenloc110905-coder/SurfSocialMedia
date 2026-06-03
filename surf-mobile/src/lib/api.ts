import { auth } from '@/lib/firebase/auth';
import Constants from 'expo-constants';

// Tự lấy IP từ Metro bundler — không cần sửa khi đổi WiFi
function getApiBase(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0]; // chỉ lấy IP, bỏ port Metro
    return `http://${host}:4000`;
  }
  return 'http://localhost:4000';
}

const API_BASE = getApiBase();
console.log("API_BASE =>", API_BASE);
export const apiBaseUrl = API_BASE;

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
  }).catch((err) => {
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new Error(`${message} (${url})`);
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = res.statusText;
    if (text) {
      try {
        const error = JSON.parse(text) as { message?: string; error?: string };
        message = error.message ?? error.error ?? message;
      } catch {
        message = text;
      }
    }
    throw new Error(message || 'Request failed');
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string, opts?: Partial<RequestOptions>) =>
    request<T>(path, { method: 'GET', ...opts }),
  post: <T>(path: string, body?: unknown, opts?: Partial<RequestOptions>) =>
    request<T>(path, { method: 'POST', body, ...opts }),
  put: <T>(path: string, body?: unknown, opts?: Partial<RequestOptions>) =>
    request<T>(path, { method: 'PUT', body, ...opts }),
  patch: <T>(path: string, body?: unknown, opts?: Partial<RequestOptions>) =>
    request<T>(path, { method: 'PATCH', body, ...opts }),
  delete: <T>(path: string, opts?: Partial<RequestOptions>) =>
    request<T>(path, { method: 'DELETE', ...opts }),
};
