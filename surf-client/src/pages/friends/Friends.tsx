import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useNicknameStore } from '@/stores/nicknameStore';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import FriendsLeftNav from '@/components/layout/FriendsLeftNav';

type FriendItem  = { id: string; name: string; avatarUrl?: string; mutualCount?: number };
type RequestItem = { id: string; fromUid: string; name: string; avatarUrl?: string };
type SentItem    = { id: string; toUid: string;  name: string; avatarUrl?: string };

/* -- Avatar ---------------------------------------------------------------- */
function Avatar({ url, name, size = 'md' }: { url?: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-16 h-16 text-lg' : size === 'sm' ? 'w-9 h-9 text-xs' : 'w-12 h-12 text-sm';
  const initials = (() => {
    const w = (name || 'S').split(' ');
    return w.length >= 2 ? (w[0][0] + w[w.length - 1][0]).toUpperCase() : (name[0] || 'S').toUpperCase();
  })();
  return url ? (
    <img src={url} alt={name} className={`${dim} rounded-2xl object-cover flex-shrink-0 ring-2 ring-white/20`} />
  ) : (
    <span className={`${dim} rounded-2xl flex-shrink-0 flex items-center justify-center font-bold text-white bg-gradient-to-br from-surf-primary to-surf-secondary ring-2 ring-white/20`}>
      {initials}
    </span>
  );
}

/* -- Empty state ----------------------------------------------------------- */
function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-surf-primary/15 to-surf-secondary/15 flex items-center justify-center text-surf-primary">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">{title}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">{desc}</p>
      </div>
    </div>
  );
}

/* -- Spinner --------------------------------------------------------------- */
function Spinner() {
  return <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />;
}

