import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';

type LiveRole = 'broadcaster' | 'viewer';
type AppTheme = 'light' | 'dark';

type LiveStream = {
  id: string;
  hostId: string;
  hostName: string;
  hostPhotoURL: string | null;
  title: string;
  status: 'live' | 'ended';
  provider: 'daily' | 'livekit';
  transport: 'daily' | 'socket-webrtc' | 'livekit';
  providerRoomName: string | null;
  providerRoomUrl: string | null;
  viewerCount: number;
  reactionCounts: Record<string, number>;
  startedAt: string;
  endedAt: string | null;
};

type TwitchStream = {
  id: string;
  platform?: 'twitch' | 'youtube';
  platformName?: string;
  userId: string;
  userLogin: string;
  userName: string;
  gameId: string;
  gameName: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  language: string;
  thumbnailUrl: string;
  tags: string[];
  isMature: boolean;
  twitchUrl: string;
  watchUrl?: string;
  embedUrl?: string | null;
  chatEmbedUrl?: string | null;
};

type ExternalLiveSource = {
  platform: 'twitch' | 'youtube';
  platformName: string;
  source: 'twitch' | 'youtube' | 'cache' | 'stale-cache' | 'unconfigured' | 'error';
  configured: boolean;
  count: number;
  message?: string;
  error?: string;
};

type ExternalChannelGroup = {
  key: string;
  platform: 'twitch' | 'youtube';
  platformName: string;
  channelName: string;
  totalViewerCount: number;
  streams: TwitchStream[];
};

type LiveComment = {
  id: string;
  streamId: string;
  userId: string;
  authorName: string;
  authorPhotoURL: string | null;
  text: string;
  createdAt: string;
};

type LiveSignal =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'candidate'; candidate: RTCIceCandidateInit };

type LiveKitLiveTokenResponse = {
  provider: 'livekit';
  roomName: string;
  serverUrl: string;
  token: string;
};

type FloatingReaction = {
  id: string;
  emoji: string;
  left: number;
};

const reactionOptions = ['❤️', '🔥', '👏', '😂', '😮', '👍'];

const iceServers: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const createClientInstanceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const shouldUseLiveKit = (stream: LiveStream) =>
  stream.transport === 'livekit' || stream.provider === 'livekit';

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(iso));

const getInitial = (name: string) => name.trim().charAt(0).toUpperCase() || 'S';

const formatViewerCount = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.0', '')} Tr`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace('.0', '')} N`;
  return `${value}`;
};

const categoryCards = [
  {
    title: 'Trò chuyện',
    meta: 'Cộng đồng',
    keywords: ['trò chuyện', 'chat', 'talk', 'podcast', 'freetalk', 'just chatting', 'irl'],
    gradient: 'from-fuchsia-500 via-rose-500 to-amber-400',
    image:
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=640&q=80',
  },
  {
    title: 'Gaming',
    meta: 'Đấu đội',
    keywords: [
      'gaming',
      'game',
      'esports',
      'valorant',
      'dota',
      'league',
      'free fire',
      'minecraft',
      'roblox',
      'dreamleague',
      'sprunki',
    ],
    gradient: 'from-cyan-400 via-blue-500 to-violet-600',
    image:
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=640&q=80',
  },
  {
    title: 'Âm nhạc',
    meta: 'Sân khấu',
    keywords: [
      'âm nhạc',
      'music',
      'nhạc',
      'lofi',
      'radio',
      'jazz',
      'piano',
      'beats',
      'ambient',
      'chill',
    ],
    gradient: 'from-emerald-400 via-teal-500 to-sky-500',
    image:
      'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=640&q=80',
  },
  {
    title: 'Học tập',
    meta: 'Focus room',
    keywords: [
      'học tập',
      'study',
      'focus',
      'work',
      'coding',
      'lecture',
      'co-working',
      'deep focus',
    ],
    gradient: 'from-indigo-400 via-purple-500 to-pink-500',
    image:
      'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=640&q=80',
  },
  {
    title: 'IRL',
    meta: 'Đời sống',
    keywords: ['irl', 'đời sống', 'life', 'travel', 'vlog', 'food', 'street', 'event'],
    gradient: 'from-lime-400 via-green-500 to-emerald-600',
    image:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=640&q=80',
  },
  {
    title: 'Sáng tạo',
    meta: 'Studio',
    keywords: ['sáng tạo', 'creative', 'art', 'draw', 'drawing', 'design', 'studio', 'live2d'],
    gradient: 'from-orange-400 via-red-500 to-fuchsia-600',
    image:
      'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=640&q=80',
  },
];

type LiveCategoryCard = (typeof categoryCards)[number];

const liveTags = ['SurfLive', 'Vietnamese', 'Community', 'IRL', 'Gaming', 'Music'];

const streamCoverGradients = [
  'from-cyan-500/80 via-slate-950 to-fuchsia-500/80',
  'from-emerald-400/80 via-slate-950 to-blue-500/80',
  'from-rose-500/80 via-slate-950 to-amber-400/80',
  'from-indigo-500/80 via-slate-950 to-teal-400/80',
  'from-violet-500/80 via-slate-950 to-lime-400/80',
];

const streamCoverImages = categoryCards.map((category) => category.image);

const getCoverGradient = (value: string) =>
  streamCoverGradients[(value.charCodeAt(0) || 0) % streamCoverGradients.length];

const getCoverImage = (value: string) =>
  streamCoverImages[(value.charCodeAt(value.length - 1) || 0) % streamCoverImages.length];

const getEmbedHostname = () => {
  if (typeof window === 'undefined') return 'localhost';
  return window.location.hostname || 'localhost';
};

const getTwitchEmbedParents = () => {
  const hostname = getEmbedHostname();
  return hostname === 'localhost' ? ['localhost', '127.0.0.1'] : [hostname];
};

const buildTwitchEmbedUrl = (baseUrl: string, channel: string, extra?: Record<string, string>) => {
  const params = new URLSearchParams(extra);
  params.set('channel', channel);
  getTwitchEmbedParents().forEach((parent) => params.append('parent', parent));
  return `${baseUrl}?${params.toString()}`;
};

