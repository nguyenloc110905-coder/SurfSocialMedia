import { useState } from 'react';
import { useLangStore, type Lang } from '@/stores/langStore';
import { useT } from '@/lib/i18n';

const LANG_OPTIONS: { value: Lang; flag: string; label: string; sublabel: string }[] = [
  { value: 'vi', flag: '🇻🇳', label: 'Tiếng Việt', sublabel: 'Vietnamese' },
  { value: 'en', flag: '🇺🇸', label: 'English', sublabel: 'Tiếng Anh' },
];

export default function LanguagePanel() {
  const t = useT();
  const { lang, setLang } = useLangStore();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<Lang>(lang);

  function handleSave() {
    setLang(pending);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const isDirty = pending !== lang;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">
        {t('lang_panel_title')}
      </h1>
      <p className="text-slate-500 dark:text-slate-400 mb-8">{t('lang_panel_desc')}</p>

      <div className="space-y-3 mb-8">
        {LANG_OPTIONS.map((opt) => {
          const isSelected = pending === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPending(opt.value)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                isSelected
                  ? 'border-surf-primary dark:border-surf-secondary bg-surf-primary/8 dark:bg-surf-secondary/10 shadow-md shadow-surf-primary/10'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 hover:border-surf-primary/40 dark:hover:border-surf-secondary/40'
              }`}
            >
              <span className="text-3xl flex-shrink-0">{opt.flag}</span>
              <div className="flex-1 min-w-0">
                <p
                  className={`font-semibold text-sm ${isSelected ? 'text-surf-primary dark:text-surf-secondary' : 'text-slate-800 dark:text-slate-100'}`}
                >
                  {opt.label}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.sublabel}</p>
              </div>
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelected
                    ? 'border-surf-primary dark:border-surf-secondary bg-surf-primary dark:bg-surf-secondary'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                {isSelected && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty}
          className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            isDirty
              ? 'bg-surf-primary hover:bg-surf-primary/90 text-white shadow-md shadow-surf-primary/25'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
        >
          {t('save')}
        </button>

        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium animate-fade-in">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
            {t('lang_saved_toast')}
          </span>
        )}
      </div>
    </div>
  );
}
