import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
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

type SupportTicketStatus = 'new' | 'open' | 'pending' | 'resolved' | 'closed';

type SupportReply = {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: 'user' | 'support';
  message: string;
  createdAt: string | null;
};

type SupportTicket = {
  id: string;
  category: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
  replies: SupportReply[];
};

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'account',
    question: 'Tôi không đăng nhập được hoặc nghi tài khoản bị truy cập lạ thì làm gì?',
    answer:
      'Đổi mật khẩu ngay trong Cài đặt, kiểm tra email/số điện thoại khôi phục và gửi ticket loại Tài khoản để đội ngũ Surf kiểm tra lịch sử bảo mật.',
  },
  {
    id: 'privacy',
    question: 'Ai có thể xem bài viết, hồ sơ và hoạt động của tôi?',
    answer:
      'Mỗi bài viết có quyền riêng tư riêng. Bạn có thể chọn công khai, bạn bè, chỉ mình tôi hoặc cấu hình mặc định trong Cài đặt.',
  },
  {
    id: 'report',
    question: 'Tôi nên báo cáo nội dung hoặc tài khoản vi phạm ở đâu?',
    answer:
      'Mở menu của bài viết, tin nhắn, hồ sơ hoặc nhóm rồi chọn báo cáo. Nếu cần mô tả thêm bối cảnh, gửi ticket loại Báo cáo nội dung.',
  },
  {
    id: 'marketplace',
    question: 'Surf Market hỗ trợ tranh chấp mua bán thế nào?',
    answer:
      'Giữ toàn bộ trao đổi trong Surf để có lịch sử rõ ràng, sau đó gửi ticket loại Marketplace kèm mã bài niêm yết, người bán/người mua và bằng chứng.',
  },
  {
    id: 'messages',
    question: 'Vì sao tôi không gửi được tin nhắn?',
    answer:
      'Tin nhắn có thể bị chặn nếu cuộc trò chuyện không còn hợp lệ, một trong hai tài khoản đã chặn nhau hoặc kết nối mạng đang gián đoạn.',
  },
  {
    id: 'bug',
    question: 'Làm sao báo lỗi kỹ thuật giống Report a Problem?',
    answer:
      'Chọn loại Lỗi kỹ thuật trong form, mô tả thao tác gây lỗi, thiết bị/trình duyệt đang dùng và thêm thời điểm xảy ra để support tái hiện nhanh hơn.',
  },
];

const CATEGORY_OPTIONS = [
  { value: 'account_access', label: 'Tài khoản và đăng nhập' },
  { value: 'privacy_safety', label: 'Quyền riêng tư và an toàn' },
  { value: 'report_content', label: 'Báo cáo nội dung/tài khoản' },
  { value: 'messages', label: 'Waves Chat và nhóm chat' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'groups_pages', label: 'Nhóm, Trang và Sự kiện' },
  { value: 'bug', label: 'Lỗi kỹ thuật' },
  { value: 'feedback', label: 'Góp ý sản phẩm' },
  { value: 'other', label: 'Khác' },
] as const;

