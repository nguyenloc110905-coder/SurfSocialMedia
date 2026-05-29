import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

type SupportTicketStatus = 'new' | 'open' | 'pending' | 'resolved' | 'closed';

type SupportReply = {
  id: string;
  authorName: string;
  authorRole: 'user' | 'support';
  message: string;
  createdAt: string | null;
};

type SupportTicket = {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
  replies: SupportReply[];
};

const STATUS_OPTIONS: { value: SupportTicketStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'new', label: 'Mới' },
  { value: 'open', label: 'Đang xử lý' },
  { value: 'pending', label: 'Chờ user' },
  { value: 'resolved', label: 'Đã xử lý' },
  { value: 'closed', label: 'Đã đóng' },
];

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  new: 'Mới',
  open: 'Đang xử lý',
  pending: 'Chờ user',
  resolved: 'Đã xử lý',
  closed: 'Đã đóng',
};

function formatDate(value: string | null) {
  if (!value) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusClass(status: SupportTicketStatus) {
  if (status === 'new') return 'bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200';
  if (status === 'open') return 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200';
  if (status === 'pending')
    return 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200';
  if (status === 'resolved')
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200';
  return 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300';
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0] ?? null,
    [selectedTicketId, tickets]
  );

  const upsertTicket = (ticket: SupportTicket) => {
    setTickets((current) => {
      const next = current.some((item) => item.id === ticket.id)
        ? current.map((item) => (item.id === ticket.id ? ticket : item))
        : [ticket, ...current];
      return next.sort(
        (a, b) =>
          new Date(b.lastMessageAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.lastMessageAt ?? a.createdAt ?? 0).getTime()
      );
    });
  };

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = statusFilter === 'all' ? '' : `?status=${statusFilter}`;
      const res = await api.get<{ tickets: SupportTicket[] }>(`/api/support/admin/tickets${query}`);
      setTickets(res.tickets ?? []);
      setSelectedTicketId((current) => current ?? res.tickets?.[0]?.id ?? null);
    } catch (err) {
      setTickets([]);
      setError(err instanceof Error ? err.message : 'Không thể tải support inbox');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  const handleStatusChange = async (nextStatus: SupportTicketStatus) => {
    if (!selectedTicket || statusUpdating) return;

    setStatusUpdating(true);
    try {
      const res = await api.patch<{ ticket: SupportTicket }>(
        `/api/support/admin/tickets/${selectedTicket.id}`,
        { status: nextStatus }
      );
      upsertTicket(res.ticket);
      setSelectedTicketId(res.ticket.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTicket || replyDraft.trim().length < 2 || replySubmitting) return;

    setReplySubmitting(true);
    try {
      const res = await api.post<{ ticket: SupportTicket }>(
        `/api/support/admin/tickets/${selectedTicket.id}/replies`,
        { message: replyDraft.trim() }
      );
      setReplyDraft('');
      upsertTicket(res.ticket);
      setSelectedTicketId(res.ticket.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gửi phản hồi');
    } finally {
      setReplySubmitting(false);
    }
  };

  return (
    <div className="w-full py-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-300">
            Support
          </p>
          <h1 className="mt-2 text-2xl font-bold text-gray-950 dark:text-gray-50">Support Inbox</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Hàng đợi nội bộ cho support/admin xem ticket, trả lời và đổi trạng thái.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as SupportTicketStatus | 'all');
              setSelectedTicketId(null);
            }}
            className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={fetchTickets}
            className="min-h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800"
          >
            Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-400/10 dark:text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-400">
          Đang tải support inbox...
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-400">
          Không có ticket nào trong bộ lọc này.
        </div>
      ) : (
        <div className="grid min-h-[560px] gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-lg border border-gray-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            <div className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
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
                        : 'border-transparent hover:bg-gray-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900 dark:text-gray-100">
                        {ticket.subject}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(ticket.status)}`}
                      >
                        {STATUS_LABELS[ticket.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                      {ticket.displayName} · {ticket.category}
                    </p>
                    <p className="mt-2 text-[11px] text-gray-400">
                      {formatDate(ticket.lastMessageAt)}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          {selectedTicket && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-4 flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-gray-950 dark:text-gray-50">
                    {selectedTicket.subject}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    #{selectedTicket.id} · {selectedTicket.displayName} ·{' '}
                    {selectedTicket.email || 'không có email'}
                  </p>
                </div>
                <select
                  value={selectedTicket.status}
                  disabled={statusUpdating}
                  onChange={(event) =>
                    void handleStatusChange(event.target.value as SupportTicketStatus)
                  }
                  className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100"
                >
                  {STATUS_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-950">
                  <p className="text-xs font-semibold uppercase text-gray-400">Loại</p>
                  <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">
                    {selectedTicket.category}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-950">
                  <p className="text-xs font-semibold uppercase text-gray-400">Tạo lúc</p>
                  <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">
                    {formatDate(selectedTicket.createdAt)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-950">
                  <p className="text-xs font-semibold uppercase text-gray-400">User ID</p>
                  <p className="mt-1 truncate font-semibold text-gray-800 dark:text-gray-100">
                    {selectedTicket.uid}
                  </p>
                </div>
              </div>

              <div className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
                {selectedTicket.replies.map((reply) => (
                  <div
                    key={reply.id}
                    className={`rounded-lg px-4 py-3 ${
                      reply.authorRole === 'support'
                        ? 'bg-cyan-50 dark:bg-cyan-400/10'
                        : 'bg-gray-50 dark:bg-slate-950'
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                        {reply.authorRole === 'support' ? 'Support' : reply.authorName}
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(reply.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
                      {reply.message}
                    </p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleReply} className="mt-4 space-y-2">
                <textarea
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                  placeholder="Trả lời user"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-100 dark:focus:ring-cyan-400/20"
                />
                <button
                  type="submit"
                  disabled={replyDraft.trim().length < 2 || replySubmitting}
                  className="rounded-lg bg-surf-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {replySubmitting ? 'Đang gửi...' : 'Gửi phản hồi'}
                </button>
              </form>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
