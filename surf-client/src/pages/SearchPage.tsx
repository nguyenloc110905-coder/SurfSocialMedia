import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '@/lib/api';

type SearchUser = { id: string; name: string; avatarUrl?: string; mutualCount?: number };

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';

  const [users, setUsers] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!q.trim()) {
        setUsers([]);
        setDone(true);
        return;
      }
      setLoading(true);
      setDone(false);
      try {
        const res = await api.get<{ users: SearchUser[] }>(
          `/api/users/search?q=${encodeURIComponent(q.trim())}`
        );
        setUsers(res.users ?? []);
      } catch {
        setUsers([]);
      } finally {
        setLoading(false);
        setDone(true);
      }
    };
    run();
  }, [q]);

  return (
    <div className="py-4 px-2">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Kết quả cho <span className="text-surf-primary">"{q}"</span>
      </h2>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-surf-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* No results */}
      {done && !loading && users.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center gap-3">
          <svg
            className="w-16 h-16 text-gray-300 dark:text-gray-600"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <p className="font-medium text-gray-600 dark:text-gray-400">
            Không tìm thấy kết quả nào cho "{q}"
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">Thử tìm với từ khoá khác</p>
        </div>
      )}

      {/* Results */}
      {done && !loading && users.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{users.length} kết quả</p>
          {users.map((u) => (
            <Link
              key={u.id}
              to={`/feed/profile/${u.id}`}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {u.avatarUrl ? (
                <img
                  src={u.avatarUrl}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-lg font-bold">
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{u.name}</p>
                {(u.mutualCount ?? 0) > 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {u.mutualCount} bạn chung
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