const getAppChatTheme = (themeMode?: ThemeMode): AppTheme => {
  if (themeMode === 'dark') return 'dark';
  if (themeMode === 'light') return 'light';
  if (
    themeMode === 'system' &&
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  if (
    !themeMode &&
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
  ) {
    return 'dark';
  }
  return 'light';
};

const buildTwitchChatUrl = (channel: string, chatTheme: AppTheme) => {
  const params = new URLSearchParams();
  if (chatTheme === 'dark') params.set('darkpopout', 'true');
  getTwitchEmbedParents().forEach((parent) => params.append('parent', parent));
  return `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?${params.toString()}`;
};

const buildYouTubeChatUrl = (chatEmbedUrl: string | null | undefined, chatTheme: AppTheme) => {
  if (!chatEmbedUrl) return null;
  const url = new URL(chatEmbedUrl);
  url.searchParams.set('embed_domain', getEmbedHostname());
  url.searchParams.set('dark_theme', chatTheme === 'dark' ? '1' : '0');
  url.searchParams.set('theme', chatTheme);
  url.searchParams.set('hl', 'vi');
  return url.toString();
};

const getExternalPlatform = (stream: TwitchStream) => stream.platform ?? 'twitch';

const getExternalPlatformName = (stream: TwitchStream) =>
  stream.platformName ?? (getExternalPlatform(stream) === 'youtube' ? 'YouTube' : 'Twitch');

const getExternalStreamKey = (stream: TwitchStream) =>
  `${getExternalPlatform(stream)}:${(stream.userLogin || stream.id).toLowerCase()}`;

const normalizeCategoryText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const getExternalCategoryText = (stream: TwitchStream) =>
  normalizeCategoryText(
    [stream.title, stream.userName, stream.gameName, stream.language, stream.tags.join(' ')].join(
      ' '
    )
  );

const matchesCategoryKeywords = (text: string, category: LiveCategoryCard) =>
  category.keywords.some((keyword) => text.includes(normalizeCategoryText(keyword)));

export default function LivePage() {
  const user = useAuthStore((state) => state.user);
  const { streamId } = useParams<{ streamId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const themeMode = useThemeStore((state) => state.theme);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const commentsBottomRef = useRef<HTMLDivElement | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const liveKitRoomRef = useRef<Room | null>(null);
  const liveKitRemoteStreamRef = useRef<MediaStream>(new MediaStream());
  const liveKitClientIdRef = useRef(createClientInstanceId());
  const localStreamRef = useRef<MediaStream | null>(null);
  const roleRef = useRef<LiveRole | null>(null);
  const streamIdRef = useRef<string | null>(null);

  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [activeStream, setActiveStream] = useState<LiveStream | null>(null);
  const [role, setRole] = useState<LiveRole | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState('Live cùng Surf');
  const [joinDraft, setJoinDraft] = useState('');
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [twitchStreams, setTwitchStreams] = useState<TwitchStream[]>([]);
  const [loadingTwitchStreams, setLoadingTwitchStreams] = useState(true);
  const [twitchStatus, setTwitchStatus] = useState<string | null>(null);
  const [chatTheme, setChatTheme] = useState<AppTheme>(() =>
    getAppChatTheme(useThemeStore.getState().theme)
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [selectedExternalStreamKey, setSelectedExternalStreamKey] = useState<string | null>(null);
  const [selectedExternalChannelKey, setSelectedExternalChannelKey] = useState<string | null>(null);
  const [suppressRouteExternalTarget, setSuppressRouteExternalTarget] = useState(false);
  const [starting, setStarting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    streamIdRef.current = activeStream?.id ?? null;
  }, [activeStream?.id]);

  useEffect(() => {
    const syncChatTheme = () => setChatTheme(getAppChatTheme(themeMode));
    syncChatTheme();

    if (themeMode !== 'system' || typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', syncChatTheme);

    return () => mediaQuery.removeEventListener('change', syncChatTheme);
  }, [themeMode]);

  useEffect(() => {
    localStreamRef.current = localStream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    commentsBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [comments.length]);

  const totalReactions = useMemo(
    () =>
      Object.values(activeStream?.reactionCounts ?? {}).reduce(
        (total, value) => total + (Number.isFinite(value) ? value : 0),
        0
      ),
    [activeStream?.reactionCounts]
  );
  const sortedStreams = useMemo(
    () =>
      [...streams].sort((a, b) => {
        const viewerDiff = b.viewerCount - a.viewerCount;
        if (viewerDiff !== 0) return viewerDiff;
        return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
      }),
    [streams]
  );
  const featuredStream =
    activeStream?.status === 'live' ? activeStream : (sortedStreams[0] ?? null);
  const sidebarStreams = sortedStreams.slice(0, 10);
  const mainGridStreams = sortedStreams.filter((stream) => stream.id !== featuredStream?.id);
  const externalTarget = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const external = params.get('external')?.trim().toLowerCase();
    if (external) {
      const [platform, ...idParts] = external.split(':');
      const id = idParts.join(':');
      if ((platform === 'twitch' || platform === 'youtube') && id) {
        return { platform, id };
      }
    }

    const twitch = params.get('twitch')?.trim().toLowerCase();
    return twitch ? { platform: 'twitch' as const, id: twitch } : null;
  }, [location.search]);

  useEffect(() => {
    setSuppressRouteExternalTarget(false);
  }, [location.search]);

  const routeExternalTarget = suppressRouteExternalTarget ? null : externalTarget;
  const activeTwitchStream = useMemo(
    () =>
      routeExternalTarget
        ? (twitchStreams.find((stream) => {
            const platform = getExternalPlatform(stream);
            const targetId = routeExternalTarget.id.toLowerCase();
            return (
              platform === routeExternalTarget.platform &&
              (stream.userLogin.toLowerCase() === targetId || stream.id.toLowerCase() === targetId)
            );
          }) ?? null)
        : null,
    [routeExternalTarget, twitchStreams]
  );
  const selectedExternalStream = useMemo(
    () =>
      selectedExternalStreamKey
        ? (twitchStreams.find(
            (stream) => getExternalStreamKey(stream) === selectedExternalStreamKey
          ) ?? null)
        : null,
    [selectedExternalStreamKey, twitchStreams]
  );
  const twitchWatchStream = activeStream ? null : (selectedExternalStream ?? activeTwitchStream);
  const isTwitchWatchMode = Boolean(twitchWatchStream);
  const isWatchMode = Boolean(activeStream) || isTwitchWatchMode;
  const selectedCategoryCard = useMemo(
    () => categoryCards.find((category) => category.title === selectedCategory) ?? null,
    [selectedCategory]
  );
  const externalChannelGroups = useMemo<ExternalChannelGroup[]>(() => {
    const groups = new Map<string, ExternalChannelGroup>();

    twitchStreams.forEach((stream) => {
      const platform = getExternalPlatform(stream);
      const channelId = stream.userId || stream.userLogin || stream.id;
      const key = `${platform}:${channelId.toLowerCase()}`;
      const current = groups.get(key);

      if (current) {
        current.streams.push(stream);
        current.totalViewerCount += stream.viewerCount;
        return;
      }

      groups.set(key, {
        key,
        platform,
        platformName: getExternalPlatformName(stream),
        channelName: stream.userName,
        totalViewerCount: stream.viewerCount,
        streams: [stream],
      });
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        streams: [...group.streams].sort((a, b) => b.viewerCount - a.viewerCount),
      }))
      .sort((a, b) => b.totalViewerCount - a.totalViewerCount)
      .slice(0, 12);
  }, [twitchStreams]);
  const selectedExternalChannelGroup = useMemo(
    () =>
      selectedExternalChannelKey
        ? (externalChannelGroups.find((group) => group.key === selectedExternalChannelKey) ?? null)
        : null,
    [externalChannelGroups, selectedExternalChannelKey]
  );
  const visibleExternalStreams = useMemo(() => {
    if (selectedExternalChannelGroup) return selectedExternalChannelGroup.streams;
    return selectedCategoryCard
      ? twitchStreams.filter((stream) =>
          matchesCategoryKeywords(getExternalCategoryText(stream), selectedCategoryCard)
        )
      : twitchStreams;
  }, [selectedCategoryCard, selectedExternalChannelGroup, twitchStreams]);
  const refreshStreams = useCallback(async () => {
    try {
      const data = await api.get<{ items: LiveStream[] }>('/api/live-streams');
      setStreams(data.items ?? []);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const refreshTwitchStreams = useCallback(async () => {
    setLoadingTwitchStreams(true);
    try {
      const params = new URLSearchParams({
        limit: '30',
        youtubeLimit: '12',
        regionCode: 'VN',
        relevanceLanguage: 'vi',
      });
      if (externalTarget?.platform === 'twitch') {
        params.set('userLogin', externalTarget.id);
      }
      const data = await api.get<{
        items: TwitchStream[];
        sources?: ExternalLiveSource[];
      }>(`/api/live-streams/external?${params.toString()}`);
      const items = data.items ?? [];
      setTwitchStreams(items);
      const sources = data.sources ?? [];
      const missingSources = sources.filter((source) => !source.configured);
      const erroredSources = sources.filter((source) => source.error);
      const configuredSources = sources.filter((source) => source.configured);

      if (sources.length > 0 && missingSources.length === sources.length) {
        setTwitchStatus(
          'Chưa cấu hình API nền tảng live. Thêm TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET hoặc YOUTUBE_API_KEY để lấy stream thật.'
        );
      } else if (erroredSources.length > 0) {
        setTwitchStatus(
          erroredSources.map((source) => `${source.platformName}: ${source.error}`).join(' · ')
        );
      } else if (items.length === 0 && configuredSources.length > 0) {
        setTwitchStatus(
          `${configuredSources.map((source) => source.platformName).join(', ')} đã cấu hình nhưng hiện API không trả stream đang live cho bộ lọc này.`
        );
      } else if (sources.some((source) => source.source === 'stale-cache')) {
        setTwitchStatus('Đang dùng cache dự phòng vì YouTube quota/API tạm lỗi.');
      } else if (sources.some((source) => source.source === 'cache')) {
        setTwitchStatus('Live ngoài Surf đang dùng cache để giảm gọi API/quota.');
      } else {
        setTwitchStatus(null);
      }
    } catch (err) {
      setTwitchStreams([]);
      setTwitchStatus((err as Error).message);
    } finally {
      setLoadingTwitchStreams(false);
    }
  }, [externalTarget]);

  const loadComments = useCallback(async (id: string) => {
    try {
      const data = await api.get<{ comments: LiveComment[] }>(`/api/live-streams/${id}/comments`);
      setComments(data.comments ?? []);
    } catch {
      setComments([]);
    }
  }, []);

  const closePeerConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
  }, []);

  const syncLiveKitRemoteStream = useCallback(() => {
    const tracks = liveKitRemoteStreamRef.current.getTracks();
    setRemoteStream(tracks.length > 0 ? new MediaStream(tracks) : null);
  }, []);

  const resetLiveKitRemoteStream = useCallback(() => {
    liveKitRemoteStreamRef.current = new MediaStream();
    setRemoteStream(null);
  }, []);

  const disconnectLiveKit = useCallback(() => {
    liveKitRoomRef.current?.disconnect();
    liveKitRoomRef.current = null;
    resetLiveKitRemoteStream();
  }, [resetLiveKitRemoteStream]);

  const stopLocalMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const sendSignal = useCallback((targetSocketId: string, signal: LiveSignal) => {
    const currentStreamId = streamIdRef.current;
    if (!currentStreamId) return;
    getSocket().emit('live:signal', {
      streamId: currentStreamId,
      targetSocketId,
      signal,
    });
  }, []);

  const createPeerConnection = useCallback(
    (targetSocketId: string) => {
      const pc = new RTCPeerConnection(iceServers);

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        sendSignal(targetSocketId, {
          type: 'candidate',
          candidate: event.candidate.toJSON(),
        });
      };

      pc.ontrack = (event) => {
        if (roleRef.current !== 'viewer') return;
        const [incomingStream] = event.streams;
        if (incomingStream) {
          setRemoteStream(incomingStream);
          return;
        }

        setRemoteStream((current) => {
          const next = current ?? new MediaStream();
          next.addTrack(event.track);
          return next;
        });
      };

      return pc;
    },
    [sendSignal]
  );

  const addLiveKitRemoteTrack = useCallback(
    (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Video && track.kind !== Track.Kind.Audio) return;

      const mediaTrack = track.mediaStreamTrack;
      const stream = liveKitRemoteStreamRef.current;
      if (!stream.getTracks().some((item) => item.id === mediaTrack.id)) {
        stream.addTrack(mediaTrack);
      }
      syncLiveKitRemoteStream();
    },
    [syncLiveKitRemoteStream]
  );

  const removeLiveKitRemoteTrack = useCallback(
    (track: RemoteTrack) => {
      const mediaTrack = track.mediaStreamTrack;
      const stream = liveKitRemoteStreamRef.current;
      stream
        .getTracks()
        .filter((item) => item.id === mediaTrack.id)
        .forEach((item) => stream.removeTrack(item));
      syncLiveKitRemoteStream();
    },
    [syncLiveKitRemoteStream]
  );

  const connectLiveKitStream = useCallback(
    async (stream: LiveStream, nextRole: LiveRole, sourceStream?: MediaStream) => {
      disconnectLiveKit();

      const participantName =
        user?.displayName?.trim() || user?.email?.split('@')[0]?.trim() || 'Surf user';
      const tokenResponse = await api.post<LiveKitLiveTokenResponse>(
        `/api/live-streams/${stream.id}/livekit-token`,
        {
          role: nextRole,
          clientId: liveKitClientIdRef.current,
          participantName,
        }
      );

      if (
        tokenResponse.provider !== 'livekit' ||
        !tokenResponse.serverUrl ||
        !tokenResponse.token
      ) {
        throw new Error('LiveKit chưa được cấu hình cho Surf Live.');
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: {
          simulcast: true,
        },
      });

      room.on(RoomEvent.TrackSubscribed, (track) => {
        addLiveKitRemoteTrack(track);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        removeLiveKitRemoteTrack(track);
      });
      room.on(RoomEvent.Disconnected, () => {
        if (streamIdRef.current === stream.id && roleRef.current === 'viewer') {
          resetLiveKitRemoteStream();
        }
      });

      liveKitRoomRef.current = room;
      await room.connect(tokenResponse.serverUrl, tokenResponse.token);

      if (nextRole === 'broadcaster' && sourceStream) {
        for (const track of sourceStream.getTracks()) {
          await room.localParticipant.publishTrack(track, {
            source: track.kind === 'video' ? Track.Source.Camera : Track.Source.Microphone,
            simulcast: track.kind === 'video',
          });
        }
        return;
      }

      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          const subscribedTrack = publication.track;
          if (subscribedTrack) addLiveKitRemoteTrack(subscribedTrack);
        });
      });
    },
    [
      addLiveKitRemoteTrack,
      disconnectLiveKit,
      removeLiveKitRemoteTrack,
      resetLiveKitRemoteStream,
      user?.displayName,
      user?.email,
    ]
  );

  const joinViewer = useCallback(
    async (stream: LiveStream) => {
      if (roleRef.current === 'viewer' && streamIdRef.current === stream.id) return;

      setJoining(true);
      setError(null);
      closePeerConnections();
      setRemoteStream(null);
      setActiveStream(stream);
      setRole('viewer');
      try {
        await loadComments(stream.id);
        if (shouldUseLiveKit(stream)) {
          await connectLiveKitStream(stream, 'viewer');
        } else {
          disconnectLiveKit();
        }
        getSocket().emit('live:join', { streamId: stream.id, role: 'viewer' });
      } catch (err) {
        disconnectLiveKit();
        closePeerConnections();
        setRemoteStream(null);
        setRole(null);
        setActiveStream(null);
        setError((err as Error).message || 'Không thể tham gia live stream.');
      } finally {
        setJoining(false);
      }
    },
    [closePeerConnections, connectLiveKitStream, disconnectLiveKit, loadComments]
  );

  const openSurfStream = useCallback(
    async (stream: LiveStream) => {
      if (roleRef.current === 'broadcaster' && streamIdRef.current !== stream.id) {
        setError('Bạn đang phát live trên Surf. Hãy kết thúc live trước khi xem live khác.');
        return;
      }
      if (streamIdRef.current === stream.id && roleRef.current) {
        setSelectedExternalStreamKey(null);
        setSelectedExternalChannelKey(null);
        setSuppressRouteExternalTarget(true);
        setActiveStream(stream);
        return;
      }

      setSelectedExternalStreamKey(null);
      setSelectedExternalChannelKey(null);
      setSuppressRouteExternalTarget(true);
      const currentStreamId = streamIdRef.current;
      if (currentStreamId && currentStreamId !== stream.id) {
        getSocket().emit('live:leave', { streamId: currentStreamId });
      }

      if (stream.status === 'live' && stream.hostId !== user?.uid) {
        await joinViewer(stream);
        return;
      }

      closePeerConnections();
      disconnectLiveKit();
      setActiveStream(stream);
      setRole(stream.hostId === user?.uid && stream.status === 'live' ? roleRef.current : null);
      setComments([]);
    },
    [closePeerConnections, disconnectLiveKit, joinViewer, user?.uid]
  );

  useEffect(() => {
    void refreshStreams();
  }, [refreshStreams]);

  useEffect(() => {
    void refreshTwitchStreams();
  }, [refreshTwitchStreams]);

  useEffect(() => {
    if (!streamId) return;
    if (roleRef.current === 'broadcaster' && streamIdRef.current === streamId) return;

    let cancelled = false;
    const loadStream = async () => {
      setError(null);
      try {
        const data = await api.get<{ item: LiveStream }>(`/api/live-streams/${streamId}`);
        if (cancelled) return;
        setActiveStream(data.item);
        if (data.item.status === 'live' && data.item.hostId !== user?.uid) {
          await joinViewer(data.item);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };

    void loadStream();
    return () => {
      cancelled = true;
    };
  }, [joinViewer, streamId, user?.uid]);

  useEffect(() => {
    if (!externalTarget || streamId) return;
    if (roleRef.current === 'broadcaster') return;

    const currentStreamId = streamIdRef.current;
    if (currentStreamId) getSocket().emit('live:leave', { streamId: currentStreamId });
    closePeerConnections();
    disconnectLiveKit();
    setActiveStream(null);
    setRole(null);
    setComments([]);
  }, [closePeerConnections, disconnectLiveKit, externalTarget, streamId]);

  useEffect(() => {
    const socket = getSocket();

    const onViewerJoined = async (payload: {
      streamId: string;
      viewerSocketId: string;
      viewerId: string | null;
    }) => {
      if (roleRef.current !== 'broadcaster') return;
      if (payload.streamId !== streamIdRef.current) return;
      if (liveKitRoomRef.current) return;
      const source = localStreamRef.current;
      if (!source) return;

      peerConnectionsRef.current.get(payload.viewerSocketId)?.close();
      const pc = createPeerConnection(payload.viewerSocketId);
      peerConnectionsRef.current.set(payload.viewerSocketId, pc);
      source.getTracks().forEach((track) => pc.addTrack(track, source));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(payload.viewerSocketId, { type: 'offer', sdp: offer.sdp ?? '' });
    };

    const onViewerLeft = (payload: { streamId: string; viewerSocketId: string }) => {
      if (payload.streamId !== streamIdRef.current) return;
      const pc = peerConnectionsRef.current.get(payload.viewerSocketId);
      pc?.close();
      peerConnectionsRef.current.delete(payload.viewerSocketId);
    };

    const onSignal = async (payload: {
      streamId: string;
      fromSocketId: string;
      signal: LiveSignal;
    }) => {
      if (payload.streamId !== streamIdRef.current) return;
      if (liveKitRoomRef.current) return;
      const { signal } = payload;

      if (signal.type === 'offer') {
        if (roleRef.current !== 'viewer') return;
        peerConnectionsRef.current.get(payload.fromSocketId)?.close();
        const pc = createPeerConnection(payload.fromSocketId);
        peerConnectionsRef.current.set(payload.fromSocketId, pc);
        await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(payload.fromSocketId, { type: 'answer', sdp: answer.sdp ?? '' });
        return;
      }

      const pc = peerConnectionsRef.current.get(payload.fromSocketId);
      if (!pc) return;

      if (signal.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      } else if (signal.type === 'candidate') {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    };

    const onViewerCount = (payload: { streamId: string; count: number }) => {
      if (payload.streamId !== streamIdRef.current) return;
      setActiveStream((current) =>
        current ? { ...current, viewerCount: payload.count } : current
      );
      setStreams((current) =>
        current.map((stream) =>
          stream.id === payload.streamId ? { ...stream, viewerCount: payload.count } : stream
        )
      );
    };

    const onComment = (comment: LiveComment) => {
      if (comment.streamId !== streamIdRef.current) return;
      setComments((current) =>
        current.some((item) => item.id === comment.id) ? current : [...current, comment]
      );
    };

    const onReaction = (payload: {
      streamId: string;
      emoji: string;
      counts: Record<string, number>;
    }) => {
      if (payload.streamId !== streamIdRef.current) return;
      setActiveStream((current) =>
        current ? { ...current, reactionCounts: payload.counts } : current
      );
      const reactionId = `${payload.emoji}-${Date.now()}-${Math.random()}`;
      setFloatingReactions((current) => [
        ...current,
        { id: reactionId, emoji: payload.emoji, left: 15 + Math.random() * 70 },
      ]);
      window.setTimeout(() => {
        setFloatingReactions((current) => current.filter((item) => item.id !== reactionId));
      }, 1800);
    };

    const onEnded = (payload: { streamId: string }) => {
      if (payload.streamId !== streamIdRef.current) return;
      setActiveStream((current) => (current ? { ...current, status: 'ended' } : current));
      setRole(null);
      disconnectLiveKit();
      closePeerConnections();
    };

    socket.on('live:viewer-joined', onViewerJoined);
    socket.on('live:viewer-left', onViewerLeft);
    socket.on('live:signal', onSignal);
    socket.on('live:viewer-count', onViewerCount);
    socket.on('live:comment', onComment);
    socket.on('live:reaction', onReaction);
    socket.on('live:ended', onEnded);

    return () => {
      socket.off('live:viewer-joined', onViewerJoined);
      socket.off('live:viewer-left', onViewerLeft);
      socket.off('live:signal', onSignal);
      socket.off('live:viewer-count', onViewerCount);
      socket.off('live:comment', onComment);
      socket.off('live:reaction', onReaction);
      socket.off('live:ended', onEnded);
    };
  }, [closePeerConnections, createPeerConnection, disconnectLiveKit, sendSignal]);

  useEffect(() => {
    return () => {
      const currentStreamId = streamIdRef.current;
      if (currentStreamId) getSocket().emit('live:leave', { streamId: currentStreamId });
      closePeerConnections();
      disconnectLiveKit();
      stopLocalMedia();
    };
  }, [closePeerConnections, disconnectLiveKit, stopLocalMedia]);

  const startBroadcast = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    setStarting(true);
    setError(null);
    closePeerConnections();
    disconnectLiveKit();

    let requestedStream: MediaStream | null = null;
    let createdStream: LiveStream | null = null;
    try {
      requestedStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      const response = await api.post<{ item: LiveStream }>('/api/live-streams', {
        title: titleDraft.trim() || 'Surf Live',
      });

      createdStream = response.item;
      setLocalStream(requestedStream);

      if (shouldUseLiveKit(response.item)) {
        await connectLiveKitStream(response.item, 'broadcaster', requestedStream);
      } else {
        disconnectLiveKit();
      }

      setActiveStream(response.item);
      setComments([]);
      setRole('broadcaster');
      getSocket().emit('live:join', { streamId: response.item.id, role: 'broadcaster' });
      void refreshStreams();
    } catch (err) {
      if (createdStream) {
        void api.patch(`/api/live-streams/${createdStream.id}/end`).catch(() => undefined);
      }
      disconnectLiveKit();
      requestedStream?.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      setError((err as Error).message || 'Không thể bắt đầu live stream.');
    } finally {
      setStarting(false);
    }
  };

  const stopBroadcast = async () => {
    const currentStreamId = streamIdRef.current;
    if (!currentStreamId) return;

    setError(null);
    try {
      if (roleRef.current === 'broadcaster') {
        await api.patch(`/api/live-streams/${currentStreamId}/end`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      getSocket().emit('live:leave', { streamId: currentStreamId });
      closePeerConnections();
      disconnectLiveKit();
      stopLocalMedia();
      setRole(null);
      setActiveStream((current) => (current ? { ...current, status: 'ended' } : current));
      navigate('/feed/live', { replace: true });
      void refreshStreams();
    }
  };

  const leaveViewer = () => {
    const currentStreamId = streamIdRef.current;
    if (currentStreamId) getSocket().emit('live:leave', { streamId: currentStreamId });
    closePeerConnections();
    disconnectLiveKit();
    setRole(null);
    setActiveStream(null);
    setComments([]);
    navigate('/feed/live', { replace: true });
  };

  const openTwitchStream = (stream: TwitchStream) => {
    if (roleRef.current === 'broadcaster') {
      setError('Bạn đang phát live trên Surf. Hãy kết thúc live trước khi mở stream ngoài Surf.');
      return;
    }

    const currentStreamId = streamIdRef.current;
    if (currentStreamId) getSocket().emit('live:leave', { streamId: currentStreamId });
    closePeerConnections();
    disconnectLiveKit();
    setActiveStream(null);
    setRole(null);
    setComments([]);
    setSuppressRouteExternalTarget(true);
    setSelectedExternalStreamKey(getExternalStreamKey(stream));
  };

  const selectExternalChannelGroup = (group: ExternalChannelGroup) => {
    if (group.streams.length === 1) {
      openTwitchStream(group.streams[0]);
      return;
    }

    if (roleRef.current === 'broadcaster') {
      setError('Bạn đang phát live trên Surf. Hãy kết thúc live trước khi chọn kênh ngoài Surf.');
      return;
    }

    const currentStreamId = streamIdRef.current;
    if (currentStreamId) getSocket().emit('live:leave', { streamId: currentStreamId });
    closePeerConnections();
    disconnectLiveKit();
    setActiveStream(null);
    setRole(null);
    setComments([]);
    setSuppressRouteExternalTarget(true);
    setSelectedExternalStreamKey(null);
    setSelectedCategory('Tất cả');
    setSelectedExternalChannelKey(group.key);
  };

  const submitJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = joinDraft.trim();
    if (!target) return;
    navigate(`/feed/live/${target}`);
  };

  const sendComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = commentDraft.trim();
    if (!text || !activeStream) return;
    getSocket().emit('live:comment', { streamId: activeStream.id, text });
    setCommentDraft('');
  };

  const sendReaction = (emoji: string) => {
    if (!activeStream) return;
    getSocket().emit('live:reaction', { streamId: activeStream.id, emoji });
  };

  const copyStreamId = async () => {
    if (!activeStream) return;
    await navigator.clipboard?.writeText(activeStream.id);
  };

  const renderAvatar = (
    name: string,
    photoURL: string | null,
    className: string,
    fallbackClassName = 'bg-gradient-to-br from-cyan-400 via-blue-500 to-fuchsia-500 text-white'
  ) =>
    photoURL ? (
      <img src={photoURL} alt={name} className={`${className} object-cover`} />
    ) : (
      <div
        className={`${className} ${fallbackClassName} flex items-center justify-center font-bold`}
      >
        {getInitial(name)}
      </div>
    );

  const renderStreamCard = (stream: LiveStream, variant: 'featured' | 'grid' = 'grid') => {
    const isFeatured = variant === 'featured';
    const viewerLabel = formatViewerCount(stream.viewerCount);
    const coverImage = getCoverImage(stream.id);

    return (
      <button
        key={stream.id}
        type="button"
        onClick={() => void openSurfStream(stream)}
        className={
          isFeatured
            ? 'group grid min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-xl shadow-slate-200/70 transition hover:border-cyan-300 hover:shadow-cyan-100 dark:border-slate-700/80 dark:bg-surf-card dark:shadow-slate-950/40 dark:hover:border-cyan-400/60 lg:grid-cols-[minmax(0,1fr)_250px]'
            : 'group min-w-0 rounded-2xl text-left'
        }
      >
        <div
          className={`relative overflow-hidden bg-slate-950 ${
            isFeatured ? 'aspect-video lg:aspect-auto lg:min-h-[300px]' : 'aspect-video rounded-2xl'
          }`}
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.08), rgba(2,6,23,0.82)), url("${coverImage}")`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        >
          <div
            className={`absolute inset-0 bg-gradient-to-br ${getCoverGradient(stream.id)} opacity-45 mix-blend-multiply dark:opacity-50`}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.24),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.12)_0_1px,transparent_1px_16px)] opacity-40" />
          <div className="absolute inset-x-5 top-5 flex items-center justify-between gap-3">
            <span className="rounded bg-rose-600 px-2 py-1 text-xs font-extrabold uppercase leading-none text-white">
              Trực tiếp
            </span>
            <span className="rounded bg-black/65 px-2 py-1 text-xs font-semibold text-white backdrop-blur">
              {formatTime(stream.startedAt)}
            </span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center px-7 text-center">
            <div>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/50 bg-black/40 text-2xl font-black text-white shadow-xl backdrop-blur">
                {getInitial(stream.hostName)}
              </div>
              <p className="line-clamp-2 text-lg font-black text-white drop-shadow md:text-2xl">
                {stream.title}
              </p>
              <p className="mt-2 text-sm font-semibold text-cyan-100">{stream.hostName}</p>
            </div>
          </div>
          <div className="absolute bottom-3 left-3 rounded bg-black/75 px-2 py-1 text-xs font-semibold text-white backdrop-blur">
            {viewerLabel} người xem
          </div>
          <div className="absolute inset-0 ring-0 ring-cyan-400/0 transition group-hover:ring-4 group-hover:ring-cyan-400/50" />
        </div>

        {isFeatured ? (
          <div className="flex min-w-0 flex-col justify-between gap-5 p-5">
            <div>
              <div className="flex items-center gap-3">
                {renderAvatar(stream.hostName, stream.hostPhotoURL, 'h-14 w-14 rounded-full')}
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-slate-950 dark:text-white">
                    {stream.hostName}
                  </p>
                  <p className="truncate text-sm text-cyan-600 dark:text-cyan-200">Surf Live</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-300">
                    {viewerLabel} người xem
                  </p>
                </div>
              </div>
              <p className="mt-4 line-clamp-3 text-sm font-semibold text-slate-700 dark:text-slate-100">
                {stream.title}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {liveTags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700/80 dark:text-slate-100"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 flex min-w-0 gap-3">
            {renderAvatar(stream.hostName, stream.hostPhotoURL, 'h-10 w-10 shrink-0 rounded-full')}
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-bold leading-snug text-slate-950 dark:text-slate-100">
                {stream.title}
              </p>
              <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-400">
                {stream.hostName}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-500">Surf Live</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {liveTags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-700/80 dark:text-slate-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </button>
    );
  };

  const renderTwitchCard = (stream: TwitchStream) => {
    const platform = getExternalPlatform(stream);
    const platformName = getExternalPlatformName(stream);
    const badgeClass = platform === 'youtube' ? 'bg-red-600' : 'bg-[#9146ff]';

    return (
      <button
        key={`${platform}-${stream.id}`}
        type="button"
        onClick={() => openTwitchStream(stream)}
        className="group flex h-full min-w-0 flex-col rounded-2xl text-left"
      >
        <div
          className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950 shadow-lg shadow-slate-200 transition group-hover:-translate-y-0.5 group-hover:shadow-cyan-100 dark:shadow-black/30"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.02), rgba(2,6,23,0.32)), url("${stream.thumbnailUrl || getCoverImage(stream.id)}")`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        >
          <div className="absolute left-3 top-3">
            <span
              className={`rounded px-2 py-1 text-xs font-extrabold uppercase leading-none text-white ${badgeClass}`}
            >
              {platformName}
            </span>
          </div>
          <span className="absolute bottom-3 left-3 rounded bg-black/75 px-2 py-1 text-xs font-bold text-white">
            {formatViewerCount(stream.viewerCount)} xem
          </span>
        </div>
        <div className="mt-3 grid min-h-[154px] grid-cols-[44px_minmax(0,1fr)] gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black text-white ${badgeClass}`}
          >
            {getInitial(stream.userName)}
          </div>
          <div className="flex min-w-0 flex-col">
            <p className="line-clamp-2 text-base font-black leading-snug text-slate-950 transition group-hover:text-cyan-600 dark:text-slate-100 dark:group-hover:text-cyan-300">
              {stream.title}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-300">
              {stream.userName}
            </p>
            <p className="truncate text-sm text-slate-600 dark:text-slate-400">{stream.gameName}</p>
            <div className="mt-2 flex min-h-[54px] flex-wrap content-start gap-1.5 overflow-hidden">
              {(stream.tags.length > 0 ? stream.tags : [platformName, stream.language || 'Live'])
                .slice(0, 3)
                .map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-700/80 dark:text-slate-300"
                  >
                    {tag}
                  </span>
                ))}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const renderCreateLivePanel = () => (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-surf-card dark:shadow-lg dark:shadow-slate-950/20">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-lg font-black text-white">
          S
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-300">
            Surf Studio
          </p>
          <h2 className="truncate text-lg font-black text-slate-950 dark:text-white">
            Tạo live trên Surf
          </h2>
        </div>
      </div>

      {!role ? (
        <form onSubmit={startBroadcast} className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Tiêu đề live
            </span>
            <input
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              maxLength={120}
              placeholder="Live cùng Surf"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-400 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-white dark:placeholder:text-slate-500"
            />
          </label>
          <button
            type="submit"
            disabled={starting}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {starting ? 'Đang mở camera...' : 'Go Live'}
          </button>
        </form>
      ) : role === 'broadcaster' ? (
        <button
          type="button"
          onClick={stopBroadcast}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-black text-white transition hover:bg-rose-500"
        >
          Kết thúc live
        </button>
      ) : (
        <button
          type="button"
          onClick={leaveViewer}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700/80 dark:text-white dark:hover:bg-slate-600"
        >
          Rời live hiện tại
        </button>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        {['Camera', 'Mic', 'Chat'].map((item) => (
          <span
            key={item}
            className="rounded-lg bg-slate-100 px-2 py-2 text-center text-xs font-black text-slate-600 dark:bg-slate-700/80 dark:text-slate-300"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );

  const renderJoinPanel = () => (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-surf-card dark:shadow-lg dark:shadow-slate-950/20">
      <h2 className="text-sm font-black text-slate-950 dark:text-white">Tham gia bằng ID</h2>
      <form onSubmit={submitJoin} className="mt-3 flex gap-2">
        <input
          value={joinDraft}
          onChange={(event) => setJoinDraft(event.target.value)}
          placeholder="Stream ID"
          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-400 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-white dark:placeholder:text-slate-500"
        />
        <button
          type="submit"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 px-3 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
        >
          Vào
        </button>
      </form>
    </section>
  );

  const renderTwitchWatch = (stream: TwitchStream) => {
    const platform = getExternalPlatform(stream);
    const platformName = getExternalPlatformName(stream);
    const badgeClass = platform === 'youtube' ? 'bg-red-600' : 'bg-[#9146ff]';
    const playerUrl =
      stream.embedUrl ??
      (platform === 'twitch'
        ? buildTwitchEmbedUrl('https://player.twitch.tv/', stream.userLogin, {
            autoplay: 'false',
            muted: 'false',
          })
        : null);
    const chatUrl =
      platform === 'youtube'
        ? buildYouTubeChatUrl(stream.chatEmbedUrl, chatTheme)
        : buildTwitchChatUrl(stream.userLogin, chatTheme);
    const forceLightYouTubeChat = platform === 'youtube' && chatTheme === 'light';
    const watchUrl = stream.watchUrl ?? stream.twitchUrl;

    return (
      <main className="grid min-h-[calc(100vh-68px)] grid-cols-1 items-start gap-4 bg-slate-100 p-4 dark:bg-surf-dark lg:grid-cols-[minmax(0,1fr)_360px] lg:p-5">
        <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/80 dark:bg-surf-card">
          <section className="relative overflow-hidden bg-black">
            <div className="aspect-video w-full bg-black">
              {playerUrl ? (
                <iframe
                  title={`${stream.userName} ${platformName} stream`}
                  src={playerUrl}
                  allowFullScreen
                  className="h-full w-full border-0"
                  allow="autoplay; fullscreen; picture-in-picture"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-base font-black text-white">
                    Stream này chưa có embed player.
                  </p>
                  <a
                    href={watchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-white px-4 text-sm font-black text-slate-950"
                  >
                    Mở trên {platformName}
                  </a>
                </div>
              )}
            </div>
            <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center justify-between gap-2">
              <span
                className={`rounded px-2.5 py-1.5 text-xs font-extrabold uppercase leading-none text-white ${badgeClass}`}
              >
                {platformName}
              </span>
              <span className="rounded bg-black/65 px-2.5 py-1.5 text-xs font-bold text-white backdrop-blur">
                {formatViewerCount(stream.viewerCount)} người xem
              </span>
            </div>
          </section>

          <div className="border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-700/80 dark:bg-surf-card lg:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <h1 className="line-clamp-2 text-xl font-black text-slate-950 dark:text-white">
                  {stream.title}
                </h1>
                <div className="mt-3 flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-black text-white ${badgeClass}`}
                  >
                    {getInitial(stream.userName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-slate-950 dark:text-white">
                      {stream.userName}
                    </p>
                    <p className="truncate text-sm font-semibold text-cyan-600 dark:text-cyan-300">
                      {stream.gameName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Nguồn {platformName} · bắt đầu {formatTime(stream.startedAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(stream.tags.length > 0 ? stream.tags : [platformName, 'Live'])
                    .slice(0, 5)
                    .map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700/80 dark:text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-black text-white transition ${badgeClass} hover:opacity-90`}
                >
                  Mở {platformName}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedExternalStreamKey(null);
                    setSelectedExternalChannelKey(null);
                    setSuppressRouteExternalTarget(true);
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700/80 dark:text-white dark:hover:bg-slate-600"
                >
                  Quay lại Surf Live
                </button>
              </div>
            </div>
          </div>

          {twitchStreams.length > 1 && (
            <section className="px-4 py-6 lg:px-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-950 dark:text-white">
                  Live khác từ nền tảng ngoài
                </h2>
                <button
                  type="button"
                  onClick={() => void refreshTwitchStreams()}
                  className="text-sm font-black text-cyan-600 hover:text-cyan-500 dark:text-cyan-300 dark:hover:text-cyan-200"
                >
                  Làm mới
                </button>
              </div>
              <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
                {twitchStreams
                  .filter(
                    (item) =>
                      `${getExternalPlatform(item)}:${item.userLogin}` !==
                      `${platform}:${stream.userLogin}`
                  )
                  .slice(0, 6)
                  .map((item) => renderTwitchCard(item))}
              </div>
            </section>
          )}

          <section className="px-4 pb-6 lg:hidden">{renderCreateLivePanel()}</section>
        </section>

        <aside className="flex min-h-[520px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/80 dark:bg-surf-card lg:h-[calc(100vh-108px)]">
          {chatUrl ? (
            <iframe
              key={chatUrl}
              title={`${stream.userName} ${platformName} chat`}
              src={chatUrl}
              className="min-h-0 flex-1 border-0"
              style={
                forceLightYouTubeChat
                  ? {
                      backgroundColor: '#ffffff',
                      colorScheme: 'light',
                      filter: 'invert(1) hue-rotate(180deg) brightness(1.05) contrast(0.96)',
                    }
                  : { colorScheme: 'dark' }
              }
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
              Nền tảng này chưa hỗ trợ nhúng chat.
            </div>
          )}
        </aside>
      </main>
    );
  };

  const renderVideoSurface = () => (
    <section className="relative bg-black">
      <div className="aspect-video w-full bg-black">
        {role === 'broadcaster' ? (
          <video
            ref={localVideoRef}
            muted
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
        ) : remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-white/10 text-3xl font-black text-white backdrop-blur">
              {activeStream ? getInitial(activeStream.hostName) : 'S'}
            </div>
            <div>
              <p className="text-base font-bold text-white">
                {activeStream
                  ? activeStream.status === 'ended'
                    ? 'Live stream đã kết thúc'
                    : joining
                      ? 'Đang tham gia phòng live...'
                      : 'Đang chờ tín hiệu video...'
                  : 'Chọn một live stream hoặc bắt đầu live mới'}
              </p>
              <p className="mt-2 max-w-md text-sm text-slate-400">
                {activeStream?.transport === 'livekit'
                  ? 'Media đang đi qua LiveKit SFU để người xem ở máy khác vào ổn định hơn.'
                  : 'WebRTC dùng socket signalling của Surf để nối broadcaster và viewer.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {floatingReactions.map((reaction) => (
        <span
          key={reaction.id}
          className="emoji-fall pointer-events-none absolute bottom-16 text-4xl"
          style={{ left: `${reaction.left}%` }}
        >
          {reaction.emoji}
        </span>
      ))}

      {activeStream && (
        <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 rounded bg-black/65 px-3 py-1.5 backdrop-blur">
            <p className="truncate text-xs font-bold text-white">{activeStream.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-rose-600 px-2.5 py-1.5 text-xs font-extrabold uppercase leading-none text-white">
              {activeStream.status === 'live' ? 'Trực tiếp' : 'Đã kết thúc'}
            </span>
            <span className="rounded bg-black/65 px-2.5 py-1.5 text-xs font-bold text-white backdrop-blur">
              {formatViewerCount(activeStream.viewerCount)} người xem
            </span>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 dark:bg-surf-dark dark:text-slate-100">
      <div className="flex min-h-full">
        <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white xl:block dark:border-slate-700/80 dark:bg-surf-card">
          <div className="sticky top-0 max-h-screen overflow-y-auto px-3 py-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase text-slate-950 dark:text-white">
                Kênh trực tiếp
              </h2>
              <button
                type="button"
                onClick={() => {
                  void refreshStreams();
                  void refreshTwitchStreams();
                }}
                className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-700/80 dark:hover:text-white"
              >
                Làm mới
              </button>
            </div>

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600 dark:text-cyan-300">
                  Surf đang live
                </p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                  {sidebarStreams.length}
                </span>
              </div>
              <div className="space-y-1">
                {sidebarStreams.length === 0 ? (
                  <p className="rounded-lg bg-slate-100 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                    Chưa có kênh Surf nào đang live.
                  </p>
                ) : (
                  sidebarStreams.map((stream) => (
                    <button
                      key={stream.id}
                      type="button"
                      onClick={() => void openSurfStream(stream)}
                      className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-700/80"
                    >
                      {renderAvatar(
                        stream.hostName,
                        stream.hostPhotoURL,
                        'h-9 w-9 shrink-0 rounded-full'
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-950 dark:text-white">
                          {stream.hostName}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {stream.title}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-200">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        {formatViewerCount(stream.viewerCount)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700/80">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600 dark:text-cyan-300">
                  Nền tảng ngoài
                </p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                  {externalChannelGroups.length}
                </span>
              </div>
              {loadingTwitchStreams ? (
                <p className="rounded-lg bg-slate-100 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                  Đang tải kênh ngoài...
                </p>
              ) : externalChannelGroups.length === 0 ? (
                <p className="rounded-lg bg-slate-100 px-3 py-4 text-sm text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                  Chưa có kênh ngoài đang live.
                </p>
              ) : (
                <div className="space-y-1">
                  {externalChannelGroups.map((group) => (
                    <div key={group.key}>
                      <button
                        type="button"
                        onClick={() => selectExternalChannelGroup(group)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-700/80 ${
                          selectedExternalChannelKey === group.key
                            ? 'bg-cyan-50 ring-1 ring-cyan-200 dark:bg-cyan-500/10 dark:ring-cyan-500/30'
                            : ''
                        }`}
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ${
                            group.platform === 'youtube' ? 'bg-red-600' : 'bg-[#9146ff]'
                          }`}
                        >
                          {getInitial(group.channelName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-950 dark:text-white">
                            {group.channelName}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {group.streams.length === 1
                              ? group.streams[0].title
                              : `${group.streams.length} live · xem ở lưới chính`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-200">
                          <span className="h-2 w-2 rounded-full bg-rose-500" />
                          {formatViewerCount(group.totalViewerCount)}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700/80 dark:bg-surf-card/95 lg:px-6">
            <div className="grid gap-3 xl:grid-cols-[240px_minmax(320px,1fr)_minmax(320px,420px)] xl:items-center">
              <button
                type="button"
                onClick={() => navigate('/feed/live')}
                className="flex items-center gap-3 text-left"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-lg font-black text-white">
                  S
                </span>
                <div>
                  <p className="text-lg font-black leading-tight text-slate-950 dark:text-white">
                    Surf Live
                  </p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {isWatchMode ? 'Đang xem trực tiếp' : 'Khám phá livestream'}
                  </p>
                </div>
              </button>

              <form onSubmit={submitJoin} className="min-w-0">
                <div className="flex w-full rounded-lg border border-slate-200 bg-slate-50 focus-within:border-cyan-400 dark:border-slate-600/80 dark:bg-slate-900/70">
                  <input
                    value={joinDraft}
                    onChange={(event) => setJoinDraft(event.target.value)}
                    placeholder="Tìm hoặc nhập stream ID"
                    className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    className="h-10 shrink-0 border-l border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-cyan-500 hover:text-white dark:border-slate-700/80 dark:bg-slate-700/80 dark:text-white"
                  >
                    Tham gia
                  </button>
                </div>
              </form>

              <div className="flex min-w-0 justify-start xl:justify-end">
                {!role ? (
                  <form onSubmit={startBroadcast} className="flex w-full min-w-0 gap-2">
                    <input
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      maxLength={120}
                      placeholder="Tiêu đề live"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-400 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-white dark:placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={starting}
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-slate-700"
                    >
                      {starting ? 'Đang mở...' : 'Go Live'}
                    </button>
                  </form>
                ) : role === 'broadcaster' ? (
                  <button
                    type="button"
                    onClick={stopBroadcast}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-black text-white transition hover:bg-rose-500"
                  >
                    Kết thúc live
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={leaveViewer}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700/80 dark:text-white dark:hover:bg-slate-600"
                  >
                    Rời live
                  </button>
                )}
              </div>
            </div>
          </header>

          {error && (
            <div className="mx-4 mt-4 rounded-lg border border-rose-500/30 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-100 lg:mx-6">
              {error}
            </div>
          )}

          {activeStream ? (
            <main className="grid min-h-[calc(100vh-68px)] grid-cols-1 items-start gap-4 bg-slate-100 p-4 dark:bg-surf-dark lg:grid-cols-[minmax(0,1fr)_360px] lg:p-5">
              <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/80 dark:bg-surf-card">
                {renderVideoSurface()}

                <div className="border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-700/80 dark:bg-surf-card lg:px-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <h1 className="line-clamp-2 text-xl font-black text-slate-950 dark:text-white">
                        {activeStream.title}
                      </h1>
                      <div className="mt-3 flex min-w-0 items-center gap-3">
                        {renderAvatar(
                          activeStream.hostName,
                          activeStream.hostPhotoURL,
                          'h-12 w-12 shrink-0 rounded-full'
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-base font-black text-slate-950 dark:text-white">
                            {activeStream.hostName}
                          </p>
                          <p className="truncate text-sm font-semibold text-cyan-600 dark:text-cyan-300">
                            Surf Live
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Bắt đầu {formatTime(activeStream.startedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {liveTags.slice(0, 5).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700/80 dark:text-slate-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-cyan-500 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-400"
                      >
                        Theo dõi
                      </button>
                      <button
                        type="button"
                        onClick={copyStreamId}
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 px-3 font-mono text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700/80 dark:text-white dark:hover:bg-slate-600"
                        title="Copy stream ID"
                      >
                        {activeStream.id}
                      </button>
                      <span className="inline-flex h-9 items-center rounded-lg bg-slate-100 px-3 text-sm font-bold text-slate-700 dark:bg-slate-700/80 dark:text-white">
                        {formatViewerCount(activeStream.viewerCount)} người xem
                      </span>
                    </div>
                  </div>
                </div>

                {mainGridStreams.length > 0 && (
                  <section className="px-4 py-6 lg:px-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-lg font-black text-slate-950 dark:text-white">
                        Kênh live khác
                      </h2>
                      <button
                        type="button"
                        onClick={() => void refreshStreams()}
                        className="text-sm font-black text-cyan-300 hover:text-cyan-200"
                      >
                        Làm mới
                      </button>
                    </div>
                    <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
                      {mainGridStreams.slice(0, 6).map((stream) => renderStreamCard(stream))}
                    </div>
                  </section>
                )}
              </section>

              <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/80 dark:bg-surf-card lg:h-[calc(100vh-108px)]">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700/80">
                  <div className="flex items-center justify-between">
                    <h2 className="text-center text-sm font-black uppercase text-slate-950 dark:text-white">
                      Trò chuyện
                    </h2>
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700/80 dark:text-slate-300">
                      {comments.length}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2 overflow-hidden">
                    {reactionOptions.slice(0, 4).map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => sendReaction(emoji)}
                        disabled={activeStream.status !== 'live'}
                        className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-slate-100 px-2 text-sm font-black text-slate-800 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700/80 dark:text-white dark:hover:bg-slate-600"
                      >
                        <span>{emoji}</span>
                        <span className="truncate text-xs text-slate-500 dark:text-slate-300">
                          {activeStream.reactionCounts[emoji] ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
                  <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Chào mừng bạn đến với phòng trò chuyện của {activeStream.hostName}.
                  </p>
                  {comments.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700/80">
                      Chưa có bình luận.
                    </p>
                  ) : (
                    comments.map((comment, index) => (
                      <p
                        key={comment.id}
                        className="text-sm leading-relaxed text-slate-700 dark:text-slate-200"
                      >
                        <span
                          className={`font-black ${
                            index % 3 === 0
                              ? 'text-cyan-300'
                              : index % 3 === 1
                                ? 'text-fuchsia-300'
                                : 'text-emerald-300'
                          }`}
                        >
                          {comment.authorName}:{' '}
                        </span>
                        <span className="break-words">{comment.text}</span>
                      </p>
                    ))
                  )}
                  <div ref={commentsBottomRef} />
                </div>

                <form
                  onSubmit={sendComment}
                  className="border-t border-slate-200 p-3 dark:border-slate-700/80"
                >
                  <div className="mb-2 flex flex-wrap gap-2">
                    {reactionOptions.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => sendReaction(emoji)}
                        disabled={activeStream.status !== 'live'}
                        className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-slate-100 px-2 text-base transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700/80 dark:hover:bg-slate-600"
                      >
                        {emoji}
                      </button>
                    ))}
                    <span className="ml-auto inline-flex h-8 items-center rounded-lg bg-slate-100 px-2 text-xs font-bold text-slate-600 dark:bg-slate-700/80 dark:text-slate-300">
                      {totalReactions}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                      disabled={activeStream.status !== 'live'}
                      maxLength={500}
                      placeholder={joining ? 'Đang tham gia...' : 'Gửi tin nhắn'}
                      className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-white dark:placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={!commentDraft.trim() || activeStream.status !== 'live'}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-cyan-500 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      Chat
                    </button>
                  </div>
                </form>
              </aside>
            </main>
          ) : twitchWatchStream ? (
            renderTwitchWatch(twitchWatchStream)
          ) : (
            <main className="px-4 py-6 lg:px-6">
              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="min-w-0">
                  {featuredStream ? (
                    <div className="w-full">{renderStreamCard(featuredStream, 'featured')}</div>
                  ) : (
                    <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-700/80 dark:bg-surf-card dark:shadow-slate-950/40 lg:grid-cols-[minmax(0,1fr)_360px]">
                      <div
                        className="relative min-h-[300px] bg-slate-950"
                        style={{
                          backgroundImage:
                            'linear-gradient(120deg, rgba(14,165,233,0.24), rgba(15,23,42,0.58)), url("https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80")',
                          backgroundPosition: 'center',
                          backgroundSize: 'cover',
                        }}
                      >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.25),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.11)_0_1px,transparent_1px_18px)] opacity-50" />
                        <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
                          <div>
                            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-white/40 bg-black/35 text-4xl font-black text-white backdrop-blur">
                              S
                            </div>
                            <h1 className="text-3xl font-black text-white sm:text-4xl">
                              Surf Live
                            </h1>
                            <p className="mt-3 max-w-xl text-sm font-semibold text-cyan-50">
                              Mở camera/mic, tạo phòng live và để bạn bè tham gia bình luận theo
                              thời gian thực.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col justify-between gap-5 p-5">
                        <p className="text-sm font-black uppercase text-cyan-600 dark:text-cyan-300">
                          Kênh nội bộ
                        </p>
                        <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
                          Chưa có live trên Surf
                        </h2>
                        <div className="grid grid-cols-3 gap-2">
                          {['Surf', 'YouTube', 'Twitch'].map((item) => (
                            <span
                              key={item}
                              className="rounded-lg bg-slate-100 px-2 py-2 text-center text-xs font-black text-slate-600 dark:bg-slate-700/80 dark:text-slate-300"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <section className="mt-8">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h2 className="text-xl font-black text-slate-950 dark:text-white">
                          Các danh mục chúng tôi nghĩ bạn sẽ thích
                        </h2>
                        {selectedCategoryCard && (
                          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                            Đang lọc live theo {selectedCategoryCard.title.toLowerCase()}.
                          </p>
                        )}
                      </div>
                      {selectedCategoryCard && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedExternalChannelKey(null);
                            setSelectedCategory('Tất cả');
                          }}
                          className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700/80 dark:text-white dark:hover:bg-slate-600"
                        >
                          Xem tất cả
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                      {categoryCards.map((category) => (
                        <button
                          key={category.title}
                          type="button"
                          onClick={() => {
                            setSelectedExternalChannelKey(null);
                            setSelectedCategory(category.title);
                          }}
                          aria-pressed={selectedCategory === category.title}
                          className={`group text-left ${
                            selectedCategory === category.title
                              ? 'rounded-xl ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-50 dark:ring-offset-surf-dark'
                              : ''
                          }`}
                        >
                          <div
                            className={`relative aspect-[4/5] overflow-hidden rounded-2xl bg-gradient-to-br ${category.gradient} shadow-lg shadow-slate-200 transition group-hover:-translate-y-0.5 group-hover:shadow-cyan-100 dark:shadow-slate-950/40`}
                            style={{
                              backgroundImage: `linear-gradient(180deg, rgba(2,6,23,0.02), rgba(2,6,23,0.58)), url("${category.image}")`,
                              backgroundPosition: 'center',
                              backgroundSize: 'cover',
                            }}
                          >
                            <div
                              className={`absolute inset-0 bg-gradient-to-br ${category.gradient} opacity-35 mix-blend-multiply`}
                            />
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.32),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.13)_0_1px,transparent_1px_18px)] opacity-60" />
                            <div className="absolute inset-x-4 bottom-4">
                              <p className="text-2xl font-black text-white drop-shadow">
                                {category.title}
                              </p>
                            </div>
                          </div>
                          <p className="mt-2 font-bold text-slate-950 dark:text-white">
                            {category.title}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {category.meta}
                          </p>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-700/80">
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
                          {selectedExternalChannelGroup
                            ? selectedExternalChannelGroup.platformName
                            : selectedCategoryCard
                              ? 'Danh mục'
                              : 'Twitch + YouTube'}
                        </p>
                        <h2 className="text-xl font-black text-slate-950 dark:text-white">
                          {selectedExternalChannelGroup
                            ? `${selectedExternalChannelGroup.channelName} đang live`
                            : selectedCategoryCard
                              ? `${selectedCategoryCard.title} đang live`
                              : 'Đang live từ nền tảng ngoài'}
                        </h2>
                        {selectedExternalChannelGroup && (
                          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {selectedExternalChannelGroup.streams.length} live để chọn · tổng{' '}
                            {formatViewerCount(selectedExternalChannelGroup.totalViewerCount)} người
                            xem
                          </p>
                        )}
                        {twitchStatus && (
                          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {twitchStatus}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {selectedExternalChannelGroup && (
                          <button
                            type="button"
                            onClick={() => setSelectedExternalChannelKey(null)}
                            className="text-sm font-black text-slate-500 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                          >
                            Xem tất cả
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void refreshTwitchStreams()}
                          className="text-sm font-black text-cyan-600 hover:text-cyan-500 dark:text-cyan-300 dark:hover:text-cyan-200"
                        >
                          Làm mới
                        </button>
                      </div>
                    </div>
                    {loadingTwitchStreams ? (
                      <p className="rounded-lg bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500 shadow-sm dark:bg-slate-800/80 dark:text-slate-400">
                        Đang tải live streams...
                      </p>
                    ) : visibleExternalStreams.length === 0 ? (
                      <p className="rounded-lg bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500 shadow-sm dark:bg-slate-800/80 dark:text-slate-400">
                        {selectedCategoryCard
                          ? `Chưa có live ${selectedCategoryCard.title.toLowerCase()} phù hợp trong danh sách hiện tại.`
                          : selectedExternalChannelGroup
                            ? `Chưa có live nào từ ${selectedExternalChannelGroup.channelName}.`
                            : (twitchStatus ??
                              'Các nền tảng ngoài hiện không trả về stream nào đang live cho bộ lọc này.')}
                      </p>
                    ) : (
                      <div className="grid items-stretch gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {visibleExternalStreams.map((stream) => renderTwitchCard(stream))}
                      </div>
                    )}
                  </section>
                </section>

                <aside className="space-y-4 xl:sticky xl:top-24">
                  {renderCreateLivePanel()}
                  {renderJoinPanel()}
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-surf-card dark:shadow-lg dark:shadow-slate-950/20">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-black text-slate-950 dark:text-white">
                        Surf live đang mở
                      </h2>
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-600 dark:bg-slate-700/80 dark:text-slate-300">
                        {sortedStreams.length}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {sortedStreams.slice(0, 4).map((stream) => (
                        <button
                          key={stream.id}
                          type="button"
                          onClick={() => void openSurfStream(stream)}
                          className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-700/80"
                        >
                          {renderAvatar(
                            stream.hostName,
                            stream.hostPhotoURL,
                            'h-8 w-8 shrink-0 rounded-full'
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-950 dark:text-white">
                              {stream.hostName}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {stream.title}
                            </p>
                          </div>
                        </button>
                      ))}
                      {sortedStreams.length === 0 && (
                        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                          Chưa có live nội bộ.
                        </p>
                      )}
                    </div>
                  </section>
                </aside>
              </div>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
