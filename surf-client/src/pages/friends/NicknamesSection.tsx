import { Link } from 'react-router-dom';
import { useFriends } from './FriendsContext';
import { Avatar, EmptyState, Spinner } from './ui';

export default function NicknamesSection() {
  const {
    friends, nicknames, nicknameEdit, setNicknameEdit,
    nickSearchQ, setNickSearchQ, nickSaving,
    handleSaveNickname, handleDeleteNickname, resolve,
  } = useFriends();

  return (
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
  );
}
