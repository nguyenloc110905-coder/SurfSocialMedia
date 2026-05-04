import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Circle, MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useMarketplaceStore, type Listing, type Category, type Condition } from '../stores/marketplaceStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import Avatar from '../components/ui/Avatar';
import { uploadImage } from '../lib/cloudinary';

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'all', label: 'Tất cả', icon: 'M4 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h4V6zm8 0V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2h8z' },
  { key: 'electronics', label: 'Điện tử', icon: 'M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z' },
  { key: 'clothing', label: 'Thời trang', icon: 'M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z' },
  { key: 'vehicles', label: 'Xe cộ', icon: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9l-3.3-1.1c-.2-.1-.3-.2-.4-.3l-2.4-4c-.3-.5-1-.7-1.5-.7h-3.8c-.5 0-1.2.2-1.5.7l-2.4 4c-.1.1-.2.2-.4.3l-3.3 1.1c-.8.2-1.5 1-1.5 1.9v3c0 .6.4 1 1 1h2' },
  { key: 'home', label: 'Gia dụng', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11l2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6' },
  { key: 'sports', label: 'Thể thao', icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z' },
  { key: 'other', label: 'Khác', icon: 'M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0' },
];

const CONDITION_LABELS: Record<Condition, string> = {
  new: 'Mới',
  like_new: 'Như mới',
  good: 'Tốt',
  fair: 'Khá',
};

type SellerSection = 'listings' | 'dashboard' | 'notifications' | 'insights' | 'profile';

const SELLER_SECTIONS: { key: SellerSection; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Bảng điều khiển của người bán', icon: 'M3 13h8V3H3v10zm10 8h8V3h-8v18zM3 21h8v-6H3v6z' },
  { key: 'listings', label: 'Bài niêm yết của bạn', icon: 'M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z' },
  { key: 'notifications', label: 'Thông báo', icon: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0' },
  { key: 'insights', label: 'Thông tin chi tiết', icon: 'M4 19V9m5 10V5m5 14v-7m5 7V3' },
  { key: 'profile', label: 'Trang cá nhân trên Marketplace', icon: 'M5.121 17.804A8 8 0 1118.88 17.8M15 11a3 3 0 11-6 0 3 3 0 016 0z' },
];

function formatPrice(price: number) {
  if (price === 0) return 'Miễn phí';
  return price.toLocaleString('vi-VN') + ' ₫';
}

const BRAND_KEYWORDS = [
  'baseus',
  'anker',
  'apple',
  'samsung',
  'sony',
  'xiaomi',
  'huawei',
  'asus',
  'lenovo',
  'msi',
  'dell',
  'hp',
  'acer',
  'logitech',
  'razer',
  'jbl',
  'lg',
  'oppo',
  'vivo',
  'realme',
  'canon',
  'nikon',
];

const MAP_ZOOM = 14;
const LOCATION_CIRCLE_RADIUS_METERS = 1500;
const DEFAULT_MAP_CENTER: [number, number] = [10.8231, 106.6297];

function getBrandFromTitle(title: string) {
  const lower = title.toLowerCase();
  const found = BRAND_KEYWORDS.find((brand) => lower.includes(brand));
  if (!found) return 'Khác';
  return found.charAt(0).toUpperCase() + found.slice(1);
}

type MapCenter = [number, number];

type LocationSuggestion = {
  id: string;
  label: string;
  subtitle: string;
  center: MapCenter;
  displayName: string;
};

type NominatimSearchResult = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
  type?: string;
  address?: Record<string, string | undefined>;
};

const DEFAULT_LOCATION_SUGGESTIONS: LocationSuggestion[] = [
  {
    id: 'default-ho-chi-minh-city',
    label: 'Thành phố Hồ Chí Minh',
    subtitle: 'Tỉnh/Thành phố',
    center: DEFAULT_MAP_CENTER,
    displayName: 'Thành phố Hồ Chí Minh, Việt Nam',
  },
  {
    id: 'default-quan-1',
    label: 'Quận 1, Hồ Chí Minh City',
    subtitle: 'Quận 1, Hồ Chí Minh City',
    center: [10.7769, 106.7009],
    displayName: 'Quận 1, Thành phố Hồ Chí Minh, Việt Nam',
  },
  {
    id: 'default-binh-thanh',
    label: 'Bình Thạnh, Hồ Chí Minh City',
    subtitle: 'Bình Thạnh, Hồ Chí Minh City',
    center: [10.8017, 106.7108],
    displayName: 'Bình Thạnh, Thành phố Hồ Chí Minh, Việt Nam',
  },
  {
    id: 'default-hoc-mon',
    label: 'Hóc Môn, Hồ Chí Minh City',
    subtitle: 'Hóc Môn, Hồ Chí Minh City',
    center: [10.8833, 106.5903],
    displayName: 'Hóc Môn, Thành phố Hồ Chí Minh, Việt Nam',
  },
  {
    id: 'default-thu-duc',
    label: 'Thủ Đức, Hồ Chí Minh City',
    subtitle: 'Thủ Đức, Hồ Chí Minh City',
    center: [10.8494, 106.7537],
    displayName: 'Thủ Đức, Thành phố Hồ Chí Minh, Việt Nam',
  },
  {
    id: 'default-ha-noi',
    label: 'Hà Nội',
    subtitle: 'Tỉnh/Thành phố',
    center: [21.0278, 105.8342],
    displayName: 'Hà Nội, Việt Nam',
  },
];

function normalizeLocationText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function toLocationSuggestion(place: NominatimSearchResult, index: number): LocationSuggestion | null {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  const displayName = place.display_name ?? '';
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !displayName) return null;
  const address = place.address ?? {};
  const baseName =
    place.name ||
    address.amenity ||
    address.tourism ||
    address.leisure ||
    address.road ||
    address.neighbourhood ||
    displayName.split(',')[0]?.trim() ||
    'Vị trí';
  const district = address.suburb || address.city_district || address.district || address.county || '';
  const city = address.city || address.town || address.municipality || address.state || '';
  const labelParts = [baseName, district, city].filter(Boolean);
  const uniqueLabelParts = labelParts.filter((value, partIndex, arr) => arr.indexOf(value) === partIndex);
  const label = uniqueLabelParts.length > 0 ? uniqueLabelParts.join(', ') : displayName.split(',').slice(0, 3).join(', ');
  const subtitle = displayName.split(',').slice(1, 4).map((part) => part.trim()).filter(Boolean).join(', ') || place.type || 'Địa điểm';
  return {
    id: String(place.place_id ?? `${place.osm_type ?? 'place'}-${place.osm_id ?? index}`),
    label,
    subtitle,
    center: [lat, lon],
    displayName,
  };
}

function mergeLocationSuggestions(apiSuggestions: LocationSuggestion[], query: string) {
  const normalizedQuery = normalizeLocationText(query);
  const matchingDefaults = DEFAULT_LOCATION_SUGGESTIONS.filter((suggestion) => {
    const haystack = normalizeLocationText(`${suggestion.label} ${suggestion.subtitle} ${suggestion.displayName}`);
    return !normalizedQuery || haystack.includes(normalizedQuery);
  });
  const suggestions = [...apiSuggestions, ...matchingDefaults, ...DEFAULT_LOCATION_SUGGESTIONS];
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = normalizeLocationText(`${suggestion.label}-${suggestion.displayName}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function matchesLocationSuggestion(value: string, suggestion: LocationSuggestion | null) {
  if (!suggestion) return false;
  const normalizedValue = normalizeLocationText(value);
  return (
    normalizedValue === normalizeLocationText(suggestion.label) ||
    normalizedValue === normalizeLocationText(suggestion.displayName)
  );
}

function findExactLocationSuggestion(value: string, suggestions: LocationSuggestion[]) {
  return suggestions.find((suggestion) => matchesLocationSuggestion(value, suggestion)) ?? null;
}

const MeterCircle = Circle as ComponentType<{
  center: MapCenter;
  radius: number;
  pathOptions: {
    color: string;
    fillColor: string;
    fillOpacity: number;
    weight: number;
  };
}>;

function MapCenterUpdater({ center, zoom }: { center: MapCenter; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: false });
    setTimeout(() => map.invalidateSize(), 0);
  }, [center, zoom, map]);
  return null;
}

function FixedRadiusCircle({ center }: { center: MapCenter }) {
  return (
    <MeterCircle
      center={center}
      radius={LOCATION_CIRCLE_RADIUS_METERS}
      pathOptions={{
        color: '#38bdf8',
        fillColor: '#38bdf8',
        fillOpacity: 0.25,
        weight: 2,
      }}
    />
  );
}

function LocationMap({
  center,
  zoom,
  interactive,
}: {
  center: MapCenter;
  zoom: number;
  interactive: boolean;
}) {
  const mapClassName = interactive ? 'h-full w-full' : 'h-full w-full pointer-events-none';
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className={mapClassName}
      zoomControl={interactive}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <FixedRadiusCircle center={center} />
      <MapCenterUpdater center={center} zoom={zoom} />
    </MapContainer>
  );
}

export default function MarketPage() {
  const {
    listings,
    loading,
    activeCategory,
    searchQuery,
    searchResults,
    isSearchMode,
    myListings,
    myListingsLoading,
    savedListings,
    savedLoading,
    fetchListings,
    fetchMyListings,
    fetchSavedListings,
    setCategory,
    search,
    setSearchQuery,
    toggleSave,
    createListing,
  } = useMarketplaceStore();
  const currentUser = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const currentUserId = currentUser?.uid;

  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'saved'>('all');
  const [sellerSection, setSellerSection] = useState<SellerSection>('listings');
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isSellerProfileOpen, setIsSellerProfileOpen] = useState(false);
  const [sellerListingSearch, setSellerListingSearch] = useState('');
  const [createImageUploading, setCreateImageUploading] = useState(false);
  const [createImageError, setCreateImageError] = useState('');
  const [mapCenter, setMapCenter] = useState<MapCenter>(DEFAULT_MAP_CENTER);
  const [createMapCenter, setCreateMapCenter] = useState<MapCenter>(DEFAULT_MAP_CENTER);
  const [createLocationSuggestions, setCreateLocationSuggestions] = useState<LocationSuggestion[]>(
    DEFAULT_LOCATION_SUGGESTIONS.slice(0, 5)
  );
  const [createLocationLoading, setCreateLocationLoading] = useState(false);
  const [isCreateLocationFocused, setIsCreateLocationFocused] = useState(false);
  const [isCreateMapOpen, setIsCreateMapOpen] = useState(false);
  const [selectedCreateLocation, setSelectedCreateLocation] = useState<LocationSuggestion | null>(null);
  const [createLocationError, setCreateLocationError] = useState('');
  const [myListingSearch, setMyListingSearch] = useState('');
  const geoCache = useRef(new Map<string, MapCenter>());

  // New Listing Form State
  const [newListing, setNewListing] = useState({
    title: '',
    description: '',
    price: '',
    category: 'other' as Exclude<Category, 'all'>,
    condition: 'good' as Condition,
    location: '',
    mediaUrls: [] as string[],
  });

  useEffect(() => {
    fetchListings(true);
  }, [fetchListings]);

  useEffect(() => {
    if (activeTab === 'my') {
      fetchMyListings();
      return;
    }
    if (activeTab === 'saved') {
      fetchSavedListings();
    }
  }, [activeTab, fetchMyListings, fetchSavedListings]);

  useEffect(() => {
    const location = selectedListing?.location?.trim();
    if (!location || location.toLowerCase() === 'toàn quốc' || location.toLowerCase() === 'toan quoc') {
      setMapCenter(DEFAULT_MAP_CENTER);
      return;
    }
    const cached = geoCache.current.get(location);
    if (cached) {
      setMapCenter(cached);
      return;
    }
    const controller = new AbortController();
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`;
    let cancelled = false;
    fetch(url, { signal: controller.signal, headers: { 'Accept-Language': 'vi' } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data) || !data[0]) {
          setMapCenter(DEFAULT_MAP_CENTER);
          return;
        }
        const next: MapCenter = [Number(data[0].lat), Number(data[0].lon)];
        geoCache.current.set(location, next);
        setMapCenter(next);
      })
      .catch(() => {
        if (!cancelled) setMapCenter(DEFAULT_MAP_CENTER);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedListing?.location]);

  useEffect(() => {
    if (!isDetailModalOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isSellerProfileOpen) {
        setIsSellerProfileOpen(false);
        return;
      }
      if (isMapOpen) {
        setIsMapOpen(false);
        return;
      }
      setIsDetailModalOpen(false);
      setSelectedListing(null);
    };
    document.addEventListener('keydown', onEscape);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = originalOverflow;
    };
  }, [isDetailModalOpen, isMapOpen, isSellerProfileOpen]);

  useEffect(() => {
    if (!isCreateModalOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isCreateMapOpen) {
        setIsCreateMapOpen(false);
        return;
      }
      setIsCreateModalOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = originalOverflow;
    };
  }, [isCreateMapOpen, isCreateModalOpen]);

  useEffect(() => {
    if (!isCreateModalOpen) return;
    const location = newListing.location.trim();
    setSelectedCreateLocation((current) => (matchesLocationSuggestion(location, current) ? current : null));
    if (!location) {
      setCreateLocationSuggestions(DEFAULT_LOCATION_SUGGESTIONS.slice(0, 5));
      setCreateLocationLoading(false);
      setCreateMapCenter(DEFAULT_MAP_CENTER);
      return;
    }
    const fallbackSuggestions = mergeLocationSuggestions([], location);
    const fallbackExactSuggestion = findExactLocationSuggestion(location, fallbackSuggestions);
    setCreateLocationSuggestions(fallbackSuggestions);
    if (fallbackExactSuggestion) {
      setSelectedCreateLocation(fallbackExactSuggestion);
      setCreateMapCenter(fallbackExactSuggestion.center);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCreateLocationLoading(true);
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(location)}&limit=5`;
      fetch(url, { signal: controller.signal, headers: { 'Accept-Language': 'vi' } })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          const apiSuggestions = Array.isArray(data)
            ? data.map((place, index) => toLocationSuggestion(place, index)).filter(Boolean) as LocationSuggestion[]
            : [];
          const nextSuggestions = mergeLocationSuggestions(apiSuggestions, location);
          const exactSuggestion = findExactLocationSuggestion(location, nextSuggestions);
          setCreateLocationSuggestions(nextSuggestions);
          if (exactSuggestion) {
            setSelectedCreateLocation(exactSuggestion);
            setCreateMapCenter(exactSuggestion.center);
          }
        })
        .catch(() => setCreateLocationSuggestions(mergeLocationSuggestions([], location)))
        .finally(() => setCreateLocationLoading(false));
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isCreateModalOpen, newListing.location]);

  const handleSelectMainTab = (tab: 'all' | 'my' | 'saved') => {
    setActiveTab(tab);
    if (tab === 'all') {
      setCategory('all');
      return;
    }
    if (tab === 'my') {
      setSellerSection('listings');
    }
  };

  const handleSelectSellerSection = (section: SellerSection) => {
    setActiveTab('my');
    setSellerSection(section);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveTab('all');
    search(searchQuery);
  };

  const handleCreateImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const remainingSlots = Math.max(0, 10 - newListing.mediaUrls.length);
    const selectedFiles = files.slice(0, remainingSlots);
    if (selectedFiles.length === 0) {
      setCreateImageError('Tối đa 10 ảnh cho mỗi mặt hàng');
      return;
    }
    setCreateImageUploading(true);
    setCreateImageError('');
    try {
      const uploadedUrls = await Promise.all(
        selectedFiles.map((file) => uploadImage(file, { folder: 'surf/marketplace' }))
      );
      setNewListing((current) => ({
        ...current,
        mediaUrls: [...current.mediaUrls, ...uploadedUrls].slice(0, 10),
      }));
    } catch {
      setCreateImageError('Không thể tải ảnh lên. Vui lòng thử lại.');
    } finally {
      setCreateImageUploading(false);
    }
  };

  const removeCreateImage = (url: string) => {
    setNewListing((current) => ({
      ...current,
      mediaUrls: current.mediaUrls.filter((item) => item !== url),
    }));
  };

  const handleCreateLocationChange = (value: string) => {
    setNewListing((current) => ({ ...current, location: value }));
    setCreateLocationError('');
    setIsCreateLocationFocused(true);
  };

  const handleSelectCreateLocation = (suggestion: LocationSuggestion) => {
    setNewListing((current) => ({ ...current, location: suggestion.label }));
    setSelectedCreateLocation(suggestion);
    setCreateMapCenter(suggestion.center);
    geoCache.current.set(suggestion.label, suggestion.center);
    geoCache.current.set(suggestion.displayName, suggestion.center);
    setCreateLocationSuggestions(mergeLocationSuggestions([suggestion], suggestion.label));
    setCreateLocationError('');
    setIsCreateLocationFocused(false);
  };

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createImageUploading) return;
    if (!matchesLocationSuggestion(newListing.location.trim(), selectedCreateLocation)) {
      setCreateLocationError('Vui lòng chọn một địa chỉ hợp lệ trong danh sách gợi ý.');
      setIsCreateLocationFocused(true);
      return;
    }
    try {
      await createListing({
        ...newListing,
        price: Number(newListing.price),
      });
      setIsCreateModalOpen(false);
      setActiveTab('my');
      setNewListing({
        title: '',
        description: '',
        price: '',
        category: 'other',
        condition: 'good',
        location: '',
        mediaUrls: [],
      });
      setSelectedCreateLocation(null);
      setCreateLocationSuggestions(DEFAULT_LOCATION_SUGGESTIONS.slice(0, 5));
      setCreateMapCenter(DEFAULT_MAP_CENTER);
      setCreateLocationError('');
      setCreateImageError('');
    } catch (err) {
      alert('Lỗi khi tạo tin đăng');
    }
  };

  const handleCloseDetail = () => {
    setIsDetailModalOpen(false);
    setSelectedListing(null);
    setIsMapOpen(false);
    setIsSellerProfileOpen(false);
    setSellerListingSearch('');
  };

  const openDetail = (listing: Listing) => {
    setSelectedListing(listing);
    setActiveMediaIndex(0);
    setIsMapOpen(false);
    setIsSellerProfileOpen(false);
    setSellerListingSearch('');
    setIsDetailModalOpen(true);
  };

  const openSellerProfile = () => {
    setIsMapOpen(false);
    setSellerListingSearch('');
    setIsSellerProfileOpen(true);
  };

  const isSaved = (listing: Listing | null | undefined) => listing?.savedBy?.includes(currentUserId ?? 'me') ?? false;
  const setLocalSaved = (listing: Listing, saved: boolean): Listing => {
    const userId = currentUserId ?? 'me';
    const savedBy = listing.savedBy ?? [];
    return {
      ...listing,
      savedBy: saved
        ? Array.from(new Set([...savedBy, userId]))
        : savedBy.filter((uid) => uid !== userId),
    };
  };
  const handleToggleSave = async (listing: Listing) => {
    try {
      const saved = await toggleSave(listing.id);
      setSelectedListing((current) => current?.id === listing.id ? setLocalSaved(current, saved) : current);
    } catch {
      alert('Không thể cập nhật tin đã lưu');
    }
  };

  const displayedListings =
    activeTab === 'my'
      ? myListings
      : activeTab === 'saved'
        ? savedListings
        : isSearchMode
          ? searchResults
          : listings;
  const currentLoading =
    activeTab === 'my'
      ? myListingsLoading
      : activeTab === 'saved'
        ? savedLoading
        : loading;
  const activeCategoryLabel = CATEGORIES.find((cat) => cat.key === activeCategory)?.label ?? 'Tất cả';
  const activeTabLabel = activeTab === 'all' ? 'Khám phá' : activeTab === 'my' ? 'Đang bán' : 'Đã lưu';
  const sellerSectionLabel = SELLER_SECTIONS.find((section) => section.key === sellerSection)?.label ?? 'Bài niêm yết của bạn';
  const marketDescription =
    activeTab === 'my'
      ? 'Quản lý những mặt hàng bạn đang đăng bán.'
      : activeTab === 'saved'
        ? 'Những món bạn đã lưu để xem lại sau.'
        : 'Khám phá đồ công nghệ, thời trang, xe cộ và nhiều món hời quanh bạn.';
  const visibleListingCount = displayedListings.length;
  const sellerDisplayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Người bán';
  const sellerInitial = sellerDisplayName.trim().charAt(0).toUpperCase() || 'S';
  const sellerPhotoUrl = currentUser?.photoURL ?? '';
  const activeMyListings = myListings.filter((listing) => listing.status === 'active');
  const soldMyListings = myListings.filter((listing) => listing.status === 'sold');
  const filteredMyListings = myListings.filter((listing) =>
    listing.title.toLowerCase().includes(myListingSearch.trim().toLowerCase())
  );
  const myListingViews = myListings.reduce((total, listing) => total + (listing.viewCount ?? 0), 0);
  const myListingSaves = myListings.reduce((total, listing) => total + (listing.savedBy?.length ?? 0), 0);
  const latestMyListing = myListings[0];
  const createPreviewImage = newListing.mediaUrls[0];
  const createPreviewTitle = newListing.title.trim() || 'Tiêu đề mặt hàng';
  const createPreviewPrice = Number(newListing.price) || 0;
  const createPreviewLocation = newListing.location.trim() || 'Vị trí niêm yết';
  const createPreviewDescription = newListing.description.trim() || 'Mô tả của người bán sẽ hiển thị tại đây.';
  const createSellerName = currentUser?.displayName || currentUser?.email || 'Người bán';
  const canShowCreatePreviewMap = matchesLocationSuggestion(newListing.location.trim(), selectedCreateLocation);
  const detailMediaUrls = selectedListing?.mediaUrls ?? [];
  const activeMediaUrl = detailMediaUrls[activeMediaIndex] ?? detailMediaUrls[0];
  const detailLocation = selectedListing?.location || 'Toàn quốc';
  const detailStatusLabel =
    selectedListing?.status === 'sold'
      ? 'Đã bán'
      : selectedListing?.status === 'deleted'
        ? 'Đã xóa'
        : 'Còn hàng';
  const detailBrand = selectedListing ? getBrandFromTitle(selectedListing.title) : 'Khác';
  const sellerName = selectedListing?.sellerDisplayName || 'Người bán';
  const sellerShortName = sellerName.trim().split(/\s+/).pop() || sellerName;
  const sellerKnownListings = selectedListing
    ? Array.from(
        new Map(
          [...listings, ...searchResults, ...myListings, ...savedListings, selectedListing]
            .filter((listing) => listing.sellerId === selectedListing.sellerId && listing.status !== 'deleted')
            .map((listing) => [listing.id, listing] as const)
        ).values()
      )
    : [];
  const sellerActiveListings = sellerKnownListings.filter((listing) => listing.status === 'active');
  const sellerProfileListings = sellerActiveListings.length > 0 ? sellerActiveListings : sellerKnownListings;
  const sellerFilteredListings = sellerProfileListings.filter((listing) =>
    listing.title.toLowerCase().includes(sellerListingSearch.trim().toLowerCase())
  );
  const sellerCoverUrl =
    selectedListing?.mediaUrls?.[0] ??
    sellerProfileListings.find((listing) => listing.mediaUrls?.[0])?.mediaUrls?.[0] ??
    '';
  const isMarketDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div className="market-theme flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-[#0b0f14] font-sans text-slate-100">
      {/* --- Market Sub-Header --- */}
      <div className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#0b0f14]/90 px-4 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3">
          <div className="flex min-w-0 items-center gap-2 pr-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surf-primary text-white shadow-lg shadow-surf-primary/20">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div className="hidden leading-tight sm:block">
              <h1 className="text-sm font-black text-white">Surf Market</h1>
              <p className="text-[10px] font-semibold text-slate-500">{visibleListingCount} mặt hàng</p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="relative min-w-0 flex-1">
            <input
              type="text"
              placeholder="Search marketplace"
              className="h-10 w-full rounded-xl border border-white/[0.08] bg-[#11161d] pl-10 pr-4 text-sm font-medium text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-surf-primary/60 focus:bg-[#151b24]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <svg className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </form>

          <button
            type="button"
            onClick={() => setTheme(isMarketDark ? 'light' : 'dark')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#11161d] text-slate-300 transition hover:border-surf-primary/50 hover:text-surf-secondary active:scale-95"
            aria-label={isMarketDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          >
            {isMarketDark ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36l-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0l-1.42-1.42M7.06 7.06L5.64 5.64M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-surf-secondary hover:text-white active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Đăng bán</span>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-white/[0.08] bg-[#0d1117] px-3 py-4 lg:block">
          {/* Categories & Search Row */}
          <div className="space-y-1">
            {(['all', 'my', 'saved'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => handleSelectMainTab(tab)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-bold transition ${
                  activeTab === tab
                    ? 'bg-[#1b222d] text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <span>{tab === 'all' ? 'Khám phá' : tab === 'my' ? 'Đang bán' : 'Đã lưu'}</span>
                {activeTab === tab && <span className="h-1.5 w-1.5 rounded-full bg-surf-secondary" />}
              </button>
            ))}
          </div>

          <div className="my-4 h-px bg-white/[0.08]" />

          {activeTab === 'my' ? (
            <div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-surf-primary px-3 py-2 text-xs font-black text-white transition hover:bg-surf-secondary"
              >
                <span>+</span>
                Tạo bài niêm yết mới
              </button>
              <div className="space-y-1">
                {SELLER_SECTIONS.map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => handleSelectSellerSection(section.key)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold transition ${
                      sellerSection === section.key
                        ? 'bg-[#26303b] text-white'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      sellerSection === section.key ? 'bg-surf-primary text-white' : 'bg-white/[0.08] text-slate-400'
                    }`}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={section.icon} />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{section.label}</span>
                  </button>
                ))}
              </div>
              {sellerSection === 'listings' && (
                <div className="mt-4 space-y-3">
                  <button className="w-full rounded-lg bg-white/[0.08] px-3 py-2 text-xs font-black text-slate-200">
                    Quản lý bài niêm yết
                  </button>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-400">
                      <span>Bộ lọc</span>
                      <button type="button" onClick={() => setMyListingSearch('')} className="text-surf-secondary">Xóa</button>
                    </div>
                    <div className="space-y-2 text-xs font-semibold text-slate-500">
                      <div className="flex items-center justify-between">
                        <span>Sắp xếp theo</span>
                        <span>⌄</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Trạng thái</span>
                        <span>⌄</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div>
                <div className="mb-2 px-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">Danh mục</div>
                <div className="space-y-1">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => { setActiveTab('all'); setCategory(cat.key); }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold transition ${
                        activeCategory === cat.key
                          ? 'bg-surf-primary/15 text-surf-secondary'
                          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                      }`}
                    >
                      <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cat.icon} />
                      </svg>
                      <span className="truncate">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/[0.08] bg-[#121821] p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-surf-secondary">Surf safe</div>
                <p className="mt-2 text-sm font-bold leading-snug text-white">Mua bán gọn hơn, ít rối hơn.</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{marketDescription}</p>
              </div>
            </>
          )}
        </aside>

      {/* --- Listings Content --- */}
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 scrollbar-hide sm:px-6">
          <div className="mx-auto max-w-[1380px]">
            <div className="mb-4 rounded-2xl border border-surf-primary/30 bg-[#10161e] px-4 py-4 shadow-lg shadow-black/20 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-surf-secondary">{activeTabLabel}</div>
                  <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                    {activeTab === 'my'
                      ? sellerSectionLabel
                      : activeCategoryLabel === 'Tất cả'
                        ? 'Khám phá marketplace'
                        : activeCategoryLabel}
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
                    {activeTab === 'my' ? 'Theo dõi bài niêm yết, thông báo, hiệu quả bán hàng và trang cá nhân Marketplace.' : marketDescription}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-white/[0.08] bg-[#151b24] px-3 py-1.5 text-xs font-bold text-slate-300">
                    {currentLoading ? 'Đang tải...' : activeTab === 'my' ? `${activeMyListings.length} đang bán` : `${visibleListingCount} items`}
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-[#151b24] px-3 py-1.5 text-xs font-bold text-slate-300">
                    {activeTab === 'my' ? `${soldMyListings.length} đã bán` : activeCategoryLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide lg:hidden">
              {(['all', 'my', 'saved'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleSelectMainTab(tab)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${
                    activeTab === tab
                      ? 'border-surf-primary bg-surf-primary text-white'
                      : 'border-white/[0.08] bg-[#121821] text-slate-400'
                  }`}
                >
                  {tab === 'all' ? 'Khám phá' : tab === 'my' ? 'Đang bán' : 'Đã lưu'}
                </button>
              ))}
              {activeTab === 'my'
                ? SELLER_SECTIONS.map((section) => (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => handleSelectSellerSection(section.key)}
                      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${
                        sellerSection === section.key
                          ? 'border-surf-primary bg-surf-primary/15 text-surf-secondary'
                          : 'border-white/[0.08] bg-[#121821] text-slate-400'
                      }`}
                    >
                      {section.label}
                    </button>
                  ))
                : CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => { setActiveTab('all'); setCategory(cat.key); }}
                      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${
                        activeCategory === cat.key
                          ? 'border-surf-primary bg-surf-primary/15 text-surf-secondary'
                          : 'border-white/[0.08] bg-[#121821] text-slate-400'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
            </div>

            {activeTab === 'my' ? (
              <div className="space-y-4">
                {sellerSection === 'dashboard' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-4">
                      <h3 className="mb-3 text-sm font-black text-white">Tổng quan</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-4">
                          <div className="text-2xl font-black text-white">0</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Đoạn chat cần trả lời</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-4">
                          <div className="text-2xl font-black text-white">0</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Xếp hạng người bán</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-black text-white">Bài niêm yết của bạn</h3>
                        <button type="button" onClick={() => setIsCreateModalOpen(true)} className="rounded-lg bg-surf-primary px-3 py-1.5 text-xs font-black text-white">
                          Tạo bài mới
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{activeMyListings.length}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Đang hoạt động</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{soldMyListings.length}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Đã bán / hết hàng</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">0</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Cần chú ý</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">0</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Bản nháp</div>
                        </div>
                      </div>
                      {latestMyListing && (
                        <button type="button" onClick={() => openDetail(latestMyListing)} className="mt-4 flex w-full gap-3 rounded-xl bg-[#10161e] p-3 text-left transition hover:bg-[#1b222d]">
                          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[#0f141b]">
                            {latestMyListing.mediaUrls?.[0] && <img src={latestMyListing.mediaUrls[0]} alt={latestMyListing.title} className="h-full w-full object-cover" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-black text-white">{latestMyListing.title}</div>
                            <div className="mt-1 text-sm font-black text-slate-200">{formatPrice(latestMyListing.price)}</div>
                            <div className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">{latestMyListing.description || latestMyListing.location}</div>
                          </div>
                        </button>
                      )}
                    </div>

                    <div className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-4">
                      <h3 className="mb-3 text-sm font-black text-white">Thông tin chi tiết trên Marketplace</h3>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{myListingViews}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Lượt click vào bài niêm yết</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">{myListingSaves}</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Lượt lưu bài niêm yết</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">0</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Lượt chia sẻ bài niêm yết</div>
                        </div>
                        <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-3">
                          <div className="text-xl font-black text-white">0</div>
                          <div className="mt-1 text-xs font-bold text-slate-400">Người theo dõi</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {sellerSection === 'listings' && (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#151a22] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-base font-black text-white">Bài niêm yết của bạn</h3>
                      <div className="relative min-w-0 sm:w-80">
                        <input
                          value={myListingSearch}
                          onChange={(e) => setMyListingSearch(e.target.value)}
                          placeholder="Tìm kiếm bài niêm yết"
                          className="h-9 w-full rounded-full border border-white/[0.08] bg-[#0f141b] pl-9 pr-3 text-xs font-semibold text-white outline-none placeholder:text-slate-600 focus:border-surf-primary/60"
                        />
                        <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                    </div>
                    {myListingsLoading ? (
                      <div className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-4 text-sm font-bold text-slate-400">Đang tải bài niêm yết...</div>
                    ) : filteredMyListings.length > 0 ? (
                      filteredMyListings.map((item) => (
                        <button key={item.id} type="button" onClick={() => openDetail(item)} className="flex w-full gap-3 rounded-2xl border border-white/[0.08] bg-[#151a22] p-3 text-left transition hover:border-surf-primary/40 hover:bg-[#171e28]">
                          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#0f141b]">
                            {item.mediaUrls?.[0] ? (
                              <img src={item.mediaUrls[0]} alt={item.title} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-700">
                                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-black text-surf-secondary">Bí quyết: Cải thiện phần mô tả</div>
                            <div className="mt-1 truncate text-base font-black text-white">{item.title}</div>
                            <div className="mt-1 text-sm font-black text-slate-200">{formatPrice(item.price)}</div>
                            <div className="mt-1 text-xs font-medium text-slate-500">Còn hàng · {item.location || 'Toàn quốc'}</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-lg bg-surf-primary/15 px-3 py-1.5 text-xs font-black text-surf-secondary">Đánh dấu là hết hàng</span>
                              <span className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-black text-slate-300">Quảng bá bài niêm yết</span>
                              <span className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-black text-slate-300">Chia sẻ</span>
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/[0.12] bg-[#151a22] p-10 text-center">
                        <p className="text-base font-black text-white">Bạn chưa có bài niêm yết nào</p>
                        <p className="mt-1 text-sm font-medium text-slate-500">Tạo bài đầu tiên để bắt đầu bán trên Marketplace.</p>
                        <button type="button" onClick={() => setIsCreateModalOpen(true)} className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950">Tạo bài niêm yết mới</button>
                      </div>
                    )}
                  </div>
                )}

                {sellerSection === 'notifications' && (
                  <div className="flex min-h-[420px] flex-col rounded-2xl border border-white/[0.08] bg-[#151a22]">
                    <div className="border-b border-white/[0.08] px-4 py-3 text-base font-black text-white">Thông báo</div>
                    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.08] text-slate-400">
                        <svg className="h-9 w-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12h6m-6 4h6M8 4h8l4 4v12H4V4h4z" />
                        </svg>
                      </div>
                      <p className="text-base font-black text-white">Bạn đã xem hết rồi</p>
                      <p className="mt-1 text-sm font-medium text-slate-500">Chúng tôi sẽ cho bạn biết khi có thông báo mới.</p>
                    </div>
                  </div>
                )}

                {sellerSection === 'insights' && (
                  <div className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-base font-black text-white">Thông tin chi tiết trên Marketplace</h3>
                      <span className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-black text-slate-300">7 ngày qua</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-4">
                        <div className="text-2xl font-black text-white">{myListingViews}</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">Lượt click vào bài niêm yết</div>
                      </div>
                      <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-4">
                        <div className="text-2xl font-black text-white">{myListingSaves}</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">Lượt lưu bài niêm yết</div>
                      </div>
                      <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-4">
                        <div className="text-2xl font-black text-white">0</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">Lượt chia sẻ bài niêm yết</div>
                      </div>
                      <div className="rounded-xl border border-white/[0.1] bg-[#10161e] p-4">
                        <div className="text-2xl font-black text-white">0</div>
                        <div className="mt-1 text-xs font-bold text-slate-400">Người theo dõi trên Marketplace</div>
                      </div>
                    </div>
                  </div>
                )}

                {sellerSection === 'profile' && (
                  <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#151a22]">
                    <div className="relative h-28 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950">
                      <div className="absolute -bottom-12 left-5 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-[#151a22] bg-slate-200 text-4xl font-black text-slate-500">
                        {sellerPhotoUrl ? <img src={sellerPhotoUrl} alt={sellerDisplayName} className="h-full w-full object-cover" /> : sellerInitial}
                      </div>
                    </div>
                    <div className="px-5 pb-5 pt-14">
                      <h3 className="text-2xl font-black text-white">{sellerDisplayName}</h3>
                      <p className="mt-1 text-sm font-medium text-slate-500">Đã tham gia Surf Marketplace</p>
                      <p className="mt-1 text-sm font-medium text-slate-500">{myListings.length} bài niêm yết đang hoạt động</p>
                      <div className="mt-5 rounded-xl bg-[#10161e] p-4">
                        <p className="text-xs font-semibold leading-relaxed text-slate-400">Cách bạn cài đặt quyền riêng tư trên Marketplace sẽ kiểm soát những gì mọi người có thể xem trên trang cá nhân người bán của bạn.</p>
                      </div>
                      <div className="mt-5 border-t border-white/[0.08] pt-4">
                        <div className="text-sm font-black text-white">Xếp hạng người bán</div>
                        <div className="mt-2 flex gap-1 text-surf-secondary">
                          {Array.from({ length: 5 }).map((_, index) => (
                            <span key={index}>☆</span>
                          ))}
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-500">Không có xếp hạng</p>
                      </div>
                      <div className="mt-5 border-t border-white/[0.08] pt-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-white">Bài niêm yết của {sellerDisplayName}</div>
                            <div className="mt-1 text-xs font-medium text-slate-500">Các mặt hàng bạn đang bán trên Marketplace.</div>
                          </div>
                          <button type="button" onClick={() => setSellerSection('listings')} className="shrink-0 rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-black text-slate-300">Xem tất cả</button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {activeMyListings.slice(0, 4).map((item) => (
                            <button key={item.id} type="button" onClick={() => openDetail(item)} className="overflow-hidden rounded-xl bg-[#10161e] text-left transition hover:bg-[#1b222d]">
                              <div className="aspect-[4/3] bg-[#0f141b]">
                                {item.mediaUrls?.[0] && <img src={item.mediaUrls[0]} alt={item.title} className="h-full w-full object-cover" />}
                              </div>
                              <div className="p-3">
                                <div className="text-sm font-black text-white">{formatPrice(item.price)}</div>
                                <div className="mt-1 line-clamp-2 text-xs font-bold text-slate-300">{item.title}</div>
                                <div className="mt-1 text-[11px] font-medium text-slate-500">{item.location || 'Toàn quốc'}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {currentLoading && displayedListings.length === 0 ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/[0.08] bg-[#151a22] p-3">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="h-8 w-8 animate-pulse rounded-full bg-slate-800" />
                      <div className="h-3 w-24 animate-pulse rounded-full bg-slate-800" />
                    </div>
                    <div className="mb-3 h-4 w-4/5 animate-pulse rounded-full bg-slate-800" />
                    <div className="mb-4 h-4 w-1/2 animate-pulse rounded-full bg-slate-800" />
                    <div className="aspect-[16/10] animate-pulse rounded-xl bg-slate-800" />
                  </div>
                ))
              ) : displayedListings.length > 0 ? (
                displayedListings.map((item) => (
                  <article
                    key={item.id}
                    onClick={() => openDetail(item)}
                    className="group cursor-pointer overflow-hidden rounded-2xl border border-white/[0.08] bg-[#151a22] transition hover:-translate-y-0.5 hover:border-surf-primary/40 hover:bg-[#171e28]"
                  >
                    <div className="p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#202733] text-xs font-black text-surf-secondary ring-1 ring-white/[0.08]">
                            {item.sellerPhotoURL ? (
                              <img src={item.sellerPhotoURL} alt={item.sellerDisplayName || 'Người bán'} className="h-full w-full object-cover" />
                            ) : (
                              (item.sellerDisplayName || 'S').charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-xs font-bold text-slate-300">{item.sellerDisplayName || 'Người bán'}</div>
                            <div className="truncate text-[11px] font-medium text-slate-600">{CATEGORIES.find((cat) => cat.key === item.category)?.label ?? 'Khác'}</div>
                          </div>
                        </div>

                        {/* Save Button */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleSave(item); }}
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
                            isSaved(item)
                              ? 'border-surf-primary bg-surf-primary text-white'
                              : 'border-white/[0.08] bg-white/[0.03] text-slate-500 hover:text-white'
                          }`}
                        >
                          <svg className="h-4 w-4" fill={isSaved(item) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                        </button>
                      </div>

                      <h3 className="line-clamp-2 min-h-[2.8rem] text-base font-black leading-snug text-white transition group-hover:text-surf-secondary">{item.title}</h3>

                      {/* Price Tag Overlay */}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-lg font-black text-white">{formatPrice(item.price)}</div>
                        <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          {CONDITION_LABELS[item.condition]}
                        </span>
                      </div>

                      <div className="mt-3 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <svg className="h-3.5 w-3.5 shrink-0 text-surf-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        <span className="truncate">{item.location || 'Toàn quốc'}</span>
                      </div>
                    </div>

                    <div className="px-3 pb-3">
                      <div className="aspect-[16/10] overflow-hidden rounded-xl bg-[#0f141b]">
                        {item.mediaUrls?.[0] ? (
                          <img src={item.mediaUrls[0]} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-700">
                            <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/[0.08] px-4 py-3 text-xs font-semibold text-slate-500">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          {item.viewCount ?? 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                          {item.savedBy?.length ?? 0}
                        </span>
                      </div>
                      <span className="text-slate-600">Xem chi tiết</span>
                    </div>
                  </article>
                ))
              ) : (
                <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-[#121821] px-6 py-24 text-center">
                  <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#151a22] text-surf-secondary">
                    <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <p className="mb-2 text-xl font-black tracking-tight text-white">Chưa có mặt hàng phù hợp</p>
                  <p className="max-w-md text-sm font-medium text-slate-500">
                    {activeTab === 'saved'
                      ? 'Bạn chưa lưu tin đăng nào.'
                      : 'Thử thay đổi danh mục hoặc từ khóa tìm kiếm để khám phá thêm nhiều món hời khác.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setActiveTab('all'); setCategory('all'); }}
                    className="mt-6 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-surf-secondary hover:text-white"
                  >
                    Trở về tất cả
                  </button>
                </div>
              )}
            </div>
            )}
          </div>
        </main>
      </div>

      {/* Create Listing Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex bg-surf-dark text-white">
          <aside className="flex h-full w-full max-w-[380px] flex-col border-r border-surf-primary/10 bg-surf-card">
            <div className="flex items-center gap-3 border-b border-slate-700/70 px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setIsCreateMapOpen(false);
                  setIsCreateModalOpen(false);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/70 text-white transition hover:bg-surf-primary/20"
                aria-label="Đóng"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20z" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold text-surf-secondary">Marketplace</div>
                <h2 className="text-xl font-black leading-tight text-white">Mặt hàng cần bán</h2>
              </div>
              <button type="button" className="text-xs font-black text-surf-secondary hover:underline">
                Lưu bản nháp
              </button>
            </div>

            <form onSubmit={handleCreateListing} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="flex items-center gap-3 border-b border-slate-700/70 pb-4">
                  <Avatar
                    src={currentUser?.photoURL}
                    name={createSellerName}
                    size="md"
                    className="ring-2 ring-surf-primary/20"
                  />
                  <div>
                    <div className="text-sm font-black text-white">{createSellerName}</div>
                    <div className="mt-1 flex items-center gap-1 rounded-md bg-surf-primary/10 px-2 py-1 text-[11px] font-bold text-surf-secondary">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z" />
                      </svg>
                      Công khai
                    </div>
                  </div>
                </div>

                <div className="space-y-4 py-4">
                  <div>
                    <label className="mb-2 block text-xs font-black text-slate-300">Danh mục</label>
                    <select
                      className="w-full rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-surf-primary focus:ring-2 focus:ring-surf-primary/20"
                      value={newListing.category}
                      onChange={(e) => setNewListing({ ...newListing, category: e.target.value as Exclude<Category, 'all'> })}
                    >
                      {CATEGORIES.filter((c) => c.key !== 'all').map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-black text-slate-300">Tải ảnh lên</label>
                    <div className="grid grid-cols-3 gap-2">
                      {newListing.mediaUrls.map((url) => (
                        <div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-black">
                          <img src={url} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeCreateImage(url)}
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                            aria-label="Xóa ảnh"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      {newListing.mediaUrls.length < 10 && (
                        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-surf-primary/30 bg-surf-primary/10 text-xs font-bold text-surf-secondary transition hover:border-surf-primary/60 hover:bg-surf-primary/15">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handleCreateImageUpload}
                            disabled={createImageUploading}
                          />
                          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                          </svg>
                          {createImageUploading ? 'Đang tải...' : 'Thêm ảnh'}
                        </label>
                      )}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">Ảnh 1-10 · Bạn có thể thêm tối đa 10 ảnh.</div>
                    {createImageError && (
                      <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
                        {createImageError}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-surf-primary/20 bg-surf-primary/10 p-3 text-xs text-cyan-100">
                    Bạn có thể thêm nhiều ảnh hơn để thu hút nhiều người mua quan tâm.
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-black text-slate-300">Tiêu đề</label>
                    <input
                      required
                      type="text"
                      className="w-full rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-white placeholder:text-slate-500 outline-none transition focus:border-surf-primary focus:ring-2 focus:ring-surf-primary/20"
                      placeholder="Bạn đang bán gì?"
                      value={newListing.title}
                      onChange={(e) => setNewListing({ ...newListing, title: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-black text-slate-300">Giá</label>
                    <div className="relative">
                      <input
                        required
                        min={0}
                        type="number"
                        className="w-full rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 pr-12 text-sm font-semibold text-white placeholder:text-slate-500 outline-none transition focus:border-surf-primary focus:ring-2 focus:ring-surf-primary/20"
                        placeholder="Nhập giá cho mặt hàng"
                        value={newListing.price}
                        onChange={(e) => setNewListing({ ...newListing, price: e.target.value })}
                      />
                      <span className="absolute right-4 top-3.5 text-xs font-black text-slate-400">₫</span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-black text-slate-300">Tình trạng</label>
                    <select
                      className="w-full rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-surf-primary focus:ring-2 focus:ring-surf-primary/20"
                      value={newListing.condition}
                      onChange={(e) => setNewListing({ ...newListing, condition: e.target.value as Condition })}
                    >
                      {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-black text-slate-300">Mô tả</label>
                    <textarea
                      className="h-28 w-full resize-none rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-white placeholder:text-slate-500 outline-none transition focus:border-surf-primary focus:ring-2 focus:ring-surf-primary/20"
                      placeholder="Cho người mua biết những điều mà bạn chưa có dịp chia sẻ về mặt hàng."
                      value={newListing.description}
                      onChange={(e) => setNewListing({ ...newListing, description: e.target.value })}
                    />
                  </div>

                  <div className="relative">
                    <label className="mb-2 block text-xs font-black text-slate-300">Vị trí</label>
                    <div className="relative">
                      <svg className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <input
                        required
                        type="text"
                        className={`w-full rounded-xl border bg-slate-900/70 px-4 py-3 pl-12 text-sm font-semibold text-white placeholder:text-slate-500 outline-none transition focus:border-surf-primary focus:ring-2 focus:ring-surf-primary/20 ${
                          createLocationError ? 'border-red-400' : 'border-slate-700/70'
                        }`}
                        placeholder="Nhập đúng địa chỉ để chọn"
                        value={newListing.location}
                        onFocus={() => setIsCreateLocationFocused(true)}
                        onBlur={() => window.setTimeout(() => setIsCreateLocationFocused(false), 150)}
                        onChange={(e) => handleCreateLocationChange(e.target.value)}
                      />
                    </div>
                    {createLocationError && (
                      <div className="mt-2 text-xs font-semibold text-red-300">{createLocationError}</div>
                    )}
                    {isCreateLocationFocused && (
                      <div className="absolute left-0 right-0 top-[74px] z-30 overflow-hidden rounded-xl border border-surf-primary/20 bg-surf-card shadow-2xl shadow-surf-primary/10">
                        <div className="border-b border-slate-700/70 bg-slate-900/40 px-4 py-2 text-[11px] font-bold text-surf-secondary">
                          {createLocationLoading ? 'Đang tìm địa chỉ...' : 'Chọn một địa chỉ trong danh sách'}
                        </div>
                        {createLocationSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectCreateLocation(suggestion);
                            }}
                            className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-surf-primary/10"
                          >
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surf-primary/15 text-surf-secondary">
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-black text-white">{suggestion.label}</div>
                              <div className="mt-0.5 line-clamp-2 text-xs font-medium text-slate-400">{suggestion.subtitle}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-700/70 p-4">
                <button
                  type="submit"
                  disabled={createImageUploading}
                  className="w-full rounded-lg bg-surf-primary py-3 text-sm font-black text-white transition hover:bg-surf-secondary disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-slate-500"
                >
                  {createImageUploading ? 'Đang tải ảnh...' : 'Đăng mặt hàng'}
                </button>
              </div>
            </form>
          </aside>

          <main className="hidden min-w-0 flex-1 items-center justify-center overflow-y-auto p-8 lg:flex">
            <div className="w-full max-w-5xl rounded-xl border border-surf-primary/10 bg-surf-card p-4 shadow-2xl shadow-surf-primary/10">
              <div className="mb-3 text-sm font-black text-white">Xem trước</div>
              <div className="grid overflow-hidden rounded-lg border border-slate-700/70 bg-surf-dark lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
                <div className="flex min-h-[520px] items-center justify-center bg-black">
                  {createPreviewImage ? (
                    <img src={createPreviewImage} alt={createPreviewTitle} className="max-h-[620px] w-full object-contain" />
                  ) : (
                    <div className="flex h-full min-h-[520px] w-full flex-col items-center justify-center bg-slate-900/70 text-slate-500">
                      <svg className="mb-4 h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-bold">Thêm ảnh để xem trước</span>
                    </div>
                  )}
                </div>
                <div className="space-y-4 border-l border-slate-700/70 p-5">
                  <div>
                    <h3 className="text-2xl font-black leading-tight text-white">{createPreviewTitle}</h3>
                    <div className="mt-1 text-lg font-black text-slate-100">{formatPrice(createPreviewPrice)}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-400">
                      Đã niêm yết vài giây trước tại {createPreviewLocation}
                    </div>
                  </div>

                  <div className="border-t border-slate-700/70 pt-4">
                    <div className="text-sm font-black text-white">Chi tiết</div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-slate-500">Danh mục</div>
                        <div className="mt-1 font-bold text-slate-200">
                          {CATEGORIES.find((c) => c.key === newListing.category)?.label}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Tình trạng</div>
                        <div className="mt-1 font-bold text-slate-200">{CONDITION_LABELS[newListing.condition]}</div>
                      </div>
                    </div>
                    <p className="mt-4 whitespace-pre-wrap text-sm text-slate-300">{createPreviewDescription}</p>
                  </div>

                  {canShowCreatePreviewMap ? (
                    <div className="isolate overflow-hidden rounded-lg border border-surf-primary/20 bg-slate-900/40">
                      <button
                        type="button"
                        onClick={() => setIsCreateMapOpen(true)}
                        className="w-full text-left transition hover:bg-surf-primary/5"
                      >
                        <div className="relative z-0 h-36 bg-slate-900">
                          <LocationMap center={createMapCenter} zoom={MAP_ZOOM} interactive={false} />
                          <div className="absolute inset-0 bg-black/20 pointer-events-none" />
                          <div className="absolute right-3 top-3 rounded-full bg-surf-primary/90 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                            Map
                          </div>
                        </div>
                        <div className="px-3 py-2 text-xs text-slate-300">
                          <div className="font-black text-slate-100">{createPreviewLocation}</div>
                          <div className="text-[11px] text-surf-secondary">Nhấn để xem bản đồ · Đây chỉ là vị trí gần đúng</div>
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-surf-primary/20 bg-surf-primary/[0.04] px-4 py-5 text-center text-xs font-semibold text-slate-500">
                      Chọn một địa chỉ hợp lệ để hiển thị bản đồ.
                    </div>
                  )}

                  <div className="border-t border-slate-700/70 pt-4">
                    <div className="text-sm font-black text-white">
                      Thông tin về người bán <span className="font-medium text-slate-400">Chi tiết về người bán</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Avatar
                        src={currentUser?.photoURL}
                        name={createSellerName}
                        size="lg"
                        className="ring-2 ring-surf-primary/20"
                      />
                      <div>
                        <div className="text-sm font-black text-white">{createSellerName}</div>
                        <div className="text-xs text-slate-400">Người bán trên Marketplace</div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled
                    className="w-full rounded-lg bg-slate-900/70 py-3 text-sm font-black text-slate-500"
                  >
                    Nhắn tin
                  </button>
                </div>
              </div>
            </div>
          </main>
          {isCreateMapOpen && canShowCreatePreviewMap && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
              <div
                className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                aria-hidden
                onClick={() => setIsCreateMapOpen(false)}
              />
              <div className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-surf-primary/20 bg-surf-card shadow-2xl shadow-surf-primary/10">
                <div className="flex items-center justify-between border-b border-slate-700/70 px-4 py-3">
                  <div>
                    <div className="text-sm font-bold text-white">Vị trí niêm yết</div>
                    <div className="mt-0.5 text-xs text-slate-400">{createPreviewLocation}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCreateMapOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-white transition hover:bg-surf-primary/20"
                    aria-label="Đóng"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                </div>
                <div className="h-[min(64vh,520px)] min-h-[320px] bg-slate-900">
                  <LocationMap
                    center={createMapCenter}
                    zoom={MAP_ZOOM}
                    interactive={true}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {isDetailModalOpen && selectedListing && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-hidden
            onClick={handleCloseDetail}
          />
          <div className="relative z-10 flex h-full w-full items-center justify-center p-3 sm:p-6">
            <div className="relative h-full max-h-[92vh] w-full max-w-[1400px] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 text-white shadow-2xl">
              <button
                type="button"
                onClick={handleCloseDetail}
                className="absolute left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60"
                aria-label="Đóng"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>

              <div className="flex h-full w-full flex-col lg:flex-row">
                <div className="relative flex h-[55vh] flex-1 items-center justify-center bg-black lg:h-full">
                  {activeMediaUrl ? (
                    <>
                      <div
                        className="absolute inset-0 opacity-30 blur-2xl"
                        style={{
                          backgroundImage: `url(${activeMediaUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      />
                      <img
                        src={activeMediaUrl}
                        alt={selectedListing.title}
                        className="relative z-10 max-h-full max-w-full object-contain"
                      />
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-400">
                      <svg className="h-20 w-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}

                  {detailMediaUrls.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-2xl bg-black/40 px-3 py-2 backdrop-blur">
                      {detailMediaUrls.map((url, i) => (
                        <button
                          key={`${url}-${i}`}
                          onClick={() => setActiveMediaIndex(i)}
                          className={`h-12 w-12 overflow-hidden rounded-xl border ${
                            i === activeMediaIndex ? 'border-white' : 'border-white/20'
                          }`}
                        >
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <aside className="w-full border-t border-white/10 bg-slate-950/95 p-5 lg:w-[380px] lg:border-l lg:border-t-0 overflow-y-auto">
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        <span className="rounded-full border border-surf-primary/30 bg-surf-primary/10 px-3 py-1 text-surf-primary">
                          {CATEGORIES.find((c) => c.key === selectedListing.category)?.label}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                          {CONDITION_LABELS[selectedListing.condition]}
                        </span>
                      </div>
                      <h2 className="mt-3 text-xl font-black leading-tight text-white">
                        {selectedListing.title}
                      </h2>
                      <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="font-semibold">{detailStatusLabel}</span>
                      </div>
                      <p className="mt-2 text-2xl font-black text-surf-secondary">
                        {formatPrice(selectedListing.price)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <div className="flex items-center gap-2">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          <span>{detailLocation}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span>{selectedListing.viewCount ?? 0} lượt xem</span>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500">
                        Đã niêm yết tại {detailLocation}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button className="flex-1 rounded-2xl bg-gradient-to-br from-surf-primary to-surf-secondary px-4 py-3 text-sm font-black text-white shadow-xl shadow-surf-primary/30 transition hover:scale-[1.01]">
                        Nhắn tin
                      </button>
                      <button
                        onClick={() => handleToggleSave(selectedListing)}
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-white transition ${
                          isSaved(selectedListing)
                            ? 'border-surf-primary/60 bg-surf-primary/15 text-surf-primary'
                            : 'border-white/10 bg-white/5 text-slate-200'
                        }`}
                        aria-label="Lưu"
                      >
                        <svg className="h-5 w-5" fill={isSaved(selectedListing) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                      </button>
                      <button
                        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
                        aria-label="Chia sẻ"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                      </button>
                      <button
                        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
                        aria-label="Tùy chọn"
                      >
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                        </svg>
                      </button>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Chi tiết</div>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Tình trạng</span>
                          <span className="font-semibold text-slate-100">{CONDITION_LABELS[selectedListing.condition]}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Thương hiệu</span>
                          <span className="font-semibold text-slate-100">{detailBrand}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Danh mục</span>
                          <span className="font-semibold text-slate-100">
                            {CATEGORIES.find((c) => c.key === selectedListing.category)?.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Vị trí</span>
                          <span className="font-semibold text-slate-100">{detailLocation}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Lượt xem</span>
                          <span className="font-semibold text-slate-100">{selectedListing.viewCount ?? 0}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Mô tả</div>
                      <p className="mt-3 text-sm leading-relaxed text-slate-200">
                        {selectedListing.description || 'Không có mô tả chi tiết cho sản phẩm này.'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setIsMapOpen(true)}
                        className="w-full text-left"
                      >
                        <div className="relative aspect-[16/9] bg-slate-900">
                          <LocationMap
                            center={mapCenter}
                            zoom={MAP_ZOOM}
                            interactive={false}
                          />
                          <div className="absolute inset-0 bg-black/20 pointer-events-none" />
                          <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                            Map
                          </div>
                        </div>
                        <div className="px-4 py-3 text-xs text-slate-300">
                          <div className="font-semibold text-slate-100">{detailLocation}</div>
                          <div className="text-[11px] text-slate-400">Đây chỉ là vị trí gần đúng</div>
                        </div>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={openSellerProfile}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-surf-primary/40 hover:bg-white/10"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Thông tin người bán</div>
                        <span className="text-[11px] font-bold text-surf-secondary">Chi tiết về người bán</span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <Avatar
                          src={selectedListing.sellerPhotoURL}
                          name={selectedListing.sellerDisplayName}
                          size="lg"
                          className="ring-2 ring-white/20"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-black text-white">{selectedListing.sellerDisplayName}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span>Rất tích cực trên Marketplace</span>
                          </div>
                        </div>
                        <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-slate-200">
                          Xem trang
                        </span>
                      </div>
                    </button>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Gửi tin nhắn cho người bán</div>
                      <textarea
                        rows={2}
                        placeholder="Mặt hàng này còn chứ?"
                        className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-surf-primary/60"
                      />
                      <button className="mt-3 w-full rounded-xl bg-surf-primary py-2.5 text-sm font-black text-white transition hover:bg-surf-secondary">
                        Gửi
                      </button>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
          {isMapOpen && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/70"
                aria-hidden
                onClick={() => setIsMapOpen(false)}
              />
              <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="text-sm font-bold text-white">Vị trí niêm yết</div>
                  <button
                    type="button"
                    onClick={() => setIsMapOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    aria-label="Đóng"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                </div>
                <div className="aspect-[4/3] bg-slate-900">
                  <LocationMap
                    center={mapCenter}
                    zoom={MAP_ZOOM}
                    interactive={true}
                  />
                </div>
              </div>
            </div>
          )}
          {isSellerProfileOpen && (
            <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/75"
                aria-hidden
                onClick={() => setIsSellerProfileOpen(false)}
              />
              <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#242526] text-white shadow-2xl">
                <div className="relative h-44 shrink-0 bg-slate-800">
                  {sellerCoverUrl ? (
                    <img src={sellerCoverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#242526] via-transparent to-transparent" />
                  <button
                    type="button"
                    onClick={() => setIsSellerProfileOpen(false)}
                    className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/70"
                    aria-label="Đóng"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                </div>
                <div className="overflow-y-auto px-5 pb-5">
                  <div className="-mt-12 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end">
                    <Avatar
                      src={selectedListing.sellerPhotoURL}
                      name={sellerName}
                      size="2xl"
                      className="shrink-0 rounded-full ring-4 ring-[#242526]"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-2xl font-black text-white">{sellerName}</h3>
                      <p className="mt-1 text-xs font-semibold text-slate-300">
                        {sellerProfileListings.length} bài niêm yết đang hoạt động
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_auto]">
                    <button
                      type="button"
                      className="rounded-lg bg-surf-primary px-4 py-2.5 text-sm font-black text-white transition hover:bg-surf-secondary"
                    >
                      Theo dõi
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/15"
                    >
                      Nhắn tin
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/15 sm:col-span-2"
                    >
                      Xem trang cá nhân
                    </button>
                  </div>

                  <div className="border-t border-white/10 py-4">
                    <div className="text-sm font-black text-white">Huy hiệu</div>
                    <p className="mt-1 text-xs text-slate-400">Dựa theo hoạt động của {sellerShortName} trên Marketplace</p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500">
                        <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-black text-white">Rất tích cực</div>
                        <div className="text-xs text-slate-400">Thường trả lời trong vòng 1 giờ</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mt-4 w-full rounded-lg bg-white/10 py-2 text-xs font-black text-white transition hover:bg-white/15"
                    >
                      Xem chi tiết về huy hiệu
                    </button>
                  </div>

                  <div className="border-t border-white/10 py-4">
                    <div className="text-sm font-black text-white">Giới thiệu</div>
                    <div className="mt-3 space-y-2 text-xs font-semibold text-slate-200">
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 shrink-0 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                        </svg>
                        <span>Sống tại {detailLocation}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 shrink-0 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm1 11h-2V7h2zm0 4h-2v-2h2z" />
                        </svg>
                        <span>Rất nhiệt tình trả lời tin nhắn</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 shrink-0 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.93 6h-2.95a15.3 15.3 0 00-1.38-3.25A8.03 8.03 0 0118.93 8zM12 4.04A13.2 13.2 0 0113.91 8h-3.82A13.2 13.2 0 0112 4.04zM4.26 14A8.35 8.35 0 014 12c0-.69.09-1.36.26-2h3.33A16.36 16.36 0 007.5 12c0 .68.03 1.35.09 2H4.26zm.81 2h2.95c.33 1.17.79 2.27 1.38 3.25A8.03 8.03 0 015.07 16zm2.95-8H5.07A8.03 8.03 0 019.4 4.75 15.3 15.3 0 008.02 8zM12 19.96A13.2 13.2 0 0110.09 16h3.82A13.2 13.2 0 0112 19.96zM14.34 14H9.66A14.71 14.71 0 019.5 12c0-.7.06-1.37.16-2h4.68c.1.63.16 1.3.16 2s-.06 1.37-.16 2zm.26 5.25A15.3 15.3 0 0015.98 16h2.95a8.03 8.03 0 01-4.33 3.25zM16.41 14c.06-.65.09-1.32.09-2s-.03-1.35-.09-2h3.33c.17.64.26 1.31.26 2s-.09 1.36-.26 2h-3.33z" />
                        </svg>
                        <span>Đã tham gia Surf Marketplace</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <div className="text-sm font-black text-white">Bài niêm yết của {sellerShortName}</div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={sellerListingSearch}
                          onChange={(e) => setSellerListingSearch(e.target.value)}
                          placeholder="Tìm kiếm bài niêm yết"
                          className="w-full rounded-lg border border-white/10 bg-white/10 py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-surf-primary/60"
                        />
                        <svg className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <span className="rounded-lg bg-white/10 px-3 py-2 text-center text-xs font-black text-white">Còn bài với cửa hàng</span>
                      <span className="rounded-lg bg-white/10 px-3 py-2 text-center text-xs font-black text-white">Sắp xếp theo</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {sellerFilteredListings.map((listing) => (
                        <button
                          key={listing.id}
                          type="button"
                          onClick={() => {
                            setSelectedListing(listing);
                            setActiveMediaIndex(0);
                            setIsSellerProfileOpen(false);
                          }}
                          className="overflow-hidden rounded-xl bg-white/5 text-left transition hover:bg-white/10"
                        >
                          <div className="aspect-square bg-slate-800">
                            {listing.mediaUrls?.[0] ? (
                              <img src={listing.mediaUrls[0]} alt={listing.title} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-600">
                                <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="p-2">
                            <div className="text-sm font-black text-white">{formatPrice(listing.price)}</div>
                            <div className="mt-1 line-clamp-2 text-xs font-semibold text-slate-200">{listing.title}</div>
                            <div className="mt-1 truncate text-[11px] text-slate-400">{listing.location || 'Toàn quốc'}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {sellerFilteredListings.length === 0 && (
                      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5 text-center text-sm font-semibold text-slate-400">
                        Không tìm thấy bài niêm yết phù hợp.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
