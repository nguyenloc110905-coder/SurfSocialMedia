import { useEffect, useRef, useState, useCallback } from 'react';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  mediaDevices,
} from 'react-native-webrtc';
import WebRTCLogger from 'react-native-webrtc/lib/module/Logger';
import RTCIceCandidateEvent from 'react-native-webrtc/lib/typescript/RTCIceCandidateEvent';
import RTCTrackEvent from 'react-native-webrtc/lib/typescript/RTCTrackEvent';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';

WebRTCLogger.enable('rn-webrtc:*:WARN,rn-webrtc:*:ERROR');

// ── ICE servers ────────────────────────────────────────────────────────────────
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

type QueuedSignal = {
  callId: string;
  fromUserId: string;
  mode?: 'audio' | 'video';
  signal: any;
};

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useWebRTC({
  callId,
  conversationId,
  peerUid,
  isHost,
  mode,
  onReady,
  onModeChange,
}: {
  callId: string;
  conversationId: string;
  peerUid: string;
  isHost: boolean;
  mode: 'audio' | 'video';
  onReady?: () => void;
  onModeChange?: (mode: 'audio' | 'video') => void;
}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(mode === 'audio');
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [connectionState, setConnectionState] = useState<string>('new');
  const [currentMode, setCurrentModeState] = useState<'audio' | 'video'>(mode);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingSignalsRef = useRef<QueuedSignal[]>([]);
  const pendingIceCandidatesRef = useRef<any[]>([]);
  const isReadyRef = useRef(false);
  const shouldSendOfferRef = useRef(false);
  const modeRef = useRef<'audio' | 'video'>(mode);
  const onReadyRef = useRef(onReady);

  const socket = getSocket();
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const setCurrentMode = useCallback(
    (nextMode: 'audio' | 'video') => {
      modeRef.current = nextMode;
      setCurrentModeState(nextMode);
      onModeChange?.(nextMode);
    },
    [onModeChange]
  );

  // ── Camera / Mic init ────────────────────────────────────────────────────────

  const initLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video:
          mode === 'video'
            ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
            : false,
      });
      if (stream) {
        const ms = stream as MediaStream;
        localStreamRef.current = ms;
        setLocalStream(ms);
        return ms;
      }
    } catch (e) {
      console.error('[WebRTC] Failed to get local stream:', e);
    }
    return null;
  }, [mode]);

  // ── Controls ─────────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMicMuted(!track.enabled);
    }
  }, []);

  const ensureLocalVideoTrack = useCallback(async () => {
    const currentStream = localStreamRef.current;
    const currentTrack = currentStream?.getVideoTracks()[0];

    if (currentTrack) {
      currentTrack.enabled = true;
      setIsCameraOff(false);
      setCurrentMode('video');
      return currentTrack;
    }

    const cameraStream = await mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    const videoTrack = (cameraStream as MediaStream).getVideoTracks()[0];
    if (!videoTrack) return null;

    const baseStream = currentStream ?? new MediaStream();
    baseStream.addTrack(videoTrack);
    localStreamRef.current = baseStream;
    setLocalStream(new MediaStream(baseStream.getTracks()));

    const pc = pcRef.current;
    if (pc) {
      const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(videoTrack);
      } else {
        pc.addTrack(videoTrack, baseStream);
      }
    }

    setIsFrontCamera(true);
    setIsCameraOff(false);
    setCurrentMode('video');
    return videoTrack;
  }, [setCurrentMode]);

  const toggleCamera = useCallback(() => {
    if (modeRef.current !== 'video') return;
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsCameraOff(!track.enabled);
      return;
    }
    void ensureLocalVideoTrack();
  }, [ensureLocalVideoTrack]);

  const switchCamera = useCallback(() => {
    if (modeRef.current !== 'video') return;
    const track = localStreamRef.current?.getVideoTracks()[0] as any;
    if (track?._switchCamera) {
      track._switchCamera();
      setIsFrontCamera((prev) => !prev);
    }
  }, []);

  const endCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setHasRemoteVideo(false);
    pcRef.current?.close();
    pcRef.current = null;
    isReadyRef.current = false;
    pendingSignalsRef.current = [];
    pendingIceCandidatesRef.current = [];
    shouldSendOfferRef.current = false;
  }, []);

  // ── Signal helpers ────────────────────────────────────────────────────────────

  const emitSignal = useCallback(
    (signal: any) => {
      socket.emit('call:signal', {
        callId,
        conversationId,
        fromUserId: user?.uid,
        toUserId: peerUid,
        mode: modeRef.current,
        signal,
      });
    },
    [callId, conversationId, peerUid, socket, user?.uid]
  );

  const createAndSendOfferInternal = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      emitSignal({ type: 'offer', sdp: pc.localDescription });
    } catch (e) {
      console.error('[WebRTC] Error creating offer:', e);
    }
  }, [emitSignal]);

  const flushPendingIceCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !(pc as any).remoteDescription) return;

    while (pendingIceCandidatesRef.current.length > 0) {
      const candidate = pendingIceCandidatesRef.current.shift();
      if (!candidate) continue;
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const processSignal = useCallback(
    async (signal: any, signalMode?: 'audio' | 'video') => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        if (signalMode === 'video' && modeRef.current !== 'video') {
          await ensureLocalVideoTrack();
        }

        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await flushPendingIceCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          emitSignal({ type: 'answer', sdp: pc.localDescription });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await flushPendingIceCandidates();
        } else if (signal.type === 'ice') {
          if (!(pc as any).remoteDescription) {
            pendingIceCandidatesRef.current.push(signal.candidate);
            return;
          }
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (e) {
        console.error('[WebRTC] Error processing signal:', e);
      }
    },
    [emitSignal, ensureLocalVideoTrack, flushPendingIceCandidates]
  );

  // ── Main effect ───────────────────────────────────────────────────────────────

  useEffect(() => {
    isReadyRef.current = false;
    pendingSignalsRef.current = [];
    pendingIceCandidatesRef.current = [];
    shouldSendOfferRef.current = false;

    // Register signal listener before async setup so we don't miss early signals
    const handleSignal = async (payload: QueuedSignal) => {
      if (payload.callId !== callId || payload.fromUserId !== peerUid) return;
      if (!isReadyRef.current) {
        pendingSignalsRef.current.push(payload);
        return;
      }
      await processSignal(payload.signal, payload.mode);
    };
    socket.on('call:signal', handleSignal);

    const setupWebrtc = async () => {
      const stream = await initLocalStream();
      const pc = new RTCPeerConnection(configuration);
      pcRef.current = pc;

      // Add local tracks
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      // Remote stream handler
      (pc as any).addEventListener('track', (event: RTCTrackEvent<'track'>) => {
        if (event.streams?.[0]) {
          const stream = event.streams[0] as MediaStream;
          setRemoteStream(stream);
          setHasRemoteVideo(stream.getVideoTracks().some((track) => track.readyState === 'live'));
        }
        if ((event as any).track?.kind === 'video') {
          setHasRemoteVideo(true);
          setCurrentMode('video');
        }
      });

      // ICE candidate handler
      (pc as any).addEventListener('icecandidate', (event: RTCIceCandidateEvent<'icecandidate'>) => {
        if (event.candidate) {
          emitSignal({
            type: 'ice',
            candidate: (event.candidate as any).toJSON(),
          });
        }
      });

      // Connection state handler
      (pc as any).addEventListener('iceconnectionstatechange', () => {
        setConnectionState(pc.iceConnectionState);
      });

      // Mark ready, flush queue
      isReadyRef.current = true;
      onReadyRef.current?.();

      if (shouldSendOfferRef.current) {
        shouldSendOfferRef.current = false;
        await createAndSendOfferInternal();
      }

      for (const queued of pendingSignalsRef.current) {
        await processSignal(queued.signal, queued.mode);
      }
      pendingSignalsRef.current = [];
    };

    setupWebrtc();

    return () => {
      socket.off('call:signal', handleSignal);
      endCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, conversationId, peerUid]);

  // ── Public: called by caller when peer accepts ────────────────────────────────

  const createAndSendOffer = useCallback(() => {
    if (!isReadyRef.current) {
      shouldSendOfferRef.current = true;
      return;
    }
    void createAndSendOfferInternal();
  }, [createAndSendOfferInternal]);

  const upgradeToVideo = useCallback(async () => {
    try {
      await ensureLocalVideoTrack();
      await createAndSendOfferInternal();
    } catch (e) {
      console.error('[WebRTC] Error upgrading to video:', e);
    }
  }, [createAndSendOfferInternal, ensureLocalVideoTrack]);

  return {
    localStream,
    remoteStream,
    hasRemoteVideo,
    callMode: currentMode,
    isMicMuted,
    isCameraOff,
    isFrontCamera,
    connectionState,
    toggleMic,
    toggleCamera,
    switchCamera,
    endCall,
    createAndSendOffer,
    upgradeToVideo,
  };
}
