import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  NativeModules,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import {
  dismissCallSystemNotification,
  showOngoingCallSystemNotification,
} from '@/lib/systemNotifications';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Call'>;
  route: RouteProp<RootStackParamList, 'Call'>;
};

type CallMode = 'audio' | 'video';
type CallPhase = 'incoming' | 'outgoing' | 'connecting' | 'connected' | 'ended';

type TokenResponse = {
  provider: 'livekit' | 'fallback';
  serverUrl?: string;
  token?: string;
  roomName: string;
  reason?: string;
};

const CALL_TIMEOUT_MS = 45_000;
const CALL_NOTIFICATION_REFRESH_MS = 15_000;
const LIVEKIT_CAMERA_SOURCE = 'camera';
const LIVEKIT_CONNECTED_STATE = 'connected';

const makeCallId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type LiveKitNativeModule = {
  AudioSession: { startAudioSession: () => Promise<void>; stopAudioSession: () => Promise<void> };
  LiveKitRoom: React.ComponentType<any>;
  VideoTrack: React.ComponentType<any>;
  isTrackReference: (value: unknown) => boolean;
  registerGlobals: () => void;
  useLocalParticipant: () => { localParticipant: any };
  useRoomContext: () => any;
  useTracks: (sources: unknown[]) => unknown[];
};

let liveKitNative: LiveKitNativeModule | null | undefined;

function ensureLiveKitGlobals() {
  const globalScope = globalThis as any;
  if (!globalScope.DOMException) {
    globalScope.DOMException = class DOMException extends Error {
      constructor(message?: string, name = 'DOMException') {
        super(message);
        this.name = name;
      }
    };
  }
}

function getLiveKitNative(): LiveKitNativeModule | null {
  if (liveKitNative !== undefined) return liveKitNative;

  try {
    if (!NativeModules.WebRTCModule) {
      liveKitNative = null;
      return liveKitNative;
    }

    // Keep this require lazy. Existing dev builds do not contain LiveKit's native media module.
    // A rebuilt development APK will load this path and enable native LiveKit calls.
    ensureLiveKitGlobals();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    liveKitNative = require('@livekit/react-native') as LiveKitNativeModule;
    liveKitNative.registerGlobals();
  } catch {
    liveKitNative = null;
  }

  return liveKitNative;
}

