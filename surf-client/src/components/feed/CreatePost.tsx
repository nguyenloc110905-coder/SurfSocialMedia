import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api';
import { uploadImage, uploadVideo } from '../../lib/cloudinary';
import { optimizeImageUrl } from '../../lib/image-cdn';
import { resizePostImage } from '../../lib/utils/image';
import TagFriendsModal from './TagFriendsModal';

interface ImagePreview {
  id: string;
  url: string;
  file: File;
}

interface VideoPreview {
  id: string;
  url: string;
  file: File;
  name: string;
}

interface TaggedFriend {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

interface CreatePostProps {
  onPostCreated?: (post: Record<string, unknown>) => void;
  groupId?: string;
}

type PostPrivacy = 'public' | 'friends' | 'only-me' | 'custom';

type NominatimAddress = Record<string, string>;

function formatLocationLabel({
  name,
  address,
  displayName,
}: {
  name?: string;
  address?: NominatimAddress;
  displayName?: string;
}): string {
  const addr = address ?? {};
  const baseName =
    name || addr['amenity'] || addr['tourism'] || addr['leisure'] || addr['historic'] || '';
  const district =
    addr['suburb'] || addr['city_district'] || addr['district'] || addr['county'] || '';
  const city = addr['city'] || addr['town'] || addr['state'] || '';

  if (baseName && (district || city)) {
    const parts = [baseName, district, city].filter(Boolean);
    const unique = parts.filter((value, index, arr) => arr.indexOf(value) === index);
    return unique.join(', ');
  }

  if (baseName) {
    return baseName;
  }

  return (displayName ?? '').split(', ').slice(0, 3).join(', ');
}

const getCurrentPosition = (): Promise<GeolocationPosition> =>
  new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });

function toPostPrivacy(value: unknown): PostPrivacy {
  if (value === 'public' || value === 'friends' || value === 'only-me' || value === 'custom') {
    return value;
  }
  return 'public';
}

