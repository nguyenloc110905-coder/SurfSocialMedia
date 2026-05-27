import { useEffect, useState } from 'react';

export default function NetworkStatusToast() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setShowBackOnline(true);
      setTimeout(() => setShowBackOnline(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBackOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showBackOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] pointer-events-none flex flex-col gap-2">
      {/* Offline Toast */}
      {!isOnline && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-900/95 dark:bg-black/95 backdrop-blur-md text-white shadow-2xl animate-in slide-in-from-bottom-2 fade-in">
          <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-100">Không có kết nối mạng</p>
            <p className="text-xs text-gray-400 mt-0.5">Surf có thể phản hồi chậm hơn bình thường.</p>
          </div>
        </div>
      )}
      
      {/* Back Online Toast */}
      {showBackOnline && isOnline && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-600/95 dark:bg-emerald-800/95 backdrop-blur-md text-white shadow-2xl animate-in slide-in-from-bottom-2 fade-in">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold">Đã khôi phục kết nối</p>
          </div>
        </div>
      )}
    </div>
  );
}
