import { SettingsIcon } from '@/lib/settings-data.tsx';
import { PRIVACY_CHECKUP_TOPICS } from './settings-constants';

interface PrivacyCheckupPanelProps {
  onBack: () => void;
}

export default function PrivacyCheckupPanel({ onBack }: PrivacyCheckupPanelProps) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
        Kiểm tra quyền riêng tư
      </h1>
      <p className="text-slate-600 dark:text-slate-300 mb-8">
        Chọn chủ đề để chúng tôi hướng dẫn bạn thiết lập phù hợp với tài khoản Surf.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {PRIVACY_CHECKUP_TOPICS.map((topic) => (
          <button
            key={topic.id}
            type="button"
            className="flex gap-4 p-5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-600/80 hover:border-surf-primary/40 dark:hover:border-surf-secondary/50 hover:shadow-lg hover:shadow-surf-primary/10 dark:hover:shadow-surf-secondary/10 text-left transition-all group border-l-4 border-l-surf-primary dark:border-l-surf-secondary"
          >
            <span className={`w-12 h-12 rounded-xl bg-gradient-to-br ${topic.accent} flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform [&_svg]:!text-white [&_svg]:w-6 [&_svg]:h-6 dark:opacity-95`}>
              <SettingsIcon name={topic.icon} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{topic.title}</span>
              {topic.hint && (
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{topic.hint}</span>
              )}
            </div>
            <svg className="w-5 h-5 text-slate-300 dark:text-slate-500 group-hover:text-surf-primary dark:group-hover:text-surf-secondary flex-shrink-0 self-center transition-colors" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </button>
        ))}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Xem thêm trong{' '}
        <button type="button" onClick={onBack} className="text-surf-primary dark:text-surf-secondary font-medium hover:underline">
          Cài đặt
        </button>
        .
      </p>
    </div>
  );
}
