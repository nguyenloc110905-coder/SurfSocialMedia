import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';

// ─── localStorage helpers ────────────────────────────────────────────────────

const STORAGE_KEY = 'surf_recent_searches';
const MAX_RECENT = 8;

type RecentUser  = { type: 'user';  uid: string; name: string; avatarUrl?: string };
type RecentQuery = { type: 'query'; text: string };
type RecentItem  = RecentUser | RecentQuery;

type SearchUser = { id: string; name: string; avatarUrl?: string; mutualCount?: number };

function getRecents(): RecentItem[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

function saveRecent(item: RecentItem) {
  const filtered = getRecents().filter((r) => {
    if (r.type === 'user'  && item.type === 'user')  return r.uid  !== item.uid;
    if (r.type === 'query' && item.type === 'query') return r.text !== item.text;
    return true;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify([item, ...filtered].slice(0, MAX_RECENT)));
}

function removeRecent(item: RecentItem) {
  const filtered = getRecents().filter((r) => {
    if (r.type === 'user'  && item.type === 'user')  return r.uid  !== item.uid;
    if (r.type === 'query' && item.type === 'query') return r.text !== item.text;
    return true;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

// ─── Avatar helper ───────────────────────────────────────────────────────────

function Avatar({ name, avatarUrl, size = 8 }: { name: string; avatarUrl?: string; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full flex-shrink-0`;
  if (avatarUrl)
    return <img src={avatarUrl} alt="" className={`${cls} object-cover`} />;
  return (
    <div className={`${cls} bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center`}>
      <span className="text-white text-xs font-bold">{name.charAt(0).toUpperCase()}</span>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

type Props = { wrapperClassName?: string };

export default function SearchBox({ wrapperClassName }: Props) {
  const navigate = useNavigate();
  const [query, setQuery]           = useState('');
  const [focused, setFocused]       = useState(false);
  const [suggestions, setSuggestions] = useState<SearchUser[]>([]);
  const [loading, setLoading]       = useState(false);
  const [recents, setRecents]       = useState<RecentItem[]>([]);
  const [activeIdx, setActiveIdx]   = useState(-1);

  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync to server (fire-and-forget) ──────────────────────────────────
  const syncServer = useCallback((items: RecentItem[]) => {
    api.put('/api/users/me/recent-searches', { recentSearches: items }).catch(() => {});
  }, []);

  // ── Load from server on first focus ────────────────────────────────
  const serverLoadedRef = useRef(false);
  const handleFocus = useCallback(() => {
    const local = getRecents();
    setRecents(local);
    setFocused(true);
    setActiveIdx(-1);
    if (!serverLoadedRef.current) {
      serverLoadedRef.current = true;
      api.get<{ recentSearches: RecentItem[] }>('/api/users/me/recent-searches')
        .then((res) => {
          const serverItems = res.recentSearches ?? [];
          if (serverItems.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(serverItems));
            setRecents(serverItems);
          }
        })
        .catch(() => {});
    }
  }, []);

  // ── Close on outside click ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Debounced API suggestions ───────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setSuggestions([]); setLoading(false); return; }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ users: SearchUser[] }>(
          `/api/users/search?q=${encodeURIComponent(query.trim())}`
        );
        setSuggestions(res.users ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
        setActiveIdx(-1);
      }
    }, 280);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const goToSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    saveRecent({ type: 'query', text: trimmed });
    const updated = getRecents();
    syncServer(updated);
    navigate(`/feed/search?q=${encodeURIComponent(trimmed)}`);
    setFocused(false);
    setQuery('');
  }, [navigate, syncServer]);

  const goToProfile = useCallback((user: { id?: string; uid?: string; name: string; avatarUrl?: string }) => {
    const uid = user.id ?? user.uid ?? '';
    saveRecent({ type: 'user', uid, name: user.name, avatarUrl: user.avatarUrl });
    const updated = getRecents();
    syncServer(updated);
    navigate(`/feed/profile/${uid}`);
    setFocused(false);
    setQuery('');
  }, [navigate, syncServer]);

  // ── Build flat list for keyboard nav ───────────────────────────────────
  const isEmptyQuery = !query.trim();
  const dropdownItems: (() => void)[] = isEmptyQuery
    ? recents.map((r) => () => {
        if (r.type === 'query') goToSearch(r.text);
        else goToProfile(r);
      })
    : suggestions.map((u) => () => goToProfile(u));
  // last item when query: "search all"
  if (!isEmptyQuery) dropdownItems.push(() => goToSearch(query));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, dropdownItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < dropdownItems.length)
        dropdownItems[activeIdx]();
      else
        goToSearch(query);
    } else if (e.key === 'Escape') {
      setFocused(false);
    }
  };

  const handleRemoveRecent = (e: React.MouseEvent, item: RecentItem) => {
    e.stopPropagation();
    removeRecent(item);
    const updated = getRecents();
    setRecents(updated);
    syncServer(updated);
  };

  const showDropdown = focused;

  return (
    <div ref={wrapRef} className={`relative ${wrapperClassName ?? ''}`}>
      {/* ── Input bar ── */}
      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-full px-3 py-1.5 w-full">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Tìm kiếm trên Surf"
          className="bg-transparent border-none outline-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 w-full [&::-webkit-search-cancel-button]:hidden"
          aria-label="Tìm kiếm trên Surf"
          onFocus={handleFocus}
          onChange={(e) => { setQuery(e.target.value); setActiveIdx(-1); }}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => { setQuery(''); setSuggestions([]); inputRef.current?.focus(); }}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 transition-colors"
            aria-label="Xoá"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* ── Dropdown ── */}
      {showDropdown && (
        <div className="absolute top-full left-0 mt-2 w-80 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl z-50 overflow-y-auto max-h-[70vh] animate-fade-in">

          {/* ── EMPTY QUERY: recent searches ─────────────────────────── */}
          {isEmptyQuery ? (
            recents.length === 0 ? (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8 px-4">
                Chưa có tìm kiếm nào gần đây
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tìm kiếm gần đây</span>
                  <button
                    type="button"
                    onClick={() => { localStorage.removeItem(STORAGE_KEY); setRecents([]); syncServer([]); }}
                    className="text-xs text-surf-primary hover:underline"
                  >
                    Xoá tất cả
                  </button>
                </div>
                {recents.map((item, i) => (
                  <div
                    key={i}
                    onClick={() => dropdownItems[i]?.()}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                      activeIdx === i ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700/60'
                    }`}
                  >
                    {item.type === 'user' ? (
                      <Avatar name={item.name} avatarUrl={item.avatarUrl} />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                        <SearchIcon />
                      </div>
                    )}
                    <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">
                      {item.type === 'user' ? item.name : item.text}
                    </span>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => handleRemoveRecent(e, item)}
                      className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      aria-label="Xoá khỏi lịch sử"
                    >
                      <CloseIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </>
            )
          ) : (
            /* ── HAS QUERY: live suggestions ───────────────────────── */
            <>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-surf-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : suggestions.length > 0 ? (
                <>
                  <div className="px-4 pt-3 pb-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Người dùng
                    </span>
                  </div>
                  {suggestions.map((u, i) => (
                    <div
                      key={u.id}
                      onClick={() => goToProfile(u)}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                        activeIdx === i ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700/60'
                      }`}
                    >
                      <Avatar name={u.name} avatarUrl={u.avatarUrl} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{u.name}</p>
                        {(u.mutualCount ?? 0) > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{u.mutualCount} bạn chung</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* "Tìm tất cả" row */}
                  <div
                    onClick={() => goToSearch(query)}
                    className={`flex items-center gap-3 px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 cursor-pointer transition-colors ${
                      activeIdx === suggestions.length ? 'bg-gray-100 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700/60'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                      <SearchIcon />
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Tìm kiếm "<strong>{query}</strong>"
                    </span>
                  </div>
                </>
              ) : (
                /* No suggestions — still allow search */
                <div
                  onClick={() => goToSearch(query)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                    <SearchIcon />
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Tìm kiếm "<strong>{query}</strong>"
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
