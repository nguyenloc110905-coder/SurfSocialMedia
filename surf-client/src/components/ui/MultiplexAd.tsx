import { useEffect } from 'react';

export default function MultiplexAd() {
  useEffect(() => {
    // Không chạy script AdSense ở Local để tránh lỗi
    if (import.meta.env.DEV) return;

    try {
      // Đẩy quảng cáo vào khung ins khi component được render
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (e) {
      // Hoàn toàn bỏ qua lỗi từ AdSense (để tránh rác console)
    }
  }, []);

  // Ở Local (npm run dev), hiển thị một khối giả (Placeholder) để dễ debug UI
  if (import.meta.env.DEV) {
    return (
      <div className="w-full mt-4 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 h-64">
        <span className="text-slate-500 dark:text-slate-400 font-bold text-sm text-center px-4">
          [Local Dev]<br/>Khung Google AdSense Multiplex
        </span>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden mt-4 bg-white dark:bg-gray-800 rounded-2xl">
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-format="autorelaxed"
        data-ad-client="ca-pub-7296491209846267"
        data-ad-slot="6085208998"
      ></ins>
    </div>
  );
}
