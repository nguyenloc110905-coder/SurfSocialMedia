import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNicknameStore } from '@/stores/nicknameStore';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { FriendItem, RequestItem, SentItem } from './types';

interface FriendsContextValue {
  friends: FriendItem[];
  requests: RequestItem[];
  sent: SentItem[];
  suggestions: FriendItem[];
  sentMap: Map<string, string>;
  loading: boolean;
  error: string;
  actioningId: string | null;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: FriendItem[];
  searchLoading: boolean;

  friendsSearchQ: string;
  setFriendsSearchQ: (q: string) => void;

  reqTab: 'received' | 'sent';
  setReqTab: (t: 'received' | 'sent') => void;

  nicknames: Record<string, string>;
  nicknameEdit: { uid: string; value: string } | null;
  setNicknameEdit: (v: { uid: string; value: string } | null) => void;
  nickSearchQ: string;
  setNickSearchQ: (q: string) => void;
  nickSaving: boolean;

  handleAccept: (requestId: string) => Promise<void>;
  handleReject: (requestId: string) => Promise<void>;
  handleAddFriend: (toUid: string, name: string, avatarUrl?: string) => Promise<void>;
  handleCancelSent: (requestId: string, toUid: string) => Promise<void>;
  handleSaveNickname: () => Promise<void>;
  handleDeleteNickname: (uid: string) => Promise<void>;

  isFriend: (uid: string) => boolean;
  hasSent: (uid: string) => boolean;
  hasRequest: (uid: string) => boolean;
  resolve: (uid: string, fallback: string) => string;
}

const FriendsContext = createContext<FriendsContextValue | null>(null);

export function useFriends() {
  const ctx = useContext(FriendsContext);
  if (!ctx) throw new Error('useFriends must be used within FriendsProvider');
  return ctx;
}

export function FriendsProvider({ children }: { children: ReactNode }) {
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

  const [sentMap, setSentMap] = useState<Map<string, string>>(new Map());
  const [reqTab, setReqTab] = useState<'received' | 'sent'>('received');

  const [nicknames, setNicknames]       = useState<Record<string, string>>({});
  const [nicknameEdit, setNicknameEdit] = useState<{ uid: string; value: string } | null>(null);
  const [nickSearchQ, setNickSearchQ]   = useState('');
  const [nickSaving, setNickSaving]     = useState(false);

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

  return (
    <FriendsContext.Provider value={{
      friends, requests, sent, suggestions, sentMap, loading, error, actioningId,
      searchQuery, setSearchQuery, searchResults, searchLoading,
      friendsSearchQ, setFriendsSearchQ,
      reqTab, setReqTab,
      nicknames, nicknameEdit, setNicknameEdit, nickSearchQ, setNickSearchQ, nickSaving,
      handleAccept, handleReject, handleAddFriend, handleCancelSent,
      handleSaveNickname, handleDeleteNickname,
      isFriend, hasSent, hasRequest, resolve,
    }}>
      {children}
    </FriendsContext.Provider>
  );
}
