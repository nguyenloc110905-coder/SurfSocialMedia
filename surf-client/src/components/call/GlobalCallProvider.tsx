import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import {
  buildDeterministicFallbackUrl,
  defaultVideoProfile,
  fetchLiveKitToken,
  getVideoSpec,
  isVideoFpsClamped,
  targetVideoFps,
  useLiveKitProvider,
  type LiveKitTokenResponse,
  type VideoProfile,
} from '@/lib/livekit-call';
import { optimizeImageUrl } from '@/lib/image-cdn';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';

export type CallMode = 'audio' | 'video';

type CallInvitePayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  mode: CallMode;
};

type CallAcceptedPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  mode: CallMode;
};

type CallSignalPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  mode: CallMode;
  signal:
    | { type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }
    | { type: 'ice'; candidate: RTCIceCandidateInit };
};

type CallEndPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  reason?: string;
};

type IncomingCall = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  mode: CallMode;
};

type ActiveCall = {
  callId: string;
  conversationId: string;
  peerId: string;
  peerName: string;
  peerAvatarUrl: string | null;
  mode: CallMode;
  isOutgoing: boolean;
  status: 'outgoing' | 'connecting' | 'connected';
};

type StartCallInput = {
  conversationId: string;
  peerId: string;
  peerName: string;
  peerAvatarUrl: string | null;
  mode: CallMode;
};

type StartGroupCallInput = {
  conversationId: string;
  conversationTitle?: string;
  memberIds: string[];
  mode: CallMode;
};

type GroupIncomingCall = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  conversationTitle?: string;
  mode: CallMode;
};

type GroupCallRoomReadyPayload = {
  callId: string;
  conversationId: string;
  hostUserId: string;
  conversationTitle?: string;
  mode: CallMode;
  roomName: string;
};

type GroupCallDeclinedPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  reason?: string;
};

type GroupCallIncomingPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  conversationTitle?: string;
  mode: CallMode;
};

type GlobalCallContextValue = {
  startCall: (input: StartCallInput) => void;
  startGroupCall: (input: StartGroupCallInput) => void;
  activeCall: ActiveCall | null;
  incomingCall: IncomingCall | null;
  isBusy: boolean;
};

type CallToast = {
  id: string;
  title: string;
  description: string;
};

type CallQuotaState = {
  usagePercent: number | null;
  usageSource: 'manual' | 'api' | 'unavailable';
  softLimitPercent: number;
  hardLimitPercent: number;
  fallbackRecommended: boolean;
};

type FallbackSessionState = {
  peerName: string;
  fallbackUrl: string;
  reason: string;
};

type PendingCallAcceptPayload = IncomingCall & {
  targetUserId: string;
  createdAt: number;
};

type PendingOutgoingCallConnectPayload = {
  callId: string;
  conversationId: string;
  peerId: string;
  peerName: string;
  peerAvatarUrl: string | null;
  mode: CallMode;
  targetUserId: string;
  createdAt: number;
};

type PendingGroupOutgoingCall = {
  callId: string;
  conversationId: string;
  conversationTitle?: string;
  mode: CallMode;
};

const GlobalCallContext = createContext<GlobalCallContextValue | null>(null);

const CALL_WINDOW_QUERY_KEY = 'callWindow';
const PENDING_CALL_ACCEPT_STORAGE_KEY = 'surf:call:pending-accept';
const PENDING_OUTGOING_CALL_CONNECT_STORAGE_KEY = 'surf:call:pending-outgoing-connect';
const PENDING_CALL_ACCEPT_MAX_AGE_MS = 1000 * 60 * 2;
const POPUP_HORIZONTAL_MARGIN = 48;
const POPUP_VERTICAL_MARGIN = 64;

const parseRtcUrls = (value?: string) =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

const createIceServers = (): RTCIceServer[] => {
  const stunUrls = parseRtcUrls(import.meta.env.VITE_WEBRTC_STUN_URLS).filter((url) =>
    url.startsWith('stun:')
  );
  const turnUrls = parseRtcUrls(import.meta.env.VITE_WEBRTC_TURN_URLS).filter(
    (url) => url.startsWith('turn:') || url.startsWith('turns:')
  );
  const turnUsername = import.meta.env.VITE_WEBRTC_TURN_USERNAME?.trim();
  const turnCredential = import.meta.env.VITE_WEBRTC_TURN_CREDENTIAL?.trim();

  const servers: RTCIceServer[] = [];

  if (stunUrls.length > 0) {
    servers.push({
      urls: stunUrls.length === 1 ? stunUrls[0] : stunUrls,
    });
  }

  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  if (servers.length === 0) {
    servers.push({ urls: 'stun:stun.l.google.com:19302' });
  }

  return servers;
};

const WEBRTC_ICE_SERVERS = createIceServers();

const buildCameraConstraints = (profile: VideoProfile): MediaTrackConstraints => {
  const { resolution } = getVideoSpec(profile, targetVideoFps);

  return {
    width: {
      min: 854,
      ideal: resolution.width,
    },
    height: {
      min: 480,
      ideal: resolution.height,
    },
    frameRate: {
      min: 30,
      ideal: targetVideoFps,
      max: targetVideoFps,
    },
  };
};

const getFallbackReason = (reason?: string) => {
  if (reason === 'livekit_hard_quota_limit' || reason === 'livekit_forced_fallback') {
    return 'LiveKit gần chạm quota nên hệ thống chuyển sang phòng dự phòng.';
  }

  if (reason === 'livekit_not_configured') {
    return 'LiveKit chưa cấu hình đủ trên server nên hệ thống chuyển sang phòng dự phòng.';
  }

  return 'Không thể kết nối LiveKit, hệ thống đã mở phòng dự phòng.';
};

const initials = (value?: string | null) =>
  value
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'S';

