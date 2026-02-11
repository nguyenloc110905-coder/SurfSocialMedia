const API_URL = import.meta.env.VITE_API_URL || '';

export async function getToken(): Promise<string | null> {
  const auth = (await import('@/lib/firebase/auth')).auth;
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

async function request<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, ...init } = options;
  const headers: HeadersInit = { ...(init.headers as Record<string, string>) };
  if (!skipAuth) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
