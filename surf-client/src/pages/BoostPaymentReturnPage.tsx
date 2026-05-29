import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const PAYMENT_RESULT_CHANNEL = 'surf-boost-sandbox-payment';
const PAYMENT_RESULT_TYPE = 'surf-boost-sandbox-payment';

export default function BoostPaymentReturnPage() {
  const [searchParams] = useSearchParams();
  const paymentId = searchParams.get('paymentId') || '';
  const provider = searchParams.get('provider') || '';
  const orderId = searchParams.get('orderId') || '';
  const status = searchParams.get('status') || 'failed';
  const isSuccess = status === 'success';

  useEffect(() => {
    document.title = 'Kết quả thanh toán Surf Boost';
    const payload = {
      type: PAYMENT_RESULT_TYPE,
      status: isSuccess ? 'success' : 'failed',
      paymentId,
      provider,
      orderId,
      completedAt: Date.now(),
    };

    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(PAYMENT_RESULT_CHANNEL);
      channel.postMessage(payload);
      channel.close();
    }

    window.opener?.postMessage(payload, window.location.origin);
    window.localStorage.setItem(PAYMENT_RESULT_CHANNEL, JSON.stringify(payload));
  }, [isSuccess, orderId, paymentId, provider]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#18191a] p-6 text-center shadow-2xl">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl font-black ${isSuccess ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
          {isSuccess ? '✓' : '×'}
        </div>
        <h1 className="mt-5 text-xl font-black">
          {isSuccess ? 'Gateway đã xác nhận thanh toán' : 'Thanh toán sandbox chưa thành công'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Kết quả từ {provider.toUpperCase() || 'gateway'} đã được gửi về Surf Market. Mã đơn hàng: {orderId || paymentId}.
        </p>
        <button
          type="button"
          onClick={() => window.close()}
          className="mt-6 rounded-lg bg-[#2d88ff] px-5 py-2.5 text-sm font-black text-white hover:bg-[#1877f2]"
        >
          Đóng tab
        </button>
      </section>
    </main>
  );
}
