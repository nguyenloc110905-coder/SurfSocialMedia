import { useState, useEffect } from 'react';
import {
  CUSTOM_SETTINGS_ITEMS,
  CUSTOM_SETTING_LABELS,
  CUSTOM_SETTING_OPTIONS,
} from './settings-constants';
import type { CustomSettingValue } from './settings-constants';

interface CustomSettingsModalProps {
  onDone: () => void;
  onClose: () => void;
}

export default function CustomSettingsModal({ onDone, onClose }: CustomSettingsModalProps) {
  const [customSettingsValues, setCustomSettingsValues] = useState<Record<string, CustomSettingValue>>(() =>
    Object.fromEntries(CUSTOM_SETTINGS_ITEMS.map(({ key }) => [key, key === 'follow_list' ? 'only_me' : 'public']))
  );
  const [editingSettingKey, setEditingSettingKey] = useState<string | null>(null);
  const [searchEngineLink, setSearchEngineLink] = useState(true);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingSettingKey) setEditingSettingKey(null);
        else onClose();
      }
    };
    document.addEventListener('keydown', onEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = '';
    };
  }, [editingSettingKey, onClose]);

  return (
    <>
      {/* Modal Cài đặt tùy chỉnh */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="custom-modal-title">
        <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm" aria-hidden onClick={() => !editingSettingKey && onClose()} />
        <div className="relative flex flex-col w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 border-2 border-surf-primary/30 dark:border-surf-secondary/30 shadow-2xl">
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600 rounded-t-2xl bg-gradient-to-r from-surf-primary/10 to-transparent dark:from-surf-secondary/15">
            <h2 id="custom-modal-title" className="text-lg font-bold text-slate-800 dark:text-slate-100">Cài đặt tùy chỉnh</h2>
            <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:text-surf-primary dark:hover:text-surf-secondary transition-colors" aria-label="Đóng">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
            </button>
          </div>
          <div className="flex-shrink-0 px-4 py-4 space-y-1">
            {CUSTOM_SETTINGS_ITEMS.map(({ key, title }) => (
              <button
                key={key}
                type="button"
                onClick={() => setEditingSettingKey(key)}
                className="w-full flex items-center justify-between gap-3 py-3 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left border-l-4 border-l-surf-primary dark:border-l-surf-secondary"
              >
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100 flex-1">{title}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400 flex-shrink-0">{CUSTOM_SETTING_LABELS[customSettingsValues[key] ?? 'public']}</span>
                <svg className="w-4 h-4 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
              </button>
            ))}
            <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-600">
              <p className="text-sm text-slate-700 dark:text-slate-200 mb-2">Cho phép công cụ tìm kiếm liên kết đến trang cá nhân Surf?</p>
              <button
                type="button"
                role="switch"
                aria-checked={searchEngineLink}
                onClick={() => setSearchEngineLink((v) => !v)}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:ring-2 focus:ring-surf-primary/50 ${searchEngineLink ? 'bg-surf-primary dark:bg-surf-secondary' : 'bg-slate-200 dark:bg-slate-600'}`}
              >
                <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition ${searchEngineLink ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
              <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">{searchEngineLink ? 'Bật' : 'Tắt'}</span>
            </div>
          </div>
          <div className="flex-shrink-0 p-4 border-t border-slate-200 dark:border-slate-600 rounded-b-2xl bg-slate-50/50 dark:bg-slate-800/50">
            <button
              type="button"
              onClick={onDone}
              className="w-full py-3 rounded-xl font-semibold bg-surf-primary dark:bg-surf-secondary text-white hover:opacity-90 transition-opacity"
            >
              Xong
            </button>
          </div>
        </div>
      </div>

      {/* Picker chọn đối tượng */}
      {editingSettingKey && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" aria-hidden onClick={() => setEditingSettingKey(null)} />
          <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-800 border-2 border-surf-primary/30 dark:border-surf-secondary/30 shadow-2xl p-4 pb-6">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3">Chọn đối tượng</p>
            <div className="space-y-1">
              {CUSTOM_SETTING_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setCustomSettingsValues((prev) => ({ ...prev, [editingSettingKey]: value }));
                    setEditingSettingKey(null);
                  }}
                  className="w-full flex items-center justify-between py-3 px-4 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 text-left"
                >
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{CUSTOM_SETTING_LABELS[value]}</span>
                  {(customSettingsValues[editingSettingKey] ?? 'public') === value && (
                    <svg className="w-5 h-5 text-surf-primary dark:text-surf-secondary" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
