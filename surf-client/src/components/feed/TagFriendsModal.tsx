import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface Friend {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

interface TagFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFriends: string[];
  onToggleFriend: (friendUid: string) => void;
}

export default function TagFriendsModal({ 
  isOpen, 
  onClose, 
  selectedFriends,
  onToggleFriend 
}: TagFriendsModalProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadFriends();
    }
  }, [isOpen]);

  const loadFriends = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ friends: any[] }>('/api/friends');
      // Map API response: {id, name, avatarUrl} -> {uid, displayName, photoURL}
      const mappedFriends = (response.friends || []).map(f => ({
        uid: f.id,
        displayName: f.name,
        photoURL: f.avatarUrl
      }));
      setFriends(mappedFriends);
      console.log('Loaded friends:', mappedFriends);
    } catch (error) {
      console.error('Failed to load friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredFriends = friends.filter(friend =>
    friend.displayName && 
    friend.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[600px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Gắn thẻ bạn bè</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm bạn bè..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-slate-700/50 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
        </div>

        {/* Friends List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery ? 'Không tìm thấy bạn bè' : 'Chưa có bạn bè'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFriends.map((friend) => (
                <label
                  key={friend.uid}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedFriends.includes(friend.uid)}
                    onChange={() => onToggleFriend(friend.uid)}
                    className="w-5 h-5 rounded border-gray-300 dark:border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                  />
                  {friend.photoURL ? (
                    <img
                      src={friend.photoURL}
                      alt={friend.displayName || 'Friend'}
                      className="w-10 h-10 rounded-full ring-2 ring-gray-200 dark:ring-slate-700 object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full ring-2 ring-gray-200 dark:ring-slate-700 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                      <span className="text-sm font-bold text-white">
                        {(() => {
                          const name = friend.displayName || 'S';
                          const words = name.split(' ');
                          if (words.length >= 2) {
                            return (words[0][0] + words[words.length - 1][0]).toUpperCase();
                          }
                          return name.substring(0, 1).toUpperCase();
                        })()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {friend.displayName || 'Unknown'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-slate-700 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg font-medium bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg font-medium bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white transition-all"
          >
            Xong ({selectedFriends.length})
          </button>
        </div>
      </div>
    </div>
  );
}
