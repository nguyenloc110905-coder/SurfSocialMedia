type Props = { onBack: () => void };

const ITEMS = ['Trung tâm trợ giúp', 'Gửi phản hồi', 'Điều khoản'] as const;

export default function HelpSupport({ onBack }: Props) {
  return (
    <div className="p-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-3 transition-colors"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
        <span className="font-medium">Trợ giúp và hỗ trợ</span>
      </button>
      <ul className="space-y-0.5">
        {ITEMS.map((item) => (
          <li key={item}>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors text-left"
            >
              <span className="text-sm">{item}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
