import { ChangeEvent, FormEvent, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { uploadImage } from '@/lib/cloudinary';
import { useAuthStore } from '@/stores/authStore';

type RsvpStatus = 'going' | 'maybe' | 'not_going';

type SurfEvent = {
  id: string;
  creatorId: string;
  creatorName: string;
  name: string;
  date: string;
  location: string;
  description: string;
  coverImageUrl: string | null;
  attendeeCounts: Record<RsvpStatus, number>;
  myRsvp: RsvpStatus | null;
  createdAt: string;
  updatedAt: string;
};

type EventForm = {
  name: string;
  date: string;
  location: string;
  description: string;
  coverImageUrl: string;
};

const emptyForm: EventForm = {
  name: '',
  date: '',
  location: '',
  description: '',
  coverImageUrl: '',
};

const rsvpOptions: Array<{ value: RsvpStatus; label: string }> = [
  { value: 'going', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'not_going', label: 'Not going' },
];

const toDatetimeLocal = (iso: string) => {
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const formatEventDate = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

export default function EventsPage() {
  const user = useAuthStore((state) => state.user);
  const [events, setEvents] = useState<SurfEvent[]>([]);
  const [locationFilter, setLocationFilter] = useState('');
  const deferredLocation = useDeferredValue(locationFilter);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [rsvpingId, setRsvpingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === editingId) ?? null,
    [editingId, events]
  );

  useEffect(() => {
    const controller = new AbortController();

    const loadEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        if (deferredLocation.trim()) query.set('location', deferredLocation.trim());
        const data = await api.get<{ items: SurfEvent[] }>(
          `/api/events${query.toString() ? `?${query.toString()}` : ''}`,
          { signal: controller.signal }
        );
        setEvents(data.items ?? []);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void loadEvents();
    return () => controller.abort();
  }, [deferredLocation]);

  useEffect(() => {
    if (!selectedEvent) return;
    setForm({
      name: selectedEvent.name,
      date: toDatetimeLocal(selectedEvent.date),
      location: selectedEvent.location,
      description: selectedEvent.description,
      coverImageUrl: selectedEvent.coverImageUrl ?? '',
    });
    setShowForm(true);
  }, [selectedEvent]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError(null);
    setMessage(null);
  };

  const handleCoverChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingCover(true);
    setError(null);
    try {
      const url = await uploadImage(file, { folder: 'surf/events' });
      setForm((current) => ({ ...current, coverImageUrl: url }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadingCover(false);
    }
  };

  const submitEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const payload = {
        ...form,
        coverImageUrl: form.coverImageUrl.trim() || null,
        date: new Date(form.date).toISOString(),
      };

      if (editingId) {
        const data = await api.patch<{ item: SurfEvent }>(`/api/events/${editingId}`, payload);
        setEvents((current) =>
          current.map((item) => (item.id === data.item.id ? data.item : item))
        );
        setMessage('Đã cập nhật sự kiện và gửi thông báo cho attendee.');
      } else {
        const data = await api.post<{ item: SurfEvent }>('/api/events', payload);
        setEvents((current) =>
          [data.item, ...current].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          )
        );
        setMessage('Đã tạo sự kiện.');
      }

      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitRsvp = async (eventId: string, status: RsvpStatus) => {
    setRsvpingId(eventId);
    setError(null);
    setMessage(null);

    try {
      const data = await api.post<{ item: SurfEvent }>(`/api/events/${eventId}/rsvp`, {
        status,
      });
      setEvents((current) => current.map((item) => (item.id === eventId ? data.item : item)));
      setMessage('Đã cập nhật RSVP.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRsvpingId(null);
    }
  };

  return (
    <div className="flex min-h-full w-full flex-col bg-slate-50 dark:bg-slate-950">
      <section className="border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600">
              Surf Events
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-50">
              Sự kiện sắp diễn ra
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Tạo sự kiện, lọc theo địa điểm và RSVP Going/Maybe/Not going. Khi sự kiện được chỉnh
              sửa, attendee sẽ nhận notification realtime.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm);
              setShowForm((current) => !current);
            }}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          >
            {showForm && !editingId ? 'Đóng form' : 'Tạo event'}
          </button>
        </div>
      </section>

      <div className="space-y-4 p-4 sm:p-6">
        {(message || error) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              error
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
            }`}
          >
            {error ?? message}
          </div>
        )}

        {showForm && (
          <form
            onSubmit={submitEvent}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Tên event
                </span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                  maxLength={120}
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Ngày giờ
                </span>
                <input
                  type="datetime-local"
                  value={form.date}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, date: event.target.value }))
                  }
                  required
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Địa điểm
                </span>
                <input
                  value={form.location}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, location: event.target.value }))
                  }
                  required
                  maxLength={160}
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Cover image
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverChange}
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="md:col-span-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Mô tả
                </span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  required
                  maxLength={2000}
                  rows={4}
                  className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
            </div>

            {form.coverImageUrl && (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <img src={form.coverImageUrl} alt="" className="h-44 w-full object-cover" />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={submitting || uploadingCover}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-600 px-5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {uploadingCover
                  ? 'Đang upload cover...'
                  : submitting
                    ? 'Đang lưu...'
                    : editingId
                      ? 'Lưu thay đổi'
                      : 'Tạo event'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Hủy
              </button>
            </div>
          </form>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Discovery
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                GET /api/events sorted by date, filter by location
              </p>
            </div>
            <input
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              placeholder="Lọc theo địa điểm"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:max-w-xs"
            />
          </div>
        </section>

        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Đang tải sự kiện...</p>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Chưa có event sắp diễn ra.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {events.map((event) => (
              <article
                key={event.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="h-44 bg-slate-200 dark:bg-slate-800">
                  {event.coverImageUrl ? (
                    <img src={event.coverImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#0ea5e9,#10b981,#f59e0b)] text-sm font-bold text-white">
                      Surf Event
                    </div>
                  )}
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-600">
                      {formatEventDate(event.date)}
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950 dark:text-slate-50">
                      {event.name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {event.location} · tạo bởi {event.creatorName}
                    </p>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
                      {event.description}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    {rsvpOptions.map((option) => (
                      <div
                        key={option.value}
                        className="rounded-xl bg-slate-100 px-2 py-2 dark:bg-slate-800"
                      >
                        <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                          {event.attendeeCounts[option.value] ?? 0}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {option.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {rsvpOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void submitRsvp(event.id, option.value)}
                        disabled={rsvpingId === event.id}
                        className={`inline-flex h-10 items-center justify-center rounded-xl px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          event.myRsvp === option.value
                            ? 'bg-cyan-600 text-white'
                            : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                    {event.creatorId === user?.uid && (
                      <button
                        type="button"
                        onClick={() => setEditingId(event.id)}
                        className="ml-auto inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Sửa
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
