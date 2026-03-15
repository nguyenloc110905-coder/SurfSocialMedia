import { auth } from '@/lib/firebase/auth';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

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
