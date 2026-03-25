import { useEffect, useState } from 'react';
import SurfMusicPlayer from './SurfMusicPlayer';
import { musicStore, type TrackItem, type Playlist } from '../../lib/musicStore';

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

function AddToPlaylistMenu({
  trackId,
  playlists,
  onAdd,
}: {
  trackId: string;
  playlists: Playlist[];
  onAdd: (playlistId: string) => void;
}) {
  return (
    <div className="absolute right-0 top-full z-50 mt-0.5 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
      {playlists.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 px-3 py-2">Chưa có playlist</p>
      ) : (
        playlists.map((pl) => (
          <button
            key={pl.id}
            onClick={() => onAdd(pl.id)}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 truncate"
          >
            {pl.name}
          </button>
        ))
      )}
    </div>
  );
}

export type { TrackItem };

/** Cột phải: Music player + Lịch sử/Yêu thích + Playlist. */
export default function MainRightSidebar() {
  const [, rerender] = useState(0);
  const [activeTab, setActiveTab] = useState<'history' | 'favorites'>('history');
  const [expandedPlaylist, setExpandedPlaylist] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [addToPlaylistFor, setAddToPlaylistFor] = useState<string | null>(null);

  useEffect(() => musicStore.subscribe(() => rerender((t) => t + 1)), []);

  // Close playlist menu on outside click
  useEffect(() => {
    if (!addToPlaylistFor) return;
    const handler = () => setAddToPlaylistFor(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [addToPlaylistFor]);

  const history = musicStore.getHistory();
  const favorites = musicStore.getFavorites();
  const playlists = musicStore.getPlaylists();
  const tracks = activeTab === 'history' ? history : favorites;

  return (
    <aside className="hidden lg:flex flex-col min-w-0 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide p-3 gap-4">
      {/* 1. Music player */}
      <section className="flex-shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Surf Music
        </h3>
        <SurfMusicPlayer />
      </section>

      {/* 2. Lịch sử nghe / Yêu thích */}
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
                {/* Inline playlist picker — avoids overflow clipping */}
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

      {/* 3. Playlist */}
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
    </aside>
  );
}
