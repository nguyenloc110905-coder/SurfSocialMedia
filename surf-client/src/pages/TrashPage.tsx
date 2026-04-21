import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { optimizeImageUrl } from '../lib/image-cdn';
import Modal from '../components/ui/Modal';

interface TrashedPost {
  id: string;
  authorId?: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  content: string;
  mediaUrls: string[];
  createdAt: unknown;
  deletedAt: { toMillis?: () => number } | null;
  feeling?: string;
  location?: string;
}

const TRASH_DAYS = 36;

function daysRemaining(deletedAt: TrashedPost['deletedAt']): number {
  if (!deletedAt) return TRASH_DAYS;
  const ts = deletedAt.toMillis?.() ?? 0;
  if (!ts) return TRASH_DAYS;
  const elapsed = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  return Math.max(0, TRASH_DAYS - elapsed);
}

function formatDate(deletedAt: TrashedPost['deletedAt']): string {
  if (!deletedAt) return '';
  const ts = deletedAt.toMillis?.() ?? 0;
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function TrashPage() {
  const [posts, setPosts] = useState<TrashedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchTrash = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ posts: TrashedPost[] }>('/api/posts/trash');
      setPosts(res.posts ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  const handleRestore = async (id: string) => {
    setActionId(id);
    try {
      await api.post(`/api/posts/${id}/restore`, {});
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert('Không thể khôi phục bài viết. Vui lòng thử lại.');
    } finally {
      setActionId(null);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    setConfirmDeleteId(null);
    setActionId(id);
    try {
      await api.delete(`/api/posts/${id}/permanent`);
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert('Không thể xóa vĩnh viễn. Vui lòng thử lại.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto pt-4 pb-10 px-2 sm:px-3">
      {/* Confirm permanent delete modal */}
      <Modal
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="Xóa vĩnh viễn?"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Bài viết sẽ bị <span className="font-semibold text-red-500">xóa vĩnh viễn</span> và
            không thể khôi phục sau khi xóa.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={() => confirmDeleteId && void handlePermanentDelete(confirmDeleteId)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
            >
              Xóa vĩnh viễn
            </button>
          </div>
        </div>
      </Modal>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-500/15 flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-red-500" fill="currentColor">
            <path d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Thùng rác</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Bài viết sẽ bị xóa vĩnh viễn sau {TRASH_DAYS} ngày kể từ khi xóa.
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-800/40 rounded-2xl p-4 border border-gray-200 dark:border-slate-700/50 animate-pulse"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-slate-700" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/3" />
                  <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded w-1/4" />
                </div>
              </div>
              <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-full mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-4/5" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && posts.length === 0 && (
        <div className="bg-white dark:bg-slate-800/40 rounded-2xl p-12 text-center border border-gray-200 dark:border-slate-700/50">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
            <svg
              viewBox="0 0 24 24"
              className="w-8 h-8 text-gray-400 dark:text-gray-500"
              fill="currentColor"
            >
              <path d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Thùng rác trống
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Các bài viết bạn xóa sẽ xuất hiện ở đây.
          </p>
        </div>
      )}

      {/* Post list */}
      {!loading && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((post) => {
            const remaining = daysRemaining(post.deletedAt);
            const isActing = actionId === post.id;
            const urgent = remaining <= 7;

            return (
              <div
                key={post.id}
                className="bg-white dark:bg-slate-800/40 rounded-2xl border border-gray-200 dark:border-slate-700/50 overflow-hidden"
              >
                {/* Days remaining banner */}
                <div
                  className={`px-4 py-1.5 text-xs font-medium flex items-center gap-1.5 ${
                    urgent
                      ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
                      : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                    <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                  </svg>
                  {remaining === 0
                    ? 'Sẽ bị xóa vĩnh viễn ngay hôm nay'
                    : `Còn ${remaining} ngày trước khi xóa vĩnh viễn`}
                  {post.deletedAt && (
                    <span className="ml-auto text-[11px] opacity-70">
                      Đã xóa: {formatDate(post.deletedAt)}
                    </span>
                  )}
                </div>

                {/* Post body */}
                <div className="p-4">
                  {/* Author */}
                  <div className="flex items-center gap-2.5 mb-3">
                    {post.authorPhotoURL ? (
                      <img
                        src={optimizeImageUrl(post.authorPhotoURL)}
                        alt={post.authorDisplayName}
                        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-surf-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-surf-primary text-sm font-semibold">
                          {post.authorDisplayName?.[0]?.toUpperCase() ?? '?'}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {post.authorDisplayName}
                      </p>
                      {post.feeling && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {post.feeling}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  {post.content && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-3 mb-3">
                      {post.content}
                    </p>
                  )}

                  {/* Media thumbnail */}
                  {post.mediaUrls?.length > 0 && (
                    <div className="mb-3 rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-700 h-28 relative">
                      <img
                        src={optimizeImageUrl(post.mediaUrls[0])}
                        alt=""
                        className="w-full h-full object-cover opacity-70"
                      />
                      {post.mediaUrls.length > 1 && (
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-md">
                          +{post.mediaUrls.length - 1}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleRestore(post.id)}
                      disabled={isActing}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surf-primary/10 dark:bg-surf-primary/15 text-surf-primary dark:text-surf-secondary text-sm font-medium hover:bg-surf-primary/20 transition-colors disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                        <path d="M12 5V2L8 6l4 4V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                      </svg>
                      {isActing ? 'Đang xử lý...' : 'Khôi phục'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(post.id)}
                      disabled={isActing}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                        <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                      </svg>
                      {isActing ? 'Đang xử lý...' : 'Xóa vĩnh viễn'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
