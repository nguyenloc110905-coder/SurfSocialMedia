import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import PresenceBadge from '@/components/ui/PresenceBadge';
import { optimizeImageUrl } from '@/lib/image-cdn';
import { isVideoUrl } from '@/lib/cloudinary';

type SearchUser = { id: string; name: string; avatarUrl?: string; mutualCount?: number };
type SearchPost = {
  id: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  authorId: string;
  content: string;
  mediaUrls: string[];
  hasVideo?: boolean;
  createdAt: unknown;
  likeCount: number;
  replyCount: number;
};

type Tab = 'people' | 'posts' | 'groups' | 'videos';
type DateFilter = 'any' | 'today' | 'week' | 'month';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  {
    key: 'people',
    label: 'Mọi người',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
      </svg>
    ),
  },
  {
    key: 'posts',
    label: 'Bài viết',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    key: 'groups',
    label: 'Nhóm',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
      </svg>
    ),
  },
  {
    key: 'videos',
    label: 'Video',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    ),
  },
];

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'any', label: 'Mọi thời gian' },
  { key: 'today', label: 'Hôm nay' },
  { key: 'week', label: '7 ngày' },
  { key: 'month', label: '30 ngày' },
];

function parseTab(value: string | null): Tab {
  return TABS.some((tab) => tab.key === value) ? (value as Tab) : 'people';
}

function parseDateFilter(value: string | null): DateFilter {
  return DATE_FILTERS.some((filter) => filter.key === value) ? (value as DateFilter) : 'any';
}

