import { SETTINGS_DETAIL_SECTIONS, SettingsIcon } from '@/lib/settings-data.tsx';

interface SettingsSectionPageProps {
  sectionKey: string;
  activeItem: string | null;
}

export default function SettingsSectionPage({ sectionKey, activeItem }: SettingsSectionPageProps) {
  const section = SETTINGS_DETAIL_SECTIONS.find((s) => s.key === sectionKey);
  if (!section) return null;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
        {section.title}
      </h1>
      {section.subtitle && (
        <p className="text-slate-600 dark:text-slate-300 mb-8">{section.subtitle}</p>
      )}

      <div className="space-y-3">
        {section.items.map((item) => {
          const isActive = activeItem === item.key;
          return (
            <div
              key={item.key}
              className={`flex items-center gap-4 p-4 rounded-2xl transition-all border-l-4 ${
                isActive
                  ? 'border-l-surf-primary dark:border-l-surf-secondary bg-surf-primary/10 dark:bg-surf-secondary/15 shadow-md shadow-surf-primary/10 dark:shadow-surf-secondary/10'
                  : 'border-l-transparent bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-600/80 hover:border-surf-primary/40 dark:hover:border-surf-secondary/50 hover:shadow-lg hover:shadow-surf-primary/10'
              }`}
            >
              <span
                className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isActive
                    ? 'bg-surf-primary dark:bg-surf-secondary [&_svg]:!text-white'
                    : 'bg-surf-primary/15 dark:bg-surf-primary/25 [&_svg]:!text-surf-primary dark:[&_svg]:!text-surf-secondary'
                } [&_svg]:w-5 [&_svg]:h-5`}
              >
                <SettingsIcon name={item.icon} />
              </span>
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {item.label}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Chưa có thay đổi nào
                </span>
              </div>
              <svg
                className="w-5 h-5 text-slate-300 dark:text-slate-500 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}
