import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
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

type GlobalCallContextValue = {
  startCall: (input: StartCallInput) => void;
  activeCall: ActiveCall | null;
  incomingCall: IncomingCall | null;
  isBusy: boolean;
};

type CallToast = {
  id: string;
  title: string;
  description: string;
};

const GlobalCallContext = createContext<GlobalCallContextValue | null>(null);

const initials = (value?: string | null) =>
  value?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'S';

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

  return <img src={src} alt={name ?? 'Call avatar'} className={className} onError={() => setFailed(true)} />;
}

export function GlobalCallProvider({ children }: PropsWithChildren) {
  const user = useAuthStore((state) => state.user);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [callToast, setCallToast] = useState<CallToast | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [acceptingCall, setAcceptingCall] = useState(false);

  const activeCallRef = useRef<ActiveCall | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callToastTimeoutRef = useRef<number | null>(null);
  const ringtoneContextRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<number | null>(null);
  const outgoingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

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

    const scheduleTone = (offset: number, frequency: number, duration: number) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + offset;
      const endAt = startAt + duration;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(startAt);
      oscillator.stop(endAt);
    };

    scheduleTone(0, 880, 0.26);
    scheduleTone(0.36, 740, 0.28);
  };

  const startRingtone = () => {
    if (ringtoneIntervalRef.current) return;

    void playRingtoneBurst();
    ringtoneIntervalRef.current = window.setInterval(() => {
      void playRingtoneBurst();
    }, 2200);
  };

  const resetCallMedia = () => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingIceCandidatesRef.current = [];

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    setRemoteStream(null);
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
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
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

      event.streams[0]?.getTracks().forEach((track) => {
        const exists = target.getTracks().some((current) => current.id === track.id);
        if (!exists) target.addTrack(track);
      });
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
      video: mode === 'video',
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  const emitEndCall = (call: ActiveCall, reason?: string) => {
    if (!user?.uid) return;
    getSocket().emit('call:end', {
      callId: call.callId,
      conversationId: call.conversationId,
      fromUserId: user.uid,
      toUserId: call.peerId,
      reason,
    });
  };

  const finishCall = (notifyPeer: boolean, reason?: string) => {
    const current = activeCallRef.current;
    if (notifyPeer && current) emitEndCall(current, reason);
    clearOutgoingTimeout();
    stopRingtone();
    resetCallMedia();
    setActiveCall(null);
    setIncomingCall(null);
    setAcceptingCall(false);
  };

  const handleIncomingSignal = async (payload: CallSignalPayload) => {
    const current = activeCallRef.current;
    const peer = peerConnectionRef.current;
    if (!current || current.callId !== payload.callId || !peer) return;

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
        mode: current.mode,
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
    if (!user?.uid || activeCallRef.current || incomingCall) return;

    const callId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setCallError(null);
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

  const acceptIncomingCall = async () => {
    if (!incomingCall || !user?.uid || activeCallRef.current) return;

    try {
      stopRingtone();
      setAcceptingCall(true);
      setCallError(null);

      const nextCall: ActiveCall = {
        callId: incomingCall.callId,
        conversationId: incomingCall.conversationId,
        peerId: incomingCall.fromUserId,
        peerName: incomingCall.fromName,
        peerAvatarUrl: incomingCall.fromAvatarUrl,
        mode: incomingCall.mode,
        isOutgoing: false,
        status: 'connecting',
      };

      const stream = await requestLocalStream(incomingCall.mode);
      const peer = createPeerConnection(nextCall);
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      setActiveCall(nextCall);
      getSocket().emit('call:accept', {
        callId: incomingCall.callId,
        conversationId: incomingCall.conversationId,
        fromUserId: user.uid,
        toUserId: incomingCall.fromUserId,
        mode: incomingCall.mode,
      });
      setIncomingCall(null);
    } catch (e) {
      setCallError((e as Error).message || 'Không thể truy cập microphone/camera');
      getSocket().emit('call:decline', {
        callId: incomingCall.callId,
        conversationId: incomingCall.conversationId,
        fromUserId: user.uid,
        toUserId: incomingCall.fromUserId,
        reason: 'media_error',
      });
      finishCall(false);
    }
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

  useEffect(() => {
    if (incomingCall && !activeCall) {
      startRingtone();
      return;
    }

    stopRingtone();
  }, [incomingCall, activeCall]);

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
    const socket = getSocket();

    const onIncomingCall = (payload: CallInvitePayload) => {
      if (payload.fromUserId === user?.uid) return;
      if (activeCallRef.current) {
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

    const onCallAccepted = async (payload: CallAcceptedPayload) => {
      const current = activeCallRef.current;
      if (!current || current.callId !== payload.callId || !current.isOutgoing || !user?.uid) return;

      try {
        clearOutgoingTimeout();
        setCallError(null);
        const stream = await requestLocalStream(current.mode);
        const peer = createPeerConnection({ ...current, status: 'connecting' });
        stream.getTracks().forEach((track) => peer.addTrack(track, stream));

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        setActiveCall((call) =>
          call && call.callId === payload.callId ? { ...call, status: 'connecting' } : call
        );

        socket.emit('call:signal', {
          callId: current.callId,
          conversationId: current.conversationId,
          fromUserId: user.uid,
          toUserId: current.peerId,
          mode: current.mode,
          signal: {
            type: 'offer',
            sdp: {
              type: offer.type,
              sdp: offer.sdp ?? undefined,
            },
          },
        });
      } catch (e) {
        setCallError((e as Error).message || 'Không thể bắt đầu cuộc gọi');
        finishCall(true);
      }
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
        const description =
          payload.reason === 'missed'
            ? `${currentIncoming.fromName} đã kết thúc sau khi bạn chưa kịp bắt máy.`
            : `${currentIncoming.fromName} đã kết thúc cuộc gọi.`;
        pushToast('Cuộc gọi nhỡ', description);
      } else if (currentActive?.callId === payload.callId && currentActive.isOutgoing && currentActive.status !== 'connected') {
        pushToast('Cuộc gọi kết thúc', `Cuộc gọi tới ${currentActive.peerName} đã kết thúc.`);
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

    socket.on('call:incoming', onIncomingCall);
    socket.on('call:accepted', onCallAccepted);
    socket.on('call:declined', onCallDeclined);
    socket.on('call:ended', onCallEnded);
    socket.on('call:signal', onCallSignal);

    return () => {
      socket.off('call:incoming', onIncomingCall);
      socket.off('call:accepted', onCallAccepted);
      socket.off('call:declined', onCallDeclined);
      socket.off('call:ended', onCallEnded);
      socket.off('call:signal', onCallSignal);
    };
  }, [incomingCall?.callId, user?.uid]);

  useEffect(() => {
    return () => {
      stopRingtone();
      clearOutgoingTimeout();
      if (callToastTimeoutRef.current) {
        window.clearTimeout(callToastTimeoutRef.current);
      }
      finishCall(false);
    };
  }, []);

  return (
    <GlobalCallContext.Provider
      value={{
        startCall,
        activeCall,
        incomingCall,
        isBusy: Boolean(activeCall || incomingCall),
      }}
    >
      {children}
      {callToast && (
        <div className="pointer-events-none fixed right-6 top-6 z-[119] max-w-sm rounded-[28px] border border-cyan-100 bg-white/95 px-5 py-4 shadow-[0_26px_60px_-28px_rgba(8,145,178,0.45)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-600">Surf Call</p>
          <h4 className="mt-2 text-lg font-semibold text-slate-900">{callToast.title}</h4>
          <p className="mt-1 text-sm leading-6 text-slate-500">{callToast.description}</p>
        </div>
      )}
      {(incomingCall || activeCall) && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-6 backdrop-blur-sm">
          {incomingCall && !activeCall ? (
            <div className="w-full max-w-md rounded-[32px] bg-white p-8 text-center shadow-2xl">
              <CallAvatar
                src={incomingCall.fromAvatarUrl}
                name={incomingCall.fromName}
                className="mx-auto h-24 w-24 rounded-full object-cover"
                fallbackClassName="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-2xl font-semibold text-white"
              />
              <p className="mt-5 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-600">
                {incomingCall.mode === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}
              </p>
              <h3 className="mt-3 text-3xl font-semibold text-slate-900">{incomingCall.fromName}</h3>
              <p className="mt-2 text-sm text-slate-500">Đang gọi cho bạn qua Surf Waves</p>
              {callError && <p className="mt-3 text-sm text-red-500">{callError}</p>}
              <div className="mt-8 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={declineIncomingCall}
                  className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30"
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
                  onClick={() => {
                    void acceptIncomingCall();
                  }}
                  disabled={acceptingCall}
                  className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 disabled:opacity-50"
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
                </button>
              </div>
            </div>
          ) : activeCall ? (
            <div className="w-full max-w-5xl overflow-hidden rounded-[36px] bg-slate-950 shadow-2xl shadow-slate-950/40">
              <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-[1fr_240px]">
                <div className="relative flex min-h-[520px] items-center justify-center bg-slate-950">
                  {activeCall.mode === 'video' ? (
                    <>
                      <video ref={remoteVideoRef} autoPlay playsInline className="h-full min-h-[520px] w-full object-cover" />
                      {!remoteStream && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950 text-white">
                          <CallAvatar
                            src={activeCall.peerAvatarUrl}
                            name={activeCall.peerName}
                            className="h-28 w-28 rounded-full object-cover"
                            fallbackClassName="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-3xl font-semibold text-white"
                          />
                          <p className="text-lg font-semibold">{activeCall.peerName}</p>
                          <p className="text-sm text-slate-300">
                            {activeCall.status === 'outgoing' ? 'Đang đổ chuông...' : 'Đang kết nối video...'}
                          </p>
                        </div>
                      )}
                      <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="absolute bottom-5 right-5 h-36 w-28 rounded-[24px] border border-white/10 bg-slate-900 object-cover shadow-xl"
                      />
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-5 px-8 text-center text-white">
                      <CallAvatar
                        src={activeCall.peerAvatarUrl}
                        name={activeCall.peerName}
                        className="h-28 w-28 rounded-full object-cover"
                        fallbackClassName="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-surf-primary to-cyan-500 text-3xl font-semibold text-white"
                      />
                      <div>
                        <p className="text-3xl font-semibold">{activeCall.peerName}</p>
                        <p className="mt-2 text-sm text-slate-300">
                          {activeCall.status === 'connected'
                            ? 'Đang trong cuộc gọi thoại'
                            : activeCall.status === 'outgoing'
                              ? 'Đang đổ chuông...'
                              : 'Đang kết nối...'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-between bg-slate-900 px-6 py-6 text-white">
                  <div>
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
                    {callError && <p className="mt-4 text-sm text-red-300">{callError}</p>}
                  </div>
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={() => finishCall(true)}
                      className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-red-500 text-base font-semibold text-white shadow-lg shadow-red-500/30"
                    >
                      Kết thúc cuộc gọi
                    </button>
                  </div>
                </div>
              </div>
              <audio ref={remoteAudioRef} autoPlay />
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
