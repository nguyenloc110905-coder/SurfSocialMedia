import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

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
  const user = useAuthStore((s) => s.user);
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [suggestions, setSuggestions] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<FriendItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [friendsSearchQuery, setFriendsSearchQuery] = useState('');

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
      console.log('📋 Đang tải danh sách bạn bè...');
      
      // Đợi thêm một chút để đảm bảo auth sẵn sàng
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const [friendsRes, requestsRes, suggestionsRes] = await Promise.all([
        api.get<{ friends: FriendItem[] }>('/api/friends'),
        api.get<{ requests: Array<{ id: string; fromUid: string; name: string; avatarUrl?: string }> }>('/api/friends/requests'),
        api.get<{ suggestions: FriendItem[] }>('/api/friends/suggestions'),
      ]);
      setFriends(friendsRes?.friends ?? []);
      setRequests(requestsRes?.requests ?? []);
      setSuggestions(suggestionsRes?.suggestions ?? []);
      console.log(`✅ Tải xong: ${friendsRes?.friends?.length ?? 0} bạn, ${requestsRes?.requests?.length ?? 0} lời mời, ${suggestionsRes?.suggestions?.length ?? 0} gợi ý`);
    } catch (e) {
      console.error('❌ Lỗi tải bạn bè:', e);
      setError(e instanceof Error ? e.message : 'Không tải được danh sách bạn bè.');
      setFriends([]);
      setRequests([]);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setFriends([]);
      setRequests([]);
      setSuggestions([]);
      return;
    }
    setLoading(true);
    loadFriends();
  }, [user, loadFriends]);

  // Listen Socket.io events cho real-time friend requests
  useEffect(() => {
    if (!user) return;

    const socket = getSocket();

    const handleFriendRequest = (request: RequestItem) => {
      console.log('🔔 Nhận lời mời kết bạn mới:', request.name);
      setRequests((prev) => {
        // Kiểm tra không trùng
        if (prev.some((r) => r.id === request.id)) {
          return prev;
        }
        return [request, ...prev];
      });
    };

    socket.on('friendRequestReceived', handleFriendRequest);

    return () => {
      socket.off('friendRequestReceived', handleFriendRequest);
    };
  }, [user, pathname]);

  // Tìm bạn theo tên (chỉ khi đã đăng nhập)
  useEffect(() => {
    const q = searchQuery.trim();
    if (!user || !q) {
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
  }, [user, searchQuery]);

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
      // Thêm vào danh sách đã gửi lời mời
      setSentRequests((prev) => new Set([...prev, toUid]));
      // KHÔNG gọi loadFriends() và KHÔNG xóa khỏi searchResults
      // Để người dùng vẫn hiển thị với button "Đã gửi lời mời"
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

      {/* Trang chủ bạn bè - Tìm kiếm tất cả users */}
      {section === 'home' && (
        <section>
          <div className="relative mb-6">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
            <input
              type="search"
              placeholder="Tìm kiếm người dùng..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-surf-primary/40 focus:border-surf-primary/50 dark:focus:ring-surf-secondary/40 transition-shadow"
            />
          </div>

          {searchQuery.trim() ? (
            <>
              <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">Kết quả tìm kiếm</h2>
              {searchLoading ? (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm py-4">
                  <span className="inline-block w-5 h-5 border-2 border-surf-primary dark:border-surf-secondary border-t-transparent rounded-full animate-spin" />
                  Đang tìm…
                </div>
              ) : searchResults.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-4">Không tìm thấy người dùng nào.</p>
              ) : (
                <ul className="space-y-2">
                  {searchResults.map((s) => {
                    const isFriend = friends.some(f => f.id === s.id);
                    const hasSentRequest = sentRequests.has(s.id);
                    const hasReceivedRequest = requests.some(r => r.fromUid === s.id);
                    
                    return (
                      <li key={s.id}>
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600">
                          <Link to={`/feed/profile/${s.id}`} className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden">
                            {s.avatarUrl ? (
                              <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-600">
                                <span className="text-sm font-bold text-white">
                                  {(() => {
                                    const name = s.name || 'S';
                                    const words = name.split(' ');
                                    if (words.length >= 2) {
                                      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
                                    }
                                    return name.substring(0, 1).toUpperCase();
                                  })()}
                                </span>
                              </span>
                            )}
                          </Link>
                          <Link to={`/feed/profile/${s.id}`} className="min-w-0 flex-1 font-medium text-slate-800 dark:text-slate-100 hover:text-surf-primary dark:hover:text-surf-secondary truncate">
                            {s.name}
                          </Link>
                          {isFriend ? (
                            <div className="flex gap-2 flex-shrink-0">
                              <span className="py-2 px-3 rounded-lg bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 text-green-700 dark:text-green-300 text-sm font-medium flex items-center gap-1.5">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                                </svg>
                                <span>Bạn bè</span>
                              </span>
                              <Link
                                to="/feed/waves"
                                className="py-2 px-3 rounded-lg bg-gradient-to-r from-surf-primary to-blue-500 dark:from-surf-secondary dark:to-purple-500 text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                                </svg>
                                <span>Nhắn tin</span>
                              </Link>
                            </div>
                          ) : hasReceivedRequest ? (
                            <button
                              type="button"
                              className="flex-shrink-0 py-2 px-3 rounded-lg bg-gradient-to-r from-surf-primary to-blue-500 dark:from-surf-secondary dark:to-purple-500 text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                              </svg>
                              <span>Chấp nhận</span>
                            </button>
                          ) : (
                            <button 
                              type="button" 
                              disabled={actioningId === s.id || hasSentRequest} 
                              onClick={() => handleAddFriend(s.id)} 
                              className={`flex-shrink-0 py-2 px-3 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50 flex items-center gap-1.5 ${
                                hasSentRequest 
                                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400' 
                                  : 'bg-gradient-to-r from-surf-primary to-blue-500 dark:from-surf-secondary dark:to-purple-500 text-white hover:opacity-90'
                              }`}
                            >
                              {hasSentRequest ? (
                                <>
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                                  </svg>
                                  <span>Đã gửi</span>
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                                  </svg>
                                  <span>Thêm bạn</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <EmptyState
              iconPath="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              title="Chào mừng đến Bạn bè"
              description="Dùng thanh tìm kiếm để tìm bạn bè, hoặc dùng menu bên trái để xem lời mời và gợi ý."
            />
          )}
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
                    <Link to={`/feed/profile/${r.fromUid}`} className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden">
                      {r.avatarUrl ? (
                        <img src={r.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-600">
                          <span className="text-sm font-bold text-white">
                            {(() => {
                              const name = r.name || 'S';
                              const words = name.split(' ');
                              if (words.length >= 2) {
                                return (words[0][0] + words[words.length - 1][0]).toUpperCase();
                              }
                              return name.substring(0, 1).toUpperCase();
                            })()}
                          </span>
                        </span>
                      )}
                    </Link>
                    <Link to={`/feed/profile/${r.fromUid}`} className="min-w-0 flex-1 font-medium text-slate-800 dark:text-slate-100 hover:text-surf-primary dark:hover:text-surf-secondary truncate">
                      {r.name}
                    </Link>
                    <div className="flex gap-2 flex-shrink-0">
                      <button type="button" disabled={actioningId === r.id} onClick={() => handleAccept(r.id)} className="py-2 px-3 rounded-lg bg-gradient-to-r from-surf-primary to-blue-500 dark:from-surf-secondary dark:to-purple-500 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                        <span>Chấp nhận</span>
                      </button>
                      <button type="button" disabled={actioningId === r.id} onClick={() => handleReject(r.id)} className="py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                        </svg>
                        <span>Từ chối</span>
                      </button>
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
              title="Chưa có ai để gợi ý"
              description="Những người chưa kết bạn với bạn sẽ hiện ở đây. Để có người: nhờ ai đó mở app và đăng nhập rồi tải lại, hoặc dùng tài khoản thứ 2 (cửa sổ ẩn danh). Có thể tìm theo tên ở ô phía trên."
            />
          ) : (
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 hover:border-surf-primary/30 dark:hover:border-surf-secondary/30 transition-colors">
                    <Link to={`/feed/profile/${s.id}`} className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden">
                      {s.avatarUrl ? (
                        <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-600">
                          <span className="text-sm font-bold text-white">
                            {(() => {
                              const name = s.name || 'S';
                              const words = name.split(' ');
                              if (words.length >= 2) {
                                return (words[0][0] + words[words.length - 1][0]).toUpperCase();
                              }
                              return name.substring(0, 1).toUpperCase();
                            })()}
                          </span>
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/feed/profile/${s.id}`} className="font-medium text-slate-800 dark:text-slate-100 hover:text-surf-primary dark:hover:text-surf-secondary truncate block">{s.name}</Link>
                      {s.mutualCount != null && s.mutualCount > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{s.mutualCount} bạn chung</p>}
                    </div>
                    <button 
                      type="button" 
                      disabled={actioningId === s.id || sentRequests.has(s.id)} 
                      onClick={() => handleAddFriend(s.id)} 
                      className={`flex-shrink-0 py-2 px-3 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50 flex items-center gap-1.5 ${
                        sentRequests.has(s.id) 
                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400' 
                          : 'bg-gradient-to-r from-surf-primary to-blue-500 dark:from-surf-secondary dark:to-purple-500 text-white hover:opacity-90'
                      }`}
                    >
                      {sentRequests.has(s.id) ? (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                          </svg>
                          <span>Đã gửi</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                          </svg>
                          <span>Thêm bạn</span>
                        </>
                      )}
                    </button>
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
          {/* Thanh tìm kiếm chỉ tìm trong bạn bè */}
          <div className="relative mb-6">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
            <input
              type="search"
              placeholder="Tìm trong danh sách bạn bè..."
              value={friendsSearchQuery}
              onChange={(e) => setFriendsSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-surf-primary/40 focus:border-surf-primary/50 dark:focus:ring-surf-secondary/40 transition-shadow"
            />
          </div>

          {friends.length === 0 ? (
            <EmptyState
              iconPath="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
              title="Chưa có bạn bè"
              description="Tìm kiếm hoặc chấp nhận lời mời để kết nối."
            />
          ) : (
            <>
              {(() => {
                // Filter bạn bè theo query
                const filteredFriends = friendsSearchQuery.trim()
                  ? friends.filter((f) =>
                      f.name.toLowerCase().includes(friendsSearchQuery.toLowerCase())
                    )
                  : friends;

                if (filteredFriends.length === 0) {
                  return (
                    <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
                      Không tìm thấy bạn bè nào với tên "{friendsSearchQuery}".
                    </p>
                  );
                }

                return (
                  <ul className="space-y-2">
                    {filteredFriends.map((f) => (
                      <li key={f.id}>
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 hover:border-surf-primary/30 dark:hover:border-surf-secondary/30 transition-colors">
                          <Link to={`/feed/profile/${f.id}`} className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden">
                            {f.avatarUrl ? (
                              <img src={f.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-600">
                                <span className="text-sm font-bold text-white">
                                  {(() => {
                                    const name = f.name || 'S';
                                    const words = name.split(' ');
                                    if (words.length >= 2) {
                                      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
                                    }
                                    return name.substring(0, 1).toUpperCase();
                                  })()}
                                </span>
                              </span>
                            )}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <Link to={`/feed/profile/${f.id}`} className="font-medium text-slate-800 dark:text-slate-100 hover:text-surf-primary dark:hover:text-surf-secondary truncate block">
                              {f.name}
                            </Link>
                            {f.mutualCount != null && f.mutualCount > 0 && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">{f.mutualCount} bạn chung</p>
                            )}
                          </div>
                          <Link
                            to="/feed/waves"
                            className="flex-shrink-0 py-2 px-3 rounded-lg bg-gradient-to-r from-surf-primary to-blue-500 dark:from-surf-secondary dark:to-purple-500 text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                            </svg>
                            <span>Nhắn tin</span>
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </>
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