function initials(name: string) {
  return (name.trim() || '?').charAt(0).toUpperCase();
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getUserName(user: ReturnType<typeof useAuthStore.getState>['user']) {
  return user?.displayName || user?.email?.split('@')[0] || 'Surf user';
}

function phaseToNotificationState(phase: CallPhase): 'ringing' | 'connecting' | 'active' {
  if (phase === 'connected') return 'active';
  if (phase === 'connecting') return 'connecting';
  return 'ringing';
}

function RemoteVideoStage({ lk, peerName, peerAvatar }: { lk: LiveKitNativeModule; peerName: string; peerAvatar?: string | null }) {
  const tracks = lk.useTracks([LIVEKIT_CAMERA_SOURCE]);
  const remoteTrack = tracks.find((track) => {
    if (!lk.isTrackReference(track)) return false;
    return !(track as any).participant?.isLocal;
  });

  if (remoteTrack && lk.isTrackReference(remoteTrack)) {
    const VideoTrack = lk.VideoTrack;
    return <VideoTrack trackRef={remoteTrack} style={s.remoteVideo} objectFit="cover" />;
  }

  return (
    <View style={s.remoteFallback}>
      {peerAvatar ? (
        <Image source={{ uri: peerAvatar }} style={s.heroAvatar} />
      ) : (
        <View style={s.heroAvatarFallback}>
          <Text style={s.heroInitial}>{initials(peerName)}</Text>
        </View>
      )}
      <Text style={s.waitingVideoText}>Đang chờ video của {peerName}</Text>
    </View>
  );
}

function LocalPreview({ lk, enabled }: { lk: LiveKitNativeModule; enabled: boolean }) {
  const tracks = lk.useTracks([LIVEKIT_CAMERA_SOURCE]);
  const localTrack = tracks.find((track) => {
    if (!lk.isTrackReference(track)) return false;
    return Boolean((track as any).participant?.isLocal);
  });

  if (!enabled || !localTrack || !lk.isTrackReference(localTrack)) {
    return (
      <View style={s.localPreviewOff}>
        <Ionicons name="videocam-off" size={18} color="#dbeafe" />
      </View>
    );
  }

  const VideoTrack = lk.VideoTrack;
  return (
    <View style={s.localPreview}>
      <VideoTrack trackRef={localTrack} style={s.localVideo} objectFit="cover" mirror zOrder={1} />
    </View>
  );
}

function LiveKitCallContent({
  lk,
  mode,
  peerName,
  peerAvatar,
  phase,
  seconds,
  onConnected,
  onEnd,
}: {
  lk: LiveKitNativeModule;
  mode: CallMode;
  peerName: string;
  peerAvatar?: string | null;
  phase: CallPhase;
  seconds: number;
  onConnected: () => void;
  onEnd: () => void;
}) {
  const room = lk.useRoomContext();
  const { localParticipant } = lk.useLocalParticipant();
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(mode === 'video');
  const [speakerEnabled, setSpeakerEnabled] = useState(true);

  useEffect(() => {
    const update = () => {
      if (room.state === LIVEKIT_CONNECTED_STATE) onConnected();
    };

    update();
    room.on('connectionStateChanged' as any, update);
    return () => {
      room.off('connectionStateChanged' as any, update);
    };
  }, [onConnected, room]);

  const toggleMic = async () => {
    const next = !micEnabled;
    setMicEnabled(next);
    await localParticipant.setMicrophoneEnabled(next);
  };

  const toggleCamera = async () => {
    const next = !cameraEnabled;
    setCameraEnabled(next);
    await localParticipant.setCameraEnabled(next);
  };

  const toggleSpeaker = async () => {
    setSpeakerEnabled((current) => !current);
  };

  return (
    <View style={s.liveRoot}>
      {mode === 'video' ? (
        <RemoteVideoStage lk={lk} peerName={peerName} peerAvatar={peerAvatar} />
      ) : (
        <View style={s.audioStage}>
          {peerAvatar ? (
            <Image source={{ uri: peerAvatar }} style={s.heroAvatar} />
          ) : (
            <View style={s.heroAvatarFallback}>
              <Text style={s.heroInitial}>{initials(peerName)}</Text>
            </View>
          )}
        </View>
      )}

      <SafeAreaView style={s.overlay} edges={['top', 'bottom']}>
        <View style={s.topBlock}>
          <Text style={s.peerName} numberOfLines={1}>{peerName}</Text>
          <Text style={s.callStatus}>
            {phase === 'connected'
              ? formatDuration(seconds)
              : phase === 'connecting'
                ? 'Đang kết nối...'
                : mode === 'video'
                  ? 'Đang gọi video...'
                  : 'Đang gọi thoại...'}
          </Text>
        </View>

        {mode === 'video' ? <LocalPreview lk={lk} enabled={cameraEnabled} /> : null}

        <View style={s.controls}>
          <RoundButton
            icon={micEnabled ? 'mic' : 'mic-off'}
            label={micEnabled ? 'Mic' : 'Tắt mic'}
            active={micEnabled}
            onPress={toggleMic}
          />
          {mode === 'video' ? (
            <RoundButton
              icon={cameraEnabled ? 'videocam' : 'videocam-off'}
              label={cameraEnabled ? 'Camera' : 'Tắt cam'}
              active={cameraEnabled}
              onPress={toggleCamera}
            />
          ) : (
            <RoundButton
              icon={speakerEnabled ? 'volume-high' : 'volume-mute'}
              label="Loa"
              active={speakerEnabled}
              onPress={toggleSpeaker}
            />
          )}
          <TouchableOpacity style={s.endButton} onPress={onEnd} activeOpacity={0.85}>
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.controlItem} onPress={onPress} activeOpacity={0.82}>
      <View style={[s.roundButton, active ? s.roundButtonActive : s.roundButtonMuted]}>
        <Ionicons name={icon} size={23} color="#fff" />
      </View>
      <Text style={s.controlLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function CallScreen({ navigation, route }: Props) {
  const {
    conversationId,
    peerUid,
    peerName,
    peerAvatar,
    mode,
    callKind = 'direct',
    direction = 'outgoing',
    autoAccept = false,
    resume = false,
    resumeState = 'connecting',
    conversationTitle,
    hostUserId,
    participantIds = [],
  } = route.params;
  const user = useAuthStore((state) => state.user);
  const isGroupCall = callKind === 'group';
  const displayName = isGroupCall ? (conversationTitle || peerName || 'Cuộc gọi nhóm') : peerName;
  const lk = useMemo(getLiveKitNative, []);
  const [phase, setPhase] = useState<CallPhase>(
    resume
      ? resumeState === 'ringing'
        ? direction === 'incoming'
          ? 'incoming'
          : 'outgoing'
        : 'connecting'
      : direction === 'incoming'
        ? (autoAccept ? 'connecting' : 'incoming')
        : 'outgoing'
  );
  const [tokenResponse, setTokenResponse] = useState<TokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const routeCallId = route.params.callId;
  const callId = useMemo(() => routeCallId ?? makeCallId(), [routeCallId]);
  const endedRef = useRef(false);
  const connectedAtRef = useRef<number | null>(null);
  const groupJoinedRef = useRef(false);
  const outgoingInviteSentRef = useRef(false);
  const liveKitTokenRequestRef = useRef(false);

  const syncCallNotification = useCallback((state: 'ringing' | 'connecting' | 'active') => {
    const notificationPeerId = peerUid || hostUserId || user?.uid;
    if (!notificationPeerId) return;
    void showOngoingCallSystemNotification({
      callId,
      conversationId,
      peerUserId: notificationPeerId,
      peerName: displayName,
      peerAvatarUrl: peerAvatar,
      conversationTitle: isGroupCall ? displayName : undefined,
      mode,
      direction,
      callKind,
      state,
    });
  }, [callId, callKind, conversationId, direction, displayName, hostUserId, mode, peerAvatar, peerUid, user?.uid]);

  const finish = useCallback((reason: 'ended' | 'missed' | 'failed' = 'ended') => {
    if (endedRef.current) return;
    endedRef.current = true;

    const socket = getSocket();
    if (user?.uid && isGroupCall) {
      if (groupJoinedRef.current) {
        socket.emit('call:group-participant-leave', {
          callId,
          conversationId,
          userId: user.uid,
          reason,
        });
      }
    } else if (user?.uid && peerUid) {
      socket.emit('call:end', {
        callId,
        conversationId,
        fromUserId: user.uid,
        toUserId: peerUid,
        reason,
      });
    }

    void dismissCallSystemNotification(callId);
    setPhase('ended');
    navigation.goBack();
  }, [callId, conversationId, isGroupCall, navigation, peerUid, user?.uid]);

  const connectLiveKit = useCallback(async () => {
    if (!user?.uid || liveKitTokenRequestRef.current || tokenResponse) return;
    liveKitTokenRequestRef.current = true;
    const tokenPeerId = isGroupCall ? (hostUserId || peerUid || user.uid) : peerUid;
    if (!tokenPeerId) {
      liveKitTokenRequestRef.current = false;
      setError('Thiếu dữ liệu người tham gia cuộc gọi.');
      setTimeout(() => finish('failed'), 900);
      return;
    }
    if (!lk) {
      liveKitTokenRequestRef.current = false;
      setError('Cần cài lại bản Android development build để bật LiveKit.');
      setTimeout(() => finish('failed'), 1300);
      return;
    }

    setPhase('connecting');
    setError(null);

    try {
      const response = await api.post<TokenResponse>('/api/calls/livekit-token', {
        callId,
        conversationId,
        peerId: tokenPeerId,
        mode,
        quality: mode === 'video' ? 'p720' : 'p480',
        userName: getUserName(user),
      });

      if (response.provider !== 'livekit' || !response.serverUrl || !response.token) {
        throw new Error(response.reason || 'livekit_not_available');
      }

      setTokenResponse(response);
    } catch {
      setError('LiveKit chưa sẵn sàng cho cuộc gọi này.');
      setTimeout(() => finish('failed'), 900);
    } finally {
      liveKitTokenRequestRef.current = false;
    }
  }, [callId, conversationId, finish, hostUserId, isGroupCall, lk, mode, peerUid, tokenResponse, user]);

  const acceptIncomingCall = useCallback(() => {
    if (!user?.uid || endedRef.current) return;
    connectSocket(user.uid);
    if (isGroupCall) {
      getSocket().emit('call:group-accept', {
        callId,
        conversationId,
        fromUserId: user.uid,
      });
    } else if (peerUid) {
      getSocket().emit('call:accept', {
        callId,
        conversationId,
        fromUserId: user.uid,
        toUserId: peerUid,
        mode,
      });
    }
    syncCallNotification('connecting');
    if (isGroupCall) {
      setTimeout(() => {
        if (!endedRef.current) void connectLiveKit();
      }, 350);
    } else {
      void connectLiveKit();
    }
  }, [callId, connectLiveKit, conversationId, isGroupCall, mode, peerUid, syncCallNotification, user?.uid]);

  const declineIncomingCall = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;

    if (user?.uid) {
      connectSocket(user.uid);
      if (isGroupCall) {
        getSocket().emit('call:group-decline', {
          callId,
          conversationId,
          fromUserId: user.uid,
          reason: 'declined',
        });
      } else if (peerUid) {
        getSocket().emit('call:decline', {
          callId,
          conversationId,
          fromUserId: user.uid,
          toUserId: peerUid,
          reason: 'declined',
        });
      }
    }

    void dismissCallSystemNotification(callId);
    setPhase('ended');
    navigation.goBack();
  }, [callId, conversationId, isGroupCall, navigation, peerUid, user?.uid]);

  useEffect(() => {
    if (!lk) return;
    void lk.AudioSession.startAudioSession();
    return () => {
      void lk.AudioSession.stopAudioSession();
    };
  }, [lk]);

  useEffect(() => {
    if (!user?.uid) return;
    connectSocket(user.uid);
    const socket = getSocket();

    if (resume) {
      syncCallNotification(resumeState);
      if (resumeState !== 'ringing') {
        void connectLiveKit();
      }
    } else if (direction === 'incoming') {
      if (autoAccept) {
        acceptIncomingCall();
      }
    } else if (!outgoingInviteSentRef.current) {
      outgoingInviteSentRef.current = true;
      if (isGroupCall) {
        const targets = Array.from(new Set(participantIds.map(id => id.trim()).filter(Boolean))).filter(id => id !== user.uid);
        if (targets.length === 0) {
          outgoingInviteSentRef.current = false;
          setError('Nhóm chưa có thành viên khác để gọi.');
          setTimeout(() => finish('failed'), 900);
          return;
        }
        socket.emit('call:group-invite', {
          callId,
          conversationId,
          fromUserId: user.uid,
          fromName: getUserName(user),
          fromAvatarUrl: user.photoURL ?? null,
          conversationTitle: conversationTitle || displayName,
          participantIds: targets,
          mode,
        });
      } else if (peerUid) {
        socket.emit('call:invite', {
          callId,
          conversationId,
          fromUserId: user.uid,
          toUserId: peerUid,
          fromName: getUserName(user),
          fromAvatarUrl: user.photoURL ?? null,
          mode,
        });
      }
      syncCallNotification('ringing');
    }

    const accepted = (payload: { callId?: string }) => {
      if (isGroupCall || direction === 'incoming' || payload.callId !== callId || endedRef.current) return;
      syncCallNotification('connecting');
      void connectLiveKit();
    };

    const declined = (payload: { callId?: string; reason?: string }) => {
      if (payload.callId !== callId || endedRef.current) return;
      endedRef.current = true;
      void dismissCallSystemNotification(callId);
      setError(payload.reason === 'busy' ? 'Người nhận đang bận.' : 'Người nhận đã từ chối.');
      setTimeout(() => navigation.goBack(), 900);
    };

    const ended = (payload: { callId?: string }) => {
      if (isGroupCall || payload.callId !== callId || endedRef.current) return;
      endedRef.current = true;
      void dismissCallSystemNotification(callId);
      navigation.goBack();
    };

    const groupRoomReady = (payload: { callId?: string; conversationId?: string; hostUserId?: string }) => {
      if (!isGroupCall || payload.callId !== callId || payload.conversationId !== conversationId || endedRef.current) return;
      syncCallNotification('connecting');
      void connectLiveKit();
    };

    socket.on('call:accepted', accepted);
    socket.on('call:declined', declined);
    socket.on('call:ended', ended);
    socket.on('call:group-room-ready', groupRoomReady);

    return () => {
      socket.off('call:accepted', accepted);
      socket.off('call:declined', declined);
      socket.off('call:ended', ended);
      socket.off('call:group-room-ready', groupRoomReady);
    };
  }, [acceptIncomingCall, autoAccept, callId, connectLiveKit, conversationId, conversationTitle, direction, displayName, finish, isGroupCall, mode, navigation, participantIds, peerUid, resume, resumeState, syncCallNotification, user]);

  useEffect(() => {
    if (phase === 'ended' || endedRef.current) return;

    const notificationState = phaseToNotificationState(phase);

    syncCallNotification(notificationState);

    const refresh = setInterval(() => {
      if (!endedRef.current) {
        syncCallNotification(notificationState);
      }
    }, CALL_NOTIFICATION_REFRESH_MS);

    return () => clearInterval(refresh);
  }, [phase, syncCallNotification]);

  useEffect(() => {
    if (phase === 'ended' || endedRef.current) return;

    const restoreCurrentCallNotification = () => {
      if (!endedRef.current) {
        syncCallNotification(phaseToNotificationState(phase));
      }
    };

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        restoreCurrentCallNotification();
      }
    });
    const focusUnsubscribe = navigation.addListener('focus', restoreCurrentCallNotification);

    restoreCurrentCallNotification();

    return () => {
      appStateSubscription.remove();
      focusUnsubscribe();
    };
  }, [navigation, phase, syncCallNotification]);

  useEffect(() => {
    if (phase !== 'incoming' && phase !== 'outgoing') return;

    const timeout = setTimeout(() => {
      if (!endedRef.current) {
        finish('missed');
      }
    }, CALL_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [finish, phase]);

  useEffect(() => {
    if (phase !== 'connected') return;
    const timer = setInterval(() => {
      const startedAt = connectedAtRef.current ?? Date.now();
      setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const handleConnected = useCallback(() => {
    if (connectedAtRef.current) return;
    connectedAtRef.current = Date.now();
    if (isGroupCall && user?.uid && !groupJoinedRef.current) {
      getSocket().emit('call:group-participant-join', {
        callId,
        conversationId,
        userId: user.uid,
      });
      groupJoinedRef.current = true;
    }
    syncCallNotification('active');
    setPhase('connected');
  }, [callId, conversationId, isGroupCall, syncCallNotification, user?.uid]);

  return (
    <View style={s.root}>
      {Platform.OS === 'android' ? <StatusBar barStyle="light-content" backgroundColor="#05070d" /> : null}
      {phase === 'incoming' ? (
        <SafeAreaView style={s.outgoingRoot} edges={['top', 'bottom']}>
          <View style={s.topBlock}>
            <Text style={s.callEyebrow}>{mode === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}</Text>
            <Text style={s.peerName} numberOfLines={1}>{displayName}</Text>
            <Text style={s.callStatus}>
              {isGroupCall ? 'Đang mời bạn vào cuộc gọi nhóm Surf' : 'Đang gọi cho bạn qua Surf'}
            </Text>
          </View>
          <View style={s.outgoingCenter}>
            {peerAvatar ? (
              <Image source={{ uri: peerAvatar }} style={s.heroAvatar} />
            ) : (
              <View style={s.heroAvatarFallback}>
                <Text style={s.heroInitial}>{initials(displayName)}</Text>
              </View>
            )}
          </View>
          <View style={s.incomingControls}>
            <TouchableOpacity style={[s.callActionButton, s.declineButton]} onPress={declineIncomingCall} activeOpacity={0.85}>
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.callActionButton, s.acceptButton]} onPress={acceptIncomingCall} activeOpacity={0.85}>
              <Ionicons name={mode === 'video' ? 'videocam' : 'call'} size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      ) : lk && tokenResponse?.serverUrl && tokenResponse.token ? (
        <lk.LiveKitRoom
          serverUrl={tokenResponse.serverUrl}
          token={tokenResponse.token}
          connect
          audio
          video={mode === 'video'}
          options={{ adaptiveStream: { pixelDensity: 'screen' }, dynacast: true }}
          onConnected={handleConnected}
          onDisconnected={() => {
            if (!endedRef.current) finish('ended');
          }}
          onError={() => {
            if (!endedRef.current) finish('failed');
          }}
        >
          <LiveKitCallContent
            lk={lk}
            mode={mode}
            peerName={displayName}
            peerAvatar={peerAvatar}
            phase={phase}
            seconds={seconds}
            onConnected={handleConnected}
            onEnd={() => finish('ended')}
          />
        </lk.LiveKitRoom>
      ) : (
        <SafeAreaView style={s.outgoingRoot} edges={['top', 'bottom']}>
          <View style={s.topBlock}>
            <Text style={s.peerName} numberOfLines={1}>{displayName}</Text>
            <Text style={s.callStatus}>
              {error ?? (mode === 'video' ? 'Đang gọi video...' : 'Đang gọi thoại...')}
            </Text>
          </View>
          <View style={s.outgoingCenter}>
            {peerAvatar ? (
              <Image source={{ uri: peerAvatar }} style={s.heroAvatar} />
            ) : (
              <View style={s.heroAvatarFallback}>
                <Text style={s.heroInitial}>{initials(displayName)}</Text>
              </View>
            )}
            {!error ? <ActivityIndicator color="#fff" size="large" style={{ marginTop: 26 }} /> : null}
          </View>
          <View style={s.controls}>
            <RoundButton icon="mic" label="Mic" active onPress={() => {}} />
            <RoundButton icon={mode === 'video' ? 'videocam' : 'volume-high'} label={mode === 'video' ? 'Camera' : 'Loa'} active onPress={() => {}} />
            <TouchableOpacity style={s.endButton} onPress={() => finish('ended')} activeOpacity={0.85}>
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05070d' },
  liveRoot: { flex: 1, backgroundColor: '#05070d' },
  outgoingRoot: { flex: 1, backgroundColor: '#05070d' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  topBlock: { alignItems: 'center', paddingTop: 28 },
  callEyebrow: {
    marginBottom: 10,
    color: '#22d3ee',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  peerName: { maxWidth: '88%', color: '#fff', fontSize: 28, lineHeight: 34, fontWeight: '800' },
  callStatus: { marginTop: 8, color: 'rgba(255,255,255,0.72)', fontSize: 15, fontWeight: '600' },
  outgoingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  audioStage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#05070d' },
  remoteVideo: { flex: 1, width: '100%', height: '100%' },
  remoteFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#05070d' },
  waitingVideoText: { marginTop: 18, color: 'rgba(255,255,255,0.68)', fontSize: 14, fontWeight: '700' },
  heroAvatar: { width: 142, height: 142, borderRadius: 71, backgroundColor: '#172033' },
  heroAvatarFallback: {
    width: 142,
    height: 142,
    borderRadius: 71,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
  },
  heroInitial: { color: '#fff', fontSize: 58, fontWeight: '900' },
  localPreview: {
    position: 'absolute',
    right: 22,
    top: 116,
    width: 104,
    height: 146,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: '#111827',
  },
  localVideo: { width: '100%', height: '100%' },
  localPreviewOff: {
    position: 'absolute',
    right: 22,
    top: 116,
    width: 104,
    height: 146,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(15,23,42,0.86)',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingBottom: 26,
  },
  incomingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 44,
    paddingBottom: 38,
  },
  callActionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  acceptButton: {
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
  declineButton: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
  controlItem: { alignItems: 'center', gap: 8, minWidth: 74 },
  roundButton: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  roundButtonActive: { backgroundColor: 'rgba(255,255,255,0.20)' },
  roundButtonMuted: { backgroundColor: 'rgba(255,255,255,0.10)' },
  controlLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '700' },
  endButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOpacity: 0.36,
    shadowRadius: 18,
    elevation: 7,
  },
});