const HELP_ACTIONS = [
  {
    title: 'Trung tâm trợ giúp',
    description: 'Tìm nhanh câu trả lời về tài khoản, quyền riêng tư, bài viết và chat.',
    href: '#faq',
    iconPath:
      'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 17a1.2 1.2 0 1 1 0-2.4A1.2 1.2 0 0 1 12 19Zm1.1-5.3h-2v-.4c0-1.2.7-1.9 1.7-2.5.9-.6 1.4-1 1.4-1.9 0-.9-.7-1.5-1.8-1.5-1 0-1.8.5-2.4 1.4L8.5 7.7A4.5 4.5 0 0 1 12.5 5c2.3 0 3.9 1.4 3.9 3.5 0 1.7-.9 2.5-2.1 3.3-.8.5-1.2.9-1.2 1.7v.2Z',
  },
  {
    title: 'Hộp thư hỗ trợ',
    description: 'Theo dõi ticket, phản hồi thêm thông tin và xem trạng thái xử lý.',
    href: '#support-inbox',
    iconPath:
      'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5L4 8V6l8 5 8-5v2Z',
  },
  {
    title: 'Báo cáo sự cố',
    description: 'Gửi lỗi kỹ thuật, vấn đề bảo mật hoặc hành vi bất thường cho Surf.',
    href: '#contact-form',
    iconPath: 'M1 21h22L12 2 1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z',
  },
  {
    title: 'Trạng thái tài khoản',
    description: 'Kiểm tra các ticket liên quan đến tài khoản, báo cáo và chính sách.',
    href: '#support-inbox',
    iconPath:
      'M12 2 4 5.5v6c0 5 3.4 9.7 8 10.5 4.6-.8 8-5.5 8-10.5v-6L12 2Zm-1 14-3.5-3.5L9 11l2 2 4-4 1.5 1.5L11 16Z',
  },
] as const;

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  new: 'Mới',
  open: 'Đang xử lý',
  pending: 'Chờ bạn phản hồi',
  resolved: 'Đã xử lý',
  closed: 'Đã đóng',
};

type SupportCategory = (typeof CATEGORY_OPTIONS)[number]['value'];

