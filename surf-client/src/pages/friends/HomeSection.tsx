import { Link } from 'react-router-dom';
import { useFriends } from './FriendsContext';
import { Avatar, EmptyState, Spinner, Card } from './ui';
import AddFriendBtn from './AddFriendBtn';

export default function HomeSection() {
  const { searchQuery, setSearchQuery, searchResults, searchLoading, isFriend, hasSent, resolve } = useFriends();

  return (
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
                    {s.mutualCount != null && s.mutualCount > 0
                      ? <p className="text-xs text-gray-400 dark:text-gray-500">{s.mutualCount} bạn chung</p>
                      : !isFriend(s.id) && <p className="text-xs text-gray-400 dark:text-gray-500">Không có bạn chung</p>
                    }
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
  );
}
