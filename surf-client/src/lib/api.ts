import { auth } from '@/lib/firebase/auth';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

type RequestOptions = {
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
	body?: unknown;
	headers?: HeadersInit;
	signal?: AbortSignal;
	requireAuth?: boolean;
};

async function request<T>(path: string, options: RequestOptions): Promise<T> {
	const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
	const headers = new Headers(options.headers);

	if (options.requireAuth !== false) {
		console.log(`🔒 API ${options.method} ${path} - checking auth...`);
		
		if (!auth.currentUser) {
			console.error('❌ No currentUser available');
			throw new Error('Chưa đăng nhập');
		}
		
		console.log(`👤 currentUser: ${auth.currentUser.email}`);
		
		// Lấy token với retry
		let token: string | null = null;
		let attempts = 0;
		const maxAttempts = 3;
		
		while (!token && attempts < maxAttempts) {
			attempts++;
			console.log(`🔑 Getting token (attempt ${attempts}/${maxAttempts})...`);
			
			try {
				token = await auth.currentUser.getIdToken(false);
				if (token) {
					console.log(`✅ Token obtained, length: ${token.length}`);
				}
			} catch (err) {
				console.error(`❌ getIdToken attempt ${attempts} failed:`, err);
				if (attempts < maxAttempts) {
					await new Promise(resolve => setTimeout(resolve, 500));
				}
			}
		}
		
		if (!token) {
			console.error('❌ Failed to get token after all attempts');
			throw new Error('Không lấy được token');
		}
		
		headers.set('Authorization', `Bearer ${token}`);
	}

	let body: BodyInit | undefined;
	if (options.body !== undefined) {
		if (options.body instanceof FormData) {
			body = options.body;
		} else {
			headers.set('Content-Type', 'application/json');
			body = JSON.stringify(options.body);
		}
	}

	const res = await fetch(url, {
		method: options.method,
		headers,
		body,
		signal: options.signal,
	});

	if (!res.ok) {
		let message = res.statusText;
		try {
			const data = (await res.json()) as { error?: string; message?: string };
			message = data.error || data.message || message;
		} catch {
			const text = await res.text();
			if (text) message = text;
		}
		console.error(`❌ API ${options.method} ${path} failed: ${res.status} ${message}`);
		throw new Error(message || 'Request failed');
	}

	if (res.status === 204) {
		return undefined as T;
	}

	return (await res.json()) as T;
}

export const api = {
	get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
		return request<T>(path, { ...options, method: 'GET' });
	},
	post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
		return request<T>(path, { ...options, method: 'POST', body });
	},
	put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
		return request<T>(path, { ...options, method: 'PUT', body });
	},
	patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
		return request<T>(path, { ...options, method: 'PATCH', body });
	},
	delete<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) {
		return request<T>(path, { ...options, method: 'DELETE', body });
	},
};
/**
 * Đồng bộ profile user vào Firestore ngay sau khi đăng nhập/đăng ký.
 * Gọi API để trigger middleware ensureUser tạo document trong collection 'users'.
 */
export async function syncUserProfile(): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.log('⏸️ Không sync profile: chưa đăng nhập');
      return;
    }
    
    console.log('🔄 Đang đồng bộ profile:', user.email);
    await api.put('/api/users/me', {
      displayName: user.displayName ?? user.email?.split('@')[0] ?? 'User',
      email: user.email ?? '',
      photoURL: user.photoURL ?? null,
    });
    console.log('✅ Đã đồng bộ profile thành công');
  } catch (err) {
    console.warn('⚠️ Không đồng bộ được profile:', err);
    // Không throw để không block UI
  }
}