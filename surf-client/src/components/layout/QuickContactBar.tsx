import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAuthStore } from '../../stores/authStore';
import SurfMusicPlayer from './SurfMusicPlayer';
import MiniChatPanel from './MiniChatPanel';
import { musicStore, type TrackItem, type Playlist } from '../../lib/musicStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { formatLastSeen } from '../../lib/utils/lastSeen';

/** Renders the presence indicator overlaid on an avatar corner */
function PresenceBadge({ uid, size = 'md' }: { uid: string; size?: 'sm' | 'md' }) {
  const isOnline = usePresenceStore((s) => s.onlineUsers.has(uid));
  const lastSeenTs = usePresenceStore((s) => s.lastSeen.get(uid));

  if (isOnline) {
    const dotSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
    return (
      <span
        className={`absolute bottom-0 right-0 ${dotSize} rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800`}
      />
    );
  }

  if (lastSeenTs == null) return null;

  const { label, gray } = formatLastSeen(lastSeenTs);

  if (gray) {
    const dotSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
    return (
      <span
        className={`absolute bottom-0 right-0 ${dotSize} rounded-full bg-gray-400 dark:bg-slate-500 border-2 border-white dark:border-slate-800`}
      />
    );
  }

  return (
    <span className="absolute -bottom-1 -right-1 bg-gray-700 dark:bg-slate-600 text-white text-[9px] font-semibold leading-none px-1 py-0.5 rounded-full border border-white dark:border-slate-800 whitespace-nowrap">
      {label}
    </span>
  );
}

interface Friend {
  id: string;
  name: string;
  avatarUrl?: string;
}

