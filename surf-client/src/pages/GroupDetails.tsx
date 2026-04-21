import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import CreatePost from '../components/feed/CreatePost';
import PostCard from '../components/feed/PostCard';
import { uploadImage } from '../lib/cloudinary';

type GroupDetailsInfo = {
  id: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  category?: string;
  privacy: 'public' | 'private';
  ownerId: string;
  adminIds: string[];
  memberCount: number;
  membershipStatus: 'member' | 'pending' | 'none';
};

type GroupMember = {
  id: string;
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'moderator' | 'member';
  isOwner?: boolean;
};

type GroupRequest = {
  id: string;
  userId: string;
  status: string;
  user?: {
    id: string;
    displayName: string;
    photoURL?: string;
  };
};

const DEFAULT_COVER =
  'linear-gradient(135deg, rgba(14,165,233,0.95), rgba(16,185,129,0.9), rgba(250,204,21,0.85))';

export default function GroupDetails() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [group, setGroup] = useState<GroupDetailsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'discussion' | 'featured' | 'members' | 'requests'>('discussion');
  
  const [posts, setPosts] = useState<any[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [requests, setRequests] = useState<GroupRequest[]>([]);
  
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [friends, setFriends] = useState<{ id: string; name: string; avatarUrl: string | null }[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ title?: string, message: string, type: 'info' | 'error' | 'success' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null);
  
  const isAdmin = group?.adminIds.includes(user?.uid || '');

  useEffect(() => {
    if (!groupId) return;
    const fetchGroup = async () => {
      try {
        setLoading(true);
        const { item } = await api.get<{ item: GroupDetailsInfo }>(`/api/groups/${groupId}`);
        setGroup(item);
      } catch (e: any) {
        setError(e.message || 'Không thể tải nhóm');
      } finally {
        setLoading(false);
      }
    };
    void fetchGroup();
  }, [groupId]);

  useEffect(() => {
    if (!groupId || !group) return;
    if (activeTab === 'discussion') {
       if (group.privacy === 'private' && group.membershipStatus !== 'member') return;
       setCursor(null);
       setHasMore(false);
       api.get<{ posts: any[]; nextCursor: number | null }>(`/api/groups/${groupId}/posts?limit=20`)
         .then((res) => {
           setPosts(res.posts || []);
           setHasMore(!!res.nextCursor);
           setCursor(res.nextCursor ?? null);
         })
         .catch(console.error);
    } else if (activeTab === 'members') {
       api.get<{ items: GroupMember[] }>(`/api/groups/${groupId}/members`)
         .then((res) => setMembers(res.items || []))
         .catch(console.error);
    } else if (activeTab === 'requests' && isAdmin) {
       api.get<{ items: GroupRequest[] }>(`/api/groups/${groupId}/requests`)
         .then((res) => setRequests(res.items || []))
         .catch(console.error);
    }
  }, [groupId, activeTab, group?.membershipStatus, isAdmin]);

  useEffect(() => {
    if (showInviteModal) {
      api.get<{ friends: { id: string; name: string; avatarUrl: string | null }[] }>('/api/friends')
        .then(res => setFriends(res.friends || []))
        .catch(console.error);
    }
  }, [showInviteModal]);

  const handleJoin = async () => {
    if (!group) return;
    try {
      const data = await api.post<{ status: 'joined' | 'pending'; item: GroupDetailsInfo }>(
        `/api/groups/${group.id}/join`
      );
      setGroup({
        ...group,
        memberCount: data.status === 'joined' ? group.memberCount + 1 : group.memberCount,
        membershipStatus: data.status === 'joined' ? 'member' : 'pending',
      });
    } catch (e: any) {
      setAlertMessage({ message: e.message || 'Lỗi tham gia nhóm', type: 'error' });
    }
  };

  const handlePostCreated = (newPost: any) => {
    setPosts([newPost, ...posts]);
  };

  const loadMorePosts = async () => {
    if (!groupId || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.get<{ posts: any[]; nextCursor: number | null }>(
        `/api/groups/${groupId}/posts?limit=20&cursor=${cursor}`
      );
      setPosts((prev) => [...prev, ...(res.posts || [])]);
      setHasMore(!!res.nextCursor);
      setCursor(res.nextCursor ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePostUpdated = (updatedPost: any) => {
    setPosts(posts.map(p => p.id === updatedPost.id ? updatedPost : p));
  };

  const handleProcessRequest = async (userId: string, action: 'approve' | 'reject') => {
    if (!group) return;
    try {
      await api.post(`/api/groups/${group.id}/requests/${userId}`, { action });
      setRequests(requests.filter(r => r.userId !== userId));
      if (action === 'approve') {
        setGroup({ ...group, memberCount: group.memberCount + 1 });
      }
    } catch (e: any) {
      setAlertMessage({ message: e.message || 'Lỗi khi xử lý yêu cầu', type: 'error' });
    }
  };

  const handleMemberAction = async (userId: string, action: 'make_admin' | 'remove_admin' | 'make_moderator' | 'remove_moderator' | 'remove') => {
     if (!group) return;
     setConfirmDialog({
       message: 'Bạn có chắc chắn muốn thực hiện hành động này?',
       onConfirm: async () => {
         try {
           if (action === 'remove') {
             await api.delete(`/api/groups/${group.id}/members/${userId}`);
             setMembers(prev => prev.filter(m => m.id !== userId));
             setGroup(prev => ({ ...prev!, memberCount: prev!.memberCount - 1 }));
           } else {
             await api.put(`/api/groups/${group.id}/members/${userId}`, { action });
             if (action === 'make_admin') {
               setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: 'admin' } : m));
             } else if (action === 'remove_admin') {
               setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: 'member' } : m));
             } else if (action === 'make_moderator') {
               setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: 'moderator' } : m));
             } else if (action === 'remove_moderator') {
               setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: 'member' } : m));
             }
           }
         } catch (e: any) {
           setAlertMessage({ message: e.message || 'Lỗi xử lý thành viên', type: 'error' });
         }
       }
     });
  };

  const handleSendInvites = async () => {
    if (!group) return;
    setInviting(true);
    try {
      await api.post(`/api/groups/${group.id}/invites`, { userIds: selectedFriends });
      setAlertMessage({ message: 'Đã gửi lời mời thành công!', type: 'success' });
      setShowInviteModal(false);
      setSelectedFriends([]);
    } catch(e: any) {
      setAlertMessage({ message: e.message || 'Có lỗi xảy ra khi mời bạn bè', type: 'error' });
    } finally {
      setInviting(false);
    }
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !group) return;
    setUploadingCover(true);
    try {
       const url = await uploadImage(file, { folder: 'surf_groups_covers' });
       await api.put(`/api/groups/${group.id}`, { coverImageUrl: url });
       setGroup({ ...group, coverImageUrl: url });
    } catch(err: any) {
       setAlertMessage({ message: 'Lỗi tải ảnh lên: ' + (err.message || 'vui lòng thử lại'), type: 'error' });
    } finally {
       setUploadingCover(false);
       if (e.target) e.target.value = '';
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setAlertMessage({ message: 'Đã sao chép liên kết nhóm!', type: 'success' });
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải...</div>;
  if (error || !group) return <div className="p-8 text-center text-red-500">{error || 'Nhóm không tồn tại'}</div>;

  return (
    <div className="max-w-4xl mx-auto pb-10">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-b-3xl shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700 relative">
        <div 
           className="h-64 object-cover w-full relative group transition-opacity"
           style={{
            backgroundImage: group.coverImageUrl
              ? `url(${group.coverImageUrl})`
              : DEFAULT_COVER,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {isAdmin && (
             <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
               <button 
                 disabled={uploadingCover}
                 onClick={() => coverInputRef.current?.click()} 
                 className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white px-6 py-2 rounded-full font-bold shadow-lg"
               >
                 {uploadingCover ? 'Đang tải...' : 'Đổi ảnh bìa'}
               </button>
               <input type="file" ref={coverInputRef} accept="image/*" onChange={handleCoverChange} className="hidden" />
             </div>
          )}
        </div>
        <div className="px-6 py-6 sm:px-10 flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-end -mt-10 relative z-10 bg-gradient-to-t from-white via-white dark:from-slate-900 dark:via-slate-900 pb-6 pt-16">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white drop-shadow-md">{group.name}</h1>
            <div className="mt-2 flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1">
                {group.privacy === 'public' ? '🌐 Công khai' : '🔒 Riêng tư'}
              </span>
              <span>•</span>
              <span>{group.memberCount} thành viên</span>
            </div>
            {group.description && (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 max-w-xl">{group.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {group.membershipStatus === 'member' && (
              <button onClick={() => setShowInviteModal(true)} className="bg-cyan-100 text-cyan-800 hover:bg-cyan-200 px-6 py-2.5 rounded-full font-bold transition">
                + Mời bạn
              </button>
            )}
            {group.membershipStatus === 'none' ? (
              <button onClick={handleJoin} className="bg-cyan-600 hover:bg-cyan-700 px-6 py-2.5 rounded-full text-white font-bold transition">
                Tham gia nhóm
              </button>
            ) : group.membershipStatus === 'pending' ? (
              <button disabled className="bg-amber-100 text-amber-700 px-6 py-2.5 rounded-full font-bold">
                Đang chờ duyệt
              </button>
            ) : (
              <div className="bg-emerald-100 text-emerald-700 px-6 py-2.5 rounded-full font-bold cursor-default">
                Đã tham gia
              </div>
            )}
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <div className="px-6 sm:px-10 border-t border-slate-100 dark:border-slate-800 flex gap-6 mt-2 relative top-0.5">
           <button 
             onClick={() => setActiveTab('discussion')}
             className={`py-4 px-2 font-semibold text-sm transition-colors border-b-4 ${activeTab === 'discussion' ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:dark:text-slate-300'}`}
           >
             Thảo luận
           </button>
           <button 
             onClick={() => setActiveTab('featured')}
             className={`py-4 px-2 font-semibold text-sm transition-colors border-b-4 ${activeTab === 'featured' ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:dark:text-slate-300'}`}
           >
             Đáng chú ý
           </button>
           <button 
             onClick={() => setActiveTab('members')}
             className={`py-4 px-2 font-semibold text-sm transition-colors border-b-4 ${activeTab === 'members' ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:dark:text-slate-300'}`}
           >
             Mọi người
           </button>
           {isAdmin && (
             <button 
               onClick={() => setActiveTab('requests')}
               className={`py-4 px-2 font-semibold text-sm transition-colors border-b-4 ${activeTab === 'requests' ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:dark:text-slate-300'}`}
             >
               Yêu cầu tham gia
             </button>
           )}
        </div>
      </div>

      <div className="mt-6 px-2 sm:px-0">
        {activeTab === 'discussion' && (
          <div className="max-w-2xl mx-auto">
            {group.membershipStatus === 'member' && (
              <CreatePost groupId={groupId} onPostCreated={handlePostCreated} />
            )}
            
            {(group.privacy === 'private' && group.membershipStatus !== 'member') ? (
               <div className="mt-8 text-center p-10 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-800">
                 <p className="text-lg font-bold text-slate-700 dark:text-slate-300">Đây là nhóm riêng tư</p>
                 <p className="text-sm text-slate-500 mt-2">Vui lòng tham gia nhóm để xem các bài thảo luận</p>
               </div>
            ) : (
               <div className="space-y-4 pt-2">
                 {posts.map(post => (
                   <PostCard key={post.id} post={post} currentUserId={user?.uid} onPostUpdated={handlePostUpdated} />
                 ))}
                 {posts.length === 0 && (
                   <div className="text-center py-10 text-slate-500">Chưa có bài viết nào trong nhóm.</div>
                 )}
                 {hasMore && (
                   <div className="flex justify-center pt-2 pb-4">
                     <button
                       onClick={loadMorePosts}
                       disabled={loadingMore}
                       className="px-6 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50"
                     >
                       {loadingMore ? 'Đang tải...' : 'Xem thêm'}
                     </button>
                   </div>
                 )}
               </div>
            )}
          </div>
        )}

        {activeTab === 'featured' && (
          <div className="max-w-2xl mx-auto">
             <div className="mt-8 text-center p-10 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
               <div className="w-16 h-16 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⭐</div>
               <p className="text-lg font-bold text-slate-700 dark:text-slate-300">Chưa có nội dung đáng chú ý</p>
               <p className="text-sm text-slate-500 mt-2">Quản trị viên chưa ghim bài viết nào lên mục đáng chú ý.</p>
             </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
             <h3 className="text-lg font-bold mb-4">Thành viên ({members.length})</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {members.map(member => (
                 <div key={member.id} className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent hover:border-slate-100 dark:hover:border-slate-700 transition">
                    <div className="flex items-center gap-3">
                      {member.photoURL ? (
                        <img src={member.photoURL} className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold">{member.displayName?.[0]}</div>
                      )}
                      <div>
                        <p className="font-bold text-slate-900 dark:text-slate-100">{member.displayName}</p>
                        <p className={`text-xs font-semibold uppercase ${
                          member.isOwner ? 'text-amber-500 dark:text-amber-400' :
                          member.role === 'admin' ? 'text-cyan-600 dark:text-cyan-400' :
                          member.role === 'moderator' ? 'text-violet-600 dark:text-violet-400' :
                          'text-slate-400'
                        }`}>
                          {member.isOwner ? 'Người tạo' : member.role === 'admin' ? 'Quản trị viên' : member.role === 'moderator' ? 'Điều hành viên' : 'Thành viên'}
                        </p>
                      </div>
                    </div>
                    {isAdmin && member.id !== user?.uid && !member.isOwner && (
                      <div className="flex gap-2 flex-wrap justify-end">
                        {member.role === 'member' && (
                          <>
                            <button onClick={() => handleMemberAction(member.id, 'make_moderator')} className="text-xs bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-900/20 dark:hover:bg-violet-900/40 dark:text-violet-300 px-3 py-1.5 rounded-lg font-semibold">+ ĐHV</button>
                            <button onClick={() => handleMemberAction(member.id, 'make_admin')} className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg font-semibold">+ QTV</button>
                          </>
                        )}
                        {member.role === 'moderator' && (
                          <>
                            <button onClick={() => handleMemberAction(member.id, 'remove_moderator')} className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg font-semibold">Gỡ ĐHV</button>
                            <button onClick={() => handleMemberAction(member.id, 'make_admin')} className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg font-semibold">+ QTV</button>
                          </>
                        )}
                        {member.role === 'admin' && (
                          <button onClick={() => handleMemberAction(member.id, 'remove_admin')} className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg font-semibold">Gỡ QTV</button>
                        )}
                        <button onClick={() => handleMemberAction(member.id, 'remove')} className="text-xs bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg font-semibold">Đuổi</button>
                      </div>
                    )}
                 </div>
               ))}
             </div>
          </div>
        )}

        {activeTab === 'requests' && isAdmin && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
             <h3 className="text-lg font-bold mb-4">Yêu cầu tham gia chờ duyệt ({requests.length})</h3>
             {requests.length === 0 ? (
               <p className="text-slate-500">Không có yêu cầu nào.</p>
             ) : (
               <div className="space-y-3">
                 {requests.map(req => (
                   <div key={req.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                     <div className="flex items-center gap-3">
                        {req.user?.photoURL ? (
                          <img src={req.user.photoURL} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold">U</div>
                        )}
                        <p className="font-bold text-slate-900 dark:text-slate-100">{req.user?.displayName || 'Người dùng ẩn'}</p>
                     </div>
                     <div className="flex gap-2">
                       <button onClick={() => handleProcessRequest(req.userId, 'approve')} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold text-sm">Phê duyệt</button>
                       <button onClick={() => handleProcessRequest(req.userId, 'reject')} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-sm">Từ chối</button>
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}
      </div>

      {showInviteModal && (
         <div className="fixed inset-0 z-50 flex justify-center items-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-xl overflow-hidden scale-100">
             <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h3 className="text-lg font-bold">Mời bạn bè</h3>
                <button onClick={() => setShowInviteModal(false)} className="text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 p-2 rounded-full">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
             </div>
             <div className="p-4 max-h-[60vh] overflow-y-auto">
                {friends.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">Bạn chưa có bạn bè nào.</p>
                ) : (
                  <div className="space-y-2">
                    {friends.map(f => (
                      <label key={f.id} className="flex flex-row items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer rounded-xl">
                        <input type="checkbox" className="w-5 h-5 rounded text-cyan-600 focus:ring-cyan-500 border-gray-300" 
                               checked={selectedFriends.includes(f.id)} 
                               onChange={(e) => {
                                 if (e.target.checked) setSelectedFriends([...selectedFriends, f.id]);
                                 else setSelectedFriends(selectedFriends.filter(id => id !== f.id));
                               }} />
                        {f.avatarUrl ? (
                          <img src={f.avatarUrl} className="w-10 h-10 rounded-full object-cover bg-slate-200 flex-shrink-0" alt="" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold flex-shrink-0">{f.name?.[0]}</div>
                        )}
                        <span className="font-bold flex-1">{f.name}</span>
                      </label>
                    ))}
                  </div>
                )}
             </div>
             <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-between gap-3 items-center">
                <button onClick={handleCopyLink} className="text-sm font-bold text-cyan-600 hover:text-cyan-700 bg-cyan-50 dark:bg-cyan-900/30 px-3 py-2 rounded-xl transition">
                  <span className="mr-1">🔗</span> Sao chép link
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setShowInviteModal(false)} className="px-4 py-2 font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">Hủy</button>
                  <button onClick={handleSendInvites} disabled={selectedFriends.length === 0 || inviting} className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl disabled:opacity-50 transition">
                    {inviting ? 'Đang gửi...' : `Gửi lời mời (${selectedFriends.length})`}
                  </button>
                </div>
             </div>
           </div>
         </div>
      )}

      {alertMessage && (
        <div className="fixed inset-0 z-[100] flex justify-center items-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-6 relative">
             <div className="flex items-center gap-4 mb-4">
               {alertMessage.type === 'error' && <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-500 text-2xl">⚠️</div>}
               {alertMessage.type === 'success' && <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500 text-2xl">✅</div>}
               {alertMessage.type === 'info' && <div className="w-12 h-12 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-500 text-2xl">ℹ️</div>}
               <div>
                  <h3 className="font-bold text-lg text-slate-800 dark:text-white">
                    {alertMessage.title || (alertMessage.type === 'error' ? 'Lỗi' : alertMessage.type === 'success' ? 'Thành công' : 'Thông báo')}
                  </h3>
               </div>
             </div>
             <p className="text-slate-600 dark:text-slate-400 mb-6">{alertMessage.message}</p>
             <button onClick={() => setAlertMessage(null)} className="w-full bg-slate-800 dark:bg-white text-white dark:text-slate-900 font-bold py-3 rounded-xl hover:bg-slate-700 transition active:scale-95">Đóng</button>
           </div>
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-[100] flex justify-center items-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-6 relative">
             <div className="flex items-center gap-4 mb-4">
               <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-500 text-2xl">❓</div>
               <div>
                  <h3 className="font-bold text-lg text-slate-800 dark:text-white">Xác nhận</h3>
               </div>
             </div>
             <p className="text-slate-600 dark:text-slate-400 mb-6">{confirmDialog.message}</p>
             <div className="flex gap-3">
               <button onClick={() => setConfirmDialog(null)} className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold py-3 rounded-xl hover:bg-slate-200 transition active:scale-95">Hủy</button>
               <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="flex-1 bg-cyan-600 text-white font-bold py-3 rounded-xl hover:bg-cyan-700 transition active:scale-95">Đồng ý</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
