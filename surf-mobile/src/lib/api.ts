import { auth } from '@/lib/firebase/auth';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEVICE_ID = `mobile-${Platform.OS}`;

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

function normalizeConfiguredApiUrl(url: string): string | null {
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

// Tự lấy IP từ Metro bundler — không cần sửa khi đổi WiFi
function getApiBase(): string {
  const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
  const normalizedConfiguredApiUrl = configuredApiUrl ? normalizeConfiguredApiUrl(configuredApiUrl) : null;
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

const API_BASE = getApiBase();
export const apiBaseUrl = API_BASE;

type RequestOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  headers?: Record<string, string>;
  requireAuth?: boolean;
};

function isHtmlResponse(text: string): boolean {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html[\s>]/i.test(text);
}

function readableApiError(text: string, statusText: string, url: string): string {
  if (!text) return statusText || 'Request failed';

  try {
    const error = JSON.parse(text) as { message?: string; error?: string };
    return error.message ?? error.error ?? statusText;
  } catch {
    if (isHtmlResponse(text)) {
      return `API trả về HTML thay vì JSON. Kiểm tra EXPO_PUBLIC_API_URL hoặc deploy server cho endpoint này: ${url}`;
    }
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  }
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-device-id': DEVICE_ID,
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
    const message = readableApiError(text, res.statusText, url);
    throw new Error(message || 'Request failed');
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    if (isHtmlResponse(text)) {
      throw new Error(`API trả về HTML thay vì JSON. Kiểm tra EXPO_PUBLIC_API_URL hoặc deploy server cho endpoint này: ${url}`);
    }
    throw new Error(`Không đọc được phản hồi API từ ${url}`);
  }
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
