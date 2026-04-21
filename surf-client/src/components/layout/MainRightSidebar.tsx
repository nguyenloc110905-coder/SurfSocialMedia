import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useNavigate, useLocation } from 'react-router-dom';

type DiscoverGroup = {
  id: string;
  name: string;
  coverImageUrl?: string;
  memberCount: number;
};

const DEFAULT_COVER =
  'linear-gradient(135deg, rgba(14,165,233,0.95), rgba(16,185,129,0.9), rgba(250,204,21,0.85))';

export default function MainRightSidebar() {
  const [groups, setGroups] = useState<DiscoverGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const isGroupPage = location.pathname.startsWith('/feed/groups');

  useEffect(() => {
    if (!isGroupPage) return;

    let isMounted = true;
    const fetchGroups = async () => {
      try {
        const res = await api.get<{ items: DiscoverGroup[] }>('/api/groups/me?limit=10');
        if (isMounted) {
          setGroups(res.items || []);
        }
      } catch (e) {
        // ignore errors for sidebar
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    void fetchGroups();
    return () => { isMounted = false; };
  }, [isGroupPage]);

  if (!isGroupPage) {
    return <aside className="hidden lg:block w-full max-w-[280px] p-4 flex-col gap-6 pt-6" />;
  }

  return (
    <aside className="hidden lg:block w-full max-w-[280px] p-4 flex-col gap-6 pt-6">
      <div className="flex flex-col gap-4 sticky top-6">
        <h3 className="font-bold text-slate-800 dark:text-slate-300 text-[15px] uppercase tracking-wider mb-2">Nhóm của bạn</h3>
        
        {loading ? (
          <div className="space-y-3">
             <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
             <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
            <p className="text-sm text-slate-500 font-medium">Chưa tham gia nhóm nào</p>
            <button onClick={() => navigate('/feed/groups')} className="mt-3 text-xs bg-cyan-100 text-cyan-800 px-3 py-1.5 rounded-lg font-bold">Khám phá ngay</button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {groups.map(group => (
              <button
                key={group.id}
                onClick={() => navigate('/feed/groups/' + group.id)}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition text-left group"
              >
                <div 
                   className="w-10 h-10 rounded-lg bg-slate-200 flex-shrink-0 shadow-sm overflow-hidden"
                   style={group.coverImageUrl ? { backgroundImage: 'url(' + group.coverImageUrl + ')', backgroundSize: 'cover', backgroundPosition: 'center' } : { background: DEFAULT_COVER }}
                />
                <div className="flex-1 min-w-0">
                   <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">{group.name}</p>
                   <p className="text-[11px] text-slate-500 font-medium">{group.memberCount} thành viên</p>
                </div>
              </button>
            ))}
            <button onClick={() => navigate('/feed/groups')} className="mt-2 text-xs text-center text-cyan-600 hover:text-cyan-700 font-bold p-2 hover:bg-cyan-50 dark:hover:bg-slate-800 rounded-xl transition">
              Xem thêm →
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
