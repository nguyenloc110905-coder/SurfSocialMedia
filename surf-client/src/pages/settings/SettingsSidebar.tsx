import { SETTINGS_DETAIL_SECTIONS, SettingsIcon } from '@/lib/settings-data.tsx';
import SettingsSearch from './SettingsSearch';

interface SettingsSidebarProps {
  selectedDetail: string | null;
  onSelectDetail: (key: string | null) => void;
}

export default function SettingsSidebar({ selectedDetail, onSelectDetail }: SettingsSidebarProps) {
  return (
    <aside className="w-80 lg:w-96 flex-shrink-0 border-r border-slate-200/80 dark:border-slate-700/80 flex flex-col min-h-0 overflow-hidden border-l-4 border-l-surf-primary bg-white dark:bg-surf-card/50">
      <div className="flex-shrink-0 pt-5 pr-4 pb-4 pl-4 border-b border-slate-200/80 dark:border-slate-700/80">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
          Cài đặt
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Quản lý tài khoản và quyền riêng tư</p>
        <SettingsSearch onSelectDetail={onSelectDetail} />
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide py-3 px-2">
        {SETTINGS_DETAIL_SECTIONS.map((section) => (
          <div key={section.title} className="mb-6">
            <h2 className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-surf-primary dark:text-surf-secondary mb-1">
              {section.title}
            </h2>
            {section.subtitle && (
              <p className="px-3 text-xs text-slate-500 dark:text-slate-400 mb-2 line-clamp-2">{section.subtitle}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = selectedDetail === item.key;
                const onItemClick = () => onSelectDetail(item.key);
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={onItemClick}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group ${
                        isActive
                          ? 'bg-surf-primary/15 dark:bg-surf-primary/25 text-surf-primary dark:text-surf-secondary'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-surf-primary/10 dark:hover:bg-surf-primary/20'
                      }`}
                    >
                      <span className={`[&_svg]:!text-current opacity-90 group-hover:opacity-100 ${isActive ? 'text-surf-primary dark:text-surf-secondary' : 'text-surf-primary dark:text-surf-secondary'}`}>
                        <SettingsIcon name={item.icon} />
                      </span>
                      <span className="text-sm font-medium flex-1">{item.label}</span>
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-surf-primary dark:group-hover:text-surf-secondary flex-shrink-0 transition-colors" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
