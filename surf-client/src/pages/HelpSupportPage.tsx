import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

type ContactStatus =
  | { type: 'idle'; message: '' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'account',
    question: 'Làm sao cập nhật thông tin tài khoản?',
    answer:
      'Vào Cài đặt, mở phần tài khoản hoặc quyền riêng tư, sau đó chỉnh thông tin hồ sơ, email, mật khẩu và tùy chọn bảo mật.',
  },
  {
    id: 'privacy',
    question: 'Ai có thể xem bài viết của tôi?',
    answer:
      'Mỗi bài viết có quyền riêng tư riêng. Bạn có thể chọn công khai, bạn bè, chỉ mình tôi hoặc cấu hình mặc định trong Cài đặt.',
  },
  {
    id: 'search',
    question: 'Tìm kiếm hoạt động như thế nào?',
    answer:
      'Thanh tìm kiếm lưu các truy vấn gần đây, hỗ trợ tìm người dùng và mở trang kết quả để lọc theo loại nội dung, thời gian và địa điểm.',
  },
  {
    id: 'report',
    question: 'Tôi nên báo cáo nội dung vi phạm ở đâu?',
    answer:
      'Mở menu của bài viết và chọn báo cáo. Đội ngũ Surf sẽ ghi nhận báo cáo và xử lý theo tiêu chuẩn cộng đồng.',
  },
  {
    id: 'messages',
    question: 'Vì sao tôi không gửi được tin nhắn?',
    answer:
      'Tin nhắn có thể bị chặn nếu cuộc trò chuyện không còn hợp lệ, một trong hai tài khoản đã chặn nhau hoặc kết nối mạng đang gián đoạn.',
  },
];

const CATEGORY_OPTIONS = [
  { value: 'account', label: 'Tài khoản' },
  { value: 'privacy', label: 'Quyền riêng tư' },
  { value: 'bug', label: 'Lỗi kỹ thuật' },
  { value: 'feedback', label: 'Góp ý' },
  { value: 'other', label: 'Khác' },
] as const;

type SupportCategory = (typeof CATEGORY_OPTIONS)[number]['value'];

export default function HelpSupportPage() {
  const [openFaqId, setOpenFaqId] = useState(FAQ_ITEMS[0]?.id ?? '');
  const [form, setForm] = useState<{
    category: SupportCategory;
    subject: string;
    message: string;
  }>({
    category: CATEGORY_OPTIONS[0].value,
    subject: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<ContactStatus>({ type: 'idle', message: '' });

  const canSubmit = form.subject.trim().length >= 3 && form.message.trim().length >= 10;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setStatus({ type: 'idle', message: '' });
    try {
      await api.post('/api/support/contact', {
        category: form.category,
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setForm((current) => ({ ...current, subject: '', message: '' }));
      setStatus({
        type: 'success',
        message: 'Yêu cầu hỗ trợ đã được gửi. Đội ngũ Surf sẽ phản hồi sớm.',
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Không thể gửi liên hệ lúc này.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full py-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-300">
          Trợ giúp
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-950 dark:text-gray-50">Help & Support</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
          Tìm câu trả lời nhanh hoặc gửi yêu cầu hỗ trợ trực tiếp cho đội ngũ Surf.
        </p>
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">FAQ</h2>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item) => {
            const isOpen = openFaqId === item.id;
            return (
              <div
                key={item.id}
                className="rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqId(isOpen ? '' : item.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {item.question}
                  </span>
                  <svg
                    className={`h-4 w-4 flex-shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3 text-sm leading-6 text-gray-600 dark:border-slate-800 dark:text-gray-400">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section
        id="contact-form"
        className="rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Liên hệ hỗ trợ</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Chủ đề</span>
            <select
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value as SupportCategory,
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100 dark:focus:ring-cyan-400/20"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tiêu đề</span>
            <input
              value={form.subject}
              onChange={(event) =>
                setForm((current) => ({ ...current, subject: event.target.value }))
              }
              placeholder="Tóm tắt vấn đề"
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-cyan-400/20"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nội dung</span>
            <textarea
              value={form.message}
              onChange={(event) =>
                setForm((current) => ({ ...current, message: event.target.value }))
              }
              placeholder="Mô tả chi tiết để đội ngũ hỗ trợ xử lý nhanh hơn"
              rows={6}
              className="mt-1 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-cyan-400/20"
            />
          </label>

          {status.message && (
            <p
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                status.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'
                  : 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-200'
              }`}
            >
              {status.message}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-surf-primary px-4 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Đang gửi...' : 'Gửi liên hệ'}
          </button>
        </form>
      </section>
    </div>
  );
}
