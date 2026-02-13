import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';

type FriendItem = { id: string; name: string; avatarUrl?: string; mutualCount?: number };
type RequestItem = { id: string; fromUid: string; name: string; avatarUrl?: string };

function EmptyState({
  iconPath,
  title,
  description,
}: {
  iconPath: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60 p-8 text-center border-l-4 border-l-surf-primary dark:border-l-surf-secondary">
      <span className="w-14 h-14 rounded-full bg-surf-primary/10 dark:bg-surf-secondary/15 flex items-center justify-center mx-auto mb-3">
        <svg className="w-7 h-7 text-surf-primary dark:text-surf-secondary" viewBox="0 0 24 24" fill="currentColor">
          <path d={iconPath} />
        </svg>
      </span>
      <p className="text-slate-600 dark:text-slate-300 text-sm mb-1">{title}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

/** Trang Bạn bè — nội dung cột giữa theo mục đã chọn ở cột trái */
export default function Friends() {
  const { pathname } = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [suggestions, setSuggestions] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<FriendItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const section = pathname === '/feed/friends'
    ? 'home'
    : pathname.endsWith('/requests')
      ? 'requests'
      : pathname.endsWith('/suggestions')
        ? 'suggestions'
        : pathname.endsWith('/all')
          ? 'all'
          : pathname.endsWith('/birthdays')
            ? 'birthdays'
            : pathname.endsWith('/history')
              ? 'history'
              : 'home';

  const loadFriends = useCallback(async () => {
    setError('');
    try {
      const [friendsRes, requestsRes, suggestionsRes] = await Promise.all([
        api.get<{ friends: FriendItem[] }>('/api/friends'),
        api.get<{ requests: Array<{ id: string; fromUid: string; name: string; avatarUrl?: string }> }>('/api/friends/requests'),
        api.get<{ suggestions: FriendItem[] }>('/api/friends/suggestions'),
      ]);
      setFriends(friendsRes?.friends ?? []);
      setRequests(requestsRes?.requests ?? []);
      setSuggestions(suggestionsRes?.suggestions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách bạn bè.');
      setFriends([]);
      setRequests([]);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadFriends();
  }, [loadFriends]);

  // Tìm bạn theo tên
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      setSearchLoading(true);
      api
        .get<{ users: FriendItem[] }>(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((r) => setSearchResults(r?.users ?? []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const handleAccept = async (requestId: string) => {
    setActioningId(requestId);
    setError('');
    try {
      await api.patch(`/api/friends/requests/${requestId}`, { action: 'accept' });
      await loadFriends();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không chấp nhận được.');
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActioningId(requestId);
    setError('');
    try {
      await api.delete(`/api/friends/requests/${requestId}`);
      await loadFriends();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không từ chối được.');
    } finally {
      setActioningId(null);
    }
  };

  const handleAddFriend = async (toUid: string) => {
    setActioningId(toUid);
    setError('');
    try {
      await api.post('/api/friends/requests', { toUid });
      await loadFriends();
      setSearchResults((prev) => prev.filter((u) => u.id !== toUid));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không gửi lời mời được.');
    } finally {
      setActioningId(null);
    }
  };

  const sectionTitles: Record<string, { title: string; desc: string }> = {
    home: { title: 'Trang chủ', desc: 'Tổng quan bạn bè và hoạt động.' },
    requests: { title: 'Lời mời kết bạn', desc: 'Chấp nhận hoặc từ chối lời mời.' },
    suggestions: { title: 'Gợi ý', desc: 'Những người bạn có thể biết.' },
    all: { title: 'Tất cả bạn bè', desc: 'Danh sách bạn bè của bạn.' },
    birthdays: { title: 'Sinh nhật', desc: 'Sinh nhật bạn bè sắp tới.' },
    history: { title: 'Lịch sử tương tác', desc: 'Theo dõi những người bạn đã follow hoặc gửi lời mời kết bạn tại đây.' },
  };

  const { title, desc } = sectionTitles[section];

  return (
    <div className="py-4 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">{title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{desc}</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="mb-4 flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
          <span className="inline-block w-5 h-5 border-2 border-surf-primary dark:border-surf-secondary border-t-transparent rounded-full animate-spin" />
          Đang tải…
        </div>
      )}

      <div className="relative mb-6">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input
          type="search"
          placeholder="Tìm bạn bè theo tên"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-surf-primary/40 focus:border-surf-primary/50 dark:focus:ring-surf-secondary/40 transition-shadow"
        />
      </div>

      {/* Kết quả tìm kiếm theo tên */}
      {searchQuery.trim() && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">Kết quả tìm kiếm</h2>
          {searchLoading ? (
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm py-4">
              <span className="inline-block w-5 h-5 border-2 border-surf-primary dark:border-surf-secondary border-t-transparent rounded-full animate-spin" />
              Đang tìm…
            </div>
          ) : searchResults.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">Không tìm thấy ai. Thử tên khác hoặc xem Gợi ý bên dưới.</p>
          ) : (
            <ul className="space-y-2">
              {searchResults.map((s) => (
                <li key={s.id}>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600">
                    <Link to={`/feed/profile/${s.id}`} className="flex-shrink-0 w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
                      {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-sm font-semibold text-slate-600 dark:text-slate-300">{s.name.charAt(0).toUpperCase()}</span>}
                    </Link>
                    <Link to={`/feed/profile/${s.id}`} className="min-w-0 flex-1 font-medium text-slate-800 dark:text-slate-100 hover:text-surf-primary dark:hover:text-surf-secondary truncate">{s.name}</Link>
                    <button type="button" disabled={actioningId === s.id} onClick={() => handleAddFriend(s.id)} className="flex-shrink-0 py-2 px-3 rounded-lg bg-surf-primary dark:bg-surf-secondary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">Thêm bạn bè</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Trang chủ bạn bè */}
      {section === 'home' && (
        <section>
          <EmptyState
            iconPath="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            title="Chào mừng đến Bạn bè"
            description="Dùng menu bên trái để xem lời mời, gợi ý, danh sách bạn bè và hơn thế."
          />
        </section>
      )}

      {/* Lời mời kết bạn */}
      {section === 'requests' && (
        <section>
          {requests.length === 0 ? (
            <EmptyState
              iconPath="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
              title="Không có lời mời"
              description="Lời mời kết bạn sẽ hiển thị ở đây."
            />
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id}>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600">
                    <Link to={`/feed/profile/${r.fromUid}`} className="flex-shrink-0 w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
                      {r.avatarUrl ? (
                        <img src={r.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-sm font-semibold text-slate-600 dark:text-slate-300">{r.name.charAt(0).toUpperCase()}</span>
                      )}
                    </Link>
                    <Link to={`/feed/profile/${r.fromUid}`} className="min-w-0 flex-1 font-medium text-slate-800 dark:text-slate-100 hover:text-surf-primary dark:hover:text-surf-secondary truncate">
                      {r.name}
                    </Link>
                    <div className="flex gap-2 flex-shrink-0">
                      <button type="button" disabled={actioningId === r.id} onClick={() => handleAccept(r.id)} className="py-2 px-3 rounded-lg bg-surf-primary dark:bg-surf-secondary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">Xác nhận</button>
                      <button type="button" disabled={actioningId === r.id} onClick={() => handleReject(r.id)} className="py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50">Xóa</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Gợi ý */}
      {section === 'suggestions' && (
        <section>
          {suggestions.length === 0 ? (
            <EmptyState
              iconPath="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
              title="Chưa có gợi ý"
              description="Gợi ý kết bạn sẽ xuất hiện khi bạn có thêm bạn bè."
            />
          ) : (
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 hover:border-surf-primary/30 dark:hover:border-surf-secondary/30 transition-colors">
                    <Link to={`/feed/profile/${s.id}`} className="flex-shrink-0 w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
                      {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-sm font-semibold text-slate-600 dark:text-slate-300">{s.name.charAt(0).toUpperCase()}</span>}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/feed/profile/${s.id}`} className="font-medium text-slate-800 dark:text-slate-100 hover:text-surf-primary dark:hover:text-surf-secondary truncate block">{s.name}</Link>
                      {s.mutualCount != null && s.mutualCount > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{s.mutualCount} bạn chung</p>}
                    </div>
                    <button type="button" disabled={actioningId === s.id} onClick={() => handleAddFriend(s.id)} className="flex-shrink-0 py-2 px-3 rounded-lg bg-surf-primary dark:bg-surf-secondary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">Thêm bạn bè</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Tất cả bạn bè */}
      {section === 'all' && (
        <section>
          {friends.length === 0 ? (
            <EmptyState
              iconPath="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
              title="Chưa có bạn bè"
              description="Tìm kiếm hoặc chấp nhận lời mời để kết nối."
            />
          ) : (
            <ul className="space-y-2">
              {friends.map((f) => (
                <li key={f.id}>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 hover:border-surf-primary/30 dark:hover:border-surf-secondary/30 transition-colors">
                    <Link to={`/feed/profile/${f.id}`} className="flex-shrink-0 w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
                      {f.avatarUrl ? <img src={f.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-sm font-semibold text-slate-600 dark:text-slate-300">{f.name.charAt(0).toUpperCase()}</span>}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/feed/profile/${f.id}`} className="font-medium text-slate-800 dark:text-slate-100 hover:text-surf-primary dark:hover:text-surf-secondary truncate block">{f.name}</Link>
                      {f.mutualCount != null && f.mutualCount > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{f.mutualCount} bạn chung</p>}
                    </div>
                    <Link to="/feed/waves" className="flex-shrink-0 py-2 px-3 rounded-lg bg-surf-primary/10 dark:bg-surf-secondary/15 text-surf-primary dark:text-surf-secondary text-sm font-medium hover:bg-surf-primary/20 dark:hover:bg-surf-secondary/25 transition-colors">Nhắn tin</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Sinh nhật */}
      {section === 'birthdays' && (
        <section>
          <EmptyState
            iconPath="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.11-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"
            title="Chưa có sinh nhật"
            description="Sinh nhật bạn bè sẽ hiển thị ở đây."
          />
        </section>
      )}

      {/* Lịch sử tương tác */}
      {section === 'history' && (
        <section>
          <EmptyState
            iconPath="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12V6c0-3.87 3.13-7 7-7s7 3.13 7 7c0 3.87-3.13 7-7 7-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"
            title="Chưa có lịch sử"
            description="Theo dõi những người bạn đã follow hoặc gửi lời mời kết bạn tại đây."
          />
        </section>
      )}
    </div>
  );
}
