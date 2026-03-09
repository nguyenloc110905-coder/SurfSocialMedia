import { MOST_ACCESSED } from '@/lib/settings-data.tsx';

export default function QuickAccessSection() {
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
              className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-surf-card/80 border border-slate-200/80 dark:border-slate-700/80 hover:border-surf-primary/50 dark:hover:border-surf-primary/50 hover:shadow-md hover:shadow-surf-primary/5 text-left transition-all group"
            >
              <span className="w-11 h-11 rounded-xl bg-surf-primary/15 dark:bg-surf-primary/25 flex items-center justify-center flex-shrink-0 text-surf-primary dark:text-surf-secondary group-hover:scale-105 transition-transform">
                {item.icon === 'block' && <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>}
                {item.icon === 'list' && <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" /></svg>}
                {item.icon === 'moon' && <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" /></svg>}
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{item.label}</span>
                {item.desc && (
                  <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{item.desc}</span>
                )}
              </div>
              <svg className="w-4 h-4 text-slate-400 group-hover:text-surf-primary dark:group-hover:text-surf-secondary flex-shrink-0 transition-colors" viewBox="0 0 24 24" fill="currentColor">
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
