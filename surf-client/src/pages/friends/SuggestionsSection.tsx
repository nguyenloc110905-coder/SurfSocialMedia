import { Link } from 'react-router-dom';
import { useFriends } from './FriendsContext';
import { Avatar, EmptyState } from './ui';
import AddFriendBtn from './AddFriendBtn';

export default function SuggestionsSection() {
  const { suggestions, resolve } = useFriends();

  if (suggestions.length === 0) {
    return (
      <EmptyState
        icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" /></svg>}
        title="Không có gợi ý"
        desc="Những người chưa kết bạn sẽ hiện ở đây."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {suggestions.map((s) => (
        <div key={s.id} className="bg-white dark:bg-gray-900/70 border border-gray-200/60 dark:border-gray-700/50 rounded-2xl p-4 flex flex-col items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-center">
          <Link to={`/feed/profile/${s.id}`}><Avatar url={s.avatarUrl} name={resolve(s.id, s.name)} size="lg" /></Link>
          <div className="min-w-0 w-full">
            <Link to={`/feed/profile/${s.id}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:text-surf-primary transition-colors truncate block">{resolve(s.id, s.name)}</Link>
            {s.mutualCount != null && s.mutualCount > 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{s.mutualCount} bạn chung</p>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Không có bạn chung</p>
            )}
          </div>
          <AddFriendBtn uid={s.id} name={resolve(s.id, s.name)} avatarUrl={s.avatarUrl} />
        </div>
      ))}
    </div>
  );
}
