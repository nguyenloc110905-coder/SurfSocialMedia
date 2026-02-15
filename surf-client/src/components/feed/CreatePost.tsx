import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api';
import TagFriendsModal from './TagFriendsModal';

interface ImagePreview {
  id: string;
  url: string;
  file: File;
}

interface TaggedFriend {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

export default function CreatePost() {
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'only-me' | 'custom'>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [feeling, setFeeling] = useState('');
  const [location, setLocation] = useState('');
  const [showFeelingPicker, setShowFeelingPicker] = useState(false);
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [showPrivacyDropdown, setShowPrivacyDropdown] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [taggedFriends, setTaggedFriends] = useState<TaggedFriend[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const privacyDropdownRef = useRef<HTMLDivElement>(null);

  const privacyOptions = [
    { value: 'public', icon: '🌐', label: 'Công khai', desc: 'Ai cũng có thể xem' },
    { value: 'friends', icon: '👥', label: 'Bạn bè', desc: 'Chỉ bạn bè của bạn' },
    { value: 'only-me', icon: '🔒', label: 'Chỉ mình tôi', desc: 'Chỉ bạn có thể xem' },
    { value: 'custom', icon: '⚙️', label: 'Tùy chỉnh', desc: 'Chọn đối tượng cụ thể' },
  ];

  const feelings = [
    { emoji: '😊', label: 'Vui vẻ' },
    { emoji: '😍', label: 'Yêu thích' },
    { emoji: '😎', label: 'Ngầu' },
    { emoji: '😢', label: 'Buồn' },
    { emoji: '😡', label: 'Giận dữ' },
    { emoji: '🥳', label: 'Hào hứng' },
    { emoji: '😴', label: 'Mệt mỏi' },
    { emoji: '🤔', label: 'Suy nghĩ' },
  ];

  // Load tagged friends info when selectedFriendIds changes
  useEffect(() => {
    const loadTaggedFriendsInfo = async () => {
      if (selectedFriendIds.length === 0) {
        setTaggedFriends([]);
        return;
      }
      
      try {
        const response = await api.get<{ friends: any[] }>('/api/friends');
        // Map API response: {id, name, avatarUrl} -> {uid, displayName, photoURL}
        const friends = (response.friends || []).map(f => ({
          uid: f.id,
          displayName: f.name,
          photoURL: f.avatarUrl
        }));
        const tagged = friends.filter(f => selectedFriendIds.includes(f.uid));
        setTaggedFriends(tagged);
      } catch (error) {
        console.error('Failed to load tagged friends info:', error);
      }
    };
    
    loadTaggedFriendsInfo();
  }, [selectedFriendIds]);

  // Close privacy dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showPrivacyDropdown && privacyDropdownRef.current && !privacyDropdownRef.current.contains(e.target as Node)) {
        setShowPrivacyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPrivacyDropdown]);