function EmptyState({ q }: { q: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center gap-3">
      <svg
        className="w-16 h-16 text-gray-300 dark:text-gray-600"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
      </svg>
      <p className="font-medium text-gray-600 dark:text-gray-400">
        Không tìm thấy kết quả nào cho "{q}"
      </p>
      <p className="text-sm text-gray-400 dark:text-gray-500">Thử tìm với từ khoá khác</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-surf-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function PeopleResults({ users, q }: { users: SearchUser[]; q: string }) {
  if (!users.length) return <EmptyState q={q} />;
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{users.length} người dùng</p>
      {users.map((u) => (
        <Link
          key={u.id}
          to={`/feed/profile/${u.id}`}
          className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="relative inline-flex flex-shrink-0 overflow-visible">
            {u.avatarUrl ? (
              <img
                src={optimizeImageUrl(u.avatarUrl)}
                alt=""
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <span className="text-white text-lg font-bold">
                  {u.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <PresenceBadge uid={u.id} size="md" />
          </span>
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{u.name}</p>
            {(u.mutualCount ?? 0) > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{u.mutualCount} bạn chung</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

function PostResults({
  posts,
  q,
  navigate,
}: {
  posts: SearchPost[];
  q: string;
  navigate: (to: string) => void;
}) {
  if (!posts.length) return <EmptyState q={q} />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{posts.length} bài viết</p>
      {posts.map((p) => {
        const firstImage = p.mediaUrls?.find((u) => !isVideoUrl(u));
        return (
          <div
            key={p.id}
            onClick={() => navigate(`/feed/profile/${p.authorId}`)}
            className="flex gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          >
            {firstImage && (
              <img
                src={optimizeImageUrl(firstImage)}
                alt=""
                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                {p.authorDisplayName}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">
                {p.content}
              </p>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-gray-500">
                <span>❤️ {p.likeCount}</span>
                <span>💬 {p.replyCount}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VideoResults({ posts, q }: { posts: SearchPost[]; q: string }) {
  if (!posts.length) return <EmptyState q={q} />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{posts.length} video</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {posts.map((p) => {
          const videoUrl = p.mediaUrls?.find((u) => isVideoUrl(u));
          if (!videoUrl) return null;
          return (
            <div
              key={p.id}
              className="relative rounded-xl overflow-hidden bg-black aspect-video cursor-pointer group"
            >
              <video src={videoUrl} className="w-full h-full object-cover" muted playsInline />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="text-white text-xs font-medium truncate">{p.authorDisplayName}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GroupsPlaceholder({ q }: { q: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center gap-3">
      <svg
        className="w-16 h-16 text-gray-300 dark:text-gray-600"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
      </svg>
      <p className="font-medium text-gray-600 dark:text-gray-400">
        Không tìm thấy nhóm nào cho "{q}"
      </p>
      <p className="text-sm text-gray-400 dark:text-gray-500">Tính năng nhóm sẽ sớm ra mắt</p>
    </div>
  );
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const q = searchParams.get('q') ?? '';
  const tabParam = parseTab(searchParams.get('tab'));
  const dateFilter = parseDateFilter(searchParams.get('date'));
  const locationFilter = searchParams.get('location')?.trim() ?? '';
  const [activeTab, setActiveTab] = useState<Tab>(tabParam);
  const [locationDraft, setLocationDraft] = useState(locationFilter);

  const [users, setUsers] = useState<SearchUser[]>([]);
  const [posts, setPosts] = useState<SearchPost[]>([]);
  const [videos, setVideos] = useState<SearchPost[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [donePeople, setDonePeople] = useState(false);
  const [donePosts, setDonePosts] = useState(false);
  const [doneVideos, setDoneVideos] = useState(false);

  useEffect(() => {
    setLocationDraft(locationFilter);
  }, [locationFilter]);

  const fetchPeople = useCallback(async () => {
    if (!q.trim()) {
      setUsers([]);
      setDonePeople(true);
      return;
    }
    setLoadingPeople(true);
    setDonePeople(false);
    try {
      const res = await api.get<{ users: SearchUser[] }>(
        `/api/users/search?q=${encodeURIComponent(q.trim())}`
      );
      setUsers(res.users ?? []);
    } catch {
      setUsers([]);
    } finally {
      setLoadingPeople(false);
      setDonePeople(true);
    }
  }, [q]);

  const fetchPosts = useCallback(async () => {
    if (!q.trim()) {
      setPosts([]);
      setDonePosts(true);
      return;
    }
    setLoadingPosts(true);
    setDonePosts(false);
    try {
      const params = new URLSearchParams({ q: q.trim(), type: 'posts' });
      if (dateFilter !== 'any') params.set('date', dateFilter);
      if (locationFilter) params.set('location', locationFilter);
      const res = await api.get<{ posts: SearchPost[] }>(`/api/posts/search?${params.toString()}`);
      setPosts(res.posts ?? []);
    } catch {
      setPosts([]);
    } finally {
      setLoadingPosts(false);
      setDonePosts(true);
    }
  }, [q, dateFilter, locationFilter]);

  const fetchVideos = useCallback(async () => {
    if (!q.trim()) {
      setVideos([]);
      setDoneVideos(true);
      return;
    }
    setLoadingVideos(true);
    setDoneVideos(false);
    try {
      const params = new URLSearchParams({ q: q.trim(), type: 'videos' });
      if (dateFilter !== 'any') params.set('date', dateFilter);
      if (locationFilter) params.set('location', locationFilter);
      const res = await api.get<{ posts: SearchPost[] }>(`/api/posts/search?${params.toString()}`);
      setVideos(res.posts ?? []);
    } catch {
      setVideos([]);
    } finally {
      setLoadingVideos(false);
      setDoneVideos(true);
    }
  }, [q, dateFilter, locationFilter]);

  // Fetch all on q change
  useEffect(() => {
    void fetchPeople();
    void fetchPosts();
    void fetchVideos();
  }, [fetchPeople, fetchPosts, fetchVideos]);

  // Sync tab to/from URL
  useEffect(() => {
    setActiveTab(tabParam);
  }, [tabParam]);

  const switchTab = (tab: Tab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', tab);
        return next;
      },
      { replace: true }
    );
    setActiveTab(tab);
  };

  const setDateFilter = (nextDateFilter: DateFilter) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextDateFilter === 'any') next.delete('date');
        else next.set('date', nextDateFilter);
        return next;
      },
      { replace: true }
    );
  };

  const applyLocationFilter = (event?: FormEvent) => {
    event?.preventDefault();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const trimmed = locationDraft.trim();
        if (trimmed) next.set('location', trimmed);
        else next.delete('location');
        return next;
      },
      { replace: true }
    );
  };

  const clearLocationFilter = () => {
    setLocationDraft('');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('location');
        return next;
      },
      { replace: true }
    );
  };

  if (!q.trim()) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-center">
        <svg
          className="w-14 h-14 text-gray-300 dark:text-gray-600"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <p className="text-gray-500 dark:text-gray-400">Nhập từ khoá để tìm kiếm</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4">
      {/* Header */}
      <h2 className="px-2 text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Kết quả cho <span className="text-surf-primary">"{q}"</span>
      </h2>

      {/* Filter chips */}
      <div className="mb-5 space-y-3 px-1">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => switchTab(tab.key)}
                className={`flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-surf-primary bg-surf-primary text-white shadow-sm dark:border-cyan-400 dark:bg-cyan-500'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-800'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {DATE_FILTERS.map((filter) => {
            const isActive = dateFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setDateFilter(filter.key)}
                className={`min-h-9 rounded-full border px-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-400 dark:bg-cyan-400/15 dark:text-cyan-200'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-400 dark:hover:bg-slate-800'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={applyLocationFilter} className="flex flex-wrap items-center gap-2">
          <div className="flex min-h-10 flex-1 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-none sm:min-w-[260px]">
            <svg
              className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
            </svg>
            <input
              value={locationDraft}
              onChange={(event) => setLocationDraft(event.target.value)}
              placeholder="Lọc theo địa điểm"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            {locationFilter && (
              <button
                type="button"
                onClick={clearLocationFilter}
                className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-gray-300"
                aria-label="Xoá lọc địa điểm"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            )}
          </div>
          <button
            type="submit"
            className="min-h-10 rounded-full bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-gray-700 dark:bg-gray-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Áp dụng
          </button>
        </form>
      </div>

      {/* Tab content */}
      <div className="px-2">
        {activeTab === 'people' &&
          (loadingPeople ? <Spinner /> : donePeople ? <PeopleResults users={users} q={q} /> : null)}
        {activeTab === 'posts' &&
          (loadingPosts ? (
            <Spinner />
          ) : donePosts ? (
            <PostResults posts={posts} q={q} navigate={navigate} />
          ) : null)}
        {activeTab === 'groups' && <GroupsPlaceholder q={q} />}
        {activeTab === 'videos' &&
          (loadingVideos ? <Spinner /> : doneVideos ? <VideoResults posts={videos} q={q} /> : null)}
      </div>
    </div>
  );
}
