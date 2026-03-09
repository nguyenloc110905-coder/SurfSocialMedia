import { useState } from 'react';
import { DEFAULT_AUDIENCE_OPTIONS } from './settings-constants';
import type { DefaultAudience } from './settings-constants';

interface DefaultAudiencePanelProps {
  onShowReview: (audience: 'public' | 'friends') => void;
  onShowCustom: () => void;
}

export default function DefaultAudiencePanel({ onShowReview, onShowCustom }: DefaultAudiencePanelProps) {
  const [defaultAudience, setDefaultAudience] = useState<DefaultAudience>('custom');

  const handleContinue = () => {
    if (defaultAudience === 'public' || defaultAudience === 'friends') {
      onShowReview(defaultAudience);
    } else if (defaultAudience === 'custom') {
      onShowCustom();
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
        Đối tượng xem mặc định
      </h1>
      <p className="text-slate-600 dark:text-slate-300 mb-6">
        Surf sẽ dùng lựa chọn của bạn làm mặc định cho bài đăng, Tin 24h và Surf Clips. Bạn vẫn có thể đổi đối tượng cho từng nội dung khi đăng.
      </p>

      <div className="space-y-3 mb-6">
        {DEFAULT_AUDIENCE_OPTIONS.map((opt) => {
          const selected = defaultAudience === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDefaultAudience(opt.value)}
              className={`w-full flex items-start gap-4 p-4 rounded-2xl text-left transition-all border-2 ${
                selected
                  ? 'border-surf-primary dark:border-surf-secondary bg-surf-primary/10 dark:bg-surf-secondary/15 shadow-md shadow-surf-primary/10 dark:shadow-surf-secondary/10'
                  : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/90 hover:border-slate-300 dark:hover:border-slate-500'
              }`}
            >
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                selected ? 'bg-surf-primary dark:bg-surf-secondary text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              } [&_svg]:w-5 [&_svg]:h-5`}>
                {opt.icon === 'globe' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>}
                {opt.icon === 'people' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>}
                {opt.icon === 'gear' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.04.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>}
              </span>
              <div className="flex-1 min-w-0">
                <span className="block font-semibold text-slate-800 dark:text-slate-100">{opt.title}</span>
                <span className="block text-sm text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</span>
              </div>
              <span className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-1 ${
                selected ? 'border-surf-primary dark:border-surf-secondary bg-surf-primary dark:bg-surf-secondary' : 'border-slate-300 dark:border-slate-500'
              } ${selected ? 'ring-2 ring-surf-primary/30 dark:ring-surf-secondary/30 ring-offset-2 dark:ring-offset-surf-dark' : ''}`}>
                {selected && <span className="block w-full h-full rounded-full bg-white scale-50" />}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="text-sm text-surf-primary dark:text-surf-secondary hover:underline"
      >
        Bạn cần trợ giúp lựa chọn?
      </button>

      <div className="mt-8">
        <button
          type="button"
          onClick={handleContinue}
          className="w-full sm:w-auto px-8 py-3 rounded-xl font-semibold bg-surf-primary dark:bg-surf-secondary text-white hover:opacity-90 focus:ring-2 focus:ring-surf-primary/50 dark:focus:ring-surf-secondary/50 focus:ring-offset-2 dark:focus:ring-offset-surf-dark transition-opacity"
        >
          Tiếp
        </button>
      </div>
    </div>
  );
}
