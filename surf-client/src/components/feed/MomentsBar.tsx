import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api';
import { optimizeImageUrl } from '../../lib/image-cdn';
import CreateMomentModal from './CreateMomentModal';
import MomentViewer, { MomentGroup } from './MomentViewer';

// ─── Component ────────────────────────────────────────────────────────────────

export default function MomentsBar() {
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<MomentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [viewerGroupIdx, setViewerGroupIdx] = useState<number | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      const data = await api.get<{ groups: MomentGroup[] }>('/api/moments/feed');
      setGroups(data.groups ?? []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const getInitials = (name: string) =>
    name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const getGroupThumb = (g: MomentGroup): { url: string; isVideo: boolean } | null => {
    // Use the LATEST moment for the card thumbnail
    const latest = g.moments[g.moments.length - 1];
    if (!latest?.mediaUrl) return null;
    return { url: latest.mediaUrl, isVideo: latest.mediaType === 'video' };
  };

  // For Cloudinary video URLs, derive a poster image by swapping extension to .jpg
  const videoPoster = (videoUrl: string) => {
    // e.g. .../upload/v123/file.mp4 -> .../upload/v123/file.jpg
    return videoUrl.replace(/\.(mp4|webm|mov|avi)(\?.*)?$/i, '.jpg');
  };

  return (
    <div className="mb-4">
      {/* Horizontal scrollable container - Surf's rich horizontal card design */}
      <div className="relative bg-gradient-to-r from-cyan-50/80 via-blue-50/80 to-purple-50/80 dark:from-slate-800/50 dark:via-slate-800/50 dark:to-slate-800/50 rounded-2xl p-4 border border-cyan-200/50 dark:border-slate-700/50">
        {/* Animated wave accent at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-t-2xl">
          <div className="h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
        </div>

        <div className="flex gap-4 overflow-x-auto scrollbar-hide">
          {/* Create Moment Button */}
          <div className="flex-shrink-0 group cursor-pointer" onClick={() => setShowCreate(true)}>
            <div className="relative w-[140px] h-[200px] rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-500 p-[3px] shadow-lg shadow-cyan-500/25 group-hover:shadow-xl group-hover:shadow-cyan-500/40 transition-all duration-300">
              <div className="relative w-full h-full rounded-[14px] overflow-hidden bg-slate-900">
                {/* Background — user photo or gradient */}
                {user?.photoURL ? (
                  <img
                    src={optimizeImageUrl(user.photoURL)}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
                )}

                {/* Bottom gradient — subtle, only for text readability */}
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />

                {/* + button */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg ring-2 ring-white group-hover:scale-110 transition-transform duration-200">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </div>

                {/* Label */}
                <div className="absolute bottom-3 left-0 right-0 text-center z-10">
                  <span className="text-[11px] font-semibold text-white/90 drop-shadow">Tạo Moment</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Skeleton loaders while fetching ── */}
          {loading && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[140px] h-[200px] rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
          ))}

          {/* ── Real moment group cards ── */}
          {!loading && groups.map((group, idx) => {
            const thumb = getGroupThumb(group);
            const isOwn = group.userId === user?.uid;
            const hasNew = group.hasUnviewed;
            return (
              <div key={group.userId} className="flex-shrink-0 group cursor-pointer" onClick={() => setViewerGroupIdx(idx)}>
                <div className={`relative w-[140px] h-[200px] rounded-2xl p-[3px] transition-all duration-500 ${
                  hasNew
                    ? 'bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-500 shadow-xl shadow-cyan-500/30 group-hover:shadow-2xl group-hover:shadow-cyan-500/50'
                    : 'bg-gradient-to-br from-gray-300 to-gray-400 dark:from-slate-600 dark:to-slate-700'
                }`}>
                  {hasNew && <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 via-transparent to-white/20 animate-pulse pointer-events-none" />}
                  <div className="relative w-full h-full rounded-[14px] overflow-hidden bg-slate-800">
                    {thumb ? (
                      thumb.isVideo ? (
                        <>
                          <video
                            src={thumb.url}
                            poster={optimizeImageUrl(videoPoster(thumb.url))}
                            muted
                            preload="metadata"
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 pointer-events-none"
                            onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.5; }}
                          />
                          {/* Play badge */}
                          <div className="absolute top-3 left-3 z-10 w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                            <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                          </div>
                        </>
                      ) : (
                        <img src={optimizeImageUrl(thumb.url)} alt={group.userDisplayName} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                      )
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    {/* Small user avatar — bottom center (FB story style) */}
                    <div className="absolute bottom-[46px] left-1/2 -translate-x-1/2 z-10">
                      <div className="w-10 h-10 rounded-full ring-[3px] ring-white shadow-lg overflow-hidden bg-gradient-to-br from-cyan-500 to-blue-600 flex-shrink-0">
                        {group.userPhotoURL
                          ? <img src={optimizeImageUrl(group.userPhotoURL)} alt="" className="w-full h-full object-cover" />
                          : <span className="w-full h-full flex items-center justify-center text-xs font-bold text-white">{getInitials(group.userDisplayName)}</span>
                        }
                      </div>
                    </div>

                    {/* User name */}
                    <div className="absolute bottom-3 left-3 right-3 z-10">
                      <div className="bg-black/40 backdrop-blur-sm rounded-xl px-2.5 py-1.5 border border-white/20">
                        <span className="text-xs font-semibold text-white drop-shadow-md line-clamp-2 leading-tight block">
                          {isOwn ? 'Của bạn' : group.userDisplayName}
                        </span>
                        <span className="text-[10px] text-gray-300">{group.moments.length} moment{group.moments.length > 1 ? 's' : ''}</span>
                      </div>
                    </div>

                    {/* NEW badge */}
                    {hasNew && !isOwn && (
                      <div className="absolute top-3 left-3 z-10">
                        <div className="relative">
                          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full blur-md opacity-70" />
                          <div className="relative flex items-center gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full px-2.5 py-1 shadow-lg border border-white/30">
                            <svg className="w-3 h-3 text-white animate-pulse" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8" /></svg>
                            <span className="text-[10px] font-bold text-white tracking-wide">MỚI</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* View count — only visible to owner */}
                    {isOwn && (
                    <div className="absolute top-3 right-3 z-10">
                      <div className="bg-black/40 backdrop-blur-sm rounded-full px-2 py-1 border border-white/20">
                        <div className="flex items-center gap-1">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span className="text-[10px] font-medium text-white">
                            {group.moments.reduce((s, m) => s + (m.viewCount ?? 0), 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Wave decoration */}
                    <div className="absolute bottom-0 left-0 right-0 h-16 opacity-20 pointer-events-none">
                      <svg className="w-full h-full" viewBox="0 0 1200 120" preserveAspectRatio="none">
                        <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" className="fill-cyan-400" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {!loading && groups.length === 0 && (
            <div className="flex items-center justify-center flex-1 py-6">
              <p className="text-sm text-gray-400 dark:text-slate-500 italic">Chưa có Moment nào — hãy là người đầu tiên! 🌊</p>
            </div>
          )}
        </div>

        {/* Bottom wave decoration */}
        <div className="absolute bottom-0 left-0 right-0 h-8 opacity-[0.06] dark:opacity-[0.03] pointer-events-none overflow-hidden rounded-b-2xl">
          <svg className="w-full h-full" viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path
              d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z"
              className="fill-cyan-500"
            />
          </svg>
        </div>
      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <CreateMomentModal
          onClose={() => setShowCreate(false)}
          onCreated={fetchGroups}
        />
      )}
      {viewerGroupIdx !== null && groups.length > 0 && (
        <MomentViewer
          groups={groups}
          startGroupIndex={viewerGroupIdx}
          currentUserId={user?.uid ?? ''}
          onClose={() => setViewerGroupIdx(null)}
          onGroupsChange={setGroups}
        />
      )}
    </div>
  );
}
