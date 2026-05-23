import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useNavigate, useLocation } from 'react-router-dom';

type DiscoverGroup = {
  id: string;
  name: string;
  coverImageUrl?: string;
  memberCount: number;
};

type TrendingHashtag = {
  tag: string;
  count: number;
};

const DEFAULT_COVER =
  'linear-gradient(135deg, rgba(14,165,233,0.95), rgba(16,185,129,0.9), rgba(250,204,21,0.85))';

export default function MainRightSidebar() {
  const [groups, setGroups] = useState<DiscoverGroup[]>([]);
  const [hashtags, setHashtags] = useState<TrendingHashtag[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingHashtags, setLoadingHashtags] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const isGroupPage = location.pathname.startsWith('/feed/groups');

  useEffect(() => {
    let isMounted = true;
    const fetchTrendingHashtags = async () => {
      try {
        const res = await api.get<{ hashtags: TrendingHashtag[] }>(
          '/api/hashtags/trending?limit=8&days=7'
        );
        if (isMounted) setHashtags(res.hashtags || []);
      } catch {
        if (isMounted) setHashtags([]);
      } finally {
        if (isMounted) setLoadingHashtags(false);
      }
    };

    void fetchTrendingHashtags();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isGroupPage) return;

    let isMounted = true;
    setLoadingGroups(true);
    const fetchGroups = async () => {
      try {
        const res = await api.get<{ items: DiscoverGroup[] }>('/api/groups/me?limit=10');
        if (isMounted) {
          setGroups(res.items || []);
        }
      } catch (e) {
        // ignore errors for sidebar
      } finally {
        if (isMounted) setLoadingGroups(false);
      }
    };
    void fetchGroups();
    return () => {
      isMounted = false;
    };
  }, [isGroupPage]);

  return (
    <aside className="hidden lg:block w-full max-w-[280px] p-4 flex-col gap-6 pt-6">
      <div className="sticky top-6 flex flex-col gap-6">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Hashtag thịnh hành
            </h3>
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              7 ngày
            </span>
          </div>

          {loadingHashtags ? (
            <div className="space-y-2">
              <div className="h-11 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-11 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-11 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            </div>
          ) : hashtags.length === 0 ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              Chưa có hashtag thịnh hành
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {hashtags.map((hashtag, index) => (
                <button
                  key={hashtag.tag}
                  onClick={() => navigate(`/feed/hashtag/${encodeURIComponent(hashtag.tag)}`)}
                  className="group flex items-center gap-3 rounded-xl p-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800/80"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-sm font-black text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
                    #{index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800 transition-colors group-hover:text-cyan-600 dark:text-slate-200 dark:group-hover:text-cyan-400">
                      #{hashtag.tag}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {hashtag.count.toLocaleString('vi-VN')} bài viết
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {isGroupPage && (
          <section>
            <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Nhóm của bạn
            </h3>

            {loadingGroups ? (
              <div className="space-y-3">
                <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <p className="text-sm text-slate-500 font-medium">Chưa tham gia nhóm nào</p>
                <button
                  onClick={() => navigate('/feed/groups')}
                  className="mt-3 text-xs bg-cyan-100 text-cyan-800 px-3 py-1.5 rounded-lg font-bold"
                >
                  Khám phá ngay
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => navigate('/feed/groups/' + group.id)}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition text-left group"
                  >
                    <div
                      className="w-10 h-10 rounded-lg bg-slate-200 flex-shrink-0 shadow-sm overflow-hidden"
                      style={
                        group.coverImageUrl
                          ? {
                              backgroundImage: 'url(' + group.coverImageUrl + ')',
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }
                          : { background: DEFAULT_COVER }
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                        {group.name}
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {group.memberCount} thành viên
                      </p>
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => navigate('/feed/groups')}
                  className="mt-2 text-xs text-center text-cyan-600 hover:text-cyan-700 font-bold p-2 hover:bg-cyan-50 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  Xem thêm
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
