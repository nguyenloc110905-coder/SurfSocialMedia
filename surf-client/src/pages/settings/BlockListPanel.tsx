import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { optimizeImageUrl } from '@/lib/image-cdn';

interface BlockedUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
  email?: string | null;
}

export default function BlockListPanel() {
  const [items, setItems] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get<{ blocked: BlockedUser[] }>('/api/users/me/blocked');
        if (!cancelled) {
          setItems(res.blocked ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || 'Không tải được danh sách đã chặn.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((u) => {
      const byName = u.name.toLowerCase().includes(q);
      const byEmail = (u.email ?? '').toLowerCase().includes(q);
      return byName || byEmail;
    });
  }, [items, query]);

  const handleUnblock = async (targetUid: string) => {
    setActioningId(targetUid);
    setError(null);
    try {
      await api.delete(`/api/users/${targetUid}/block`);
      setItems((prev) => prev.filter((u) => u.id !== targetUid));
    } catch (e) {
      setError((e as Error).message || 'Không thể bỏ chặn người dùng.');
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Danh sách chặn</h1>
      <p className="text-slate-600 dark:text-slate-300 mb-6">
        Những người trong danh sách này không thể tương tác với bạn.
      </p>

      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm trong danh sách đã chặn..."
          className="w-full px-3 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-surf-primary/40"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-8 text-center">
          <div className="inline-block w-8 h-8 border-2 border-surf-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Đang tải danh sách chặn...</p>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {items.length === 0 ? 'Bạn chưa chặn ai.' : 'Không tìm thấy người dùng phù hợp.'}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3"
            >
              {u.avatarUrl ? (
                <img
                  src={optimizeImageUrl(u.avatarUrl)}
                  alt={u.name}
                  className="w-11 h-11 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-surf-primary/15 text-surf-primary flex items-center justify-center font-bold">
                  {u.name.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {u.name}
                </p>
                {u.email && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleUnblock(u.id)}
                disabled={actioningId === u.id}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-60"
              >
                {actioningId === u.id && (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                )}
                Bỏ chặn
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
