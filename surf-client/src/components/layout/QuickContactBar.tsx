import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

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

export default function QuickContactBar() {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<{ friends: Friend[] }>('/api/friends')
      .then((data) => setFriends(data.friends ?? []))
      .catch(() => {});
  }, []);

  // Focus input when panel opens
  useEffect(() => {
    if (showSearch) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [showSearch]);

  const filtered = query.trim()
    ? friends.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    : friends;

  return (
    <div className="hidden lg:block fixed right-3 top-[72px] z-30">
      <div className="flex items-start gap-2">
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
                    <span className="relative flex-shrink-0 w-9 h-9 rounded-full overflow-hidden">
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
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {friend.name}
                      </p>
                      <p className="text-xs text-emerald-500">Đang hoạt động</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Icon bar ── */}
        <div className="flex flex-col items-center gap-3 py-3 px-2.5 rounded-2xl bg-white/85 dark:bg-slate-800/85 backdrop-blur-md border border-gray-200/60 dark:border-slate-700/60 shadow-xl shadow-black/10 max-h-[calc(100vh-100px)] overflow-y-hidden hover:overflow-y-auto transition-all duration-200 scrollbar-hide">
          {/* 1. Message */}
          <button
            onClick={() => navigate('/feed/waves')}
            title="Tin nhắn"
            className="relative w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-cyan-400 to-blue-500 shadow-md shadow-cyan-500/30 hover:scale-110 transition-transform duration-200 flex-shrink-0"
          >
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
            </svg>
          </button>

          {/* 2. Search — toggles panel */}
          <button
            onClick={() => setShowSearch((v) => !v)}
            title="Tìm kiếm"
            className={`relative w-12 h-12 rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-all duration-200 flex-shrink-0 ${
              showSearch
                ? 'bg-gradient-to-br from-pink-500 to-purple-600 shadow-purple-500/30 scale-110'
                : 'bg-gradient-to-br from-purple-400 to-pink-500 shadow-purple-500/30'
            }`}
          >
            <svg
              className="w-6 h-6 text-white"
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
          </button>

          {/* Divider */}
          <div className="w-7 h-px bg-gray-200 dark:bg-slate-600 flex-shrink-0" />

          {/* Online friends */}
          {friends.length === 0 && (
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 opacity-40">
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          )}

          {friends.map((friend) => (
            <button
              key={friend.id}
              onClick={() => navigate(`/feed/profile/${friend.id}`)}
              title={friend.name}
              className="relative w-12 h-12 rounded-full flex-shrink-0 hover:scale-110 transition-transform duration-200 group"
            >
              <span className="w-12 h-12 rounded-full overflow-hidden block ring-2 ring-white dark:ring-slate-800 shadow-sm">
                {friend.avatarUrl ? (
                  <img
                    src={friend.avatarUrl}
                    alt={friend.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-sm font-bold">
                    {getInitials(friend.name)}
                  </span>
                )}
              </span>
              <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800" />
              <span className="absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap bg-gray-900/90 text-white text-xs px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                {friend.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
