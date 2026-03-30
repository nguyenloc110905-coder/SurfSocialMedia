import { FormEvent, useDeferredValue, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type GroupPrivacy = 'public' | 'private';

type DiscoverGroup = {
  id: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  category?: string;
  privacy: GroupPrivacy;
  ownerId: string;
  adminIds: string[];
  memberIds: string[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  membershipStatus: 'member' | 'pending' | 'none';
};

const CATEGORY_OPTIONS = [
  { label: 'Tất cả', value: '' },
  { label: 'Học tập', value: 'study' },
  { label: 'Công nghệ', value: 'tech' },
  { label: 'Âm nhạc', value: 'music' },
  { label: 'Gaming', value: 'gaming' },
  { label: 'Thể thao', value: 'sports' },
];

const DEFAULT_COVER =
  'linear-gradient(135deg, rgba(14,165,233,0.95), rgba(16,185,129,0.9), rgba(250,204,21,0.85))';

export default function Groups() {
  const [groups, setGroups] = useState<DiscoverGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [category, setCategory] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    coverImageUrl: '',
    category: 'study',
    privacy: 'public' as GroupPrivacy,
  });

  useEffect(() => {
    const controller = new AbortController();

    const loadGroups = async () => {
      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams();
        query.set('limit', '20');
        if (deferredSearch.trim()) query.set('q', deferredSearch.trim());
        if (category) query.set('category', category);

        const data = await api.get<{ items: DiscoverGroup[] }>(`/api/groups?${query.toString()}`, {
          signal: controller.signal,
        });
        setGroups(data.items ?? []);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError((e as Error).message);
        }
      } finally {
        setLoading(false);
      }
    };

    void loadGroups();

    return () => controller.abort();
  }, [deferredSearch, category]);

  const submitCreateGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await api.post<{ item: DiscoverGroup }>('/api/groups', form);

      if (data.item.privacy === 'public') {
        setGroups((current) => [{ ...data.item, membershipStatus: 'member' }, ...current]);
      }

      setSuccess(
        data.item.privacy === 'public'
          ? 'Đã tạo nhóm công khai thành công.'
          : 'Đã tạo nhóm riêng tư thành công.'
      );
      setShowCreate(false);
      setForm({
        name: '',
        description: '',
        coverImageUrl: '',
        category: 'study',
        privacy: 'public',
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (groupId: string) => {
    setJoiningId(groupId);
    setError(null);
    setSuccess(null);

    try {
      const data = await api.post<{ status: 'joined' | 'pending'; item: DiscoverGroup }>(
        `/api/groups/${groupId}/join`
      );

      setGroups((current) =>
        current.map((group) => {
          if (group.id !== groupId) return group;

          return {
            ...group,
            memberCount: data.status === 'joined' ? group.memberCount + 1 : group.memberCount,
            membershipStatus: data.status === 'joined' ? 'member' : 'pending',
          };
        })
      );

      setSuccess(
        data.status === 'joined'
          ? 'Bạn đã tham gia nhóm thành công.'
          : 'Yêu cầu tham gia đã được gửi tới admin.'
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="py-4 space-y-6">
      <section className="rounded-3xl overflow-hidden border border-cyan-100/80 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div
          className="px-5 sm:px-6 py-8 sm:py-10"
          style={{
            backgroundImage:
              'radial-gradient(circle at top left, rgba(34,211,238,0.35), transparent 35%), linear-gradient(135deg, rgba(255,255,255,0.98), rgba(240,249,255,0.98))',
          }}
        >
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">Surf Groups</p>
              <h1 className="mt-2 text-3xl sm:text-4xl font-black text-slate-900">Khám phá cộng đồng của bạn</h1>
              <p className="mt-3 text-sm sm:text-base text-slate-600 max-w-xl">
                Tìm nhóm công khai theo chủ đề, tạo cộng đồng mới và tham gia ngay khi thấy phù hợp.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 text-white px-5 py-3 text-sm font-bold hover:bg-slate-800 transition-colors"
            >
              <span className="text-lg leading-none">+</span>
              Tạo nhóm
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo tên nhóm..."
            className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-400"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-400"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-10 text-sm text-slate-500 dark:text-slate-400">
          Đang tải nhóm...
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-12 text-center">
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Chưa có nhóm phù hợp</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Thử đổi từ khóa tìm kiếm hoặc tạo nhóm đầu tiên của bạn.
          </p>
        </div>
      ) : (
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {groups.map((group) => (
            <article
              key={group.id}
              className="overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm"
            >
              <div
                className="h-40"
                style={{
                  backgroundImage: group.coverImageUrl
                    ? `url(${group.coverImageUrl})`
                    : DEFAULT_COVER,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-cyan-100 text-cyan-700 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]">
                    {group.category || 'general'}
                  </span>
                  <span className="rounded-full bg-slate-100 text-slate-600 px-3 py-1 text-[11px] font-semibold">
                    {group.privacy === 'public' ? 'Công khai' : 'Riêng tư'}
                  </span>
                </div>
                <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
                  {group.name}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400 min-h-[48px]">
                  {group.description || 'Chưa có mô tả cho nhóm này.'}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Members</p>
                    <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                      {group.memberCount}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleJoin(group.id)}
                    disabled={group.membershipStatus !== 'none' || joiningId === group.id}
                    className={`rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors ${
                      group.membershipStatus === 'member'
                        ? 'bg-emerald-100 text-emerald-700 cursor-default'
                        : group.membershipStatus === 'pending'
                          ? 'bg-amber-100 text-amber-700 cursor-default'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                    } disabled:opacity-100`}
                  >
                    {joiningId === group.id
                      ? 'Đang xử lý...'
                      : group.membershipStatus === 'member'
                        ? 'Đã tham gia'
                        : group.membershipStatus === 'pending'
                          ? 'Đang chờ duyệt'
                          : 'Tham gia'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Create Group</p>
                <h2 className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
                  Tạo cộng đồng mới
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                x
              </button>
            </div>
            <form onSubmit={submitCreateGroup} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                    Tên nhóm
                  </span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-400"
                    placeholder="Surf Study Club"
                    required
                  />
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                    Danh mục
                  </span>
                  <select
                    value={form.category}
                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-400"
                  >
                    {CATEGORY_OPTIONS.filter((option) => option.value).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Mô tả
                </span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  className="w-full min-h-[120px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-400"
                  placeholder="Nhóm dành cho những người cùng chủ đề quan tâm..."
                />
              </label>

              <label className="block">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Cover image URL
                </span>
                <input
                  value={form.coverImageUrl}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, coverImageUrl: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-400"
                  placeholder="https://..."
                />
              </label>

              <div>
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Quyền riêng tư
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {(['public', 'private'] as GroupPrivacy[]).map((value) => (
                    <label
                      key={value}
                      className={`rounded-2xl border px-4 py-4 cursor-pointer transition-colors ${
                        form.privacy === value
                          ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/10'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950'
                      }`}
                    >
                      <input
                        type="radio"
                        name="privacy"
                        value={value}
                        checked={form.privacy === value}
                        onChange={() => setForm((current) => ({ ...current, privacy: value }))}
                        className="sr-only"
                      />
                      <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                        {value === 'public' ? 'Công khai' : 'Riêng tư'}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                        {value === 'public'
                          ? 'Ai cũng có thể khám phá và tham gia ngay.'
                          : 'Thành viên mới cần admin duyệt yêu cầu tham gia.'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-2xl bg-slate-900 text-white px-5 py-2.5 text-sm font-bold hover:bg-slate-800 transition-colors disabled:opacity-60"
                >
                  {submitting ? 'Đang tạo...' : 'Tạo nhóm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