const formatCallDuration = (durationSec: number) => {
  const hours = Math.floor(durationSec / 3600);
  const minutes = Math.floor((durationSec % 3600) / 60);
  const seconds = durationSec % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

function CallAvatar({
  src,
  name,
  className,
  fallbackClassName,
}: {
  src?: string | null;
  name?: string | null;
  className: string;
  fallbackClassName: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <div className={fallbackClassName}>{initials(name)}</div>;
  }

  return (
    <img
      src={optimizeImageUrl(src)}
      alt={name ?? 'Call avatar'}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

export function GlobalCallProvider({ children }: PropsWithChildren) {
  const user = useAuthStore((state) => state.user);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [groupIncomingCall, setGroupIncomingCall] = useState<GroupIncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [callToast, setCallToast] = useState<CallToast | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [acceptingCall, setAcceptingCall] = useState(false);
  const [selectedVideoProfile, setSelectedVideoProfile] =
    useState<VideoProfile>(defaultVideoProfile);
  const [callQuotaState, setCallQuotaState] = useState<CallQuotaState | null>(null);
  const [fallbackSession, setFallbackSession] = useState<FallbackSessionState | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [hasRemoteVideoTrack, setHasRemoteVideoTrack] = useState(false);
  const [isRemoteCameraMuted, setIsRemoteCameraMuted] = useState(false);
  const [hasRemoteVideoFrame, setHasRemoteVideoFrame] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [isCallHidden, setIsCallHidden] = useState(false);
  const [connectedAtMs, setConnectedAtMs] = useState<number | null>(null);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [pendingGroupOutgoingCall, setPendingGroupOutgoingCall] =
    useState<PendingGroupOutgoingCall | null>(null);
  const [awaitingGroupRoomCallId, setAwaitingGroupRoomCallId] = useState<string | null>(null);

  const callWindowMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get(CALL_WINDOW_QUERY_KEY) === '1';

  const activeCallRef = useRef<ActiveCall | null>(null);
  const liveKitRoomRef = useRef<Room | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callStageRef = useRef<HTMLDivElement | null>(null);
  const callToastTimeoutRef = useRef<number | null>(null);
  const ringtoneContextRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<number | null>(null);
  const outgoingTimeoutRef = useRef<number | null>(null);
  const groupOutgoingTimeoutRef = useRef<number | null>(null);
  const openedGroupRoomCallIdsRef = useRef<Set<string>>(new Set());
  const endedCallIdsRef = useRef<Set<string>>(new Set());

  const activeVideoSpec = getVideoSpec(selectedVideoProfile, targetVideoFps);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      void localVideoRef.current.play().catch(() => undefined);
    }
  }, [activeCall?.callId, isCallHidden, isCallMinimized, isCameraEnabled, localStream]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      void remoteVideoRef.current.play().catch(() => undefined);
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      void remoteAudioRef.current.play().catch(() => undefined);
    }

    if (!remoteStream) {
      setHasRemoteVideoTrack(false);
      setIsRemoteCameraMuted(false);
      setHasRemoteVideoFrame(false);
      return;
    }

    setHasRemoteVideoFrame(false);

    const updateRemoteTrackState = () => {
      const videoTracks = remoteStream.getVideoTracks();
      const hasVideoTrack = videoTracks.some((track) => track.readyState === 'live');
      setHasRemoteVideoTrack(hasVideoTrack);

      if (!useLiveKitProvider) {
        const allMuted =
          hasVideoTrack &&
          videoTracks.every(
            (track) => track.readyState !== 'live' || track.muted || track.enabled === false
          );
        setIsRemoteCameraMuted(allMuted);
      }
    };

    updateRemoteTrackState();

    const videoTracks = remoteStream.getVideoTracks();
    const cleanupFns: Array<() => void> = [];

    videoTracks.forEach((track) => {
      const onTrackChange = () => {
        updateRemoteTrackState();
      };

      track.addEventListener('mute', onTrackChange);
      track.addEventListener('unmute', onTrackChange);
      track.addEventListener('ended', onTrackChange);

      cleanupFns.push(() => {
        track.removeEventListener('mute', onTrackChange);
        track.removeEventListener('unmute', onTrackChange);
        track.removeEventListener('ended', onTrackChange);
      });
    });

    return () => {
      cleanupFns.forEach((cleanup) => cleanup());
    };
  }, [activeCall?.callId, isCallHidden, isCallMinimized, remoteStream]);

  useEffect(() => {
    if (!activeCall) {
      setConnectedAtMs(null);
      setCallDurationSec(0);
      return;
    }

    if (activeCall.status === 'connected') {
      setConnectedAtMs((current) => current ?? Date.now());
      return;
    }

    setConnectedAtMs(null);
    setCallDurationSec(0);
  }, [activeCall?.callId, activeCall?.status]);

  useEffect(() => {
    if (!connectedAtMs) return;

    const updateDuration = () => {
      setCallDurationSec(Math.max(0, Math.floor((Date.now() - connectedAtMs) / 1000)));
    };

    updateDuration();
    const timer = window.setInterval(updateDuration, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [connectedAtMs]);

  const resetCallControls = (mode: CallMode) => {
    setIsMicEnabled(true);
    setIsCameraEnabled(mode === 'video');
  };

  const toggleCallFullscreen = async () => {
    const stage = callStageRef.current;
    if (!stage) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      if (!stage.requestFullscreen) {
        pushToast('Trình duyệt chưa hỗ trợ', 'Thiết bị này chưa hỗ trợ chế độ toàn màn hình.');
        return;
      }

      await stage.requestFullscreen();
    } catch {
      pushToast('Không thể toàn màn hình', 'Trình duyệt đã chặn yêu cầu toàn màn hình.');
    }
  };

  const refreshRemoteVideoTrackState = () => {
    const stream = remoteStreamRef.current;
    if (!stream) {
      setHasRemoteVideoTrack(false);
      return;
    }

    const hasVideoTrack = stream.getVideoTracks().some((track) => track.readyState === 'live');
    setHasRemoteVideoTrack(hasVideoTrack);
  };

  const pushToast = (title: string, description: string) => {
    if (callToastTimeoutRef.current) {
      window.clearTimeout(callToastTimeoutRef.current);
    }

    setCallToast({
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      description,
    });

    callToastTimeoutRef.current = window.setTimeout(() => {
      setCallToast(null);
    }, 6000);
  };

  const clearGroupOutgoingTimeout = () => {
    if (groupOutgoingTimeoutRef.current) {
      window.clearTimeout(groupOutgoingTimeoutRef.current);
      groupOutgoingTimeoutRef.current = null;
    }
  };

  const buildGroupCallWindowUrl = (payload: GroupCallRoomReadyPayload) => {
    if (typeof window === 'undefined') return '';

    const url = new URL('/group-call-window', window.location.origin);
    url.searchParams.set(CALL_WINDOW_QUERY_KEY, '1');
    url.searchParams.set('callId', payload.callId);
    url.searchParams.set('conversationId', payload.conversationId);
    url.searchParams.set('roomName', payload.roomName);
    url.searchParams.set('mode', payload.mode);
    url.searchParams.set('hostUserId', payload.hostUserId);
    if (payload.conversationTitle) {
      url.searchParams.set('title', payload.conversationTitle);
    }

    return url.toString();
  };

  const buildDirectCallMeetingUrl = (call: ActiveCall) => {
    if (typeof window === 'undefined') return '';

    const url = new URL('/group-call-window', window.location.origin);
    const hostUserId = call.isOutgoing ? user?.uid : call.peerId;

    url.searchParams.set(CALL_WINDOW_QUERY_KEY, '1');
    url.searchParams.set('dm', '1');
    url.searchParams.set('callId', call.callId);
    url.searchParams.set('conversationId', call.conversationId);
    url.searchParams.set('roomName', `dm-${call.callId}`);
    url.searchParams.set('mode', call.mode);
    if (hostUserId) {
      url.searchParams.set('hostUserId', hostUserId);
    }
    url.searchParams.set('peerId', call.peerId);
    url.searchParams.set('peerName', call.peerName);
    url.searchParams.set('title', call.peerName);

    return url.toString();
  };

  const focusPopup = (popup: Window | null) => {
    if (!popup) return false;

    try {
      popup.focus();
    } catch {
      // Some browsers can block focus without blocking the popup itself.
    }

    return true;
  };

  const openGroupRoomWindow = (payload: GroupCallRoomReadyPayload) => {
    if (openedGroupRoomCallIdsRef.current.has(payload.callId)) return;

    const targetUrl = buildGroupCallWindowUrl(payload);
    if (!targetUrl) return;

    openedGroupRoomCallIdsRef.current.add(payload.callId);
    window.setTimeout(
      () => {
        openedGroupRoomCallIdsRef.current.delete(payload.callId);
      },
      1000 * 60 * 60
    );

    const popup = window.open(targetUrl, 'surf-group-call-window', buildCallWindowFeatures());

    if (!popup) {
      pushToast('Popup bị chặn', 'Đang chuyển sang phòng gọi nhóm trong tab hiện tại.');
      window.location.assign(targetUrl);
      return;
    }

    focusPopup(popup);
  };

  const openDirectCallMeetingWindow = (call: ActiveCall) => {
    const targetUrl = buildDirectCallMeetingUrl(call);
    if (!targetUrl) return false;

    const popup = window.open(targetUrl, 'surf-direct-call-window', buildCallWindowFeatures());

    if (!popup) return false;
    return focusPopup(popup);
  };

  const buildCallWindowUrl = () => {
    if (typeof window === 'undefined') return '';
    const url = new URL('/call-window', window.location.origin);
    url.searchParams.set(CALL_WINDOW_QUERY_KEY, '1');
    return url.toString();
  };

  const buildCallWindowFeatures = () => {
    if (typeof window === 'undefined') return '';

    const maxAllowedWidth = Math.max(680, window.screen.availWidth - POPUP_HORIZONTAL_MARGIN);
    const maxAllowedHeight = Math.max(520, window.screen.availHeight - POPUP_VERTICAL_MARGIN);
    const preferredWidth = Math.round(window.screen.availWidth * 0.78);
    const preferredHeight = Math.round(window.screen.availHeight * 0.8);
    const width = Math.min(maxAllowedWidth, Math.max(860, Math.min(preferredWidth, 1220)));
    const height = Math.min(maxAllowedHeight, Math.max(560, Math.min(preferredHeight, 860)));
    const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));

    return [
      'width=' + width,
      'height=' + height,
      'left=' + left,
      'top=' + top,
      'resizable=yes',
      'scrollbars=no',
    ].join(',');
  };

  const openCallWindow = () => {
    if (typeof window === 'undefined') return false;

    const popup = window.open(buildCallWindowUrl(), 'surf-call-window', buildCallWindowFeatures());

    return focusPopup(popup);
  };

  const queuePendingCallAccept = (call: IncomingCall, targetUserId: string) => {
    if (typeof window === 'undefined') return;

    const payload: PendingCallAcceptPayload = {
      ...call,
      targetUserId,
      createdAt: Date.now(),
    };

    window.localStorage.setItem(PENDING_CALL_ACCEPT_STORAGE_KEY, JSON.stringify(payload));
  };

  const consumePendingCallAccept = (targetUserId: string): IncomingCall | null => {
    if (typeof window === 'undefined') return null;

    const raw = window.localStorage.getItem(PENDING_CALL_ACCEPT_STORAGE_KEY);
    if (!raw) return null;

    window.localStorage.removeItem(PENDING_CALL_ACCEPT_STORAGE_KEY);

    try {
      const parsed = JSON.parse(raw) as Partial<PendingCallAcceptPayload>;

      if (parsed.targetUserId !== targetUserId) return null;
      if (typeof parsed.createdAt !== 'number') return null;
      if (Date.now() - parsed.createdAt > PENDING_CALL_ACCEPT_MAX_AGE_MS) return null;

      if (
        typeof parsed.callId !== 'string' ||
        typeof parsed.conversationId !== 'string' ||
        typeof parsed.fromUserId !== 'string' ||
        typeof parsed.fromName !== 'string' ||
        (parsed.mode !== 'audio' && parsed.mode !== 'video')
      ) {
        return null;
      }

      return {
        callId: parsed.callId,
        conversationId: parsed.conversationId,
        fromUserId: parsed.fromUserId,
        fromName: parsed.fromName,
        fromAvatarUrl: typeof parsed.fromAvatarUrl === 'string' ? parsed.fromAvatarUrl : null,
        mode: parsed.mode,
      };
    } catch {
      return null;
    }
  };

  const queuePendingOutgoingCallConnect = (call: ActiveCall, targetUserId: string) => {
    if (typeof window === 'undefined') return;

    const payload: PendingOutgoingCallConnectPayload = {
      callId: call.callId,
      conversationId: call.conversationId,
      peerId: call.peerId,
      peerName: call.peerName,
      peerAvatarUrl: call.peerAvatarUrl,
      mode: call.mode,
      targetUserId,
      createdAt: Date.now(),
    };

    window.localStorage.setItem(PENDING_OUTGOING_CALL_CONNECT_STORAGE_KEY, JSON.stringify(payload));
  };

  const consumePendingOutgoingCallConnect = (targetUserId: string): ActiveCall | null => {
    if (typeof window === 'undefined') return null;

    const raw = window.localStorage.getItem(PENDING_OUTGOING_CALL_CONNECT_STORAGE_KEY);
    if (!raw) return null;

    window.localStorage.removeItem(PENDING_OUTGOING_CALL_CONNECT_STORAGE_KEY);

    try {
      const parsed = JSON.parse(raw) as Partial<PendingOutgoingCallConnectPayload>;

      if (parsed.targetUserId !== targetUserId) return null;
      if (typeof parsed.createdAt !== 'number') return null;
      if (Date.now() - parsed.createdAt > PENDING_CALL_ACCEPT_MAX_AGE_MS) return null;

      if (
        typeof parsed.callId !== 'string' ||
        typeof parsed.conversationId !== 'string' ||
        typeof parsed.peerId !== 'string' ||
        typeof parsed.peerName !== 'string' ||
        (parsed.mode !== 'audio' && parsed.mode !== 'video')
      ) {
        return null;
      }

      return {
        callId: parsed.callId,
        conversationId: parsed.conversationId,
        peerId: parsed.peerId,
        peerName: parsed.peerName,
        peerAvatarUrl: typeof parsed.peerAvatarUrl === 'string' ? parsed.peerAvatarUrl : null,
        mode: parsed.mode,
        isOutgoing: true,
        status: 'connecting',
      };
    } catch {
      return null;
    }
  };

  const ensureStream = (scope: 'local' | 'remote') => {
    if (scope === 'local') {
      if (!localStreamRef.current) {
        const stream = new MediaStream();
        localStreamRef.current = stream;
        setLocalStream(stream);
      }
      return localStreamRef.current;
    }

    if (!remoteStreamRef.current) {
      const stream = new MediaStream();
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
    }
    return remoteStreamRef.current;
  };

  const upsertMediaTrack = (scope: 'local' | 'remote', mediaTrack?: MediaStreamTrack | null) => {
    if (!mediaTrack) return;
    const stream = ensureStream(scope);
    const exists = stream.getTracks().some((track) => track.id === mediaTrack.id);
    if (!exists) {
      stream.addTrack(mediaTrack);
    }
  };

  const removeMediaTrack = (scope: 'local' | 'remote', mediaTrack?: MediaStreamTrack | null) => {
    if (!mediaTrack) return;

    const stream = scope === 'local' ? localStreamRef.current : remoteStreamRef.current;
    if (!stream) return;

    stream.removeTrack(mediaTrack);
    if (stream.getTracks().length === 0) {
      if (scope === 'local') {
        localStreamRef.current = null;
        setLocalStream(null);
      } else {
        remoteStreamRef.current = null;
        setRemoteStream(null);
      }
    }
  };

  const syncLiveKitLocalPreview = (room: Room) => {
    const cameraPublication = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const cameraMediaTrack = cameraPublication?.track?.mediaStreamTrack;

    if (!cameraMediaTrack || cameraMediaTrack.kind !== 'video') {
      localStreamRef.current = null;
      setLocalStream(null);
      return;
    }

    const nextPreviewStream = new MediaStream([cameraMediaTrack]);
    localStreamRef.current = nextPreviewStream;
    setLocalStream(nextPreviewStream);
  };

  const isRemotePeerParticipant = (identity?: string | null) => {
    const peerId = activeCallRef.current?.peerId;
    return Boolean(identity && peerId && identity === peerId);
  };

  const openFallbackRoom = (call: ActiveCall, fallbackUrl: string, reason: string) => {
    setFallbackSession({
      peerName: call.peerName,
      fallbackUrl,
      reason,
    });

    const popup = window.open(fallbackUrl, 'surf-call-fallback-window', buildCallWindowFeatures());
    if (!popup) {
      setCallError(`Trình duyệt chặn popup. Mở thủ công: ${fallbackUrl}`);
    } else {
      focusPopup(popup);
    }

    pushToast('Chuyển sang phòng dự phòng', `${reason} (${call.peerName})`);
  };

  const reopenFallbackRoom = () => {
    if (!fallbackSession) return;
    const popup = window.open(
      fallbackSession.fallbackUrl,
      'surf-call-fallback-window',
      buildCallWindowFeatures()
    );
    if (!popup) {
      setCallError(`Trình duyệt chặn popup. Mở thủ công: ${fallbackSession.fallbackUrl}`);
    } else {
      focusPopup(popup);
    }
  };

  const connectLiveKitCall = async (call: ActiveCall) => {
    let tokenResponse: LiveKitTokenResponse;

    try {
      tokenResponse = await fetchLiveKitToken({
        callId: call.callId,
        conversationId: call.conversationId,
        peerId: call.peerId,
        mode: call.mode,
        quality: selectedVideoProfile,
      });
    } catch (error) {
      const fallbackUrl = buildDeterministicFallbackUrl(call.conversationId, call.callId);
      openFallbackRoom(call, fallbackUrl, getFallbackReason('livekit_not_configured'));
      throw error;
    }

    const fallbackUrl =
      tokenResponse.fallbackUrl ?? buildDeterministicFallbackUrl(call.conversationId, call.callId);

    if (tokenResponse.provider === 'fallback') {
      openFallbackRoom(call, fallbackUrl, getFallbackReason(tokenResponse.reason));
      throw new Error(tokenResponse.reason ?? 'fallback');
    }

    if (!tokenResponse.serverUrl || !tokenResponse.token) {
      openFallbackRoom(call, fallbackUrl, getFallbackReason('livekit_not_configured'));
      throw new Error('Thiếu LiveKit server URL hoặc token');
    }

    setCallQuotaState({
      usagePercent: tokenResponse.usagePercent ?? null,
      usageSource: tokenResponse.usageSource ?? 'unavailable',
      softLimitPercent: tokenResponse.softLimitPercent ?? 80,
      hardLimitPercent: tokenResponse.hardLimitPercent ?? 90,
      fallbackRecommended: Boolean(tokenResponse.fallbackRecommended),
    });

    liveKitRoomRef.current?.disconnect();

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: {
          ...activeVideoSpec.resolution,
          frameRate: targetVideoFps,
        },
        frameRate: targetVideoFps,
      },
      publishDefaults: {
        simulcast: true,
        videoEncoding: activeVideoSpec.encoding,
      },
    });

    room.on(RoomEvent.LocalTrackPublished, (publication) => {
      if (
        publication.source === Track.Source.Camera ||
        publication.source === Track.Source.Microphone
      ) {
        syncLiveKitLocalPreview(room);
        return;
      }

      upsertMediaTrack('local', publication.track?.mediaStreamTrack);
    });

    room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      if (
        publication.source === Track.Source.Camera ||
        publication.source === Track.Source.Microphone
      ) {
        syncLiveKitLocalPreview(room);
        return;
      }

      removeMediaTrack('local', publication.track?.mediaStreamTrack);
    });

    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (!isRemotePeerParticipant(participant?.identity)) return;
      upsertMediaTrack('remote', track.mediaStreamTrack);
      if (track.kind === Track.Kind.Video) {
        setIsRemoteCameraMuted(track.isMuted);
        setHasRemoteVideoTrack(true);
      }
      setActiveCall((current) =>
        current && current.callId === call.callId ? { ...current, status: 'connected' } : current
      );
      setCallError(null);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
      if (!isRemotePeerParticipant(participant?.identity)) return;
      removeMediaTrack('remote', track.mediaStreamTrack);
      if (track.kind === Track.Kind.Video) {
        setIsRemoteCameraMuted(true);
        refreshRemoteVideoTrackState();
      }
    });

    room.on(RoomEvent.TrackMuted, (publication, participant) => {
      if (!isRemotePeerParticipant(participant?.identity)) return;
      if (publication.source === Track.Source.Camera || publication.kind === Track.Kind.Video) {
        setIsRemoteCameraMuted(true);
      }
    });

    room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
      if (!isRemotePeerParticipant(participant?.identity)) return;
      if (publication.source === Track.Source.Camera || publication.kind === Track.Kind.Video) {
        setIsRemoteCameraMuted(false);
        refreshRemoteVideoTrackState();
      }
    });

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === 'connected') {
        setActiveCall((current) =>
          current && current.callId === call.callId ? { ...current, status: 'connected' } : current
        );
        setCallError(null);
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      if (activeCallRef.current?.callId === call.callId) {
        setCallError('Kết nối media đã bị ngắt.');
        finishCall(false);
      }
    });

    liveKitRoomRef.current = room;

    await room.connect(tokenResponse.serverUrl, tokenResponse.token);
    await room.localParticipant.setMicrophoneEnabled(true);
    setIsMicEnabled(true);
    setIsCameraEnabled(call.mode === 'video');

    if (call.mode === 'video') {
      await room.localParticipant.setCameraEnabled(
        true,
        {
          resolution: activeVideoSpec.resolution,
          frameRate: {
            min: 30,
            ideal: targetVideoFps,
            max: targetVideoFps,
          },
        },
        {
          simulcast: true,
          videoEncoding: activeVideoSpec.encoding,
        }
      );
    }

    syncLiveKitLocalPreview(room);

    if (isVideoFpsClamped && targetVideoFps < 70) {
      pushToast(
        'FPS đã được giới hạn',
        `Thiết lập 70fps không ổn định cho camera web, hệ thống đang dùng ${targetVideoFps}fps.`
      );
    }

    if (tokenResponse.fallbackRecommended) {
      pushToast(
        'Quota LiveKit đang cao',
        'Nếu call mới thất bại, hệ thống sẽ tự chuyển sang phòng dự phòng để không gián đoạn.'
      );
    }
  };

  const applyVideoProfile = async (nextProfile: VideoProfile) => {
    setSelectedVideoProfile(nextProfile);

    const currentCall = activeCallRef.current;
    if (!currentCall || currentCall.mode !== 'video') return;

    try {
      if (useLiveKitProvider) {
        const room = liveKitRoomRef.current;
        if (!room) return;

        const nextSpec = getVideoSpec(nextProfile, targetVideoFps);
        const cameraPublication = room.localParticipant.getTrackPublication(Track.Source.Camera);
        const localVideoTrack = cameraPublication?.videoTrack;

        if (localVideoTrack) {
          await localVideoTrack.restartTrack({
            resolution: nextSpec.resolution,
            frameRate: {
              min: 30,
              ideal: targetVideoFps,
              max: targetVideoFps,
            },
          });
        } else {
          await room.localParticipant.setCameraEnabled(
            true,
            {
              resolution: nextSpec.resolution,
              frameRate: {
                min: 30,
                ideal: targetVideoFps,
                max: targetVideoFps,
              },
            },
            {
              simulcast: true,
              videoEncoding: nextSpec.encoding,
            }
          );
        }

        // Ensure local corner preview always rebinds after camera track restart.
        syncLiveKitLocalPreview(room);
      } else {
        const localTrack = localStreamRef.current?.getVideoTracks()[0];
        if (localTrack) {
          await localTrack.applyConstraints(buildCameraConstraints(nextProfile));
        }

        if (localStreamRef.current) {
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        }
      }

      pushToast(
        'Đã đổi chất lượng video',
        nextProfile === 'p720' ? 'Cuộc gọi đang dùng 720p.' : 'Cuộc gọi đang dùng 480p.'
      );
      setCallError(null);
    } catch (error) {
      setCallError((error as Error).message || 'Không thể đổi chất lượng video');
    }
  };

  const toggleMicrophone = async () => {
    const currentCall = activeCallRef.current;
    if (!currentCall) return;

    const nextState = !isMicEnabled;

    try {
      if (useLiveKitProvider) {
        const room = liveKitRoomRef.current;
        if (!room) return;
        await room.localParticipant.setMicrophoneEnabled(nextState);
        syncLiveKitLocalPreview(room);
      } else {
        const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
        if (audioTracks.length === 0) {
          setCallError('Microphone chưa sẵn sàng.');
          return;
        }

        audioTracks.forEach((track) => {
          track.enabled = nextState;
        });
      }

      setIsMicEnabled(nextState);
    } catch (error) {
      setCallError((error as Error).message || 'Không thể bật/tắt microphone');
    }
  };

  const toggleCamera = async () => {
    const currentCall = activeCallRef.current;
    if (!currentCall || currentCall.mode !== 'video') return;

    const nextState = !isCameraEnabled;

    try {
      if (useLiveKitProvider) {
        const room = liveKitRoomRef.current;
        if (!room) return;

        const cameraPublication = room.localParticipant.getTrackPublication(Track.Source.Camera);
        const localVideoTrack = cameraPublication?.videoTrack;

        if (nextState) {
          let enabled = false;

          // Prefer unmuting the existing track to avoid mobile camera restart glitches.
          if (localVideoTrack) {
            try {
              await localVideoTrack.unmute();
              enabled = true;
            } catch {
              enabled = false;
            }
          }

          if (!enabled) {
            try {
              await room.localParticipant.setCameraEnabled(
                true,
                {
                  resolution: activeVideoSpec.resolution,
                  frameRate: {
                    ideal: targetVideoFps,
                  },
                },
                {
                  simulcast: true,
                  videoEncoding: activeVideoSpec.encoding,
                }
              );
              enabled = true;
            } catch {
              enabled = false;
            }
          }

          if (!enabled) {
            await room.localParticipant.setCameraEnabled(true);
          }
        } else {
          if (localVideoTrack) {
            await localVideoTrack.mute();
          } else {
            await room.localParticipant.setCameraEnabled(false);
          }
        }

        syncLiveKitLocalPreview(room);
      } else {
        const videoTracks = localStreamRef.current?.getVideoTracks() ?? [];
        if (videoTracks.length === 0) {
          setCallError('Camera chưa sẵn sàng.');
          return;
        }

        videoTracks.forEach((track) => {
          track.enabled = nextState;
        });
      }

      setIsCameraEnabled(nextState);
      setCallError(null);
    } catch (error) {
      setCallError((error as Error).message || 'Không thể bật/tắt camera');
    }
  };

  const upgradeVoiceToVideo = async () => {
    const currentCall = activeCallRef.current;
    if (!currentCall || currentCall.mode === 'video' || !user?.uid) return;

    const nextCall: ActiveCall = { ...currentCall, mode: 'video' };
    const setVideoMode = () => {
      activeCallRef.current = nextCall;
      setActiveCall((current) =>
        current && current.callId === nextCall.callId ? { ...current, mode: 'video' } : current
      );
    };

    try {
      if (useLiveKitProvider) {
        const room = liveKitRoomRef.current;
        if (!room) return;

        await room.localParticipant.setCameraEnabled(
          true,
          {
            resolution: activeVideoSpec.resolution,
            frameRate: {
              ideal: targetVideoFps,
            },
          },
          {
            simulcast: true,
            videoEncoding: activeVideoSpec.encoding,
          }
        );
        syncLiveKitLocalPreview(room);
        setVideoMode();
        setIsCameraEnabled(true);
        setCallError(null);
        return;
      }

      const peer = peerConnectionRef.current;
      if (!peer) return;

      const videoStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: buildCameraConstraints(selectedVideoProfile),
      });
      const videoTrack = videoStream.getVideoTracks()[0];
      if (!videoTrack) {
        setCallError('Camera chÆ°a sáºµn sÃ ng.');
        return;
      }

      const baseStream = localStreamRef.current ?? new MediaStream();
      baseStream.getVideoTracks().forEach((track) => {
        track.stop();
        baseStream.removeTrack(track);
      });
      baseStream.addTrack(videoTrack);
      localStreamRef.current = baseStream;

      const sender = peer.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(videoTrack);
      } else {
        peer.addTrack(videoTrack, baseStream);
      }

      setLocalStream(new MediaStream(baseStream.getTracks()));
      setVideoMode();
      setIsCameraEnabled(true);

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      getSocket().emit('call:signal', {
        callId: nextCall.callId,
        conversationId: nextCall.conversationId,
        fromUserId: user.uid,
        toUserId: nextCall.peerId,
        mode: 'video',
        signal: {
          type: 'offer',
          sdp: {
            type: offer.type,
            sdp: offer.sdp ?? undefined,
          },
        },
      });
      setCallError(null);
    } catch (error) {
      setCallError((error as Error).message || 'KhÃ´ng thá»ƒ chuyá»ƒn sang video call');
    }
  };

  const clearOutgoingTimeout = () => {
    if (outgoingTimeoutRef.current) {
      window.clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
  };

  const stopRingtone = () => {
    if (ringtoneIntervalRef.current) {
      window.clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }

    const context = ringtoneContextRef.current;
    if (context) {
      void context.close().catch(() => undefined);
      ringtoneContextRef.current = null;
    }
  };

  const playRingtoneBurst = async () => {
    if (typeof window === 'undefined') return;

    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) return;

    if (!ringtoneContextRef.current) {
      ringtoneContextRef.current = new AudioContextCtor();
    }

    const context = ringtoneContextRef.current;
    if (context.state === 'suspended') {
      await context.resume().catch(() => undefined);
    }

    const scheduleTone = (
      offset: number,
      frequency: number,
      duration: number,
      type: OscillatorType = 'triangle',
      peak = 0.06
    ) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + offset;
      const endAt = startAt + duration;

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(startAt);
      oscillator.stop(endAt);
    };

    scheduleTone(0.0, 659.25, 0.18);
    scheduleTone(0.22, 783.99, 0.18);
    scheduleTone(0.44, 987.77, 0.22, 'sine', 0.05);
    scheduleTone(0.74, 783.99, 0.2);
  };

  const startRingtone = () => {
    if (ringtoneIntervalRef.current) return;

    void playRingtoneBurst();
    ringtoneIntervalRef.current = window.setInterval(() => {
      void playRingtoneBurst();
    }, 2200);
  };

  const resetCallMedia = () => {
    liveKitRoomRef.current?.disconnect();
    liveKitRoomRef.current = null;

    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingIceCandidatesRef.current = [];

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    setRemoteStream(null);
    setHasRemoteVideoTrack(false);
    setIsRemoteCameraMuted(false);
  };

  const flushPendingIceCandidates = async (peer: RTCPeerConnection) => {
    if (!peer.remoteDescription) return;
    while (pendingIceCandidatesRef.current.length > 0) {
      const candidate = pendingIceCandidatesRef.current.shift();
      if (!candidate) continue;
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  const createPeerConnection = (call: ActiveCall) => {
    const socket = getSocket();
    const peer = new RTCPeerConnection({
      iceServers: WEBRTC_ICE_SERVERS,
    });

    const nextRemoteStream = new MediaStream();
    remoteStreamRef.current = nextRemoteStream;
    setRemoteStream(nextRemoteStream);

    peer.ontrack = (event) => {
      const target = remoteStreamRef.current ?? new MediaStream();
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = target;
        setRemoteStream(target);
      }

      const incomingTracks =
        event.streams[0]?.getTracks() ??
        (event.track ? [event.track] : []);

      incomingTracks.forEach((track) => {
        const exists = target.getTracks().some((current) => current.id === track.id);
        if (!exists) target.addTrack(track);
      });

      setHasRemoteVideoTrack(target.getVideoTracks().some((track) => track.readyState === 'live'));
      setIsRemoteCameraMuted(false);
      setRemoteStream(new MediaStream(target.getTracks()));

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = target;
        void remoteVideoRef.current.play().catch(() => undefined);
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = target;
        void remoteAudioRef.current.play().catch(() => undefined);
      }
    };

    peer.onicecandidate = (event) => {
      if (!event.candidate || !user?.uid) return;
      socket.emit('call:signal', {
        callId: call.callId,
        conversationId: call.conversationId,
        fromUserId: user.uid,
        toUserId: call.peerId,
        mode: call.mode,
        signal: {
          type: 'ice',
          candidate: event.candidate.toJSON(),
        },
      });
    };

    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'failed') {
        console.error('WebRTC ICE failed. TURN is likely missing or unreachable.', {
          callId: call.callId,
          mode: call.mode,
          iceServers: WEBRTC_ICE_SERVERS.map((server) => server.urls),
        });
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        setActiveCall((current) =>
          current && current.callId === call.callId ? { ...current, status: 'connected' } : current
        );
        setCallError(null);
      }

      if (
        ['failed', 'closed', 'disconnected'].includes(peer.connectionState) &&
        activeCallRef.current?.callId === call.callId
      ) {
        resetCallMedia();
        setActiveCall(null);
      }
    };

    peerConnectionRef.current = peer;
    return peer;
  };

  const requestLocalStream = async (mode: CallMode) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === 'video' ? buildCameraConstraints(selectedVideoProfile) : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    setIsMicEnabled(true);
    setIsCameraEnabled(mode === 'video');
    return stream;
  };

  const emitEndCall = (call: ActiveCall, reason?: string) => {
    if (!user?.uid) return;
    if (endedCallIdsRef.current.has(call.callId)) return;

    endedCallIdsRef.current.add(call.callId);
    window.setTimeout(() => {
      endedCallIdsRef.current.delete(call.callId);
    }, 15000);

    getSocket().emit('call:end', {
      callId: call.callId,
      conversationId: call.conversationId,
      fromUserId: user.uid,
      toUserId: call.peerId,
      reason,
    });
  };

  const closeCurrentCallWindow = () => {
    if (!callWindowMode || typeof window === 'undefined') return;

    window.setTimeout(() => {
      if (window.opener) {
        window.close();
        return;
      }

      window.location.replace('/feed/waves');
    }, 80);
  };

  const finishCall = (
    notifyPeer: boolean,
    reason?: string,
    options?: { keepFallbackSession?: boolean }
  ) => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }

    const current = activeCallRef.current;
    if (notifyPeer && current) emitEndCall(current, reason);
    clearOutgoingTimeout();
    clearGroupOutgoingTimeout();
    stopRingtone();
    resetCallMedia();
    setCallQuotaState(null);
    setConnectedAtMs(null);
    setCallDurationSec(0);
    setIsCallMinimized(false);
    setIsCallHidden(false);
    setIsMicEnabled(true);
    setIsCameraEnabled(true);
    setAwaitingGroupRoomCallId(null);
    setPendingGroupOutgoingCall(null);
    setGroupIncomingCall(null);
    if (!options?.keepFallbackSession) {
      setFallbackSession(null);
    }
    setActiveCall(null);
    setIncomingCall(null);
    setAcceptingCall(false);
  };

  const handleIncomingSignal = async (payload: CallSignalPayload) => {
    if (useLiveKitProvider) return;

    const current = activeCallRef.current;
    const peer = peerConnectionRef.current;
    if (!current || current.callId !== payload.callId || !peer) return;

    if (payload.mode === 'video' && current.mode !== 'video') {
      const nextCall: ActiveCall = { ...current, mode: 'video' };
      activeCallRef.current = nextCall;
      setActiveCall((active) =>
        active && active.callId === payload.callId ? { ...active, mode: 'video' } : active
      );
      setIsCameraEnabled(localStreamRef.current?.getVideoTracks().some((track) => track.enabled) ?? false);
    }

    if (payload.signal.type === 'offer') {
      await peer.setRemoteDescription(new RTCSessionDescription(payload.signal.sdp));
      await flushPendingIceCandidates(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      if (!user?.uid) return;
      getSocket().emit('call:signal', {
        callId: current.callId,
        conversationId: current.conversationId,
        fromUserId: user.uid,
        toUserId: current.peerId,
        mode: payload.mode,
        signal: {
          type: 'answer',
          sdp: {
            type: answer.type,
            sdp: answer.sdp ?? undefined,
          },
        },
      });
      return;
    }

    if (payload.signal.type === 'answer') {
      await peer.setRemoteDescription(new RTCSessionDescription(payload.signal.sdp));
      await flushPendingIceCandidates(peer);
      return;
    }

    if (payload.signal.type === 'ice') {
      if (!peer.remoteDescription) {
        pendingIceCandidatesRef.current.push(payload.signal.candidate);
        return;
      }
      await peer.addIceCandidate(new RTCIceCandidate(payload.signal.candidate));
    }
  };

  const startCall = (input: StartCallInput) => {
    if (
      !user?.uid ||
      activeCallRef.current ||
      incomingCall ||
      groupIncomingCall ||
      pendingGroupOutgoingCall ||
      awaitingGroupRoomCallId ||
      fallbackSession
    ) {
      return;
    }

    const callId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setCallError(null);
    setCallQuotaState(null);
    setFallbackSession(null);
    resetCallControls(input.mode);
    setActiveCall({
      callId,
      conversationId: input.conversationId,
      peerId: input.peerId,
      peerName: input.peerName,
      peerAvatarUrl: input.peerAvatarUrl,
      mode: input.mode,
      isOutgoing: true,
      status: 'outgoing',
    });

    getSocket().emit('call:invite', {
      callId,
      conversationId: input.conversationId,
      fromUserId: user.uid,
      toUserId: input.peerId,
      fromName: user.displayName ?? user.email?.split('@')[0] ?? 'Surf user',
      fromAvatarUrl: user.photoURL ?? null,
      mode: input.mode,
    });
  };

  const startGroupCall = (input: StartGroupCallInput) => {
    if (
      !user?.uid ||
      activeCallRef.current ||
      incomingCall ||
      groupIncomingCall ||
      pendingGroupOutgoingCall ||
      awaitingGroupRoomCallId ||
      fallbackSession
    ) {
      return;
    }

    const participantIds = Array.from(
      new Set(input.memberIds.map((id) => id.trim()).filter(Boolean))
    ).filter((id) => id !== user.uid);

    if (participantIds.length === 0) {
      pushToast('Chưa thể gọi nhóm', 'Nhóm chưa có thành viên khác để tham gia cuộc gọi.');
      return;
    }

    const callId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    clearGroupOutgoingTimeout();
    setCallError(null);
    setIncomingCall(null);
    setGroupIncomingCall(null);
    setPendingGroupOutgoingCall({
      callId,
      conversationId: input.conversationId,
      conversationTitle: input.conversationTitle,
      mode: input.mode,
    });
    setAwaitingGroupRoomCallId(callId);

    getSocket().emit('call:group-invite', {
      callId,
      conversationId: input.conversationId,
      fromUserId: user.uid,
      fromName: user.displayName ?? user.email?.split('@')[0] ?? 'Surf user',
      fromAvatarUrl: user.photoURL ?? null,
      conversationTitle: input.conversationTitle,
      participantIds,
      mode: input.mode,
    });

    pushToast(
      input.mode === 'video'
        ? 'Đang mời vào cuộc gọi video nhóm'
        : 'Đang mời vào cuộc gọi thoại nhóm',
      'Hệ thống sẽ tự mở phòng ngay khi có thành viên chấp nhận.'
    );
  };

  const connectOutgoingAcceptedCall = async (call: ActiveCall) => {
    if (!user?.uid) return;

    try {
      clearOutgoingTimeout();
      setCallError(null);
      setCallQuotaState(null);
      setFallbackSession(null);
      resetCallControls(call.mode);
      setActiveCall({ ...call, status: 'connecting', isOutgoing: true });

      if (useLiveKitProvider) {
        await connectLiveKitCall({ ...call, status: 'connecting', isOutgoing: true });
        return;
      }

      // Phase 1: Set up local media and peer connection.
      const stream = await requestLocalStream(call.mode);
      const peer = createPeerConnection({ ...call, status: 'connecting', isOutgoing: true });
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      // Phase 2: Create and send the SDP offer immediately.
      // The callee (Mobile) has a signal queue that buffers this offer
      // if it arrives before the callee's WebRTC is fully initialized.
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      getSocket().emit('call:signal', {
        callId: call.callId,
        conversationId: call.conversationId,
        fromUserId: user.uid,
        toUserId: call.peerId,
        mode: call.mode,
        signal: {
          type: 'offer',
          sdp: {
            type: offer.type,
            sdp: offer.sdp ?? undefined,
          },
        },
      });
    } catch (e) {
      const rawMessage = (e as Error).message;
      const fallbackMessage =
        rawMessage.startsWith('livekit_') || rawMessage === 'fallback'
          ? getFallbackReason(rawMessage)
          : rawMessage;
      setCallError(fallbackMessage || 'Không thể bắt đầu cuộc gọi');
      finishCall(true, 'fallback', { keepFallbackSession: true });
    }
  };

  const acceptIncomingCallInternal = async (call: IncomingCall) => {
    if (!user?.uid || activeCallRef.current) return;

    try {
      stopRingtone();
      setAcceptingCall(true);
      setCallError(null);
      setCallQuotaState(null);
      setFallbackSession(null);
      resetCallControls(call.mode);

      const nextCall: ActiveCall = {
        callId: call.callId,
        conversationId: call.conversationId,
        peerId: call.fromUserId,
        peerName: call.fromName,
        peerAvatarUrl: call.fromAvatarUrl,
        mode: call.mode,
        isOutgoing: false,
        status: 'connecting',
      };

      setActiveCall(nextCall);
      activeCallRef.current = nextCall;
      setIncomingCall(null);

      if (useLiveKitProvider) {
        getSocket().emit('call:accept', {
          callId: call.callId,
          conversationId: call.conversationId,
          fromUserId: user.uid,
          toUserId: call.fromUserId,
          mode: call.mode,
        });
        await connectLiveKitCall(nextCall);
      } else {
        const stream = await requestLocalStream(call.mode);
        const peer = createPeerConnection(nextCall);
        stream.getTracks().forEach((track) => peer.addTrack(track, stream));
        getSocket().emit('call:accept', {
          callId: call.callId,
          conversationId: call.conversationId,
          fromUserId: user.uid,
          toUserId: call.fromUserId,
          mode: call.mode,
        });
      }
    } catch (e) {
      const rawMessage = (e as Error).message;
      const fallbackMessage =
        rawMessage.startsWith('livekit_') || rawMessage === 'fallback'
          ? getFallbackReason(rawMessage)
          : rawMessage;
      setCallError(fallbackMessage || 'Không thể truy cập microphone/camera');
      finishCall(true, 'fallback', { keepFallbackSession: true });
    } finally {
      setAcceptingCall(false);
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall || !user?.uid || activeCallRef.current) return;
    if (!callWindowMode) {
      if (useLiveKitProvider) {
        const directCall: ActiveCall = {
          callId: incomingCall.callId,
          conversationId: incomingCall.conversationId,
          peerId: incomingCall.fromUserId,
          peerName: incomingCall.fromName,
          peerAvatarUrl: incomingCall.fromAvatarUrl,
          mode: incomingCall.mode,
          isOutgoing: false,
          status: 'connecting',
        };

        const popup = openDirectCallMeetingWindow(directCall);

        if (popup) {
          stopRingtone();
          setCallError(null);
          getSocket().emit('call:accept', {
            callId: incomingCall.callId,
            conversationId: incomingCall.conversationId,
            fromUserId: user.uid,
            toUserId: incomingCall.fromUserId,
            mode: incomingCall.mode,
          });
          setIncomingCall(null);
          pushToast(
            'Đã mở cửa sổ gọi',
            `Đang kết nối cuộc gọi với ${incomingCall.fromName} ở giao diện meeting.`
          );
          return;
        }

        const meetingUrl = buildDirectCallMeetingUrl(directCall);
        if (meetingUrl && typeof window !== 'undefined') {
          stopRingtone();
          setCallError(null);
          getSocket().emit('call:accept', {
            callId: incomingCall.callId,
            conversationId: incomingCall.conversationId,
            fromUserId: user.uid,
            toUserId: incomingCall.fromUserId,
            mode: incomingCall.mode,
          });
          setIncomingCall(null);
          pushToast(
            'Popup bị chặn',
            `Đang chuyển cuộc gọi với ${incomingCall.fromName} sang giao diện meeting trong tab hiện tại.`
          );
          window.location.assign(meetingUrl);
          return;
        }
      }
      // WebRTC P2P mode: handle the call directly in the main window
      // (skip popup to avoid race conditions with socket listeners).
    }

    await acceptIncomingCallInternal(incomingCall);
  };

  const declineIncomingCall = () => {
    if (!incomingCall || !user?.uid) return;
    stopRingtone();
    getSocket().emit('call:decline', {
      callId: incomingCall.callId,
      conversationId: incomingCall.conversationId,
      fromUserId: user.uid,
      toUserId: incomingCall.fromUserId,
      reason: 'declined',
    });
    setIncomingCall(null);
  };

  const acceptGroupIncomingCall = () => {
    if (
      !groupIncomingCall ||
      !user?.uid ||
      activeCallRef.current ||
      incomingCall ||
      fallbackSession ||
      pendingGroupOutgoingCall ||
      awaitingGroupRoomCallId
    ) {
      return;
    }

    stopRingtone();
    clearGroupOutgoingTimeout();
    setCallError(null);
    setAwaitingGroupRoomCallId(groupIncomingCall.callId);

    getSocket().emit('call:group-accept', {
      callId: groupIncomingCall.callId,
      conversationId: groupIncomingCall.conversationId,
      fromUserId: user.uid,
    });
    setGroupIncomingCall(null);
  };

  const declineGroupIncomingCall = () => {
    if (!groupIncomingCall || !user?.uid) return;

    stopRingtone();
    getSocket().emit('call:group-decline', {
      callId: groupIncomingCall.callId,
      conversationId: groupIncomingCall.conversationId,
      fromUserId: user.uid,
      reason: 'declined',
    });
    setGroupIncomingCall(null);
  };

  useEffect(() => {
    if ((incomingCall || groupIncomingCall) && !activeCall) {
      startRingtone();
      return;
    }

    stopRingtone();
  }, [incomingCall, groupIncomingCall, activeCall]);

  useEffect(() => {
    if (!callWindowMode || !user?.uid || activeCallRef.current || acceptingCall) return;

    const pendingCall = consumePendingCallAccept(user.uid);
    if (!pendingCall) return;

    void acceptIncomingCallInternal(pendingCall);
  }, [callWindowMode, user?.uid]);

  useEffect(() => {
    if (!callWindowMode || !user?.uid || activeCallRef.current || acceptingCall) return;

    const pendingOutgoingCall = consumePendingOutgoingCallConnect(user.uid);
    if (!pendingOutgoingCall) return;

    void connectOutgoingAcceptedCall(pendingOutgoingCall);
  }, [callWindowMode, user?.uid, acceptingCall]);

  useEffect(() => {
    if (!callWindowMode || typeof window === 'undefined') return;

    const handleWindowLeave = () => {
      const current = activeCallRef.current;
      if (!current) return;

      emitEndCall(current, 'window_closed');
    };

    window.addEventListener('beforeunload', handleWindowLeave);
    window.addEventListener('pagehide', handleWindowLeave);

    return () => {
      window.removeEventListener('beforeunload', handleWindowLeave);
      window.removeEventListener('pagehide', handleWindowLeave);
    };
  }, [callWindowMode, user?.uid]);

  useEffect(() => {
    clearOutgoingTimeout();

    if (!activeCall || !activeCall.isOutgoing || activeCall.status !== 'outgoing') {
      return;
    }

    outgoingTimeoutRef.current = window.setTimeout(() => {
      const current = activeCallRef.current;
      if (!current || current.callId !== activeCall.callId || current.status !== 'outgoing') return;

      pushToast('Không có phản hồi', `Cuộc gọi tới ${current.peerName} đã hết thời gian chờ.`);
      finishCall(true, 'missed');
    }, 30000);

    return () => {
      clearOutgoingTimeout();
    };
  }, [activeCall]);

  useEffect(() => {
    clearGroupOutgoingTimeout();

    const trackedCallId = pendingGroupOutgoingCall?.callId ?? awaitingGroupRoomCallId;
    if (!trackedCallId) {
      return;
    }

    groupOutgoingTimeoutRef.current = window.setTimeout(() => {
      setPendingGroupOutgoingCall((current) =>
        current?.callId === trackedCallId ? null : current
      );

      setAwaitingGroupRoomCallId((current) => {
        if (current !== trackedCallId) return current;

        pushToast('Không có phản hồi', 'Chưa có thành viên nào tham gia cuộc gọi nhóm.');
        setCallError('Cuộc gọi nhóm đã hết thời gian chờ.');
        return null;
      });
    }, 45000);

    return () => {
      clearGroupOutgoingTimeout();
    };
  }, [pendingGroupOutgoingCall?.callId, awaitingGroupRoomCallId]);

  useEffect(() => {
    const socket = getSocket();

    const onIncomingCall = (payload: CallInvitePayload) => {
      if (!user?.uid) return;
      if (payload.fromUserId === user?.uid) return;
      if (
        activeCallRef.current ||
        incomingCall ||
        groupIncomingCall ||
        pendingGroupOutgoingCall ||
        awaitingGroupRoomCallId ||
        fallbackSession
      ) {
        socket.emit('call:decline', {
          callId: payload.callId,
          conversationId: payload.conversationId,
          fromUserId: user?.uid,
          toUserId: payload.fromUserId,
          reason: 'busy',
        });
        return;
      }

      setCallError(null);
      setIncomingCall({
        callId: payload.callId,
        conversationId: payload.conversationId,
        fromUserId: payload.fromUserId,
        fromName: payload.fromName,
        fromAvatarUrl: payload.fromAvatarUrl,
        mode: payload.mode,
      });
    };

    const onGroupIncomingCall = (payload: GroupCallIncomingPayload) => {
      if (!user?.uid) return;
      if (payload.fromUserId === user.uid) return;

      if (
        activeCallRef.current ||
        incomingCall ||
        groupIncomingCall ||
        pendingGroupOutgoingCall ||
        awaitingGroupRoomCallId ||
        fallbackSession
      ) {
        socket.emit('call:group-decline', {
          callId: payload.callId,
          conversationId: payload.conversationId,
          fromUserId: user.uid,
          reason: 'busy',
        });
        return;
      }

      setCallError(null);
      setGroupIncomingCall({
        callId: payload.callId,
        conversationId: payload.conversationId,
        fromUserId: payload.fromUserId,
        fromName: payload.fromName,
        fromAvatarUrl: payload.fromAvatarUrl,
        conversationTitle: payload.conversationTitle,
        mode: payload.mode,
      });
    };

    const onCallAccepted = async (payload: CallAcceptedPayload) => {
      const current = activeCallRef.current;
      if (!current || current.callId !== payload.callId || !current.isOutgoing || !user?.uid)
        return;

      const nextCall: ActiveCall = {
        ...current,
        status: 'connecting',
        isOutgoing: true,
      };

      if (!callWindowMode) {
        if (useLiveKitProvider) {
          const popup = openDirectCallMeetingWindow(nextCall);

          if (popup) {
            clearOutgoingTimeout();
            setCallError(null);
            resetCallMedia();
            setActiveCall(null);
            pushToast(
              'Đã mở cửa sổ gọi',
              `Cuộc gọi với ${nextCall.peerName} đang chạy ở giao diện meeting.`
            );
            return;
          }

          const meetingUrl = buildDirectCallMeetingUrl(nextCall);
          if (meetingUrl && typeof window !== 'undefined') {
            clearOutgoingTimeout();
            setCallError(null);
            resetCallMedia();
            setActiveCall(null);
            pushToast(
              'Popup bị chặn',
              `Đang chuyển cuộc gọi với ${nextCall.peerName} sang giao diện meeting trong tab hiện tại.`
            );
            window.location.assign(meetingUrl);
            return;
          }
        }
        // WebRTC P2P mode: handle the call directly in the main window
        // (skip popup to avoid race conditions with socket listeners).
      }

      await connectOutgoingAcceptedCall(nextCall);
    };

    const onCallDeclined = (payload: CallEndPayload) => {
      if (activeCallRef.current?.callId === payload.callId) {
        const message =
          payload.reason === 'busy'
            ? 'Đối phương đang bận.'
            : payload.reason === 'media_error'
              ? 'Đối phương không thể truy cập microphone/camera.'
              : 'Đối phương đã từ chối cuộc gọi.';
        setCallError(message);
        pushToast('Cuộc gọi kết thúc', message);
        finishCall(false);
      }

      if (incomingCall?.callId === payload.callId) {
        setIncomingCall(null);
      }
    };

    const onCallEnded = (payload: CallEndPayload) => {
      const currentIncoming = incomingCall;
      const currentActive = activeCallRef.current;

      if (currentIncoming?.callId === payload.callId) {
        let description = `${currentIncoming.fromName} đã kết thúc cuộc gọi.`;
        if (payload.reason === 'window_closed') {
          description = `${currentIncoming.fromName} đã tắt cửa sổ cuộc gọi.`;
        } else if (payload.reason === 'missed') {
          description = `${currentIncoming.fromName} đã kết thúc sau khi bạn chưa kịp bắt máy.`;
        }

        pushToast('Cuộc gọi nhỡ', description);
      } else if (
        currentActive?.callId === payload.callId &&
        currentActive.isOutgoing &&
        currentActive.status !== 'connected'
      ) {
        const description =
          payload.reason === 'window_closed'
            ? `${currentActive.peerName} đã tắt cửa sổ cuộc gọi.`
            : `Cuộc gọi tới ${currentActive.peerName} đã kết thúc.`;
        pushToast('Cuộc gọi kết thúc', description);
      } else if (currentActive?.callId === payload.callId && payload.reason === 'window_closed') {
        pushToast('Cuộc gọi kết thúc', `${currentActive.peerName} đã tắt cửa sổ cuộc gọi.`);
      }

      if (currentActive?.callId === payload.callId || currentIncoming?.callId === payload.callId) {
        finishCall(false);
      }
    };

    const onCallSignal = (payload: CallSignalPayload) => {
      void handleIncomingSignal(payload).catch((e) => {
        setCallError((e as Error).message || 'Lỗi kết nối cuộc gọi');
        finishCall(true);
      });
    };

    const onGroupRoomReady = (payload: GroupCallRoomReadyPayload) => {
      const isAwaiting = awaitingGroupRoomCallId === payload.callId;
      const isOutgoingSession = pendingGroupOutgoingCall?.callId === payload.callId;
      if (!isAwaiting && !isOutgoingSession) return;

      clearGroupOutgoingTimeout();
      setPendingGroupOutgoingCall((current) =>
        current?.callId === payload.callId ? null : current
      );
      setAwaitingGroupRoomCallId((current) => (current === payload.callId ? null : current));
      setGroupIncomingCall((current) => (current?.callId === payload.callId ? null : current));
      setCallError(null);

      openGroupRoomWindow(payload);
    };

    const onGroupDeclined = (payload: GroupCallDeclinedPayload) => {
      if (pendingGroupOutgoingCall?.callId === payload.callId) {
        pushToast(
          'Có thành viên đã từ chối',
          'Hệ thống vẫn tiếp tục chờ thành viên khác tham gia.'
        );
      }

      if (groupIncomingCall?.callId === payload.callId) {
        setGroupIncomingCall(null);
      }
    };

    socket.on('call:incoming', onIncomingCall);
    socket.on('call:accepted', onCallAccepted);
    socket.on('call:declined', onCallDeclined);
    socket.on('call:ended', onCallEnded);
    socket.on('call:signal', onCallSignal);
    socket.on('call:group-incoming', onGroupIncomingCall);
    socket.on('call:group-room-ready', onGroupRoomReady);
    socket.on('call:group-declined', onGroupDeclined);

    return () => {
      socket.off('call:incoming', onIncomingCall);
      socket.off('call:accepted', onCallAccepted);
      socket.off('call:declined', onCallDeclined);
      socket.off('call:ended', onCallEnded);
      socket.off('call:signal', onCallSignal);
      socket.off('call:group-incoming', onGroupIncomingCall);
      socket.off('call:group-room-ready', onGroupRoomReady);
      socket.off('call:group-declined', onGroupDeclined);
    };
  }, [
    incomingCall?.callId,
    groupIncomingCall?.callId,
    pendingGroupOutgoingCall?.callId,
    awaitingGroupRoomCallId,
    fallbackSession,
    user?.uid,
  ]);

  useEffect(() => {
    return () => {
      stopRingtone();
      clearOutgoingTimeout();
      clearGroupOutgoingTimeout();
      if (callToastTimeoutRef.current) {
        window.clearTimeout(callToastTimeoutRef.current);
      }
      finishCall(false);
    };
  }, []);

  const showRemoteVideoPlaceholder =
    activeCall?.mode === 'video' &&
    (!remoteStream || !hasRemoteVideoTrack || isRemoteCameraMuted || !hasRemoteVideoFrame);
  const isOutgoingWaitingForAccept = Boolean(
    activeCall && activeCall.isOutgoing && activeCall.status === 'outgoing'
  );
  const showPreConnectScreen = isOutgoingWaitingForAccept;
  const preConnectTitle = activeCall
    ? isOutgoingWaitingForAccept
      ? `Đang gọi cho ${activeCall.peerName}`
      : activeCall.isOutgoing
        ? `Đang kết nối với ${activeCall.peerName}`
        : `${activeCall.peerName} đang gọi cho bạn`
    : '';
  const preConnectHint = activeCall
    ? isOutgoingWaitingForAccept
      ? 'Đợi đối phương chấp nhận cuộc gọi'
      : 'Đang trao đổi tín hiệu kết nối'
    : '';
  const isCallWindow = callWindowMode;
  const overlayClass = isCallWindow
    ? 'fixed inset-0 z-[120] flex items-center justify-center bg-slate-950 p-0'
    : 'fixed inset-0 z-[120] flex items-center justify-center bg-slate-950 p-0 backdrop-blur-sm';
  const minimizedCallClass =
    'fixed bottom-5 right-5 z-[121] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-white/15 bg-slate-950/95 text-white shadow-[0_24px_80px_-24px_rgba(15,23,42,0.75)] backdrop-blur-xl';
  const callStageClass = isFullscreen
    ? 'relative w-full bg-slate-950 shadow-2xl shadow-slate-950/40 flex h-full max-h-none max-w-none items-center justify-center overflow-hidden rounded-none p-2 sm:p-4'
    : isCallWindow
      ? 'relative h-[100dvh] w-full bg-slate-950 shadow-2xl shadow-slate-950/40 max-h-none max-w-none overflow-hidden rounded-none'
      : 'relative h-[100dvh] min-h-0 w-full overflow-hidden bg-slate-950 shadow-2xl shadow-slate-950/40';
  return (
    <GlobalCallContext.Provider
      value={{
        startCall,
        startGroupCall,
        activeCall,
        incomingCall,
        isBusy: Boolean(
          activeCall ||
          incomingCall ||
          groupIncomingCall ||
          pendingGroupOutgoingCall ||
          awaitingGroupRoomCallId ||
          fallbackSession
        ),
      }}
    >
      {children}
      {callToast && (
        <div className="pointer-events-none fixed right-6 top-6 z-[119] max-w-sm rounded-[28px] border border-cyan-100 bg-white/95 px-5 py-4 shadow-[0_26px_60px_-28px_rgba(8,145,178,0.45)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-600">
            Surf Call
          </p>
          <h4 className="mt-2 text-lg font-semibold text-slate-900">{callToast.title}</h4>
          <p className="mt-1 text-sm leading-6 text-slate-500">{callToast.description}</p>
        </div>
      )}
      {groupIncomingCall && !incomingCall && !activeCall && !fallbackSession && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[32px] bg-white p-6 text-center shadow-2xl sm:p-8">
            <CallAvatar
              src={groupIncomingCall.fromAvatarUrl}
              name={groupIncomingCall.fromName}
              className="mx-auto h-24 w-24 rounded-full object-cover"
              fallbackClassName="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-2xl font-semibold text-white"
            />
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">
              {groupIncomingCall.mode === 'video' ? 'Lời mời video nhóm' : 'Lời mời thoại nhóm'}
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-slate-900">
              {groupIncomingCall.conversationTitle ?? 'Nhóm Surf Waves'}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {groupIncomingCall.fromName} đang mời bạn tham gia. Khi chấp nhận, hệ thống sẽ mở cửa
              sổ cuộc gọi mới.
            </p>
            {callError && <p className="mt-3 text-sm text-red-500">{callError}</p>}
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={declineGroupIncomingCall}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Từ chối
              </button>
              <button
                type="button"
                onClick={acceptGroupIncomingCall}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30"
              >
                Tham gia
              </button>
            </div>
          </div>
        </div>
      )}
      {!groupIncomingCall &&
        !incomingCall &&
        !activeCall &&
        !fallbackSession &&
        (pendingGroupOutgoingCall || awaitingGroupRoomCallId) && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[32px] bg-white p-6 text-center shadow-2xl sm:p-8">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">
                {pendingGroupOutgoingCall
                  ? 'Đang chờ thành viên tham gia'
                  : 'Đang chuẩn bị phòng gọi'}
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-slate-900">
                {pendingGroupOutgoingCall?.conversationTitle ?? 'Cuộc gọi nhóm Surf Waves'}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {pendingGroupOutgoingCall
                  ? 'Cửa sổ cuộc gọi sẽ tự mở ngay khi có người chấp nhận lời mời.'
                  : 'Hệ thống đang kết nối vào phòng nhóm, vui lòng giữ nguyên màn hình.'}
              </p>
              {callError && <p className="mt-3 text-sm text-red-500">{callError}</p>}
              {pendingGroupOutgoingCall && (
                <div className="mt-6 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      clearGroupOutgoingTimeout();
                      setPendingGroupOutgoingCall(null);
                      setAwaitingGroupRoomCallId((current) =>
                        current === pendingGroupOutgoingCall.callId ? null : current
                      );
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Hủy chờ
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      {activeCall && isCallMinimized && (
        isCallHidden ? (
          <button
            type="button"
            onClick={() => setIsCallHidden(false)}
            className="fixed bottom-5 right-5 z-[121] inline-flex items-center gap-3 rounded-full border border-cyan-200/40 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_60px_-22px_rgba(8,145,178,0.9)] backdrop-blur-xl transition hover:bg-slate-900"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500">
              {activeCall.mode === 'video' ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h10Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.7 11.7 0 0 0 3.68.59 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.48a1 1 0 0 1 1 1 11.7 11.7 0 0 0 .59 3.68 1 1 0 0 1-.25 1.01Z" />
                </svg>
              )}
            </span>
            <span className="text-left">
              <span className="block text-xs uppercase tracking-[0.14em] text-cyan-200">
                Surf Call
              </span>
              <span className="block max-w-[180px] truncate">{activeCall.peerName}</span>
            </span>
          </button>
        ) : (
          <div className={minimizedCallClass}>
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <CallAvatar
                src={activeCall.peerAvatarUrl}
                name={activeCall.peerName}
                className="h-11 w-11 rounded-full object-cover"
                fallbackClassName="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-sm font-semibold text-white"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{activeCall.peerName}</p>
                <p className="mt-0.5 text-xs text-slate-300">
                  {activeCall.status === 'connected'
                    ? formatCallDuration(callDurationSec)
                    : activeCall.status === 'outgoing'
                      ? 'Đang đổ chuông'
                      : 'Đang kết nối'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCallMinimized(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
                title="Mở lại cuộc gọi"
                aria-label="Mở lại cuộc gọi"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <path d="M5 11h2V7h4V5H5v6Zm12 6h-4v2h6v-6h-2v4ZM13 5v2h4v4h2V5h-6ZM7 13H5v6h6v-2H7v-4Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setIsCallHidden(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
                title="Ẩn panel cuộc gọi"
                aria-label="Ẩn panel cuộc gọi"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <path d="M5 11h14v2H5z" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-center gap-3 px-4 py-4">
              <button
                type="button"
                onClick={() => {
                  void toggleMicrophone();
                }}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition ${
                  isMicEnabled ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-amber-400/25 text-amber-100'
                }`}
                title={isMicEnabled ? 'Tắt mic' : 'Bật mic'}
                aria-label={isMicEnabled ? 'Tắt mic' : 'Bật mic'}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Zm-6-4a1 1 0 0 1 2 0 4 4 0 1 0 8 0 1 1 0 1 1 2 0 6 6 0 0 1-5 5.91V20h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-3.09A6 6 0 0 1 6 11Z" />
                </svg>
              </button>
              {activeCall.mode === 'video' && (
                <button
                  type="button"
                  onClick={() => {
                    void toggleCamera();
                  }}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition ${
                    isCameraEnabled ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-amber-400/25 text-amber-100'
                  }`}
                  title={isCameraEnabled ? 'Tắt cam' : 'Bật cam'}
                  aria-label={isCameraEnabled ? 'Tắt cam' : 'Bật cam'}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h10Z" />
                  </svg>
                </button>
              )}
              {activeCall.mode === 'audio' && (
                <button
                  type="button"
                  onClick={() => {
                    void upgradeVoiceToVideo();
                  }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-100 transition hover:bg-cyan-500/30"
                  title="Chuyá»ƒn sang video"
                  aria-label="Chuyá»ƒn sang video"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h10Z" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  finishCall(true);
                  closeCurrentCallWindow();
                }}
                className="inline-flex h-12 min-w-24 items-center justify-center rounded-full bg-red-500 px-5 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-400"
              >
                Kết thúc
              </button>
            </div>
          </div>
        )
      )}

      {(incomingCall || (activeCall && !isCallMinimized) || fallbackSession) && (
        <div className={overlayClass}>
          {incomingCall && !activeCall ? (
            <div className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-[32px] border border-slate-200 bg-white p-6 text-center shadow-[0_30px_90px_-32px_rgba(15,23,42,0.55)] sm:p-8">
              <div className="relative mx-auto h-24 w-24">
                <div className="absolute inset-0 animate-ping rounded-full bg-cyan-400/40"></div>
                <CallAvatar
                  src={incomingCall.fromAvatarUrl}
                  name={incomingCall.fromName}
                  className="relative h-24 w-24 flex-shrink-0 rounded-full object-cover shadow-xl"
                  fallbackClassName="relative flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-2xl font-semibold text-white shadow-xl"
                />
              </div>
              <div>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600">
                  {incomingCall.mode === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}
                </p>
                <h3 className="mt-3 text-2xl font-semibold text-slate-900">
                  {incomingCall.fromName}
                </h3>
                <p className="mt-2 text-sm text-slate-500">Đang gọi cho bạn qua Surf Waves</p>
                {callError && <p className="mt-3 text-sm text-red-500">{callError}</p>}
                <div className="mt-8 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={declineIncomingCall}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4.5 15.5c4.7-3.2 10.3-3.2 15 0" />
                    <path d="M7.2 15.2 6 18" />
                    <path d="M16.8 15.2 18 18" />
                  </svg>
                  Từ chối
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void acceptIncomingCall();
                  }}
                  disabled={acceptingCall}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {acceptingCall ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                  ) : incomingCall.mode === 'video' ? (
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                      <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                      <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.7 11.7 0 0 0 3.68.59 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.48a1 1 0 0 1 1 1 11.7 11.7 0 0 0 .59 3.68 1 1 0 0 1-.25 1.01Z" />
                    </svg>
                  )}
                  {acceptingCall ? 'Đang mở' : 'Nghe máy'}
                </button>
              </div>
            </div>
            </div>
          ) : activeCall ? (
            showPreConnectScreen ? (
              <div className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-[32px] bg-white p-6 text-center shadow-2xl sm:p-8">
                <div className="relative mx-auto h-24 w-24">
                  <div className="absolute inset-0 animate-ping rounded-full bg-cyan-400/40"></div>
                  <CallAvatar
                    src={activeCall.peerAvatarUrl}
                    name={activeCall.peerName}
                    className="relative h-24 w-24 flex-shrink-0 rounded-full object-cover shadow-xl"
                    fallbackClassName="relative flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-2xl font-semibold text-white shadow-xl"
                  />
                </div>
                <div>
                  <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600">
                    {activeCall.mode === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold text-slate-900">{preConnectTitle}</h3>
                  <p className="mt-2 text-sm text-slate-500">{preConnectHint}</p>
                  {callError && <p className="mt-3 text-sm text-red-500">{callError}</p>}
                  <div className="mt-8 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      finishCall(true, 'cancelled');
                      closeCurrentCallWindow();
                    }}
                    className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30"
                    title="Cúp cuộc gọi"
                    aria-label="Cúp cuộc gọi"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4.5 15.5c4.7-3.2 10.3-3.2 15 0" />
                      <path d="M7.2 15.2 6 18" />
                      <path d="M16.8 15.2 18 18" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled
                    className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 opacity-60"
                    title="Đang chờ chấp nhận"
                    aria-label="Đang chờ chấp nhận"
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                      <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
                    </svg>
                  </button>
                </div>
              </div>
              </div>
            ) : (
            <div ref={callStageRef} className={callStageClass}>
              {!isFullscreen && (
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-400/8 via-transparent to-blue-500/8" />
              )}
              <div className="absolute left-4 right-4 top-4 z-40 flex items-center justify-between gap-3 text-white sm:left-6 sm:right-6 sm:top-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsCallMinimized(true);
                    setIsCallHidden(false);
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-black/45 px-4 text-sm font-semibold text-white shadow-lg shadow-black/25 backdrop-blur-md transition hover:bg-black/60"
                  title="Về Surf và giữ cuộc gọi"
                  aria-label="Về Surf và giữ cuộc gọi"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                    <path d="M10.6 5.4 12 6.8 7.8 11H20v2H7.8l4.2 4.2-1.4 1.4L4 12Z" />
                  </svg>
                  Về Surf
                </button>
                <div className="hidden min-w-0 items-center gap-3 rounded-full border border-white/15 bg-black/35 px-4 py-2 text-sm shadow-lg shadow-black/20 backdrop-blur-md sm:flex">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                  <span className="truncate font-semibold">{activeCall.peerName}</span>
                  <span className="text-slate-300">
                    {activeCall.status === 'connected'
                      ? formatCallDuration(callDurationSec)
                      : activeCall.status === 'outgoing'
                        ? 'Đang đổ chuông'
                        : 'Đang kết nối'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void toggleCallFullscreen();
                  }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white shadow-lg shadow-black/25 backdrop-blur-md transition hover:bg-black/60"
                  title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                  aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <path d="M5 5h5a1 1 0 1 0 0-2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 2 0V5ZM19 3h-6a1 1 0 1 0 0 2h5v5a1 1 0 0 0 2 0V4a1 1 0 0 0-1-1ZM5 13a1 1 0 0 0-2 0v6a1 1 0 0 0 1 1h6a1 1 0 1 0 0-2H5v-5ZM20 13a1 1 0 0 0-2 0v5h-5a1 1 0 1 0 0 2h6a1 1 0 0 0 1-1v-6Z" />
                  </svg>
                </button>
              </div>
              <div
                className={
                  'relative h-full min-h-0 w-full overflow-hidden' +
                  (isFullscreen ? ' max-h-[calc(100dvh-1rem)] max-w-[1800px]' : '')
                }
              >
                <div
                  className={
                    'relative h-full w-full bg-black'
                  }
                >
                  {activeCall.mode === 'video' ? (
                    <div className="relative h-full w-full bg-black">
                      <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        onLoadedData={() => setHasRemoteVideoFrame(true)}
                        onCanPlay={() => setHasRemoteVideoFrame(true)}
                        onPlaying={() => setHasRemoteVideoFrame(true)}
                        onResize={(event) => {
                          const video = event.currentTarget;
                          setHasRemoteVideoFrame(video.videoWidth > 0 && video.videoHeight > 0);
                        }}
                        className={
                          'h-full w-full bg-black object-contain object-center transition-opacity duration-200 ' +
                          (showRemoteVideoPlaceholder ? ' opacity-0' : ' opacity-100')
                        }
                      />
                      {showRemoteVideoPlaceholder && (
                        <div
                          className={
                            'absolute flex flex-col items-center justify-center gap-4 bg-black text-white ' +
                            'inset-0'
                          }
                        >
                          <CallAvatar
                            src={activeCall.peerAvatarUrl}
                            name={activeCall.peerName}
                            className="h-28 w-28 rounded-full object-cover"
                            fallbackClassName="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-3xl font-semibold text-white"
                          />
                          <p className="text-lg font-semibold">{activeCall.peerName}</p>
                          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.12em] text-slate-200">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                              <path d="M4.7 3.29a1 1 0 0 0-1.4 1.42l1.95 1.95A2 2 0 0 0 3 10v4a2 2 0 0 0 2 2h8.17l4.12 4.12a1 1 0 1 0 1.41-1.42L4.7 3.29ZM21.1 8.08a1 1 0 0 1 .9.98v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-.17.82l-1.6-1.6a1.98 1.98 0 0 0 .77-1.58V10a2 2 0 0 0-2-2H9.58l-1.9-1.9c.1-.06.21-.1.32-.1h6a2 2 0 0 1 2 2v.64l3.2-2.56a1 1 0 0 1 1.9.78Z" />
                            </svg>
                            {activeCall.status === 'connected'
                              ? 'Người kia đã tắt camera'
                              : 'Đang kết nối video...'}
                          </div>
                        </div>
                      )}
                      {isCameraEnabled && localStream ? (
                        <video
                          key={localStream.id}
                          ref={localVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="absolute right-4 top-20 z-20 h-28 w-40 scale-x-[-1] rounded-xl border border-white/20 bg-slate-900 object-cover shadow-2xl sm:right-6 sm:top-24 sm:h-36 sm:w-56"
                        />
                      ) : (
                        <div className="absolute right-4 top-20 z-20 flex h-28 w-40 items-center justify-center rounded-xl border border-white/20 bg-slate-900/95 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200 shadow-2xl sm:right-6 sm:top-24 sm:h-36 sm:w-56">
                          Cam off
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_25%,rgba(14,165,233,0.24),transparent_34%),linear-gradient(135deg,#07111f,#111827_48%,#020617)] px-6 text-center text-white">
                      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center gap-2 opacity-30">
                        {[36, 58, 84, 110, 74, 48, 92, 62, 40].map((height, index) => (
                          <span
                            key={index}
                            className="w-2 rounded-full bg-cyan-300/70"
                            style={{ height }}
                          />
                        ))}
                      </div>
                      <div className="relative z-10 w-full max-w-lg rounded-[32px] border border-white/12 bg-white/8 px-8 py-10 shadow-[0_26px_90px_-34px_rgba(8,145,178,0.75)] backdrop-blur-xl">
                      <CallAvatar
                        src={activeCall.peerAvatarUrl}
                        name={activeCall.peerName}
                        className="mx-auto h-32 w-32 rounded-full object-cover ring-4 ring-cyan-300/25"
                        fallbackClassName="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-4xl font-semibold text-white ring-4 ring-cyan-300/25"
                      />
                      <div>
                        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                          Surf Voice Call
                        </p>
                        <p className="mt-3 text-4xl font-semibold">{activeCall.peerName}</p>
                        <p className="mt-2 text-sm text-slate-300">
                          {activeCall.status === 'connected'
                            ? 'Đang trong cuộc gọi thoại'
                            : activeCall.status === 'outgoing'
                              ? 'Đang đổ chuông...'
                              : 'Đang kết nối...'}
                        </p>
                        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                          {isMicEnabled ? 'Mic đang bật' : 'Mic đang tắt'}
                        </div>
                      </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="hidden min-h-0 flex-col overflow-hidden border-white/10 bg-gradient-to-b from-slate-900/92 via-slate-900/88 to-slate-950/92 px-4 py-4 text-white backdrop-blur-sm lg:border-l sm:px-6 sm:py-6">
                  <div className="min-h-0 flex-1 overflow-y-auto pb-4 pr-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                      {activeCall.mode === 'video' ? 'Video call' : 'Audio call'}
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold">{activeCall.peerName}</h3>
                    <p className="mt-2 text-sm text-slate-300">
                      {activeCall.status === 'connected'
                        ? 'Kết nối đã sẵn sàng'
                        : activeCall.status === 'outgoing'
                          ? 'Đợi đối phương chấp nhận cuộc gọi'
                          : 'Đang trao đổi tín hiệu kết nối'}
                    </p>
                    {activeCall.status === 'connected' && (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-300">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                        {formatCallDuration(callDurationSec)}
                      </div>
                    )}
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          void toggleCallFullscreen();
                        }}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800/70 text-xs font-semibold uppercase tracking-[0.1em] text-slate-200 transition hover:bg-slate-700"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                          <path d="M5 5h5a1 1 0 1 0 0-2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 2 0V5ZM19 3h-6a1 1 0 1 0 0 2h5v5a1 1 0 0 0 2 0V4a1 1 0 0 0-1-1ZM5 13a1 1 0 0 0-2 0v6a1 1 0 0 0 1 1h6a1 1 0 1 0 0-2H5v-5ZM20 13a1 1 0 0 0-2 0v5h-5a1 1 0 1 0 0 2h6a1 1 0 0 0 1-1v-6Z" />
                        </svg>
                        {isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                      </button>
                    </div>
                    {callError && <p className="mt-4 text-sm text-red-300">{callError}</p>}

                    {activeCall.mode === 'video' && (
                      <div className="mt-4 rounded-2xl border border-slate-700/80 bg-slate-800/60 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                          Chất lượng video
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void applyVideoProfile('p480');
                            }}
                            className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                              selectedVideoProfile === 'p480'
                                ? 'bg-cyan-500 text-white'
                                : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                            }`}
                          >
                            480p
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void applyVideoProfile('p720');
                            }}
                            className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                              selectedVideoProfile === 'p720'
                                ? 'bg-cyan-500 text-white'
                                : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                            }`}
                          >
                            720p
                          </button>
                        </div>
                        <p className="mt-3 text-xs text-slate-300">
                          FPS mục tiêu: {targetVideoFps}.{' '}
                          {isVideoFpsClamped ? 'Thiết lập cao hơn sẽ tự giới hạn để ổn định.' : ''}
                        </p>
                      </div>
                    )}

                    {useLiveKitProvider && callQuotaState && (
                      <div className="mt-4 rounded-2xl border border-slate-700/80 bg-slate-800/60 p-3">
                        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em]">
                          <span className="text-slate-300">LiveKit quota</span>
                          <span
                            className={
                              callQuotaState.usagePercent !== null &&
                              callQuotaState.usagePercent >= callQuotaState.hardLimitPercent
                                ? 'text-red-300'
                                : callQuotaState.fallbackRecommended
                                  ? 'text-amber-300'
                                  : 'text-cyan-300'
                            }
                          >
                            {callQuotaState.usagePercent !== null
                              ? `${Math.round(callQuotaState.usagePercent)}%`
                              : 'N/A'}
                          </span>
                        </div>
                        {callQuotaState.usagePercent !== null ? (
                          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-700">
                            <div
                              className={`h-full rounded-full ${
                                callQuotaState.usagePercent >= callQuotaState.hardLimitPercent
                                  ? 'bg-red-400'
                                  : callQuotaState.fallbackRecommended
                                    ? 'bg-amber-400'
                                    : 'bg-cyan-400'
                              }`}
                              style={{
                                width: `${Math.min(Math.max(callQuotaState.usagePercent, 0), 100)}%`,
                              }}
                            />
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-slate-300">
                            Server chưa gửi usage hiện tại. Cuộc gọi vẫn tiếp tục bình thường.
                          </p>
                        )}
                        <p className="mt-3 text-xs text-slate-300">
                          {callQuotaState.usagePercent !== null &&
                          callQuotaState.usagePercent >= callQuotaState.hardLimitPercent
                            ? 'Đã qua hard limit. Cuộc gọi mới sẽ chuyển sang fallback.'
                            : callQuotaState.fallbackRecommended
                              ? 'Đang gần ngưỡng. Cuộc gọi mới có thể fallback để giữ ổn định.'
                              : 'Quota đang ổn, ưu tiên dùng LiveKit cho cuộc gọi mới.'}
                        </p>
                        <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                          Nguồn quota:{' '}
                          {callQuotaState.usageSource === 'api'
                            ? 'API tự động'
                            : callQuotaState.usageSource === 'manual'
                              ? 'Biến env thủ công'
                              : 'Chưa có dữ liệu'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 space-y-3 border-t border-white/10 pt-3">
                    <div
                      className="grid grid-cols-2 gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          void toggleMicrophone();
                        }}
                        className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition ${
                          isMicEnabled
                            ? 'border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700'
                            : 'border-amber-300/40 bg-amber-400/20 text-amber-100 hover:bg-amber-400/30'
                        }`}
                      >
                        {isMicEnabled ? (
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                            <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Zm-6-4a1 1 0 0 1 2 0 4 4 0 1 0 8 0 1 1 0 1 1 2 0 6 6 0 0 1-5 5.91V20h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-3.09A6 6 0 0 1 6 11Z" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                            <path d="M16 11V7a4 4 0 0 0-7.08-2.56l1.47 1.47A2 2 0 0 1 14 7v4a1.98 1.98 0 0 1-.19.86l1.58 1.58c.39-.7.61-1.5.61-2.44ZM3.7 2.29a1 1 0 0 0-1.41 1.42l4.08 4.07A7.7 7.7 0 0 0 6 11a6 6 0 0 0 5 5.91V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.09a6.1 6.1 0 0 0 2.57-1.04l4.72 4.72a1 1 0 0 0 1.42-1.42L3.7 2.3ZM8 11a3.9 3.9 0 0 1 .15-1.08l5.92 5.92A4 4 0 0 1 8 11Zm10 0a1 1 0 1 1 2 0 7.95 7.95 0 0 1-1.25 4.32l-1.47-1.47c.46-.84.72-1.8.72-2.85Z" />
                          </svg>
                        )}
                        {isMicEnabled ? 'Tắt mic' : 'Bật mic'}
                      </button>

                      {activeCall.mode === 'video' && (
                        <button
                          type="button"
                          onClick={() => {
                            void toggleCamera();
                          }}
                          className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition ${
                            isCameraEnabled
                              ? 'border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700'
                              : 'border-amber-300/40 bg-amber-400/20 text-amber-100 hover:bg-amber-400/30'
                          }`}
                        >
                          {isCameraEnabled ? (
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                              <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h10Z" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                              <path d="M4.7 3.29a1 1 0 0 0-1.4 1.42l1.95 1.95A2 2 0 0 0 3 10v4a2 2 0 0 0 2 2h8.17l4.12 4.12a1 1 0 1 0 1.41-1.42L4.7 3.29ZM21.1 8.08a1 1 0 0 1 .9.98v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-.17.82l-1.6-1.6a1.98 1.98 0 0 0 .77-1.58V10a2 2 0 0 0-2-2H9.58l-1.9-1.9c.1-.06.21-.1.32-.1h6a2 2 0 0 1 2 2v.64l3.2-2.56a1 1 0 0 1 1.9.78Z" />
                            </svg>
                          )}
                          {isCameraEnabled ? 'Tắt cam' : 'Bật cam'}
                        </button>
                      )}
                      {activeCall.mode === 'audio' && (
                        <button
                          type="button"
                          onClick={() => {
                            void upgradeVoiceToVideo();
                          }}
                          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-cyan-300/40 bg-cyan-500/20 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/30"
                        >
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                            <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h10Z" />
                          </svg>
                          Video
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        finishCall(true);
                        closeCurrentCallWindow();
                      }}
                      className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-red-500 text-base font-semibold text-white shadow-lg shadow-red-500/30"
                    >
                      Kết thúc cuộc gọi
                    </button>
                  </div>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 z-30 flex h-24 items-center justify-center gap-4 border-t border-white/10 bg-black/85 px-4 text-white shadow-2xl shadow-black/50 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => {
                    void toggleMicrophone();
                  }}
                  className={`order-3 inline-flex h-14 w-16 items-center justify-center rounded-full border transition ${
                    isMicEnabled
                      ? 'border-white/15 bg-white/12 text-white hover:bg-white/18'
                      : 'border-red-300/30 bg-red-500/25 text-red-100 hover:bg-red-500/35'
                  }`}
                  title={isMicEnabled ? 'Tắt mic' : 'Bật mic'}
                  aria-label={isMicEnabled ? 'Tắt mic' : 'Bật mic'}
                >
                  {isMicEnabled ? (
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                      <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Zm-6-4a1 1 0 0 1 2 0 4 4 0 1 0 8 0 1 1 0 1 1 2 0 6 6 0 0 1-5 5.91V20h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-3.09A6 6 0 0 1 6 11Z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                      <path d="M16 11V7a4 4 0 0 0-7.08-2.56l1.47 1.47A2 2 0 0 1 14 7v4a1.98 1.98 0 0 1-.19.86l1.58 1.58c.39-.7.61-1.5.61-2.44ZM3.7 2.29a1 1 0 0 0-1.41 1.42l18 18a1 1 0 0 0 1.41-1.42l-18-18ZM6 11a7.7 7.7 0 0 1 .37-3.22l1.78 1.78A3.9 3.9 0 0 0 8 11a4 4 0 0 0 6.07 3.42l1.44 1.44A6 6 0 0 1 13 16.91V20h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-3.09A6 6 0 0 1 6 11Z" />
                    </svg>
                  )}
                </button>
                {activeCall.mode === 'video' && (
                  <button
                    type="button"
                    onClick={() => {
                      void toggleCamera();
                    }}
                    className={`order-1 inline-flex h-14 w-16 items-center justify-center rounded-full border transition ${
                      isCameraEnabled
                        ? 'border-white/15 bg-white/12 text-white hover:bg-white/18'
                        : 'border-red-300/30 bg-red-500/25 text-red-100 hover:bg-red-500/35'
                    }`}
                    title={isCameraEnabled ? 'Tắt cam' : 'Bật cam'}
                    aria-label={isCameraEnabled ? 'Tắt cam' : 'Bật cam'}
                  >
                    {isCameraEnabled ? (
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                        <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h10Z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                        <path d="M4.7 3.29a1 1 0 0 0-1.4 1.42l1.95 1.95A2 2 0 0 0 3 10v4a2 2 0 0 0 2 2h8.17l4.12 4.12a1 1 0 1 0 1.41-1.42L4.7 3.29ZM21.1 8.08a1 1 0 0 1 .9.98v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-.17.82l-1.6-1.6a1.98 1.98 0 0 0 .77-1.58V10a2 2 0 0 0-2-2H9.58l-1.9-1.9c.1-.06.21-.1.32-.1h6a2 2 0 0 1 2 2v.64l3.2-2.56a1 1 0 0 1 1.9.78Z" />
                      </svg>
                    )}
                  </button>
                )}
                {activeCall.mode === 'audio' && (
                  <button
                    type="button"
                    onClick={() => {
                      void upgradeVoiceToVideo();
                    }}
                    className="order-1 inline-flex h-14 w-16 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-500/25 text-cyan-100 transition hover:bg-cyan-500/35"
                    title="Chuyá»ƒn sang video"
                    aria-label="Chuyá»ƒn sang video"
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                      <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h10Z" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    finishCall(true);
                    closeCurrentCallWindow();
                  }}
                  className="order-2 inline-flex h-16 min-w-28 items-center justify-center rounded-full bg-red-500 px-6 text-sm font-semibold text-white shadow-lg shadow-red-500/35 transition hover:bg-red-400"
                  title="Kết thúc cuộc gọi"
                  aria-label="Kết thúc cuộc gọi"
                >
                  Kết thúc
                </button>
              </div>
              <audio ref={remoteAudioRef} autoPlay />
            </div>
            )
          ) : fallbackSession ? (
            <div className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-[32px] bg-slate-900 p-6 text-white shadow-2xl sm:p-8">
              <div className="inline-flex rounded-full border border-amber-300/40 bg-amber-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                Fallback đang hoạt động
              </div>
              <h3 className="mt-4 text-2xl font-semibold">{fallbackSession.peerName}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{fallbackSession.reason}</p>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={reopenFallbackRoom}
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cyan-500 text-sm font-semibold text-white shadow-lg shadow-cyan-500/30"
                >
                  Mở phòng dự phòng
                </button>
                <button
                  type="button"
                  onClick={() => finishCall(false)}
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-slate-600 bg-slate-800 text-sm font-semibold text-slate-200"
                >
                  Đóng
                </button>
              </div>

              <p className="mt-4 text-xs text-slate-400">{fallbackSession.fallbackUrl}</p>
            </div>
          ) : null}
        </div>
      )}
    </GlobalCallContext.Provider>
  );
}

export function useGlobalCall() {
  const context = useContext(GlobalCallContext);
  if (!context) {
    throw new Error('useGlobalCall must be used within GlobalCallProvider');
  }
  return context;
}
