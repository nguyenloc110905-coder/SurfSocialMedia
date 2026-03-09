import { useEffect } from 'react';
import { REVIEW_ITEMS } from './settings-constants';

interface ReviewModalProps {
  audience: 'public' | 'friends';
  onConfirm: () => void;
  onClose: () => void;
}

export default function ReviewModal({ audience, onConfirm, onClose }: ReviewModalProps) {
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="review-modal-title">
      <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm" aria-hidden onClick={onClose} />
      <div className="relative flex flex-col w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 border-2 border-surf-primary/30 dark:border-surf-secondary/30 shadow-2xl shadow-surf-primary/10 dark:shadow-surf-secondary/10">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600 bg-gradient-to-r from-surf-primary/10 to-transparent dark:from-surf-secondary/15 rounded-t-2xl">
          <h2 id="review-modal-title" className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Xem lại lựa chọn
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-surf-primary dark:hover:text-surf-secondary transition-colors"
            aria-label="Đóng"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
          </button>
        </div>

        {/* Nội dung */}
        <div className="flex-shrink-0 px-4 py-4">
          <p className="text-sm text-slate-700 dark:text-slate-200 mb-4">
            Đối tượng mặc định: <strong className="text-slate-800 dark:text-slate-100">{audience === 'public' ? 'Công khai' : 'Bạn bè'}</strong>
          </p>
          <div className="space-y-2">
            {REVIEW_ITEMS.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 border-l-4 border-l-surf-primary dark:border-l-surf-secondary"
              >
                <span className="w-8 h-8 rounded-lg bg-surf-primary/20 dark:bg-surf-secondary/25 flex items-center justify-center flex-shrink-0 text-surf-primary dark:text-surf-secondary [&_svg]:w-4 [&_svg]:h-4">
                  {item.icon === 'person' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>}
                  {item.icon === 'comment' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" /></svg>}
                  {item.icon === 'globe' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>}
                  {item.icon === 'people' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>}
                  {item.icon === 'search' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>}
                </span>
                <div className="min-w-0 flex-1 flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-800 dark:text-slate-100">{item.title}</span>
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300 flex-shrink-0">{item.getValue(audience)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex flex-col sm:flex-row gap-3 p-4 border-t border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50 rounded-b-2xl">
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 order-2 sm:order-1 px-4 py-3 rounded-xl font-semibold bg-surf-primary dark:bg-surf-secondary text-white hover:opacity-90 transition-opacity"
          >
            Xác nhận
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 order-1 sm:order-2 px-4 py-3 rounded-xl font-semibold border-2 border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-200 hover:border-surf-primary dark:hover:border-surf-secondary hover:text-surf-primary dark:hover:text-surf-secondary transition-colors"
          >
            Chỉnh sửa phần cài đặt
          </button>
        </div>
      </div>
    </div>
  );
}