/* -- Card ------------------------------------------------------------------ */
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-gray-900/70 border border-gray-200/60 dark:border-gray-700/50 rounded-3xl p-4 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${className}`}>
      {children}
    </div>
  );
}

/* -- Gradient button ------------------------------------------------------- */
function GradBtn({
  onClick, disabled, children, variant = 'primary', className = '',
}: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode;
  variant?: 'primary' | 'ghost' | 'danger'; className?: string;
}) {
  const base = 'inline-flex items-center gap-1.5 px-4 h-9 rounded-2xl text-sm font-semibold transition-all disabled:opacity-50';
  const styles = {
    primary: 'bg-gradient-to-r from-surf-primary to-surf-secondary text-white shadow-sm hover:shadow-surf-primary/30 hover:scale-[1.02] active:scale-[0.98]',
    ghost:   'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
    danger:  'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100',
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

/* ========================================================================= */
export default function Friends() {
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const resolve = useNicknameStore((s) => s.resolve);
  const nicknameStoreSet = useNicknameStore((s) => s.set);
  const nicknameStoreRemove = useNicknameStore((s) => s.remove);

  const [friends,     setFriends]     = useState<FriendItem[]>([]);
  const [requests,    setRequests]    = useState<RequestItem[]>([]);
  const [sent,        setSent]        = useState<SentItem[]>([]);
  const [suggestions, setSuggestions] = useState<FriendItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);

  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<FriendItem[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [friendsSearchQ, setFriendsSearchQ] = useState('');

  // sentMap: toUid -> requestId
  const [sentMap, setSentMap] = useState<Map<string, string>>(new Map());

  // Sub-tab inside requests section
  const [reqTab, setReqTab] = useState<'received' | 'sent'>('received');

  // Nicknames
  const [nicknames, setNicknames]       = useState<Record<string, string>>({});
  const [nicknameEdit, setNicknameEdit] = useState<{ uid: string; value: string } | null>(null);
  const [nickSearchQ, setNickSearchQ]   = useState('');
  const [nickSaving, setNickSaving]     = useState(false);

  const section = pathname === '/feed/friends'   ? 'home'
    : pathname.endsWith('/requests')             ? 'requests'
    : pathname.endsWith('/suggestions')          ? 'suggestions'
    : pathname.endsWith('/all')                  ? 'all'
    : pathname.endsWith('/birthdays')            ? 'birthdays'
    : pathname.endsWith('/nicknames')             ? 'nicknames'
    : 'home';

  /* -- Load data ----------------------------------------------------------- */
  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setError('');
    try {
      const [fRes, rRes, sRes, sugRes, nickRes] = await Promise.all([
        api.get<{ friends: FriendItem[] }>('/api/friends'),
        api.get<{ requests: RequestItem[] }>('/api/friends/requests'),
        api.get<{ sent: SentItem[] }>('/api/friends/sent'),
        api.get<{ suggestions: FriendItem[] }>('/api/friends/suggestions'),
        api.get<{ nicknames: Record<string, string> }>('/api/friends/nicknames'),
      ]);
      setFriends(fRes?.friends ?? []);
      setRequests(rRes?.requests ?? []);
      setSent(sRes?.sent ?? []);
      setSuggestions(sugRes?.suggestions ?? []);
      setNicknames(nickRes?.nicknames ?? {});
      const m = new Map<string, string>();
      (sRes?.sent ?? []).forEach((s) => m.set(s.toUid, s.id));
      setSentMap(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  /* -- Socket -------------------------------------------------------------- */
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onReq = (req: RequestItem) => {
      setRequests((prev) => prev.some((r) => r.id === req.id) ? prev : [req, ...prev]);
    };
    socket.on('friendRequestReceived', onReq);
    return () => { socket.off('friendRequestReceived', onReq); };
  }, [user]);

  /* -- Search -------------------------------------------------------------- */
  useEffect(() => {
    const q = searchQuery.trim();
    if (!user || !q) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      setSearchLoading(true);
      api.get<{ users: FriendItem[] }>(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((r) => setSearchResults(r?.users ?? []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [user, searchQuery]);

  /* -- Actions ------------------------------------------------------------- */
  const handleAccept = async (requestId: string) => {
    setActioningId(requestId);
    try {
      await api.patch(`/api/friends/requests/${requestId}`, { action: 'accept' });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Lỗi chấp nhận.'); }
    finally { setActioningId(null); }
  };

  const handleReject = async (requestId: string) => {
    setActioningId(requestId);
    try {
      await api.delete(`/api/friends/requests/${requestId}`);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (e) { setError(e instanceof Error ? e.message : 'Lỗi từ chối.'); }
    finally { setActioningId(null); }
  };

  const handleAddFriend = async (toUid: string, name: string, avatarUrl?: string) => {
    setActioningId(toUid);
    try {
      const res = await api.post<{ id: string }>('/api/friends/requests', { toUid });
      const newItem: SentItem = { id: res.id, toUid, name, avatarUrl };
      setSent((prev) => [newItem, ...prev]);
      setSentMap((prev) => new Map([...prev, [toUid, res.id]]));
    } catch (e) { setError(e instanceof Error ? e.message : 'Lỗi gửi lời mời.'); }
    finally { setActioningId(null); }
  };

  const handleCancelSent = async (requestId: string, toUid: string) => {
    setActioningId(requestId);
    try {
      await api.delete(`/api/friends/requests/${requestId}`);
      setSent((prev) => prev.filter((s) => s.id !== requestId));
      setSentMap((prev) => { const m = new Map(prev); m.delete(toUid); return m; });
    } catch (e) { setError(e instanceof Error ? e.message : 'Lỗi hủy lời mời.'); }
    finally { setActioningId(null); }
  };

  /* -- Nickname actions ----------------------------------------------------- */
  const handleSaveNickname = async () => {
    if (!nicknameEdit) return;
    const { uid, value } = nicknameEdit;
    const trimmed = value.trim();
    setNickSaving(true);
    try {
      if (trimmed) {
        await api.put(`/api/friends/nicknames/${uid}`, { nickname: trimmed });
        setNicknames((prev) => ({ ...prev, [uid]: trimmed }));
        nicknameStoreSet(uid, trimmed);
      } else {
        await api.delete(`/api/friends/nicknames/${uid}`);
        setNicknames((prev) => { const n = { ...prev }; delete n[uid]; return n; });
        nicknameStoreRemove(uid);
      }
      setNicknameEdit(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Lỗi lưu biệt danh.'); }
    finally { setNickSaving(false); }
  };

  const handleDeleteNickname = async (uid: string) => {
    setNickSaving(true);
    try {
      await api.delete(`/api/friends/nicknames/${uid}`);
      setNicknames((prev) => { const n = { ...prev }; delete n[uid]; return n; });
      nicknameStoreRemove(uid);
    } catch (e) { setError(e instanceof Error ? e.message : 'Lỗi xóa biệt danh.'); }
    finally { setNickSaving(false); }
  };

  /* -- Relationship helpers ------------------------------------------------ */
  const isFriend   = (uid: string) => friends.some((f) => f.id === uid);
  const hasSent    = (uid: string) => sentMap.has(uid);
  const hasRequest = (uid: string) => requests.some((r) => r.fromUid === uid);

  /* -- Add/Friend button --------------------------------------------------- */
  function AddFriendBtn({ uid, name, avatarUrl }: { uid: string; name: string; avatarUrl?: string }) {
    if (isFriend(uid)) return (
      <span className="inline-flex items-center gap-1.5 px-4 h-9 rounded-2xl text-sm font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>
        Bạn bè
      </span>
    );
    if (hasRequest(uid)) {
      const req = requests.find((r) => r.fromUid === uid);
      return (
        <GradBtn variant="primary" disabled={actioningId === req?.id} onClick={() => req && handleAccept(req.id)}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>
          Xác nhận
        </GradBtn>
      );
    }
    if (hasSent(uid)) {
      const reqId = sentMap.get(uid)!;
      return (
        <GradBtn variant="ghost" disabled={actioningId === reqId} onClick={() => handleCancelSent(reqId, uid)}>
          {actioningId === reqId ? <Spinner /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>}
          Đã gửi
        </GradBtn>
      );
    }
    return (
      <GradBtn variant="primary" disabled={actioningId === uid} onClick={() => handleAddFriend(uid, name, avatarUrl)}>
        {actioningId === uid ? <Spinner /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>}
        Thêm bạn
      </GradBtn>
    );
  }

  /* -- Render -------------------------------------------------------------- */
  return (
    <div className="px-4 py-5 space-y-5">

      {/* Top bar: Title + horizontal tab navigation */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bạn bè</h1>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surf-primary/10 text-surf-primary font-semibold">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3z" /></svg>
              {friends.length}
            </span>
            {requests.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 font-semibold">
                {requests.length} mới
              </span>
            )}
          </div>
        </div>

        {/* Horizontal tab bar */}
        <FriendsLeftNav />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm border border-red-200/50 dark:border-red-800/50">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="w-8 h-8 border-2 border-surf-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── HOME: Search ────────────────────────────────────────── */}
          {section === 'home' && (
            <div className="space-y-4">
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
                <input
                  type="search"
                  placeholder="Tìm kiếm người dùng trên Surf..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-surf-primary/30 focus:border-surf-primary/50 transition-all text-sm"
                />
              </div>

              {searchQuery.trim() ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
                    Kết quả · {searchResults.length}
                  </p>
                  {searchLoading ? (
                    <div className="flex justify-center py-10"><Spinner /></div>
                  ) : searchResults.length === 0 ? (
                    <EmptyState
                      icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>}
                      title="Không tìm thấy"
                      desc="Thử tìm với tên khác."
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {searchResults.map((s) => (
                        <Card key={s.id}>
                          <Link to={`/feed/profile/${s.id}`}><Avatar url={s.avatarUrl} name={resolve(s.id, s.name)} /></Link>
                          <div className="flex-1 min-w-0">
                            <Link to={`/feed/profile/${s.id}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:text-surf-primary transition-colors truncate block">{resolve(s.id, s.name)}</Link>
                            {isFriend(s.id) && <p className="text-xs text-emerald-500">Bạn bè</p>}
                            {hasSent(s.id) && !isFriend(s.id) && <p className="text-xs text-surf-primary dark:text-surf-secondary">Đang chờ</p>}
                          </div>
                          <AddFriendBtn uid={s.id} name={resolve(s.id, s.name)} avatarUrl={s.avatarUrl} />
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>}
                  title="Tìm bạn trên Surf"
                  desc="Nhập tên để tìm người dùng, gửi lời mời kết bạn hoặc theo dõi nhau."
                />
              )}
            </div>
          )}

          {/* ── REQUESTS ────────────────────────────────────────────── */}
          {section === 'requests' && (
            <div className="space-y-4">
              {/* Sub-tabs */}
              <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800/60">
                {(['received', 'sent'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setReqTab(tab)}
                    className={[
                      'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                      reqTab === tab
                        ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                    ].join(' ')}
                  >
                    {tab === 'received'
                      ? `Nhận được${requests.length > 0 ? ` (${requests.length})` : ''}`
                      : `Đã gửi${sent.length > 0 ? ` (${sent.length})` : ''}`}
                  </button>
                ))}
              </div>

              {/* Received */}
              {reqTab === 'received' && (
                requests.length === 0 ? (
                  <EmptyState
                    icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>}
                    title="Không có lời mời nào"
                    desc="Khi ai đó gửi lời mời, sẽ hiện ở đây."
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {requests.map((r) => (
                      <Card key={r.id}>
                        <Link to={`/feed/profile/${r.fromUid}`}><Avatar url={r.avatarUrl} name={resolve(r.fromUid, r.name)} /></Link>
                        <div className="flex-1 min-w-0">
                          <Link to={`/feed/profile/${r.fromUid}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:text-surf-primary transition-colors truncate block">{resolve(r.fromUid, r.name)}</Link>
                          <p className="text-xs text-gray-400 dark:text-gray-500">Muốn kết bạn</p>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <GradBtn variant="primary" disabled={actioningId === r.id} onClick={() => handleAccept(r.id)}>
                            {actioningId === r.id ? <Spinner /> : null}
                            Nhận
                          </GradBtn>
                          <GradBtn variant="ghost" disabled={actioningId === r.id} onClick={() => handleReject(r.id)}>
                            Xoá
                          </GradBtn>
                        </div>
                      </Card>
                    ))}
                  </div>
                )
              )}

              {/* Sent */}
              {reqTab === 'sent' && (
                sent.length === 0 ? (
                  <EmptyState
                    icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>}
                    title="Chưa gửi lời mời nào"
                    desc="Lời mời bạn đã gửi và chưa được chấp nhận sẽ hiển thị ở đây."
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sent.map((s) => (
                      <Card key={s.id}>
                        <Link to={`/feed/profile/${s.toUid}`}><Avatar url={s.avatarUrl} name={resolve(s.toUid, s.name)} /></Link>
                        <div className="flex-1 min-w-0">
                          <Link to={`/feed/profile/${s.toUid}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:text-surf-primary transition-colors truncate block">{resolve(s.toUid, s.name)}</Link>
                          <p className="text-xs text-gray-400 dark:text-gray-500">Đang chờ xác nhận</p>
                        </div>
                        <GradBtn variant="ghost" disabled={actioningId === s.id} onClick={() => handleCancelSent(s.id, s.toUid)}>
                          {actioningId === s.id ? <Spinner /> : null}
                          Hủy
                        </GradBtn>
                      </Card>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* ── SUGGESTIONS ─────────────────────────────────────────── */}
          {section === 'suggestions' && (
            suggestions.length === 0 ? (
              <EmptyState
                icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" /></svg>}
                title="Không có gợi ý"
                desc="Những người chưa kết bạn sẽ hiện ở đây."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {suggestions.map((s) => (
                  <div key={s.id} className="bg-white dark:bg-gray-900/70 border border-gray-200/60 dark:border-gray-700/50 rounded-2xl p-4 flex flex-col items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-center">
                    <Link to={`/feed/profile/${s.id}`}><Avatar url={s.avatarUrl} name={resolve(s.id, s.name)} size="lg" /></Link>
                    <div className="min-w-0 w-full">
                      <Link to={`/feed/profile/${s.id}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:text-surf-primary transition-colors truncate block">{resolve(s.id, s.name)}</Link>
                      {s.mutualCount != null && s.mutualCount > 0 && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{s.mutualCount} bạn chung</p>
                      )}
                    </div>
                    <AddFriendBtn uid={s.id} name={resolve(s.id, s.name)} avatarUrl={s.avatarUrl} />
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── ALL FRIENDS ─────────────────────────────────────────── */}
          {section === 'all' && (
            <div className="space-y-4">
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
                <input
                  type="search"
                  placeholder="Tìm trong danh sách bạn bè..."
                  value={friendsSearchQ}
                  onChange={(e) => setFriendsSearchQ(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-surf-primary/30 transition-all text-sm"
                />
              </div>
              {friends.length === 0 ? (
                <EmptyState
                  icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>}
                  title="Chưa có bạn bè"
                  desc="Tìm kiếm và gửi lời mời để kết nối với mọi người."
                />
              ) : (() => {
                const q = friendsSearchQ.trim().toLowerCase();
                const filtered = q ? friends.filter((f) => f.name.toLowerCase().includes(q) || resolve(f.id, f.name).toLowerCase().includes(q)) : friends;
                return filtered.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">Không tìm thấy &ldquo;{friendsSearchQ}&rdquo;</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filtered.map((f) => (
                      <Card key={f.id}>
                        <Link to={`/feed/profile/${f.id}`}><Avatar url={f.avatarUrl} name={resolve(f.id, f.name)} /></Link>
                        <div className="flex-1 min-w-0">
                          <Link to={`/feed/profile/${f.id}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:text-surf-primary transition-colors truncate block">{resolve(f.id, f.name)}</Link>
                          {f.mutualCount != null && f.mutualCount > 0 && (
                            <p className="text-xs text-gray-400 dark:text-gray-500">{f.mutualCount} bạn chung</p>
                          )}
                        </div>
                        <Link to="/feed/waves" className="inline-flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" /></svg>
                          Nhắn tin
                        </Link>
                      </Card>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── BIRTHDAYS ───────────────────────────────────────────── */}
          {section === 'birthdays' && (
            <EmptyState
              icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M12 6c1.11 0 2-.9 2-2 0-.38-.1-.73-.29-1.03L12 0l-1.71 2.97c-.19.3-.29.65-.29 1.03 0 1.1.9 2 2 2zm4.6 9.99l-1.07-1.07-1.08 1.07c-1.3 1.3-3.58 1.31-4.89 0l-1.07-1.07-1.09 1.07C6.75 16.64 5.88 17 4.96 17c-.73 0-1.4-.23-1.96-.61V21c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-4.61c-.56.38-1.23.61-1.96.61-.92 0-1.79-.36-2.44-1.01zM18 9H6c-1.66 0-3 1.34-3 3v.68c0 1.01.54 1.95 1.43 2.45.49.28 1.06.37 1.57.23.51-.13.99-.45 1.35-.94.36.49.84.81 1.35.94.5.14 1.07.04 1.57-.23.49-.27.87-.67 1.14-1.15.27.48.65.88 1.14 1.15.5.27 1.07.37 1.57.23.51-.13.99-.45 1.35-.94.36.49.84.81 1.35.94.51.14 1.08.05 1.57-.22C20.46 14.63 21 13.69 21 12.68V12c0-1.66-1.34-3-3-3z" /></svg>}
              title="Sinh nhật bạn bè"
              desc="Sinh nhật sắp tới của bạn bè sẽ xuất hiện ở đây."
            />
          )}

          {/* ── NICKNAMES ───────────────────────────────────────────── */}
          {section === 'nicknames' && (
            <div className="space-y-4">
              {/* Search friends to set nickname */}
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
                <input
                  type="search"
                  placeholder="Tìm bạn bè để đặt biệt danh..."
                  value={nickSearchQ}
                  onChange={(e) => setNickSearchQ(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-surf-primary/30 transition-all text-sm"
                />
              </div>

              {/* Existing nicknames */}
              {Object.keys(nicknames).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
                    Biệt danh đã đặt · {Object.keys(nicknames).length}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(nicknames).map(([fUid, nick]) => {
                      const friend = friends.find((f) => f.id === fUid);
                      if (!friend) return null;
                      const isEditing = nicknameEdit?.uid === fUid;
                      return (
                        <div key={fUid} className="bg-white dark:bg-gray-900/70 border border-gray-200/60 dark:border-gray-700/50 rounded-2xl p-3 flex items-center gap-3 hover:shadow-sm transition-all">
                          <Link to={`/feed/profile/${fUid}`}><Avatar url={friend.avatarUrl} name={resolve(fUid, friend.name)} size="sm" /></Link>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{resolve(fUid, friend.name)}</p>
                            {isEditing ? (
                              <div className="flex items-center gap-1.5 mt-1">
                                <input
                                  autoFocus
                                  value={nicknameEdit.value}
                                  onChange={(e) => setNicknameEdit({ uid: fUid, value: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNickname(); if (e.key === 'Escape') setNicknameEdit(null); }}
                                  maxLength={50}
                                  className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-surf-primary/40"
                                  placeholder="Nhập biệt danh..."
                                />
                                <button type="button" onClick={handleSaveNickname} disabled={nickSaving} className="p-1 rounded-lg text-surf-primary hover:bg-surf-primary/10 disabled:opacity-50">
                                  {nickSaving ? <Spinner /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>}
                                </button>
                                <button type="button" onClick={() => setNicknameEdit(null)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" /></svg>
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-surf-primary dark:text-surf-secondary truncate">
                                Biệt danh: <span className="font-medium">{nick}</span>
                              </p>
                            )}
                          </div>
                          {!isEditing && (
                            <div className="flex gap-1 flex-shrink-0">
                              <button type="button" onClick={() => setNicknameEdit({ uid: fUid, value: nick })} className="p-1.5 rounded-lg text-gray-400 hover:text-surf-primary hover:bg-surf-primary/10 transition-colors" title="Sửa">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
                              </button>
                              <button type="button" onClick={() => handleDeleteNickname(fUid)} disabled={nickSaving} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50" title="Xóa">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Friends list to pick from */}
              {(() => {
                const q = nickSearchQ.trim().toLowerCase();
                const filtered = q ? friends.filter((f) => f.name.toLowerCase().includes(q) || resolve(f.id, f.name).toLowerCase().includes(q)) : friends;
                const available = filtered.filter((f) => !nicknames[f.id]);
                if (friends.length === 0) return (
                  <EmptyState
                    icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>}
                    title="Chưa có bạn bè"
                    desc="Hãy kết bạn trước để đặt biệt danh cho họ."
                  />
                );
                if (available.length === 0 && !q) return null;
                if (available.length === 0 && q) return (
                  <p className="text-sm text-gray-500 text-center py-6">Không tìm thấy &ldquo;{nickSearchQ}&rdquo;</p>
                );
                return (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
                      {q ? 'Kết quả tìm kiếm' : 'Chọn bạn bè'} · {available.length}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {available.map((f) => {
                        const isEditing = nicknameEdit?.uid === f.id;
                        return (
                          <div key={f.id} className="bg-white dark:bg-gray-900/70 border border-gray-200/60 dark:border-gray-700/50 rounded-2xl p-3 flex items-center gap-3 hover:shadow-sm transition-all">
                            <Link to={`/feed/profile/${f.id}`}><Avatar url={f.avatarUrl} name={resolve(f.id, f.name)} size="sm" /></Link>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{resolve(f.id, f.name)}</p>
                              {isEditing ? (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <input
                                    autoFocus
                                    value={nicknameEdit.value}
                                    onChange={(e) => setNicknameEdit({ uid: f.id, value: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNickname(); if (e.key === 'Escape') setNicknameEdit(null); }}
                                    maxLength={50}
                                    className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-surf-primary/40"
                                    placeholder="Nhập biệt danh..."
                                  />
                                  <button type="button" onClick={handleSaveNickname} disabled={nickSaving} className="p-1 rounded-lg text-surf-primary hover:bg-surf-primary/10 disabled:opacity-50">
                                    {nickSaving ? <Spinner /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>}
                                  </button>
                                  <button type="button" onClick={() => setNicknameEdit(null)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" /></svg>
                                  </button>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 dark:text-gray-500">Chưa có biệt danh</p>
                              )}
                            </div>
                            {!isEditing && (
                              <button type="button" onClick={() => setNicknameEdit({ uid: f.id, value: '' })} className="inline-flex items-center gap-1 px-3 h-8 rounded-xl text-xs font-semibold bg-surf-primary/10 text-surf-primary hover:bg-surf-primary/20 transition-colors">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
                                Đặt
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

