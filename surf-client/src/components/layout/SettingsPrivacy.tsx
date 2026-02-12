import { SIDEBAR_ITEMS, SettingsIcon } from '@/lib/settings-data.tsx';

type Props = { onBack: () => void; onOpenSettingsPage?: () => void };

/** Panel nhỏ: chỉ 6 mục. Nhấp "Cài đặt" → mở trang cài đặt full. */
export default function SettingsPrivacy({ onBack, onOpenSettingsPage }: Props) {
  return (
    <div className="w-[320px] max-h-[70vh] overflow-hidden bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
          <span className="font-semibold text-gray-900 dark:text-gray-100">Cài đặt và quyền riêng tư</span>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-0.5 px-2">
          {SIDEBAR_ITEMS.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                onClick={() => item.label === 'Cài đặt' && onOpenSettingsPage?.()}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <SettingsIcon name={item.icon} />
                <span className="text-sm font-semibold flex-1">{item.label}</span>
                <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
