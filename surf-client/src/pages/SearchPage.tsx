import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
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
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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

function EmptyState({ q }: { q: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center gap-3">
      <svg className="w-16 h-16 text-gray-300 dark:text-gray-600" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
      </svg>
      <p className="font-medium text-gray-600 dark:text-gray-400">Không tìm thấy kết quả nào cho "{q}"</p>
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
          {u.avatarUrl ? (
            <img src={u.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-lg font-bold">{u.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
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

function PostResults({ posts, q, navigate }: { posts: SearchPost[]; q: string; navigate: (to: string) => void }) {
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
              <img src={firstImage} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{p.authorDisplayName}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">{p.content}</p>
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
            <div key={p.id} className="relative rounded-xl overflow-hidden bg-black aspect-video cursor-pointer group">
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
      <svg className="w-16 h-16 text-gray-300 dark:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
        <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
      </svg>
      <p className="font-medium text-gray-600 dark:text-gray-400">Không tìm thấy nhóm nào cho "{q}"</p>
      <p className="text-sm text-gray-400 dark:text-gray-500">Tính năng nhóm sẽ sớm ra mắt</p>
    </div>
  );
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const q = searchParams.get('q') ?? '';
  const tabParam = (searchParams.get('tab') as Tab) ?? 'people';
  const [activeTab, setActiveTab] = useState<Tab>(tabParam);

  const [users, setUsers] = useState<SearchUser[]>([]);
  const [posts, setPosts] = useState<SearchPost[]>([]);
  const [videos, setVideos] = useState<SearchPost[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [donePeople, setDonePeople] = useState(false);
  const [donePosts, setDonePosts] = useState(false);
  const [doneVideos, setDoneVideos] = useState(false);

  const fetchPeople = useCallback(async () => {
    if (!q.trim()) { setUsers([]); setDonePeople(true); return; }
    setLoadingPeople(true);
    setDonePeople(false);
    try {
      const res = await api.get<{ users: SearchUser[] }>(`/api/users/search?q=${encodeURIComponent(q.trim())}`);
      setUsers(res.users ?? []);
    } catch { setUsers([]); }
    finally { setLoadingPeople(false); setDonePeople(true); }
  }, [q]);

  const fetchPosts = useCallback(async () => {
    if (!q.trim()) { setPosts([]); setDonePosts(true); return; }
    setLoadingPosts(true);
    setDonePosts(false);
    try {
      const res = await api.get<{ posts: SearchPost[] }>(`/api/posts/search?q=${encodeURIComponent(q.trim())}&type=posts`);
      setPosts(res.posts ?? []);
    } catch { setPosts([]); }
    finally { setLoadingPosts(false); setDonePosts(true); }
  }, [q]);

  const fetchVideos = useCallback(async () => {
    if (!q.trim()) { setVideos([]); setDoneVideos(true); return; }
    setLoadingVideos(true);
    setDoneVideos(false);
    try {
      const res = await api.get<{ posts: SearchPost[] }>(`/api/posts/search?q=${encodeURIComponent(q.trim())}&type=videos`);
      setVideos(res.posts ?? []);
    } catch { setVideos([]); }
    finally { setLoadingVideos(false); setDoneVideos(true); }
  }, [q]);

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
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: true });
    setActiveTab(tab);
  };

  if (!q.trim()) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-center">
        <svg className="w-14 h-14 text-gray-300 dark:text-gray-600" viewBox="0 0 24 24" fill="currentColor">
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

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-slate-700 mb-5 px-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-surf-primary text-surf-primary dark:text-cyan-400 dark:border-cyan-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="px-2">
        {activeTab === 'people' && (
          loadingPeople ? <Spinner /> : donePeople ? <PeopleResults users={users} q={q} /> : null
        )}
        {activeTab === 'posts' && (
          loadingPosts ? <Spinner /> : donePosts ? <PostResults posts={posts} q={q} navigate={navigate} /> : null
        )}
        {activeTab === 'groups' && <GroupsPlaceholder q={q} />}
        {activeTab === 'videos' && (
          loadingVideos ? <Spinner /> : doneVideos ? <VideoResults posts={videos} q={q} /> : null
        )}
      </div>
    </div>
  );
}