  // Close form with Escape key if empty
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded && !content.trim() && images.length === 0) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded, content, images.length]);

  const toggleFriend = (friendUid: string) => {
    setSelectedFriendIds(prev => 
      prev.includes(friendUid) 
        ? prev.filter(id => id !== friendUid)
        : [...prev, friendUid]
    );
  };

  const removeTaggedFriend = (friendUid: string) => {
    setSelectedFriendIds(prev => prev.filter(id => id !== friendUid));
  };

  const compressImage = (file: File, maxWidth: number = 1920, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize if image is too large
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to base64 with compression
          const base64 = canvas.toDataURL('image/jpeg', quality);
          resolve(base64);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!content.trim() && images.length === 0) || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Compress and convert images to base64
      const mediaUrls = await Promise.all(
        images.map(img => compressImage(img.file))
      );
      
      // Prepare tagged friends data
      const taggedFriendsData = taggedFriends.map(f => ({
        uid: f.uid,
        displayName: f.displayName,
        photoURL: f.photoURL
      }));

      await api.post('/api/posts', { 
        content: content.trim(),
        mediaUrls,
        feeling: feeling || null,
        location: location || null,
        taggedFriends: taggedFriendsData,
        privacy: privacy
      });
      
      // Reset form
      setContent('');
      setImages([]);
      setFeeling('');
      setLocation('');
      setTaggedFriends([]);
      setSelectedFriendIds([]);
      setPrivacy('public');
      setIsExpanded(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      window.location.reload();
    } catch (error) {
      console.error('Failed to create post:', error);
      alert('Không thể đăng bài. Vui lòng thử lại!');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleFocus = () => {
    setIsExpanded(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newImages: ImagePreview[] = files.map(file => ({
      id: Math.random().toString(36),
      url: URL.createObjectURL(file),
      file
    }));
    setImages(prev => [...prev, ...newImages]);
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const removed = prev.find(img => img.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter(img => img.id !== id);
    });
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-cyan-50 via-blue-50 to-purple-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 rounded-3xl mb-4 transition-all duration-700 ease-out border-2 ${
      isExpanded 
        ? 'shadow-2xl shadow-cyan-500/30 dark:shadow-cyan-500/10 border-cyan-300 dark:border-slate-700' 
        : 'shadow-xl shadow-blue-500/20 dark:shadow-xl hover:shadow-2xl hover:shadow-cyan-500/30 dark:hover:shadow-2xl cursor-pointer border-blue-200 dark:border-slate-700/50 hover:border-cyan-300 dark:hover:border-slate-600'
    }`}>
      {/* Ocean Wave Background Effect */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${
        isExpanded ? 'opacity-20 dark:opacity-20' : 'opacity-10 dark:opacity-10'
      }`}>
        <svg className="w-full h-full" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" opacity=".25" className={`fill-cyan-500 ${
            isExpanded ? 'animate-wave-slow' : ''
          }`} style={{ transformOrigin: 'center' }}></path>
          <path d="M0,0V15.81C13,36.92,27.64,56.86,47.69,72.05,99.41,111.27,165,111,224.58,91.58c31.15-10.15,60.09-26.07,89.67-39.8,40.92-19,84.73-46,130.83-49.67,36.26-2.85,70.9,9.42,98.6,31.56,31.77,25.39,62.32,62,103.63,73,40.44,10.79,81.35-6.69,119.13-24.28s75.16-39,116.92-43.05c59.73-5.85,113.28,22.88,168.9,38.84,30.2,8.66,59,6.17,87.09-7.5,22.43-10.89,48-26.93,60.65-49.24V0Z" opacity=".5" className={`fill-blue-500 ${
            isExpanded ? 'animate-wave-medium' : ''
          }`} style={{ transformOrigin: 'center' }}></path>
          <path d="M0,0V5.63C149.93,59,314.09,71.32,475.83,42.57c43-7.64,84.23-20.12,127.61-26.46,59-8.63,112.48,12.24,165.56,35.4C827.93,77.22,886,95.24,951.2,90c86.53-7,172.46-45.71,248.8-84.81V0Z" className={`fill-cyan-400 ${
            isExpanded ? 'animate-wave-fast' : ''
          }`} style={{ transformOrigin: 'center' }}></path>
        </svg>
      </div>

      {/* Gradient Border Effect */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 opacity-5 dark:opacity-20 blur-xl"></div>
      
      {/* Collapsed State - Simple Placeholder */}
      {!isExpanded && (
        <div 
          onClick={() => {
            setIsExpanded(true);
            // Focus textarea after a short delay to ensure it's rendered
            setTimeout(() => textareaRef.current?.focus(), 100);
          }}
          className="relative z-10 p-6 cursor-pointer"
        >
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full blur-md group-hover:blur-lg transition-all opacity-50"></div>
              {user?.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt={user?.displayName || 'User'} 
                  className="relative w-12 h-12 rounded-full ring-2 ring-white dark:ring-slate-800 shadow-lg object-cover"
                />
              ) : (
                <div className="relative w-12 h-12 rounded-full ring-2 ring-white dark:ring-slate-800 shadow-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <span className="text-lg font-bold text-white drop-shadow-md">
                    {(() => {
                      const name = user?.displayName || user?.email || 'S';
                      const words = name.split(' ');
                      if (words.length >= 2) {
                        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
                      }
                      return name.substring(0, 1).toUpperCase();
                    })()}
                  </span>
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full ring-2 ring-white dark:ring-slate-800"></div>
            </div>
            
            <div className="group flex-1 bg-white/90 dark:bg-slate-900/50 backdrop-blur-sm rounded-full px-5 py-3.5 text-gray-500 dark:text-gray-500 hover:bg-gradient-to-r hover:from-cyan-100 hover:to-blue-100 dark:hover:from-slate-800 dark:hover:to-slate-800 transition-all duration-500 ease-out hover:shadow-lg shadow-md border-2 border-blue-100 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-slate-600 flex items-center justify-between">
              <span className="group-hover:text-cyan-700 dark:group-hover:text-gray-300 transition-colors duration-300 font-medium">
                🌊 Chia sẻ làn sóng cảm xúc của bạn...
              </span>
              <svg className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all duration-500 ease-out text-cyan-600 dark:text-cyan-500 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Expanded State - Full Form */}
      {isExpanded && (
        <form onSubmit={handleSubmit} className="relative z-10 p-6 animate-smooth-slide-down">
          {/* Close Button */}
          <button
            type="button"
            onClick={() => {
              if (!content.trim() && images.length === 0) {
                setIsExpanded(false);
              }
            }}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700/50 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            title="Đóng"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header with Floating Avatar */}
          <div className="flex items-start gap-4 mb-4 animate-fade-in-header">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full blur-md group-hover:blur-lg transition-all opacity-50"></div>
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user?.displayName || 'User'} 
                className="relative w-12 h-12 rounded-full ring-2 ring-white dark:ring-slate-800 shadow-lg object-cover"
              />
            ) : (
              <div className="relative w-12 h-12 rounded-full ring-2 ring-white dark:ring-slate-800 shadow-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <span className="text-lg font-bold text-white drop-shadow-md">
                  {(() => {
                    const name = user?.displayName || user?.email || 'S';
                    const words = name.split(' ');
                    if (words.length >= 2) {
                      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
                    }
                    return name.substring(0, 1).toUpperCase();
                  })()}
                </span>
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full ring-2 ring-white dark:ring-slate-800"></div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm leading-relaxed mb-2">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{user?.displayName || 'User'}</span>
              {feeling && (
                <span className="text-gray-600 dark:text-gray-300"> đang cảm thấy <span className="font-medium">{feeling}</span></span>
              )}
              {taggedFriends.length > 0 && (
                <span className="text-gray-600 dark:text-gray-300"> cùng với{' '}
                  {taggedFriends.map((friend, idx) => (
                    <span key={friend.uid}>
                      <button
                        type="button"
                        onClick={() => removeTaggedFriend(friend.uid)}
                        className="font-medium text-cyan-600 dark:text-cyan-400 hover:underline"
                      >
                        {friend.displayName}
                      </button>
                      {idx < taggedFriends.length - 1 && ', '}
                    </span>
                  ))}
                </span>
              )}
              {location && (
                <span className="text-gray-600 dark:text-gray-300"> tại <span className="font-medium">📍 {location}</span></span>
              )}
            </div>
            
            {/* Privacy Selector - Surf Style */}
            <div className="relative inline-block" ref={privacyDropdownRef}>
              <button
                type="button"
                onClick={() => setShowPrivacyDropdown(!showPrivacyDropdown)}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all duration-300 ${
                  showPrivacyDropdown 
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30'
                    : 'bg-white dark:bg-slate-700/30 backdrop-blur-sm text-gray-800 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700/50 border-2 border-gray-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700'
                }`}
              >
                {privacy === 'public' && (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
                  </svg>
                )}
                {privacy === 'friends' && (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                  </svg>
                )}
                {privacy === 'only-me' && (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                )}
                {privacy === 'custom' && (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="text-xs font-semibold">{privacyOptions.find(opt => opt.value === privacy)?.label}</span>
                <svg className={`w-3 h-3 transition-transform duration-300 ${showPrivacyDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Privacy Dropdown - Grid Layout */}
              {showPrivacyDropdown && (
                <div className="absolute top-full mt-2 left-0 w-72 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-blue-500/20 border-2 border-blue-200 dark:border-slate-700/50 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-2 gap-2">
                    {privacyOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setPrivacy(option.value as any);
                          setShowPrivacyDropdown(false);
                        }}
                        className={`relative flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-300 ${
                          privacy === option.value
                            ? 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30 scale-105'
                            : 'bg-gray-50 dark:bg-slate-700/50 text-gray-800 dark:text-gray-300 hover:bg-gradient-to-br hover:from-cyan-50 hover:to-blue-50 dark:hover:bg-slate-700 hover:scale-105 border-2 border-gray-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700'
                        }`}
                      >
                        {/* Icon */}
                        {option.value === 'public' && (
                          <svg className="w-7 h-7 mb-1.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
                          </svg>
                        )}
                        {option.value === 'friends' && (
                          <svg className="w-7 h-7 mb-1.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                          </svg>
                        )}
                        {option.value === 'only-me' && (
                          <svg className="w-7 h-7 mb-1.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        {option.value === 'custom' && (
                          <svg className="w-7 h-7 mb-1.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                          </svg>
                        )}
                        
                        {/* Label */}
                        <p className="text-xs font-bold mb-0.5">{option.label}</p>
                        
                        {/* Description */}
                        <p className={`text-[9px] leading-tight text-center ${
                          privacy === option.value ? 'text-white/90' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {option.desc}
                        </p>
                        
                        {/* Active indicator */}
                        {privacy === option.value && (
                          <div className="absolute top-1.5 right-1.5">
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Textarea with Ocean Theme */}
        <div className="relative mb-4 animate-fade-in-1">
          <div className={`absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 dark:from-cyan-500/5 dark:to-blue-500/5 rounded-2xl transition-all duration-300 ${
            isExpanded ? 'opacity-100' : 'opacity-0'
          }`}></div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextareaChange}
            onFocus={handleFocus}
            placeholder={`🌊 Chia sẻ làn sóng cảm xúc của bạn...`}
            className="relative w-full bg-gray-50/50 dark:bg-slate-900/30 backdrop-blur-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none transition-all min-h-[100px] max-h-[300px] rounded-2xl px-4 py-3 border-2 border-transparent focus:border-cyan-500/30 dark:focus:border-cyan-500/20"
            rows={3}
          />
        </div>

        {/* Image Preview Grid */}
        {images.length > 0 && (
          <div className={`relative mb-3 p-2.5 rounded-xl bg-gray-50 dark:bg-slate-900/30 border-2 border-dashed border-gray-300 dark:border-slate-600/50 animate-smooth-fade-in-delayed ${
            images.length === 1 ? '' : 'grid grid-cols-2 gap-2'
          }`}>
            {images.map(img => (
              <div key={img.id} className="relative group">
                <img 
                  src={img.url} 
                  alt="Preview" 
                  className="w-full h-40 object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute top-2 right-2 w-8 h-8 bg-gray-900/80 dark:bg-slate-900/90 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="absolute bottom-2 left-2 px-3 py-1 bg-gray-900/80 dark:bg-slate-900/90 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✏️ Chỉnh sửa
                </button>
              </div>
            ))}
            
            {/* Add more button */}
            <button
              type="button"
              onClick={triggerFileInput}
              className="h-40 border-2 border-dashed border-gray-300 dark:border-slate-600/50 rounded-lg flex flex-col items-center justify-center text-gray-400 dark:text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 hover:border-cyan-500/50 transition-all"
            >
              <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-sm">Thêm ảnh</span>
            </button>
          </div>
        )}

        {/* Feeling Picker */}
        {showFeelingPicker && (
          <div className="mb-3 p-2.5 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-200 dark:border-slate-700/50 animate-smooth-fade-in-delayed">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Bạn đang cảm thấy thế nào?</h4>
              <button
                type="button"
                onClick={() => setShowFeelingPicker(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {feelings.map(f => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => {
                    setFeeling(`${f.emoji} ${f.label}`);
                    setShowFeelingPicker(false);
                  }}
                  className="px-3 py-2 bg-gray-100 dark:bg-slate-800/50 hover:bg-gray-200 dark:hover:bg-slate-700/50 rounded-lg text-left transition-colors"
                >
                  <div className="text-2xl mb-1">{f.emoji}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">{f.label}</div>
                </button>
              ))}
              {/* Clear feeling option */}
              {feeling && (
                <button
                  type="button"
                  onClick={() => {
                    setFeeling('');
                    setShowFeelingPicker(false);
                  }}
                  className="px-3 py-2 bg-red-900/20 hover:bg-red-900/40 border border-red-500/30 rounded-lg text-left transition-colors"
                >
                  <div className="text-2xl mb-1">🚫</div>
                  <div className="text-xs text-red-400">Xóa</div>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Location Input */}
        {showLocationInput && (
          <div className="mb-3 animate-smooth-fade-in-delayed">
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-200 dark:border-slate-700/50">
              <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Bạn đang ở đâu?"
                className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setShowLocationInput(false);
                  setLocation('');
                }}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Modern Action Pills */}
        <div className="flex items-center gap-2 flex-wrap mb-4 animate-fade-in-3">
              {/* Image Pill */}
              <button
                type="button"
                onClick={triggerFileInput}
                className={`group flex items-center gap-2 px-3 py-2 rounded-full transition-all hover:scale-105 ${
                  images.length > 0 
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30' 
                    : 'bg-white dark:bg-slate-700/50 text-gray-800 dark:text-gray-300 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 dark:hover:bg-slate-700 border-2 border-gray-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700'
                }`}
                title="Ảnh/Video"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-semibold">Ảnh</span>
              </button>
              
              {/* Tag Pill */}
              <button
                type="button"
                onClick={() => {
                  setShowTagModal(true);
                  setShowFeelingPicker(false);
                  setShowLocationInput(false);
                }}
                className={`group flex items-center gap-2 px-3 py-2 rounded-full transition-all hover:scale-105 ${
                  taggedFriends.length > 0
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-white dark:bg-slate-700/50 text-gray-800 dark:text-gray-300 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 dark:hover:bg-slate-700 border-2 border-gray-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700'
                }`}
                title="Tag người khác"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-xs font-semibold">Tag</span>
              </button>

              {/* Feeling Pill */}
              <button
                type="button"
                onClick={() => {
                  setShowFeelingPicker(!showFeelingPicker);
                  setShowLocationInput(false);
                }}
                className={`group flex items-center gap-2 px-3 py-2 rounded-full transition-all hover:scale-105 ${
                  feeling 
                    ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg shadow-yellow-500/30' 
                    : 'bg-white dark:bg-slate-700/50 text-gray-800 dark:text-gray-300 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 dark:hover:bg-slate-700 border-2 border-gray-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700'
                }`}
                title="Cảm xúc/Hoạt động"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zm3.5-9c.828 0 1.5-.672 1.5-1.5S16.328 8 15.5 8 14 8.672 14 9.5s.672 1.5 1.5 1.5zm-7 0c.828 0 1.5-.672 1.5-1.5S9.328 8 8.5 8 7 8.672 7 9.5 7.672 11 8.5 11zm3.5 6c2.28 0 4.22-1.66 5-4H7c.78 2.34 2.72 4 5 4z"/>
                </svg>
                <span className="text-xs font-semibold">Cảm xúc</span>
              </button>

              {/* Location Pill */}
              <button
                type="button"
                onClick={() => {
                  setShowLocationInput(!showLocationInput);
                  setShowFeelingPicker(false);
                }}
                className={`group flex items-center gap-2 px-3 py-2 rounded-full transition-all hover:scale-105 ${
                  location 
                    ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg shadow-red-500/30' 
                    : 'bg-white dark:bg-slate-700/50 text-gray-800 dark:text-gray-300 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 dark:hover:bg-slate-700 border-2 border-gray-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700'
                }`}
                title="Check in"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                <span className="text-xs font-semibold">Vị trí</span>
              </button>

              {/* GIF Pill */}
              <button
                type="button"
                className="group flex items-center gap-2 px-3 py-2 rounded-full bg-white dark:bg-slate-700/50 text-gray-800 dark:text-gray-300 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 dark:hover:bg-slate-700 border-2 border-gray-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700 transition-all hover:scale-105"
                title="GIF"
              >
                <span className="text-xs font-bold">GIF</span>
              </button>
        </div>

        {/* Wave-Styled Submit Button */}
        <button
          type="submit"
          disabled={(!content.trim() && images.length === 0) || isSubmitting}
          className={`relative w-full py-3.5 rounded-2xl font-bold text-sm transition-all duration-300 overflow-hidden group animate-fade-in-2 ${
            (!content.trim() && images.length === 0) || isSubmitting
              ? 'bg-gray-200 dark:bg-slate-700/50 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 text-white hover:shadow-2xl hover:shadow-cyan-500/30 hover:scale-[1.02]'
          }`}
        >
          {/* Animated Wave Effect */}
          {!isSubmitting && content.trim() && (
            <div className="absolute inset-0 opacity-50">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
            </div>
          )}
          <span className="relative z-10 flex items-center justify-center gap-2">
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Đang đăng sóng...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Tạo làn sóng</span>
              </>
            )}
          </span>
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageSelect}
          className="hidden"
        />
        </form>
      )}

      {/* Tag Friends Modal */}
      <TagFriendsModal
        isOpen={showTagModal}
        onClose={() => setShowTagModal(false)}
        selectedFriends={selectedFriendIds}
        onToggleFriend={toggleFriend}
      />
    </div>
  );
}