export default function CreatePost({ onPostCreated, groupId }: CreatePostProps) {
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [privacy, setPrivacy] = useState<PostPrivacy>('public');
  const [defaultPrivacy, setDefaultPrivacy] = useState<PostPrivacy>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [videos, setVideos] = useState<VideoPreview[]>([]);
  const [feeling, setFeeling] = useState('');
  const [location, setLocation] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationGeoLoading, setLocationGeoLoading] = useState(false);
  const [locationGeoError, setLocationGeoError] = useState<string | null>(null);
  const locationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showFeelingPicker, setShowFeelingPicker] = useState(false);
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [showPrivacyDropdown, setShowPrivacyDropdown] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [taggedFriends, setTaggedFriends] = useState<TaggedFriend[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showPollInput, setShowPollInput] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const privacyDropdownRef = useRef<HTMLDivElement>(null);
  const hasManualPrivacySelectionRef = useRef(false);

  const privacyOptions: Array<{ value: PostPrivacy; icon: string; label: string; desc: string }> = [
    { value: 'public', icon: '🌐', label: 'Công khai', desc: 'Ai cũng có thể xem' },
    { value: 'friends', icon: '👥', label: 'Bạn bè', desc: 'Chỉ bạn bè của bạn' },
    { value: 'only-me', icon: '🔒', label: 'Chỉ mình tôi', desc: 'Chỉ bạn có thể xem' },
    { value: 'custom', icon: '⚙️', label: 'Tùy chỉnh', desc: 'Chọn đối tượng cụ thể' },
  ];

  useEffect(() => {
    let cancelled = false;

    const loadDefaultPrivacy = async () => {
      if (!user?.uid) {
        setDefaultPrivacy('public');
        setPrivacy('public');
        hasManualPrivacySelectionRef.current = false;
        return;
      }

      try {
        const me = await api.get<{ defaultPostPrivacy?: string }>('/api/users/me');
        if (cancelled) return;
        const parsedDefault = toPostPrivacy(me.defaultPostPrivacy);
        setDefaultPrivacy(parsedDefault);
        if (!hasManualPrivacySelectionRef.current) {
          setPrivacy(parsedDefault);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load default post privacy:', error);
        setDefaultPrivacy('public');
        if (!hasManualPrivacySelectionRef.current) {
          setPrivacy('public');
        }
      }
    };

    loadDefaultPrivacy();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

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
        const response = await api.get<{
          friends: { id: string; name: string; avatarUrl: string | null }[];
        }>('/api/friends');
        // Map API response: {id, name, avatarUrl} -> {uid, displayName, photoURL}
        const friends = (response.friends || []).map((f) => ({
          uid: f.id,
          displayName: f.name,
          photoURL: f.avatarUrl,
        }));
        const tagged = friends.filter((f) => selectedFriendIds.includes(f.uid));
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
      if (
        showPrivacyDropdown &&
        privacyDropdownRef.current &&
        !privacyDropdownRef.current.contains(e.target as Node)
      ) {
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

  const searchLocation = useCallback((query: string) => {
    if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);
    if (!query.trim() || query.length < 2) {
      setLocationSuggestions([]);
      return;
    }
    locationDebounceRef.current = setTimeout(async () => {
      setLocationLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=1&extratags=1`,
          { headers: { 'Accept-Language': 'vi,en' } }
        );
        type NominatimResult = {
          display_name: string;
          name?: string;
          class: string;
          type: string;
          address?: Record<string, string>;
        };
        const data = (await res.json()) as NominatimResult[];

        // Ưu tiên POI / địa danh lên đầu
        const POI_CLASSES = ['tourism', 'amenity', 'leisure', 'historic', 'shop', 'sport', 'natural', 'man_made'];
        const sorted = [
          ...data.filter((d) => POI_CLASSES.includes(d.class)),
          ...data.filter((d) => !POI_CLASSES.includes(d.class)),
        ].slice(0, 6);

        // Format tên gọn: "Tên địa danh, Quận/Huyện, Tỉnh/TP"
        const formatted = sorted.map((d) => {
          return formatLocationLabel({
            name: d.name,
            address: d.address,
            displayName: d.display_name,
          });
        });

        // Loại trùng
        setLocationSuggestions([...new Set(formatted)]);
      } catch {
        setLocationSuggestions([]);
      } finally {
        setLocationLoading(false);
      }
    }, 400);
  }, []);

  const handleLocationQueryChange = (value: string) => {
    setLocationGeoError(null);
    setLocationQuery(value);
    setLocation(value);
    searchLocation(value);
  };

  const selectLocationSuggestion = (suggestion: string) => {
    setLocationGeoError(null);
    setLocation(suggestion);
    setLocationQuery(suggestion);
    setLocationSuggestions([]);
  };

  const useCurrentLocation = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationGeoError('Trình duyệt không hỗ trợ định vị. Hãy nhập vị trí thủ công.');
      return;
    }

    setLocationGeoLoading(true);
    setLocationGeoError(null);
    setLocationSuggestions([]);

    try {
      const position = await getCurrentPosition();
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      const reverseUrl =
        `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat.toString())}` +
        `&lon=${encodeURIComponent(lon.toString())}&format=jsonv2&addressdetails=1`;

      const res = await fetch(reverseUrl, {
        headers: { 'Accept-Language': 'vi,en' },
      });

      type ReverseResult = {
        display_name?: string;
        name?: string;
        address?: NominatimAddress;
      };

      if (!res.ok) {
        throw new Error('reverse_geocode_failed');
      }

      const data = (await res.json()) as ReverseResult;
      const formatted = formatLocationLabel({
        name: data.name,
        address: data.address,
        displayName: data.display_name,
      });
      const fallback = `Lat ${lat.toFixed(5)}, Lon ${lon.toFixed(5)}`;
      const resolved = formatted || fallback;

      setLocation(resolved);
      setLocationQuery(resolved);
    } catch (error) {
      const geoError = error as GeolocationPositionError | Error;
      if ('code' in geoError) {
        if (geoError.code === 1) {
          setLocationGeoError('Bạn đã từ chối quyền định vị. Hãy nhập vị trí thủ công.');
          return;
        }
        if (geoError.code === 2) {
          setLocationGeoError('Không thể xác định vị trí hiện tại. Hãy thử lại hoặc nhập thủ công.');
          return;
        }
        if (geoError.code === 3) {
          setLocationGeoError('Hết thời gian lấy vị trí. Hãy thử lại hoặc nhập thủ công.');
          return;
        }
      }

      setLocationGeoError('Không lấy được vị trí hiện tại. Hãy nhập vị trí thủ công.');
    } finally {
      setLocationGeoLoading(false);
    }
  }, []);

  const toggleFriend = (friendUid: string) => {
    setSelectedFriendIds((prev) =>
      prev.includes(friendUid) ? prev.filter((id) => id !== friendUid) : [...prev, friendUid]
    );
  };

  const removeTaggedFriend = (friendUid: string) => {
    setSelectedFriendIds((prev) => prev.filter((id) => id !== friendUid));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!content.trim() && images.length === 0 && videos.length === 0) || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const imageUrls = await Promise.all(
        images.map((img) => uploadImage(img.file, { folder: 'surf/posts' }))
      );
      const videoUrls = await Promise.all(
        videos.map((v) => uploadVideo(v.file, { folder: 'surf/posts/videos' }))
      );
      // Video luôn đứng trước ảnh để PostCard ưu tiên hiển thị video làm ảnh chính
      const mediaUrls = [...videoUrls, ...imageUrls];

      // Prepare tagged friends data
      const taggedFriendsData = taggedFriends.map((f) => ({
        uid: f.uid,
        displayName: f.displayName,
        photoURL: f.photoURL,
      }));

      const endpoint = groupId ? `/api/groups/${groupId}/posts` : '/api/posts';
      const newPost = await api.post<Record<string, unknown>>(endpoint, {
        content: content.trim(),
        mediaUrls,
        feeling: feeling || null,
        location: location || null,
        taggedFriends: taggedFriendsData,
        privacy: privacy,
        isAnonymous,
        poll: pollOptions.filter(o => o.trim()).length >= 2 ? { options: pollOptions.filter(o => o.trim()) } : null,
      });

      // Reset form
      setContent('');
      setImages([]);
      setVideos([]);
      setFeeling('');
      setLocation('');
      setLocationQuery('');
      setLocationSuggestions([]);
      setLocationGeoError(null);
      setTaggedFriends([]);
      setSelectedFriendIds([]);
      setIsAnonymous(false);
      setPollOptions(['', '']);
      setShowPollInput(false);
      setPrivacy(defaultPrivacy);
      hasManualPrivacySelectionRef.current = false;
      setIsExpanded(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      onPostCreated?.(newPost);
    } catch (error) {
      console.error('Failed to create post:', error);
      const msg = error instanceof Error ? error.message : 'Không thể đăng bài. Vui lòng thử lại!';
      setErrorMsg(msg);
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

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const newImages: ImagePreview[] = await Promise.all(
      files.map(async (file) => {
        const blob = await resizePostImage(file);
        return {
          id: Math.random().toString(36),
          url: URL.createObjectURL(blob),
          file: new File([blob], file.name, { type: 'image/jpeg' }),
        };
      })
    );
    setImages((prev) => [...prev, ...newImages]);
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newVideos: VideoPreview[] = files.map((file) => ({
      id: Math.random().toString(36),
      url: URL.createObjectURL(file),
      file,
      name: file.name,
    }));
    setVideos((prev) => [...prev, ...newVideos]);
    e.target.value = '';
  };

  const removeVideo = (id: string) => {
    setVideos((prev) => {
      const removed = prev.find((v) => v.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((v) => v.id !== id);
    });
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const removed = prev.find((img) => img.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((img) => img.id !== id);
    });
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };
  const triggerVideoInput = () => {
    videoInputRef.current?.click();
  };

  return (
    <div
      className={`relative bg-gradient-to-br from-cyan-50 via-blue-50 to-purple-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 rounded-3xl mb-4 transition-all duration-700 ease-out border-2 ${
        isExpanded
          ? 'shadow-2xl shadow-cyan-500/30 dark:shadow-cyan-500/10 border-cyan-300 dark:border-slate-700'
          : 'shadow-xl shadow-blue-500/20 dark:shadow-xl hover:shadow-2xl hover:shadow-cyan-500/30 dark:hover:shadow-2xl cursor-pointer border-blue-200 dark:border-slate-700/50 hover:border-cyan-300 dark:hover:border-slate-600'
      }`}
    >
      {/* Ocean Wave Background Effect */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${
          isExpanded ? 'opacity-20 dark:opacity-20' : 'opacity-10 dark:opacity-10'
        }`}
      >
        <svg className="w-full h-full" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path
            d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z"
            opacity=".25"
            className={`fill-cyan-500 ${isExpanded ? 'animate-wave-slow' : ''}`}
            style={{ transformOrigin: 'center' }}
          ></path>
          <path
            d="M0,0V15.81C13,36.92,27.64,56.86,47.69,72.05,99.41,111.27,165,111,224.58,91.58c31.15-10.15,60.09-26.07,89.67-39.8,40.92-19,84.73-46,130.83-49.67,36.26-2.85,70.9,9.42,98.6,31.56,31.77,25.39,62.32,62,103.63,73,40.44,10.79,81.35-6.69,119.13-24.28s75.16-39,116.92-43.05c59.73-5.85,113.28,22.88,168.9,38.84,30.2,8.66,59,6.17,87.09-7.5,22.43-10.89,48-26.93,60.65-49.24V0Z"
            opacity=".5"
            className={`fill-blue-500 ${isExpanded ? 'animate-wave-medium' : ''}`}
            style={{ transformOrigin: 'center' }}
          ></path>
          <path
            d="M0,0V5.63C149.93,59,314.09,71.32,475.83,42.57c43-7.64,84.23-20.12,127.61-26.46,59-8.63,112.48,12.24,165.56,35.4C827.93,77.22,886,95.24,951.2,90c86.53-7,172.46-45.71,248.8-84.81V0Z"
            className={`fill-cyan-400 ${isExpanded ? 'animate-wave-fast' : ''}`}
            style={{ transformOrigin: 'center' }}
          ></path>
        </svg>
      </div>

      {/* Gradient Border Effect */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 opacity-5 dark:opacity-20 blur-xl"></div>

      {/* Collapsed State - Facebook Style (Group) */}
      {!isExpanded && groupId && (
        <div className="relative z-10 bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user?.displayName || 'User'}
                  className="w-10 h-10 rounded-full object-cover ring-1 ring-gray-200 dark:ring-slate-700"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">
                    {(() => {
                      const name = user?.displayName || user?.email || 'S';
                      const words = name.split(' ');
                      return words.length >= 2
                        ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
                        : name.substring(0, 1).toUpperCase();
                    })()}
                  </span>
                </div>
              )}
            </div>
            
            <div
              onClick={() => {
                setIsExpanded(true);
                setTimeout(() => textareaRef.current?.focus(), 100);
              }}
              className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700/50 dark:hover:bg-slate-700 cursor-pointer rounded-full px-4 py-2.5 transition-colors"
            >
              <span className="text-gray-500 dark:text-gray-400 text-[15px]">
                Bạn viết gì đi...
              </span>
            </div>
          </div>

          <hr className="my-3 border-gray-200 dark:border-slate-700" />

          <div className="flex items-center justify-evenly">
            {groupId && (
              <button
                onClick={() => {
                  setIsExpanded(true);
                  setIsAnonymous(true);
                  setTimeout(() => textareaRef.current?.focus(), 100);
                }}
                className="flex flex-1 items-center justify-center gap-2 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                  {/* Spy Glasses modifier overlay */}
                  <path d="M7.5 13A2.5 2.5 0 005 15.5c0 .53.18 1.01.48 1.4A5.996 5.996 0 0112 18.2c2.05 0 3.84-.71 5.25-1.91A2.49 2.49 0 0019 15.5a2.5 2.5 0 00-4.9-1L12 14l-2.1.5A2.49 2.49 0 007.5 13z" fill="#0369a1"/>
                </svg>
                <span className="font-semibold text-gray-600 dark:text-gray-300 text-sm">B.viết ẩn danh</span>
              </button>
            )}
            
            <button
              onClick={() => {
                setIsExpanded(true);
                setTimeout(triggerFileInput, 100);
              }}
              className="flex flex-1 items-center justify-center gap-2 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
              <span className="font-semibold text-gray-600 dark:text-gray-300 text-sm">Ảnh/video</span>
            </button>

            <button
              onClick={() => {
                setIsExpanded(true);
                setShowPollInput(true);
              }}
              className="flex flex-1 items-center justify-center gap-2 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
              </svg>
              <span className="font-semibold text-gray-600 dark:text-gray-300 text-sm">Thăm dò ý kiến</span>
            </button>
          </div>
        </div>
      )}

      {/* Collapsed State - Dashboard Style (Main Feed) */}
      {!isExpanded && !groupId && (
        <div
          onClick={() => {
            setIsExpanded(true);
            setTimeout(() => textareaRef.current?.focus(), 100);
          }}
          className="relative z-10 p-6 cursor-pointer"
        >
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full blur-md group-hover:blur-lg transition-all opacity-50"></div>
              {user?.photoURL ? (
                <img
                  src={optimizeImageUrl(user.photoURL)}
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
              <svg
                className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all duration-500 ease-out text-cyan-600 dark:text-cyan-500 group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
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
            onClick={() => setIsExpanded(false)}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700/50 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            title="Đóng"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Header with Floating Avatar */}
          <div className="relative z-50 flex items-start gap-4 mb-4 animate-fade-in-header">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full blur-md group-hover:blur-lg transition-all opacity-50"></div>
              {user?.photoURL ? (
                <img
                  src={optimizeImageUrl(user.photoURL)}
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
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {user?.displayName || 'User'}
                </span>
                {feeling && (
                  <span className="text-gray-600 dark:text-gray-300">
                    {' '}
                    đang cảm thấy <span className="font-medium">{feeling}</span>
                  </span>
                )}
                {taggedFriends.length > 0 && (
                  <span className="text-gray-600 dark:text-gray-300">
                    {' '}
                    cùng với{' '}
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
                  <span className="text-gray-600 dark:text-gray-300">
                    {' '}
                    tại <span className="font-medium">📍 {location}</span>
                  </span>
                )}
              </div>

              {/* Privacy Selector - Surf Style */}
              <div className="relative inline-block z-50" ref={privacyDropdownRef}>
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
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {privacy === 'friends' && (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                    </svg>
                  )}
                  {privacy === 'only-me' && (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {privacy === 'custom' && (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  <span className="text-xs font-semibold">
                    {privacyOptions.find((opt) => opt.value === privacy)?.label}
                  </span>
                  <svg
                    className={`w-3 h-3 transition-transform duration-300 ${showPrivacyDropdown ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M19 9l-7 7-7-7"
                    />
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
                            hasManualPrivacySelectionRef.current = true;
                            setPrivacy(option.value);
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
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                          {option.value === 'friends' && (
                            <svg className="w-7 h-7 mb-1.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                            </svg>
                          )}
                          {option.value === 'only-me' && (
                            <svg className="w-7 h-7 mb-1.5" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                          {option.value === 'custom' && (
                            <svg className="w-7 h-7 mb-1.5" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}

                          {/* Label */}
                          <p className="text-xs font-bold mb-0.5">{option.label}</p>

                          {/* Description */}
                          <p
                            className={`text-[9px] leading-tight text-center ${
                              privacy === option.value
                                ? 'text-white/90'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
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
            <div
              className={`absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 dark:from-cyan-500/5 dark:to-blue-500/5 rounded-2xl transition-all duration-300 ${
                isExpanded ? 'opacity-100' : 'opacity-0'
              }`}
            ></div>
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
            <div
              className={`relative mb-3 p-2.5 rounded-xl bg-gray-50 dark:bg-slate-900/30 border-2 border-dashed border-gray-300 dark:border-slate-600/50 animate-smooth-fade-in-delayed ${
                images.length === 1 ? '' : 'grid grid-cols-2 gap-2'
              }`}
            >
              {images.map((img) => (
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
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
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
                <svg
                  className="w-10 h-10 mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="text-sm">Thêm ảnh</span>
              </button>
            </div>
          )}

          {/* Video Preview */}
          {videos.length > 0 && (
            <div className="mb-3 space-y-2 animate-smooth-fade-in-delayed">
              {videos.map((v) => (
                <div
                  key={v.id}
                  className="relative group rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-900/50 border-2 border-dashed border-gray-300 dark:border-slate-600/50"
                >
                  <video src={v.url} controls className="w-full max-h-64 object-contain" />
                  <button
                    type="button"
                    onClick={() => removeVideo(v.id)}
                    className="absolute top-2 right-2 w-8 h-8 bg-gray-900/80 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                  <div className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                    {v.name}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Feeling Picker */}
          {showFeelingPicker && (
            <div className="mb-3 p-2.5 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-200 dark:border-slate-700/50 animate-smooth-fade-in-delayed">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Bạn đang cảm thấy thế nào?
                </h4>
                <button
                  type="button"
                  onClick={() => setShowFeelingPicker(false)}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {feelings.map((f) => (
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
            <div className="mb-3 animate-smooth-fade-in-delayed relative z-10">
              <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-200 dark:border-slate-700/50">
                <svg className="w-5 h-5 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                <input
                  type="text"
                  value={locationQuery}
                  onChange={(e) => handleLocationQueryChange(e.target.value)}
                  placeholder="Bạn đang ở đâu?"
                  className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
                  autoFocus
                />
                {locationLoading && (
                  <svg className="w-4 h-4 text-gray-400 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowLocationInput(false);
                    setLocation('');
                    setLocationQuery('');
                    setLocationSuggestions([]);
                    setLocationGeoError(null);
                  }}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 shrink-0"
                >
                  ×
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void useCurrentLocation();
                  }}
                  disabled={locationGeoLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300 transition-colors hover:bg-cyan-100 dark:hover:bg-cyan-900/35 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {locationGeoLoading ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 2v3m0 14v3m10-10h-3M5 12H2m15.364-7.364l-2.121 2.121M8.757 15.243l-2.121 2.121m0-12.728l2.121 2.121m8.486 8.486l2.121 2.121M12 16a4 4 0 100-8 4 4 0 000 8z"
                      />
                    </svg>
                  )}
                  <span>{locationGeoLoading ? 'Đang lấy vị trí...' : 'Vị trí hiện tại'}</span>
                </button>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  Hoặc nhập thủ công ở ô bên trên
                </span>
              </div>
              {locationGeoError && (
                <p className="mt-2 text-xs text-red-500 dark:text-red-400">{locationGeoError}</p>
              )}
              {locationSuggestions.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl shadow-lg overflow-hidden">
                  {locationSuggestions.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-cyan-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors"
                        onClick={() => selectLocationSuggestion(s)}
                      >
                        <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                        </svg>
                        <span className="truncate">{s}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Poll Input */}
          {showPollInput && (
             <div className="mb-3 p-3 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-200 dark:border-slate-700/50 animate-smooth-fade-in-delayed">
               <div className="flex items-center justify-between mb-2">
                 <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                   Thăm dò ý kiến
                 </h4>
                 <button
                   type="button"
                   onClick={() => {
                     setShowPollInput(false);
                     setPollOptions(['', '']);
                   }}
                   className="text-gray-500 hover:text-gray-700"
                 >×</button>
               </div>
               <div className="space-y-2">
                 {pollOptions.map((opt, i) => (
                    <input 
                      key={i}
                      type="text" 
                      placeholder={`Lựa chọn ${i + 1}`}
                      className="w-full text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-2 rounded-lg"
                      value={opt}
                      onChange={(e) => {
                         const newOpts = [...pollOptions];
                         newOpts[i] = e.target.value;
                         if (i === newOpts.length - 1 && e.target.value.trim()) {
                            newOpts.push('');
                         }
                         setPollOptions(newOpts);
                      }}
                    />
                 ))}
               </div>
             </div>
          )}

          {/* Anonymous checkbox for group */}
          {groupId && (
            <label className="flex items-center gap-2 mb-3 cursor-pointer p-2 bg-gray-50 dark:bg-slate-800/50 rounded-xl w-fit">
               <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} className="w-4 h-4 text-cyan-600 rounded" />
               <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Đăng ẩn danh</span>
            </label>
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
              title="Ảnh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span className="text-xs font-semibold">Ảnh</span>
            </button>

            {/* Video Pill */}
            <button
              type="button"
              onClick={triggerVideoInput}
              className={`group flex items-center gap-2 px-3 py-2 rounded-full transition-all hover:scale-105 ${
                videos.length > 0
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30'
                  : 'bg-white dark:bg-slate-700/50 text-gray-800 dark:text-gray-300 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 dark:hover:bg-slate-700 border-2 border-gray-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700'
              }`}
              title="Video"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.892L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
                />
              </svg>
              <span className="text-xs font-semibold">
                Video{videos.length > 0 ? ` (${videos.length})` : ''}
              </span>
            </button>

            {/* Poll Pill */}
            <button
              type="button"
              onClick={() => setShowPollInput(!showPollInput)}
              className={`group flex items-center gap-2 px-3 py-2 rounded-full transition-all hover:scale-105 ${
                pollOptions.some(o => o.trim())
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30'
                  : 'bg-white dark:bg-slate-700/50 text-gray-800 dark:text-gray-300 hover:bg-gradient-to-r hover:from-cyan-50 hover:to-blue-50 dark:hover:bg-slate-700 border-2 border-gray-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700'
              }`}
              title="Tạo cuộc thăm dò"
            >
              <span className="text-xs font-semibold">📊 Thăm dò</span>
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
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
              {feeling ? (
                <span className="text-sm leading-none">{feeling.split(' ')[0]}</span>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zm3.5-9c.828 0 1.5-.672 1.5-1.5S16.328 8 15.5 8 14 8.672 14 9.5s.672 1.5 1.5 1.5zm-7 0c.828 0 1.5-.672 1.5-1.5S9.328 8 8.5 8 7 8.672 7 9.5 7.672 11 8.5 11zm3.5 6c2.28 0 4.22-1.66 5-4H7c.78 2.34 2.72 4 5 4z" />
                </svg>
              )}
              <span className="text-xs font-semibold">
                {feeling ? feeling.split(' ').slice(1).join(' ') : 'Cảm xúc'}
              </span>
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
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
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

          {/* Error Banner */}
          {errorMsg && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm animate-fade-in">
              <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <p className="font-semibold">Bài đăng bị từ chối</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
              <button type="button" onClick={() => setErrorMsg(null)} className="ml-auto shrink-0 text-red-400 hover:text-red-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Wave-Styled Submit Button */}
          <button
            type="submit"
            disabled={
              (!content.trim() && images.length === 0 && videos.length === 0) || isSubmitting
            }
            className={`relative w-full py-3.5 rounded-2xl font-bold text-sm transition-all duration-300 overflow-hidden group animate-fade-in-2 ${
              (!content.trim() && images.length === 0 && videos.length === 0) || isSubmitting
                ? 'bg-gray-200 dark:bg-slate-700/50 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 text-white hover:shadow-2xl hover:shadow-cyan-500/30 hover:scale-[1.02]'
            }`}
          >
            {/* Animated Wave Effect */}
            {!isSubmitting && (content.trim() || images.length > 0 || videos.length > 0) && (
              <div className="absolute inset-0 opacity-50">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
              </div>
            )}
            <span className="relative z-10 flex items-center justify-center gap-2">
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Đang đăng sóng...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <span>Tạo làn sóng</span>
                </>
              )}
            </span>
          </button>

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            multiple
            onChange={handleVideoSelect}
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
