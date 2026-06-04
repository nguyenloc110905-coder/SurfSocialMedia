import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSocket } from '@/lib/socket';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useWebRTC } from '@/hooks/useWebRTC';
import RTCVideo from '@/components/RTCVideo';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

export default function CallScreen({ route, navigation }: Props) {
  const {
    conversationId,
    peerUid,
    isHost: isHostParam,
    callId: initialCallId,
    peerName,
    peerAvatar,
    mode: initialMode,
    acceptOnReady,
  } = route.params;

  const isHost = isHostParam ?? false;

  const user = useAuthStore((state) => state.user);
  const socket = getSocket();

  const [callState, setCallState] = useState<'ringing' | 'connected' | 'ended'>(
    isHost ? 'ringing' : 'connected'
  );
  const [callId] = useState(initialCallId || `call_${Date.now()}`);
  const [duration, setDuration] = useState(0);
  const [callMode, setCallMode] = useState<'audio' | 'video'>(initialMode ?? 'audio');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acceptSentRef = useRef(false);

  const handleRtcReady = useCallback(() => {
    if (isHost || !acceptOnReady || acceptSentRef.current || !user?.uid) return;
    acceptSentRef.current = true;
    socket.emit('call:accept', {
      callId,
      conversationId,
      fromUserId: user.uid,
      toUserId: peerUid,
      mode: callMode,
    });
  }, [acceptOnReady, callId, callMode, conversationId, isHost, peerUid, socket, user?.uid]);

  // ── WebRTC ────────────────────────────────────────────────────────────────
  const {
    localStream,
    remoteStream,
    hasRemoteVideo,
    callMode: rtcCallMode,
    isMicMuted,
    isCameraOff,
    isFrontCamera,
    connectionState,
    toggleMic,
    toggleCamera,
    switchCamera,
    upgradeToVideo,
    endCall: endWebRTC,
    createAndSendOffer,
  } = useWebRTC({
    callId,
    conversationId,
    peerUid,
    isHost,
    mode: callMode,
    onReady: handleRtcReady,
    onModeChange: setCallMode,
  });

  // ── Timer ─────────────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setDuration((prev) => prev + 1), 1000);
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Socket events ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Host emits invite when screen mounts
    if (isHost) {
      socket.emit('call:invite', {
        callId,
        conversationId,
        fromUserId: user?.uid,
        toUserId: peerUid,
        fromName: user?.displayName ?? user?.email ?? 'Surf user',
        fromAvatarUrl: user?.photoURL ?? null,
        mode: callMode,
      });
    }

    const onAccepted = (payload: { callId: string }) => {
      if (payload.callId !== callId) return;
      setCallState('connected');
      startTimer();
      // Only the host (caller) creates & sends SDP offer
      if (isHost) createAndSendOffer();
    };

    const onDeclined = (payload: { callId: string }) => {
      if (payload.callId !== callId) return;
      setCallState('ended');
      setTimeout(() => navigation.goBack(), 1500);
    };

    const onEnded = (payload: { callId: string }) => {
      if (payload.callId !== callId) return;
      setCallState('ended');
      setTimeout(() => navigation.goBack(), 1500);
    };

    socket.on('call:accepted', onAccepted);
    socket.on('call:declined', onDeclined);
    socket.on('call:ended', onEnded);

    return () => {
      socket.off('call:accepted', onAccepted);
      socket.off('call:declined', onDeclined);
      socket.off('call:ended', onEnded);
      if (timerRef.current) clearInterval(timerRef.current);
      endWebRTC();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, conversationId, isHost, peerUid]);

  // Callee: start timer immediately (call was already accepted before navigating here)
  useEffect(() => {
    if (!isHost && callState === 'connected') {
      startTimer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── End call ──────────────────────────────────────────────────────────────
  const handleEnd = () => {
    socket.emit('call:end', {
      callId,
      conversationId,
      fromUserId: user?.uid,
      toUserId: peerUid,
      reason: 'ended',
    });
    setCallState('ended');
    endWebRTC();
    setTimeout(() => navigation.goBack(), 1500);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Remote video (full screen background) */}
      {rtcCallMode === 'video' && remoteStream && hasRemoteVideo && (
        <RTCVideo
          streamURL={remoteStream.toURL()}
          style={styles.remoteVideo}
          objectFit="cover"
        />
      )}

      {/* Local video (picture-in-picture, top right) */}
      {rtcCallMode === 'video' && localStream && !isCameraOff && (
        <View style={styles.localVideoContainer}>
          <RTCVideo
            streamURL={localStream.toURL()}
            style={styles.localVideo}
            objectFit="cover"
            zOrder={1}
            mirror={isFrontCamera}
          />
        </View>
      )}

      {/* Overlay UI */}
      <View style={styles.overlay}>
        {/* Status bar */}
        <View style={styles.header}>
          <Text style={styles.peerNameText}>{peerName ?? 'Người dùng'}</Text>
          <Text style={styles.statusText}>
            {callState === 'ringing'
              ? isHost
                ? 'Đang gọi…'
                : 'Đang kết nối…'
              : callState === 'connected'
              ? formatTime(duration)
              : 'Đã kết thúc'}
          </Text>
          {callState === 'connected' &&
            connectionState !== 'connected' &&
            connectionState !== 'completed' && (
              <Text style={styles.p2pStatus}>
                Thiết lập kết nối P2P ({connectionState})…
              </Text>
            )}
        </View>

        {/* Avatar (shown when no remote video) */}
        {(!hasRemoteVideo || rtcCallMode === 'audio') && (
          <View style={styles.center}>
            {peerAvatar ? (
              <Image source={{ uri: peerAvatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarText}>
                  {(peerName ?? peerUid ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Controls */}
        <View style={styles.footer}>
          {callState !== 'ended' && (
            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={[styles.controlBtn, isMicMuted && styles.controlBtnActive]}
                onPress={toggleMic}
              >
                <Ionicons name={isMicMuted ? 'mic-off' : 'mic'} size={26} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnEnd} onPress={handleEnd}>
                <Ionicons
                  name="call"
                  size={30}
                  color="#fff"
                  style={{ transform: [{ rotate: '135deg' }] }}
                />
              </TouchableOpacity>

              {rtcCallMode === 'audio' && (
                <TouchableOpacity style={styles.controlBtnVideo} onPress={upgradeToVideo}>
                  <Ionicons name="videocam" size={26} color="#fff" />
                </TouchableOpacity>
              )}

              {rtcCallMode === 'video' && (
                <>
                  <TouchableOpacity
                    style={[styles.controlBtn, isCameraOff && styles.controlBtnActive]}
                    onPress={toggleCamera}
                  >
                    <Ionicons
                      name={isCameraOff ? 'videocam-off' : 'videocam'}
                      size={26}
                      color="#fff"
                    />
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.controlBtn} onPress={switchCamera}>
                    <Ionicons name="camera-reverse" size={26} color="#fff" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },

  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
  },

  localVideoContainer: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 110,
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    elevation: 8,
    zIndex: 10,
  },
  localVideo: {
    flex: 1,
  },

  header: { alignItems: 'center', paddingTop: 8 },
  peerNameText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  statusText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    fontWeight: '500',
    marginTop: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: 'hidden',
  },
  p2pStatus: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 6,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 120, height: 120, borderRadius: 60 },
  avatarPlaceholder: {
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 48, fontWeight: 'bold' },

  footer: { alignItems: 'center' },
  controlsRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 50,
  },
  controlBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(51,65,85,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnActive: { backgroundColor: 'rgba(203,213,225,0.85)' },
  controlBtnVideo: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnEnd: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