function formatDate(value: string | null) {
  if (!value) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getStatusClass(status: SupportTicketStatus) {
  if (status === 'new') return 'bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200';
  if (status === 'open') return 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200';
  if (status === 'pending')
    return 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200';
  if (status === 'resolved')
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200';
  return 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300';
}

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
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [canManageSupport, setCanManageSupport] = useState(false);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0] ?? null,
    [selectedTicketId, tickets]
  );
  const canSubmit = form.subject.trim().length >= 3 && form.message.trim().length >= 10;

  const fetchTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const res = await api.get<{ tickets: SupportTicket[] }>('/api/support/my-tickets');
      setTickets(res.tickets ?? []);
      setSelectedTicketId((current) => current ?? res.tickets?.[0]?.id ?? null);
    } catch {
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTickets();
    api
      .get<{ canManageSupport: boolean }>('/api/support/access')
      .then((res) => setCanManageSupport(res.canManageSupport))
      .catch(() => setCanManageSupport(false));
  }, [fetchTickets]);

  const upsertTicket = (ticket: SupportTicket) => {
    setTickets((current) => {
      const exists = current.some((item) => item.id === ticket.id);
      const next = exists
        ? current.map((item) => (item.id === ticket.id ? ticket : item))
        : [ticket, ...current];
      return next.sort(
        (a, b) =>
          new Date(b.lastMessageAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.lastMessageAt ?? a.createdAt ?? 0).getTime()
      );
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setStatus({ type: 'idle', message: '' });
    try {
      const res = await api.post<{ ticket: SupportTicket }>('/api/support/contact', {
        category: form.category,
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setForm((current) => ({ ...current, subject: '', message: '' }));
      upsertTicket(res.ticket);
      setSelectedTicketId(res.ticket.id);
      setStatus({
        type: 'success',
        message: 'Ticket đã được tạo. Bạn có thể theo dõi trạng thái bên dưới.',
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

  const handleReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTicket || replyDraft.trim().length < 2 || replySubmitting) return;

    setReplySubmitting(true);
    try {
      const res = await api.post<{ ticket: SupportTicket }>(
        `/api/support/my-tickets/${selectedTicket.id}/replies`,
        { message: replyDraft.trim() }
      );
      setReplyDraft('');
      upsertTicket(res.ticket);
      setSelectedTicketId(res.ticket.id);
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Không thể gửi phản hồi.',
      });
    } finally {
      setReplySubmitting(false);
    }
  };

  return (
    <div className="w-full py-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-300">
            Trợ giúp
          </p>
          <h1 className="mt-2 text-2xl font-bold text-gray-950 dark:text-gray-50">
            Help & Support
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
            Tìm câu trả lời, báo cáo sự cố và theo dõi toàn bộ trao đổi với support trong một nơi.
          </p>
        </div>
        {canManageSupport && (
          <Link
            to="/feed/admin/support"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 px-4 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200"
          >
            Support inbox
          </Link>
        )}
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-2">
        {HELP_ACTIONS.map((item) => (
          <a
            key={item.title}
            href={item.href}
            className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 transition hover:border-cyan-200 hover:bg-cyan-50/60 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-400/30 dark:hover:bg-cyan-400/10"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d={item.iconPath} />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-gray-950 dark:text-gray-50">
                {item.title}
              </span>
              <span className="mt-1 block text-sm leading-6 text-gray-600 dark:text-gray-400">
                {item.description}
              </span>
            </span>
          </a>
        ))}
      </section>

      <section id="faq" className="mb-6 scroll-mt-24">
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
        className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Tạo ticket hỗ trợ
        </h2>
        <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
          Ticket sẽ được lưu vào hộp thư hỗ trợ và gửi email cho đội ngũ phụ trách.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Bạn cần hỗ trợ về
            </span>
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
              placeholder="Mô tả chi tiết để support xử lý nhanh hơn"
              rows={6}
              className="mt-1 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-cyan-400/20"
            />
          </label>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cần tối thiểu 3 ký tự ở tiêu đề và 10 ký tự ở nội dung để gửi.
          </p>

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
            {submitting ? 'Đang tạo ticket...' : 'Tạo ticket'}
          </button>
        </form>
      </section>

      <section
        id="support-inbox"
        className="scroll-mt-24 rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Yêu cầu của tôi
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Chỉ bạn và đội ngũ support/admin xem được các ticket này.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchTickets}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800"
          >
            Làm mới
          </button>
        </div>

        {ticketsLoading ? (
          <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Đang tải ticket...
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-lg bg-gray-50 px-4 py-8 text-center text-sm text-gray-500 dark:bg-slate-950 dark:text-gray-400">
            Bạn chưa có ticket hỗ trợ nào.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              {tickets.map((ticket) => {
                const isSelected = selectedTicket?.id === ticket.id;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      isSelected
                        ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-400/30 dark:bg-cyan-400/10'
                        : 'border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {ticket.subject}
                    </span>
                    <span
                      className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getStatusClass(ticket.status)}`}
                    >
                      {STATUS_LABELS[ticket.status]}
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedTicket && (
              <div className="min-w-0 rounded-lg border border-gray-100 p-3 dark:border-slate-800">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-gray-950 dark:text-gray-50">
                      {selectedTicket.subject}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      #{selectedTicket.id.slice(0, 8)} · {formatDate(selectedTicket.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getStatusClass(selectedTicket.status)}`}
                  >
                    {STATUS_LABELS[selectedTicket.status]}
                  </span>
                </div>

                <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                  {selectedTicket.replies.map((reply) => (
                    <div
                      key={reply.id}
                      className={`rounded-lg px-3 py-2 ${
                        reply.authorRole === 'support'
                          ? 'bg-cyan-50 dark:bg-cyan-400/10'
                          : 'bg-gray-50 dark:bg-slate-950'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {reply.authorRole === 'support' ? 'Support' : reply.authorName}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {formatDate(reply.createdAt)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
                        {reply.message}
                      </p>
                    </div>
                  ))}
                </div>

                {selectedTicket.status === 'closed' ? (
                  <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 dark:bg-slate-950 dark:text-gray-400">
                    Ticket đã đóng. Tạo ticket mới nếu bạn cần hỗ trợ thêm.
                  </p>
                ) : (
                  <form onSubmit={handleReply} className="mt-4 space-y-2">
                    <textarea
                      value={replyDraft}
                      onChange={(event) => setReplyDraft(event.target.value)}
                      placeholder="Phản hồi ticket"
                      rows={3}
                      className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100 dark:focus:ring-cyan-400/20"
                    />
                    <button
                      type="submit"
                      disabled={replyDraft.trim().length < 2 || replySubmitting}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-slate-950 dark:hover:bg-white"
                    >
                      {replySubmitting ? 'Đang gửi...' : 'Gửi phản hồi'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
