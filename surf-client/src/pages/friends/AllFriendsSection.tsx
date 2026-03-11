import { Link } from 'react-router-dom';
import { useFriends } from './FriendsContext';
import { Avatar, EmptyState, Card } from './ui';

export default function AllFriendsSection() {
  const { friends, friendsSearchQ, setFriendsSearchQ, resolve } = useFriends();

  return (
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
                  {f.mutualCount != null && f.mutualCount > 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">{f.mutualCount} bạn chung</p>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">Không có bạn chung</p>
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
  );
}
