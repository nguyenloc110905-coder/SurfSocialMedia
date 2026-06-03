import { useEffect, useRef, useState, useCallback } from 'react';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  mediaDevices,
} from 'react-native-webrtc';
import RTCIceCandidateEvent from 'react-native-webrtc/lib/typescript/RTCIceCandidateEvent';
import RTCTrackEvent from 'react-native-webrtc/lib/typescript/RTCTrackEvent';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';

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
}: {
  callId: string;
  conversationId: string;
  peerUid: string;
  isHost: boolean;
  mode: 'audio' | 'video';
  onReady?: () => void;
}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(mode === 'audio');
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [connectionState, setConnectionState] = useState<string>('new');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingSignalsRef = useRef<QueuedSignal[]>([]);
  const pendingIceCandidatesRef = useRef<any[]>([]);
  const isReadyRef = useRef(false);
  const shouldSendOfferRef = useRef(false);

  const socket = getSocket();
  const user = useAuthStore((state) => state.user);

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

  const toggleCamera = useCallback(() => {
    if (mode !== 'video') return;
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsCameraOff(!track.enabled);
    }
  }, [mode]);

  const switchCamera = useCallback(() => {
    if (mode !== 'video') return;
    const track = localStreamRef.current?.getVideoTracks()[0] as any;
    if (track?._switchCamera) {
      track._switchCamera();
      setIsFrontCamera((prev) => !prev);
    }
  }, [mode]);

  const endCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
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
        mode,
        signal,
      });
    },
    [callId, conversationId, peerUid, mode, socket, user?.uid]
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
    async (signal: any) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
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
    [emitSignal, flushPendingIceCandidates]
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
      await processSignal(payload.signal);
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
        if (event.streams?.[0]) setRemoteStream(event.streams[0] as MediaStream);
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
      onReady?.();

      if (shouldSendOfferRef.current) {
        shouldSendOfferRef.current = false;
        await createAndSendOfferInternal();
      }

      for (const queued of pendingSignalsRef.current) {
        await processSignal(queued.signal);
      }
      pendingSignalsRef.current = [];
    };

    setupWebrtc();

    return () => {
      socket.off('call:signal', handleSignal);
      endCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, conversationId, peerUid, mode, onReady]);

  // ── Public: called by caller when peer accepts ────────────────────────────────

  const createAndSendOffer = useCallback(() => {
    if (!isReadyRef.current) {
      shouldSendOfferRef.current = true;
      return;
    }
    void createAndSendOfferInternal();
  }, [createAndSendOfferInternal]);

  return {
    localStream,
    remoteStream,
    isMicMuted,
    isCameraOff,
    isFrontCamera,
    connectionState,
    toggleMic,
    toggleCamera,
    switchCamera,
    endCall,
    createAndSendOffer,
  };
}
