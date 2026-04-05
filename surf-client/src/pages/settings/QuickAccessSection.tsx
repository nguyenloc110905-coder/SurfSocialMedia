import { MOST_ACCESSED } from '@/lib/settings-constants';

interface QuickAccessSectionProps {
  onSelectDetail?: (key: string) => void;
}

export default function QuickAccessSection({ onSelectDetail }: QuickAccessSectionProps) {
  const handleQuickAccess = (label: string) => {
    if (!onSelectDetail) return;
    if (label === 'Danh sách chặn') onSelectDetail('block-list');
    if (label === 'Bảo mật tài khoản') onSelectDetail('account-security');
    if (label === 'Thông báo') onSelectDetail('notifications');
  };

  return (
    <>
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">
          Truy cập nhanh
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MOST_ACCESSED.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleQuickAccess(item.label)}
              className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-surf-card/80 border border-slate-200/80 dark:border-slate-700/80 hover:border-surf-primary/50 dark:hover:border-surf-primary/50 hover:shadow-md hover:shadow-surf-primary/5 text-left transition-all group"
            >
              <span className="w-11 h-11 rounded-xl bg-surf-primary/15 dark:bg-surf-primary/25 flex items-center justify-center flex-shrink-0 text-surf-primary dark:text-surf-secondary group-hover:scale-105 transition-transform">
                {item.icon === 'block' && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                )}
                {item.icon === 'shield' && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                  </svg>
                )}
                {item.icon === 'bell' && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                  </svg>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {item.label}
                </span>
                {item.desc && (
                  <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                    {item.desc}
                  </span>
                )}
              </div>
              <svg
                className="w-4 h-4 text-slate-400 group-hover:text-surf-primary dark:group-hover:text-surf-secondary flex-shrink-0 transition-colors"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
          Khác
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Duyệt các nhóm cài đặt ở cột bên trái hoặc dùng ô tìm kiếm phía trên.
        </p>
      </section>
    </>
  );
}
