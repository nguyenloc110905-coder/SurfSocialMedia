import React, { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import Navigation, { navigationRef } from './src/navigation';
import { useAuthStore } from './src/stores/authStore';
import { useFeedStore } from './src/stores/feedStore';
import { isDevModeEnabled, logDebugInfo, shouldClearAuthOnStartup } from './src/lib/debug-config';
import { connectSocket, disconnectSocket, getSocket } from './src/lib/socket';
import { useNotificationStore, type RealtimeMessagePayload } from './src/stores/notificationStore';
import { useFriendStore } from './src/stores/friendStore';
import { useSettingsStore } from './src/stores/settingsStore';
import {
  ACCEPT_CALL_ACTION,
  DECLINE_CALL_ACTION,
  DEFAULT_NOTIFICATION_ACTION,
  configureSystemNotifications,
  dismissCallSystemNotification,
  refreshAllCallSystemNotifications,
  refreshCallSystemNotification,
  showIncomingCallSystemNotification,
  showMessageSystemNotification,
  showOngoingCallSystemNotification,
  subscribeSystemNotificationResponses,
  type IncomingCallPayload,
  type OngoingCallPayload,
  type SystemNotificationResponse,
} from './src/lib/systemNotifications';

function responseString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isMutedForUser(payload: Record<string, unknown>, userId: string): boolean {
  if (payload.muted === true) return true;
  return Array.isArray(payload.mutedBy) && payload.mutedBy.includes(userId);
}

function isCurrentChatOpen(conversationId?: string): boolean {
  if (!conversationId || !navigationRef.isReady()) return false;
  const route = navigationRef.getCurrentRoute();
  return route?.name === 'Chat' && (route.params as { conversationId?: string } | undefined)?.conversationId === conversationId;
}

function responseNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function currentCallId(): string | null {
  if (!navigationRef.isReady()) return null;
  const route = navigationRef.getCurrentRoute();
  if (route?.name !== 'Call') return null;
  return responseNullableString((route.params as { callId?: unknown } | undefined)?.callId);
}

type CallOpenOptions = {
  autoAccept?: boolean;
  resume?: boolean;
};

type PendingCallOpen = {
  data: Record<string, unknown>;
  options: CallOpenOptions;
  createdAt: number;
};

const PENDING_CALL_OPEN_MAX_AGE_MS = 30_000;
let pendingCallOpen: PendingCallOpen | null = null;

function hasRequiredCallScreenData(data: Record<string, unknown>): boolean {
  const callId = responseString(data.callId);
  const conversationId = responseString(data.conversationId);
  const callKind = data.callKind === 'group' ? 'group' : 'direct';
  const peerUid = responseString(data.fromUserId) || responseString(data.peerUserId) || responseString(data.hostUserId);
  if (callKind === 'group') return Boolean(callId && conversationId);
  return Boolean(callId && conversationId && peerUid);
}

function openCallScreenFromData(
  data: Record<string, unknown>,
  options: CallOpenOptions = {}
): boolean {
  if (!navigationRef.isReady()) return false;

  const callId = responseString(data.callId);
  const conversationId = responseString(data.conversationId);
  const callKind = data.callKind === 'group' ? 'group' : 'direct';
  const peerUid = responseString(data.fromUserId) || responseString(data.peerUserId) || responseString(data.hostUserId);
  const conversationTitle = responseString(data.conversationTitle);
  const peerName =
    callKind === 'group'
      ? conversationTitle || responseString(data.peerName) || 'Cuộc gọi nhóm'
      : responseString(data.fromName) || responseString(data.peerName) || 'Surf user';
  const avatarValue = data.fromAvatarUrl ?? data.peerAvatarUrl;
  const mode = data.mode === 'audio' ? 'audio' : 'video';
  const direction = data.direction === 'outgoing' ? 'outgoing' : 'incoming';
  const resumeState =
    data.state === 'ringing' || data.state === 'connecting' || data.state === 'active'
      ? data.state
      : undefined;

  if (!callId || !conversationId || (callKind === 'direct' && !peerUid)) return false;
  if (currentCallId() === callId) return true;

  navigationRef.navigate('Call', {
    conversationId,
    peerUid: peerUid || null,
    peerName,
    peerAvatar: typeof avatarValue === 'string' ? avatarValue : null,
    mode,
    callKind,
    callId,
    direction,
    autoAccept: options.autoAccept,
    resume: options.resume,
    resumeState,
    conversationTitle: conversationTitle || undefined,
    hostUserId: callKind === 'group' ? peerUid || null : undefined,
  });
  return true;
}

function flushPendingCallOpen() {
  if (!pendingCallOpen) return;
  if (Date.now() - pendingCallOpen.createdAt > PENDING_CALL_OPEN_MAX_AGE_MS) {
    pendingCallOpen = null;
    return;
  }

  if (openCallScreenFromData(pendingCallOpen.data, pendingCallOpen.options)) {
    pendingCallOpen = null;
  }
}

function openCallScreenOrQueue(data: Record<string, unknown>, options: CallOpenOptions = {}): boolean {
  if (!hasRequiredCallScreenData(data)) return false;
  if (openCallScreenFromData(data, options)) {
    pendingCallOpen = null;
    return true;
  }

  pendingCallOpen = { data, options, createdAt: Date.now() };
  return false;
}

function openCallScreenFromIncomingPayload(payload: IncomingCallPayload, autoAccept = false): boolean {
  return openCallScreenOrQueue(
    {
      callId: payload.callId,
      conversationId: payload.conversationId,
      fromUserId: payload.fromUserId,
      fromName: payload.fromName,
      fromAvatarUrl: payload.fromAvatarUrl,
      conversationTitle: payload.conversationTitle,
      callKind: payload.callKind,
      mode: payload.mode,
      direction: 'incoming',
    },
    { autoAccept }
  );
}

function responseCallState(value: unknown): OngoingCallPayload['state'] | undefined {
  if (value === 'ringing' || value === 'connecting' || value === 'active') return value;
  return undefined;
}

function refreshCallNotificationFromData(
  data: Record<string, unknown>,
  fallbackState: OngoingCallPayload['state'] = 'ringing'
) {
  const callId = responseString(data.callId);
  const conversationId = responseString(data.conversationId);
  const callKind = data.callKind === 'group' ? 'group' : 'direct';
  const peerUserId =
    responseString(data.fromUserId) ||
    responseString(data.peerUserId) ||
    responseString(data.hostUserId) ||
    (callKind === 'group' ? conversationId : '');
  const conversationTitle = responseString(data.conversationTitle);
  const peerName =
    callKind === 'group'
      ? conversationTitle || responseString(data.peerName) || responseString(data.fromName) || 'Cuộc gọi nhóm'
      : responseString(data.fromName) || responseString(data.peerName) || 'Surf user';

  if (!callId || !conversationId || !peerUserId) return;

  void showOngoingCallSystemNotification({
    callId,
    conversationId,
    peerUserId,
    peerName,
    peerAvatarUrl: typeof data.fromAvatarUrl === 'string'
      ? data.fromAvatarUrl
      : typeof data.peerAvatarUrl === 'string'
        ? data.peerAvatarUrl
        : null,
    conversationTitle: callKind === 'group' ? conversationTitle || peerName : undefined,
    mode: data.mode === 'audio' ? 'audio' : 'video',
    direction: data.direction === 'outgoing' ? 'outgoing' : 'incoming',
    callKind,
    state: responseCallState(data.state) ?? fallbackState,
  });
}

export default function App() {
  const scheme = useColorScheme();
  const settingsPrefs = useSettingsStore((s) => s.prefs);
  const initializeSettings = useSettingsStore((s) => s.initialize);
  const effectiveScheme = settingsPrefs.themeMode === 'system' ? scheme : settingsPrefs.themeMode;
  const isDark = effectiveScheme === 'dark';
  const appBg = isDark ? '#0f172a' : '#f8fafc';
  const initialize = useAuthStore((s) => s.initialize);
  const setLoading = useAuthStore((s) => s.setLoading) as (loading: boolean) => void;
  const resetAuth = useAuthStore((s) => s.resetAuth);
  const user = useAuthStore((s) => s.user);
  const fetchFeed = useFeedStore((s) => s.fetch);

  useEffect(() => {
    void initializeSettings();
  }, [initializeSettings]);

  useEffect(() => {
    logDebugInfo();
    const devMode = isDevModeEnabled();
    const shouldClear = shouldClearAuthOnStartup();
    
    console.log(`📲 App init: devMode=${devMode}, shouldClear=${shouldClear}`);

    // Clear auth if needed (async, but don't wait - just start it)
    if (shouldClear) {
      console.log('🔑 Clearing auth on startup');
      resetAuth();
    }

    // Setup auth listener immediately (sync)
    if (devMode) {
      import('./src/lib/debug-config').then(({ getDebugScreen }) => {
        const debugScreen = getDebugScreen();
        if (debugScreen !== 'Auth') {
          console.log('⚙️ Dev mode: setting mock user for Main screens');
          useAuthStore.getState().setUser({
            uid: 'dev-mock-uid',
            email: 'dev@mock.com',
            displayName: 'Dev Mode User',
            photoURL: '',
            emailVerified: true,
          } as any);
        } else {
          console.log(`⚙️ Dev mode: testing ${debugScreen} screen, keeping user null`);
          useAuthStore.getState().setUser(null);
        }
        setLoading(false);
      });
    } else {
      console.log('🔐 Normal mode: initializing Firebase listener');
      const unsubscribe = initialize();
      console.log('✅ Firebase listener subscribed');
      
      // Cleanup on unmount
      return () => {
        console.log('🧹 Cleaning up Firebase listener');
        unsubscribe();
      };
    }
  }, [initialize, setLoading, resetAuth]);

  // Prefetch feed ngay khi auth xong — chạy song song với navigation render
  useEffect(() => {
    if (user) fetchFeed();
  }, [user, fetchFeed]);

  useEffect(() => {
    if (!user?.uid) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshAllCallSystemNotifications();
      }
    });
    return () => subscription.remove();
  }, [user?.uid]);

  // Sync when coming back online
  useEffect(() => {
    if (!user) return;

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable) {
        console.log('🌐 Back online, syncing feed...');
        fetchFeed(true);
      }
    });

    return () => unsubscribe();
  }, [user, fetchFeed]);

  useEffect(() => {
    const unsubscribe = subscribeSystemNotificationResponses((response: SystemNotificationResponse) => {
      const type = responseString(response.data.type);

      if (type === 'message') {
        if (navigationRef.isReady()) {
          navigationRef.navigate('Messages');
        }
        return;
      }

      if (type === 'active-call') {
        const callId = responseString(response.data.callId);
        void refreshCallSystemNotification(callId);
        refreshCallNotificationFromData(response.data, 'active');
        openCallScreenOrQueue(response.data, { resume: true });
        return;
      }

      if (type !== 'incoming-call') return;

      const callId = responseString(response.data.callId);
      const conversationId = responseString(response.data.conversationId);
      const fromUserId = responseString(response.data.fromUserId);
      const isGroupCall = response.data.callKind === 'group';

      if (response.actionIdentifier === DECLINE_CALL_ACTION) {
        if (user?.uid && callId && conversationId && fromUserId) {
          connectSocket(user.uid);
          if (isGroupCall) {
            getSocket().emit('call:group-decline', {
              callId,
              conversationId,
              fromUserId: user.uid,
              reason: 'declined',
            });
          } else {
            getSocket().emit('call:decline', {
              callId,
              conversationId,
              fromUserId: user.uid,
              toUserId: fromUserId,
              reason: 'declined',
            });
          }
        }
        void dismissCallSystemNotification(callId);
        return;
      }

      if (
        response.actionIdentifier === ACCEPT_CALL_ACTION ||
        response.actionIdentifier === DEFAULT_NOTIFICATION_ACTION
      ) {
        const autoAccept = response.actionIdentifier === ACCEPT_CALL_ACTION;
        refreshCallNotificationFromData(response.data, autoAccept ? 'connecting' : 'ringing');
        openCallScreenOrQueue(response.data, {
          autoAccept,
        });
      }
    });

    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    flushPendingCallOpen();
    const timer = setInterval(flushPendingCallOpen, 250);
    return () => clearInterval(timer);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      disconnectSocket();
      useNotificationStore.getState().clear();
      useFriendStore.getState().clear();
      return;
    }

    void configureSystemNotifications();
    connectSocket(user.uid);
    const socket = getSocket();
    const notificationStore = useNotificationStore.getState();
    useFriendStore.getState().fetchRequests().catch(() => {});
    const handleNotification = (payload: unknown) => {
      notificationStore.upsertNotification(payload as any);
    };
    const handleMessage = (payload: unknown) => {
      const p = payload as RealtimeMessagePayload & { muted?: boolean; mutedBy?: string[] } & Record<string, unknown>;
      if (isMutedForUser(p, user.uid)) return;
      useNotificationStore.getState().upsertMessage(p, user.uid);

      const conversationId =
        p.message?.conversationId ??
        p.conversation?.id ??
        (typeof p.conversationId === 'string' ? p.conversationId : undefined);
      if (!isCurrentChatOpen(conversationId)) {
        void showMessageSystemNotification(p, user.uid);
      }
    };
    const handleFriendRequest = (payload: unknown) => {
      useNotificationStore.getState().upsertFriendRequest(payload as any);
      useFriendStore.getState().upsertIncomingRequest(payload as any);
    };
    const handleIncomingCall = (payload: unknown) => {
      const p = payload as IncomingCallPayload;
      if (p.toUserId && p.toUserId !== user.uid) return;
      void showIncomingCallSystemNotification(p);
      openCallScreenFromIncomingPayload(p);
    };
    const handleIncomingGroupCall = (payload: unknown) => {
      const p = payload as IncomingCallPayload;
      const normalized = { ...p, callKind: 'group' as const };
      void showIncomingCallSystemNotification(normalized);
      openCallScreenFromIncomingPayload(normalized);
    };
    const handleCallFinished = (payload: unknown) => {
      const p = payload as { callId?: string };
      void dismissCallSystemNotification(p.callId);
    };

    socket.on('notification:new', handleNotification);
    socket.on('message:new', handleMessage);
    socket.on('friendRequestReceived', handleFriendRequest);
    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:group-incoming', handleIncomingGroupCall);
    socket.on('call:ended', handleCallFinished);
    socket.on('call:declined', handleCallFinished);

    return () => {
      socket.off('notification:new', handleNotification);
      socket.off('message:new', handleMessage);
      socket.off('friendRequestReceived', handleFriendRequest);
      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:group-incoming', handleIncomingGroupCall);
      socket.off('call:ended', handleCallFinished);
      socket.off('call:declined', handleCallFinished);
      disconnectSocket();
    };
  }, [user?.uid]);

  return (
    <SafeAreaProvider style={{ backgroundColor: appBg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={appBg} translucent={false} />
      <Navigation />
    </SafeAreaProvider>
  );
}