function getInitials(name: string) {
  const words = name.split(' ').filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function decodeHtml(html: string) {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

export default function QuickContactBar({ isShortVideo = false }: { isShortVideo?: boolean }) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [unreadByFriend, setUnreadByFriend] = useState<Record<string, number>>({});

  // Sort: online first, then offline (stable order within each group)
  const sortedFriends = [...friends].sort((a, b) => {
    const aOnline = onlineUsers.has(a.id) ? 0 : 1;
    const bOnline = onlineUsers.has(b.id) ? 0 : 1;
    return aOnline - bOnline;
  });

  const [showSearch, setShowSearch] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [showYoutube, setShowYoutube] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [openChats, setOpenChats] = useState<string[]>([]);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // YouTube panel state
  const [ytQuery, setYtQuery] = useState('');
  const [ytResults, setYtResults] = useState<Array<{ id: string; title: string; channel: string; thumbnail: string }>>([]);
  const [ytSearching, setYtSearching] = useState(false);
  const [ytActiveId, setYtActiveId] = useState<string | null>(null);
  const [ytActiveInfo, setYtActiveInfo] = useState<{ id: string; title: string; channel: string; thumbnail: string } | null>(null);
  const [ytHistory, setYtHistory] = useState<Array<{ id: string; title: string; channel: string; thumbnail: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('surf_yt_history') ?? '[]'); } catch { return []; }
  });

  // Music panel state
  const [, rerender] = useState(0);
  const [activeTab, setActiveTab] = useState<'history' | 'favorites'>('history');
  const [expandedPlaylist, setExpandedPlaylist] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [addToPlaylistFor, setAddToPlaylistFor] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ friends: Friend[] }>('/api/friends')
      .then((data) => setFriends(data.friends ?? []))
      .catch(() => {});
  }, []);

  // Load initial unread counts from conversations
  useEffect(() => {
    api
      .get<{ items: Array<{ id: string; peer: { uid: string } | null; unreadCount: number }> }>('/api/conversations?limit=50')
      .then((data) => {
        const map: Record<string, number> = {};
        for (const conv of data.items ?? []) {
          if (conv.peer && conv.unreadCount > 0) {
            map[conv.peer.uid] = (map[conv.peer.uid] ?? 0) + conv.unreadCount;
          }
        }
        setUnreadByFriend(map);
      })
      .catch(() => {});
  }, []);

  // Listen for incoming messages → increment badge
  useEffect(() => {
    const socket = getSocket();
    const handler = (payload: { conversationId: string; message: { senderId: string } }) => {
      const senderId = payload.message?.senderId;
      if (!senderId || senderId === currentUser?.uid) return;
      setUnreadByFriend((prev) => ({ ...prev, [senderId]: (prev[senderId] ?? 0) + 1 }));
    };
    socket.on('message:new', handler);
    return () => { socket.off('message:new', handler); };
  }, [currentUser?.uid]);

  useEffect(() => musicStore.subscribe(() => rerender((t) => t + 1)), []);

  // Focus input when panel opens
  useEffect(() => {
    if (showSearch) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [showSearch]);

  // Close playlist menu on outside click
  useEffect(() => {
    if (!addToPlaylistFor) return;
    const handler = () => setAddToPlaylistFor(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [addToPlaylistFor]);

  // YouTube search debounce
  useEffect(() => {
    if (!ytQuery.trim()) { setYtResults([]); return; }
    const timer = setTimeout(async () => {
      setYtSearching(true);
      try {
        const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string;
        if (!apiKey) return;
        const url = new URL('https://www.googleapis.com/youtube/v3/search');
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('type', 'video');
        url.searchParams.set('q', ytQuery.trim());
        url.searchParams.set('maxResults', '10');
        url.searchParams.set('key', apiKey);
        const res = await fetch(url.toString());
        if (!res.ok) return;
        const data = await res.json() as {
          items?: Array<{
            id: { videoId: string };
            snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string }; default?: { url: string } } };
          }>;
        };
        setYtResults((data.items ?? []).map((item) => ({
          id: item.id.videoId,
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
        })));
      } catch { setYtResults([]); }
      finally { setYtSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [ytQuery]);

  const filtered = query.trim()
    ? friends.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    : friends;

  const addYtHistory = (v: { id: string; title: string; channel: string; thumbnail: string }) => {
    setYtHistory((prev) => {
      const next = [v, ...prev.filter((h) => h.id !== v.id)].slice(0, 30);
      localStorage.setItem('surf_yt_history', JSON.stringify(next));
      return next;
    });
  };

  const clearYtHistory = () => {
    localStorage.removeItem('surf_yt_history');
    setYtHistory([]);
  };

  const playYtVideo = (v: { id: string; title: string; channel: string; thumbnail: string }) => {
    setYtActiveId(v.id);
    setYtActiveInfo(v);
    setYtQuery('');
    setYtResults([]);
    addYtHistory(v);
  };

  const history = musicStore.getHistory();
  const favorites = musicStore.getFavorites();
  const playlists = musicStore.getPlaylists();
  const tracks = activeTab === 'history' ? history : favorites;

  return (
    <>
    <div className={`hidden lg:block fixed right-3 top-[72px] z-30 transition-opacity duration-300${isShortVideo ? ' opacity-20 hover:opacity-100' : ''}`}>
      <div className="flex items-start gap-1">
        {/* ── Mini Chat panel ── */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 ${
            showChat ? 'w-[320px] opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}
        >
          <MiniChatPanel key="sidebar-list" onClose={() => { setShowChat(false); }} />
        </div>

        {/* ── YouTube panel ── */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 ${
            showYoutube ? 'w-[680px] opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-[680px] bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl border border-gray-200/60 dark:border-slate-700/60 shadow-xl shadow-black/10 flex flex-col h-[calc(100vh-84px)]">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-slate-700/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21.543 6.498C22 8.28 22 12 22 12s0 3.72-.457 5.502c-.254.985-.997 1.76-1.938 2.022C17.896 20 12 20 12 20s-5.893 0-7.605-.476c-.945-.266-1.687-1.04-1.938-2.022C2 15.72 2 12 2 12s0-3.72.457-5.502c.254-.985.997-1.76 1.938-2.022C6.107 4 12 4 12 4s5.896 0 7.605.476c.945.266 1.687 1.04 1.938 2.022zM10 15.5l6-3.5-6-3.5v7z" />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">YouTube</span>
              </div>
              <button
                onClick={() => setShowYoutube(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Embedded player */}
            <div className="flex-shrink-0">
              {ytActiveId ? (
                <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                  <iframe
                    key={ytActiveId}
                    src={`https://www.youtube.com/embed/${ytActiveId}?autoplay=1&rel=0&modestbranding=1`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full rounded-none"
                    title="YouTube player"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-36 bg-gray-900">
                  <svg className="w-10 h-10 text-red-500 mb-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21.543 6.498C22 8.28 22 12 22 12s0 3.72-.457 5.502c-.254.985-.997 1.76-1.938 2.022C17.896 20 12 20 12 20s-5.893 0-7.605-.476c-.945-.266-1.687-1.04-1.938-2.022C2 15.72 2 12 2 12s0-3.72.457-5.502c.254-.985.997-1.76 1.938-2.022C6.107 4 12 4 12 4s5.896 0 7.605.476c.945.266 1.687 1.04 1.938 2.022zM10 15.5l6-3.5-6-3.5v7z" />
                  </svg>
                  <p className="text-xs text-gray-400">Tìm video để xem</p>
                </div>
              )}
            </div>

            {/* Search bar */}
            <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700/50 flex-shrink-0">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  value={ytQuery}
                  onChange={(e) => setYtQuery(e.target.value)}
                  placeholder="Tìm kiếm trên YouTube..."
                  className="w-full text-xs bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg pl-8 pr-7 py-2 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                {ytSearching ? (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2">
                    <svg className="w-3.5 h-3.5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  </span>
                ) : ytQuery ? (
                  <button onClick={() => setYtQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>

            {/* Results / History / Now-playing info */}
            <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col">
              {ytResults.length > 0 ? (
                /* ── Search results ── */
                <ul className="py-1">
                  {ytResults.map((v) => (
                    <li
                      key={v.id}
                      onClick={() => playYtVideo(v)}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors group ${
                        ytActiveId === v.id ? 'bg-red-50 dark:bg-red-900/20' : ''
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        <img src={v.thumbnail} alt="" className="w-20 h-[45px] rounded object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-6 h-6 bg-black/50 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-900 dark:text-white line-clamp-2 leading-tight">{decodeHtml(v.title)}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{v.channel}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                /* ── No search results: show now-playing info + history ── */
                <div className="flex flex-col flex-1">
                  {/* Now playing card */}
                  {ytActiveInfo && (
                    <div className="mx-3 mt-3 mb-1 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 p-2.5 flex items-start gap-2.5">
                      <div className="relative flex-shrink-0">
                        <img src={ytActiveInfo.thumbnail} alt="" className="w-16 h-9 rounded object-cover" />
                        {/* animated equalizer badge */}
                        <span className="absolute -bottom-1 -right-1 bg-red-500 rounded-full w-4 h-4 flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-0.5">Đang phát</p>
                        <p className="text-xs font-medium text-gray-900 dark:text-white line-clamp-2 leading-tight">{decodeHtml(ytActiveInfo.title)}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{ytActiveInfo.channel}</p>
                      </div>
                    </div>
                  )}

                  {/* Watch history */}
                  {ytHistory.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Đã xem gần đây</span>
                        </div>
                        <button onClick={clearYtHistory} className="text-[10px] text-gray-400 hover:text-red-400 transition-colors">Xóa lịch sử</button>
                      </div>
                      <ul>
                        {ytHistory.map((v) => (
                          <li
                            key={v.id}
                            onClick={() => playYtVideo(v)}
                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors group ${
                              ytActiveId === v.id ? 'bg-red-50 dark:bg-red-900/20' : ''
                            }`}
                          >
                            <div className="relative flex-shrink-0">
                              <img src={v.thumbnail} alt="" className="w-20 h-[45px] rounded object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="w-6 h-6 bg-black/60 rounded-full flex items-center justify-center">
                                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                </div>
                              </div>
                              {ytActiveId === v.id && (
                                <span className="absolute bottom-0.5 right-0.5 bg-red-500 rounded-full w-3 h-3 flex items-center justify-center">
                                  <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-xs font-medium line-clamp-2 leading-tight ${ytActiveId === v.id ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{decodeHtml(v.title)}</p>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{v.channel}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : !ytActiveId ? (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center flex-1">
                      <svg className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M21.543 6.498C22 8.28 22 12 22 12s0 3.72-.457 5.502c-.254.985-.997 1.76-1.938 2.022C17.896 20 12 20 12 20s-5.893 0-7.605-.476c-.945-.266-1.687-1.04-1.938-2.022C2 15.72 2 12 2 12s0-3.72.457-5.502c.254-.985.997-1.76 1.938-2.022C6.107 4 12 4 12 4s5.896 0 7.605.476c.945.266 1.687 1.04 1.938 2.022zM10 15.5l6-3.5-6-3.5v7z" />
                      </svg>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Nhập từ khoá để tìm video</p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Music panel (always mounted for continuous playback) ── */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0 ${
            showMusic ? 'w-80 opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-80 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl border border-gray-200/60 dark:border-slate-700/60 shadow-xl shadow-black/10 flex flex-col max-h-[calc(100vh-100px)]">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-slate-700/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">Surf Music</span>
              </div>
              <button
                onClick={() => setShowMusic(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide p-3 flex flex-col gap-4">
              {/* Music player */}
              <section className="flex-shrink-0">
                <SurfMusicPlayer />
              </section>

              {/* History / Favorites */}
              <section className="flex-shrink-0">
                <div className="flex gap-1 mb-2">
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors ${
                      activeTab === 'history'
                        ? 'bg-cyan-500 text-white'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    Lịch sử
                  </button>
                  <button
                    onClick={() => setActiveTab('favorites')}
                    className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors ${
                      activeTab === 'favorites'
                        ? 'bg-cyan-500 text-white'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    Yêu thích
                  </button>
                </div>

                {tracks.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
                    {activeTab === 'history' ? 'Chưa có lịch sử nghe.' : 'Chưa có bài yêu thích.'}
                  </p>
                ) : (
                  <ul className="space-y-0.5 max-h-48 overflow-y-auto scrollbar-hide">
                    {tracks.map((track) => (
                      <li
                        key={track.id}
                        className="flex flex-col rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 group"
                      >
                        <div
                          className="flex items-center gap-2 px-1.5 py-1 cursor-pointer"
                          onClick={() => musicStore.requestPlay(track)}
                        >
                          <img src={track.thumbnail} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200 truncate leading-tight">
                              {decodeHtml(track.title)}
                            </p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{track.artist}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); musicStore.toggleFavorite(track); }}
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 transition-opacity"
                            title={musicStore.isFavorite(track.id) ? 'Bỏ yêu thích' : 'Yêu thích'}
                          >
                            <HeartIcon
                              filled={musicStore.isFavorite(track.id)}
                              className={`w-3.5 h-3.5 ${musicStore.isFavorite(track.id) ? 'text-red-500' : 'text-gray-400'}`}
                            />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setAddToPlaylistFor(addToPlaylistFor === track.id ? null : track.id); }}
                            className={`flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 transition-opacity ${addToPlaylistFor === track.id ? 'text-cyan-500' : 'text-gray-400 hover:text-cyan-500'}`}
                            title="Thêm vào playlist"
                          >
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z" />
                            </svg>
                          </button>
                        </div>
                        {addToPlaylistFor === track.id && (
                          <div className="px-2 pb-1" onClick={(e) => e.stopPropagation()}>
                            {playlists.length === 0 ? (
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 px-1 py-0.5">Chưa có playlist</p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {playlists.map((pl) => (
                                  <button
                                    key={pl.id}
                                    onClick={() => { musicStore.addToPlaylist(pl.id, track); setAddToPlaylistFor(null); }}
                                    className="px-2 py-0.5 text-[11px] bg-gray-200 dark:bg-gray-600 hover:bg-cyan-500 hover:text-white rounded-full text-gray-700 dark:text-gray-300 transition-colors truncate max-w-[120px]"
                                  >
                                    {pl.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {activeTab === 'history' && history.length > 0 && (
                  <button
                    onClick={() => musicStore.clearHistory()}
                    className="mt-1.5 text-[10px] text-gray-400 hover:text-red-400 transition-colors"
                  >
                    Xóa lịch sử
                  </button>
                )}
              </section>

              {/* Playlists */}
              <section className="flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Playlist
                  </h3>
                  <button
                    onClick={() => setIsCreatingPlaylist(true)}
                    className="text-cyan-500 hover:text-cyan-400 p-0.5 rounded transition-colors"
                    title="Tạo playlist mới"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                    </svg>
                  </button>
                </div>

                {isCreatingPlaylist && (
                  <div className="flex gap-1 mb-2">
                    <input
                      autoFocus
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newPlaylistName.trim()) {
                          musicStore.createPlaylist(newPlaylistName);
                          setNewPlaylistName('');
                          setIsCreatingPlaylist(false);
                        } else if (e.key === 'Escape') {
                          setIsCreatingPlaylist(false);
                          setNewPlaylistName('');
                        }
                      }}
                      placeholder="Tên playlist..."
                      className="flex-1 text-xs bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                    <button
                      onClick={() => {
                        if (newPlaylistName.trim()) {
                          musicStore.createPlaylist(newPlaylistName);
                          setNewPlaylistName('');
                          setIsCreatingPlaylist(false);
                        }
                      }}
                      className="px-2 py-1 text-xs bg-cyan-500 text-white rounded-lg hover:bg-cyan-400"
                    >
                      OK
                    </button>
                  </div>
                )}

                {playlists.length === 0 && !isCreatingPlaylist ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 py-1">Chưa có playlist nào.</p>
                ) : (
                  <ul className="space-y-1">
                    {playlists.map((pl) => (
                      <li key={pl.id}>
                        <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 group">
                          <button
                            onClick={() => setExpandedPlaylist(expandedPlaylist === pl.id ? null : pl.id)}
                            className="flex-1 flex items-center gap-1.5 min-w-0"
                          >
                            <svg className="w-3.5 h-3.5 flex-shrink-0 text-cyan-500" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18A2.99 2.99 0 0016 14c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                            </svg>
                            {renamingId === pl.id ? (
                              <input
                                autoFocus
                                value={renameValue}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (renameValue.trim()) musicStore.renamePlaylist(pl.id, renameValue);
                                    setRenamingId(null);
                                  } else if (e.key === 'Escape') {
                                    setRenamingId(null);
                                  }
                                  e.stopPropagation();
                                }}
                                onBlur={() => {
                                  if (renameValue.trim()) musicStore.renamePlaylist(pl.id, renameValue);
                                  setRenamingId(null);
                                }}
                                className="flex-1 min-w-0 text-xs bg-transparent border-b border-cyan-500 outline-none text-gray-900 dark:text-white"
                              />
                            ) : (
                              <span className="flex-1 min-w-0 text-xs font-medium text-gray-700 dark:text-gray-300 truncate text-left">
                                {pl.name}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{pl.tracks.length}</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (pl.tracks.length > 0) musicStore.requestPlayPlaylist(pl.tracks);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-cyan-500 transition-opacity disabled:opacity-20"
                            title="Phát playlist"
                            disabled={pl.tracks.length === 0}
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setRenamingId(pl.id); setRenameValue(pl.name); }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-opacity"
                            title="Đổi tên"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              musicStore.deletePlaylist(pl.id);
                              if (expandedPlaylist === pl.id) setExpandedPlaylist(null);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-opacity"
                            title="Xóa playlist"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>

                        {expandedPlaylist === pl.id && (
                          <div className="ml-3 mt-0.5">
                            {pl.tracks.length === 0 ? (
                              <p className="text-[10px] text-gray-400 px-1.5 py-1">
                                Playlist trống. Thêm bài từ kết quả tìm kiếm.
                              </p>
                            ) : (
                              <ul className="space-y-0.5">
                                {pl.tracks.map((track) => (
                                  <li
                                    key={track.id}
                                    className="flex items-center gap-2 px-1.5 py-1 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/60 group"
                                    onClick={() => musicStore.requestPlay(track)}
                                  >
                                    <img src={track.thumbnail} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                                    <p className="min-w-0 flex-1 text-[11px] text-gray-700 dark:text-gray-300 truncate">
                                      {decodeHtml(track.title)}
                                    </p>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); musicStore.removeFromPlaylist(pl.id, track.id); }}
                                      className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-opacity flex-shrink-0"
                                      title="Xóa khỏi playlist"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>

        {/* ── Slide-in search panel ── */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            showSearch ? 'w-64 opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-64 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl border border-gray-200/60 dark:border-slate-700/60 shadow-xl shadow-black/10 overflow-hidden">
            {/* Header */}
            <div className="px-3 pt-3 pb-2 border-b border-gray-100 dark:border-slate-700/50">
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-slate-700/60 rounded-xl px-3 py-2">
                <svg
                  className="w-4 h-4 text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="2.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
                  />
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm bạn bè hoặc nhóm..."
                  className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none min-w-0"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Results */}
            <div className="max-h-72 overflow-y-auto scrollbar-hide py-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4 px-3">
                  {query ? 'Không tìm thấy kết quả' : 'Chưa có bạn bè'}
                </p>
              ) : (
                filtered.map((friend) => (
                  <button
                    key={friend.id}
                    onClick={() => {
                      navigate(`/feed/profile/${friend.id}`);
                      setShowSearch(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                  >
                    <span className="relative flex-shrink-0 w-9 h-9 rounded-full overflow-visible">
                      <span className="w-9 h-9 rounded-full overflow-hidden block">
                        {friend.avatarUrl ? (
                          <img
                            src={friend.avatarUrl}
                            alt={friend.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-xs font-bold">
                            {getInitials(friend.name)}
                          </span>
                        )}
                      </span>
                      <PresenceBadge uid={friend.id} size="sm" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {friend.name}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Icon bar ── */}
        <div
          style={{ width: sidebarExpanded ? '13rem' : '68px' }}
          className="flex flex-col gap-2 py-3 px-2 rounded-2xl bg-white/85 dark:bg-slate-800/85 backdrop-blur-md border border-gray-200/60 dark:border-slate-700/60 shadow-xl shadow-black/10 h-[calc(100vh-88px)] overflow-y-hidden hover:overflow-y-auto transition-[width] duration-300 ease-in-out scrollbar-hide"
        >

          {/* Toggle expand button */}
          <button
            onClick={() => setSidebarExpanded((v) => !v)}
            title={sidebarExpanded ? 'Thu gọn' : 'Mở rộng'}
            className="flex items-center w-full px-1 py-1 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors flex-shrink-0 group"
          >
            <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 group-hover:bg-gray-200 dark:group-hover:bg-slate-600 transition-colors">
              <svg
                className={`w-4 h-4 transition-transform duration-300 ${sidebarExpanded ? 'rotate-0' : 'rotate-180'}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
            <span className={`text-sm font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden transition-all duration-300 ${sidebarExpanded ? 'max-w-[120px] opacity-100 ml-2.5' : 'max-w-0 opacity-0'}`}>
              Thu gọn
            </span>
          </button>

          {/* 0. YouTube — toggles youtube panel */}
          <button
            onClick={() => { setShowYoutube((v) => !v); setShowMusic(false); setShowSearch(false); }}
            title="YouTube"
            className={`flex items-center gap-2.5 w-full px-1 py-1 rounded-xl transition-colors duration-150 flex-shrink-0 ${showYoutube ? 'bg-red-50 dark:bg-red-900/20' : 'hover:bg-gray-100 dark:hover:bg-slate-700/50'}`}
          >
            <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-red-500 to-red-600 shadow-sm shadow-red-500/30">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21.543 6.498C22 8.28 22 12 22 12s0 3.72-.457 5.502c-.254.985-.997 1.76-1.938 2.022C17.896 20 12 20 12 20s-5.893 0-7.605-.476c-.945-.266-1.687-1.04-1.938-2.022C2 15.72 2 12 2 12s0-3.72.457-5.502c.254-.985.997-1.76 1.938-2.022C6.107 4 12 4 12 4s5.896 0 7.605.476c.945.266 1.687 1.04 1.938 2.022zM10 15.5l6-3.5-6-3.5v7z" />
              </svg>
            </span>
            <span className={`text-sm font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap overflow-hidden transition-all duration-300 ${sidebarExpanded ? 'max-w-[120px] opacity-100' : 'max-w-0 opacity-0'}`}>
              YouTube
            </span>
          </button>

          {/* 1. Music — toggles music panel */}
          <button
            onClick={() => { setShowMusic((v) => !v); setShowSearch(false); setShowYoutube(false); }}
            title="Surf Music"
            className={`flex items-center gap-2.5 w-full px-1 py-1 rounded-xl transition-colors duration-150 flex-shrink-0 ${showMusic ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-gray-100 dark:hover:bg-slate-700/50'}`}
          >
            <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-sm shadow-emerald-500/30">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
              </svg>
            </span>
            <span className={`text-sm font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap overflow-hidden transition-all duration-300 ${sidebarExpanded ? 'max-w-[120px] opacity-100' : 'max-w-0 opacity-0'}`}>
              Surf Music
            </span>
          </button>

          {/* Message */}
          <button
            onClick={() => { setShowChat((v) => !v); setShowMusic(false); setShowSearch(false); setShowYoutube(false); }}
            title="Tin nhắn"
            className={`flex items-center gap-2.5 w-full px-1 py-1 rounded-xl transition-colors duration-150 flex-shrink-0 ${showChat ? 'bg-cyan-50 dark:bg-cyan-900/20' : 'hover:bg-gray-100 dark:hover:bg-slate-700/50'}`}
          >
            <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-cyan-400 to-blue-500 shadow-sm shadow-cyan-500/30">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
              </svg>
            </span>
            <span className={`text-sm font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap overflow-hidden transition-all duration-300 ${sidebarExpanded ? 'max-w-[120px] opacity-100' : 'max-w-0 opacity-0'}`}>
              Tin nhắn
            </span>
          </button>

          {/* Search — toggles panel */}
          <button
            onClick={() => { setShowSearch((v) => !v); setShowMusic(false); setShowYoutube(false); }}
            title="Tìm kiếm"
            className={`flex items-center gap-2.5 w-full px-1 py-1 rounded-xl transition-colors duration-150 flex-shrink-0 ${showSearch ? 'bg-purple-50 dark:bg-purple-900/20' : 'hover:bg-gray-100 dark:hover:bg-slate-700/50'}`}
          >
            <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-purple-400 to-pink-500 shadow-sm shadow-purple-500/30">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
            </span>
            <span className={`text-sm font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap overflow-hidden transition-all duration-300 ${sidebarExpanded ? 'max-w-[120px] opacity-100' : 'max-w-0 opacity-0'}`}>
              Tìm kiếm
            </span>
          </button>

          {/* Divider */}
          <div className="mx-1 h-px bg-gray-200 dark:bg-slate-600 flex-shrink-0" />

          {/* Online friends */}
          {friends.length === 0 && (
            <div className="flex items-center gap-2.5 px-1 py-1 opacity-40 flex-shrink-0">
              <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-slate-700">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
            </div>
          )}

          {sortedFriends.map((friend) => (
            <button
              key={friend.id}
              onClick={() => {
                setOpenChats((prev) => prev.includes(friend.id) ? prev : [...prev, friend.id].slice(-3));
                setShowMusic(false); setShowSearch(false); setShowYoutube(false);
                setUnreadByFriend((prev) => { const next = { ...prev }; delete next[friend.id]; return next; });
              }}
              title={friend.name}
              className="relative flex items-center gap-2.5 w-full px-1 py-1 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors duration-150 flex-shrink-0 group"
            >
              <span className="relative flex-shrink-0">
                <span className="w-9 h-9 rounded-full overflow-hidden block ring-2 ring-white dark:ring-slate-800 shadow-sm">
                  {friend.avatarUrl ? (
                    <img src={friend.avatarUrl} alt={friend.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-sm font-bold">
                      {getInitials(friend.name)}
                    </span>
                  )}
                </span>
                <PresenceBadge uid={friend.id} />
                {(unreadByFriend[friend.id] ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none border border-white dark:border-slate-800 shadow">
                    {unreadByFriend[friend.id] > 99 ? '99+' : unreadByFriend[friend.id]}
                  </span>
                )}
              </span>
              <span className={`text-sm font-medium text-gray-800 dark:text-gray-200 truncate overflow-hidden transition-all duration-300 ${sidebarExpanded ? 'max-w-[120px] opacity-100' : 'max-w-0 opacity-0'}`}>
                {friend.name}
              </span>
              {!sidebarExpanded && (
                <span className="absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap bg-gray-900/90 text-white text-xs px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                  {friend.name}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>

    {/* ── Bottom-right compact chat panels (up to 3) ── */}
    {openChats.length > 0 && (
      <div className="hidden lg:flex fixed bottom-4 right-[86px] z-40 items-end gap-2">
        {openChats.map((peerId) => (
          <MiniChatPanel
            key={peerId}
            compact
            initialPeerId={peerId}
            onClose={() => setOpenChats((prev) => prev.filter((id) => id !== peerId))}
          />
        ))}
      </div>
    )}
    </>
  );
}
