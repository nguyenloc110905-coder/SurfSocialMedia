import { useEffect } from 'react';

export default function AdBanner() {
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
      <div className="w-full my-4 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 h-32">
        <span className="text-slate-500 dark:text-slate-400 font-bold text-sm">
          [Local Dev] Khung Google AdSense In-feed
        </span>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden my-4 flex justify-center bg-white dark:bg-gray-800 rounded-2xl">
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%' }}
        data-ad-format="fluid"
        data-ad-layout-key="-6q+e9+15-2u+4y"
        data-ad-client="ca-pub-7296491209846267"
        data-ad-slot="9727802464"
      ></ins>
    </div>
  );
}
