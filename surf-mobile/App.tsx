import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Navigation from './src/navigation';
import { useAuthStore } from './src/stores/authStore';
import { useFeedStore } from './src/stores/feedStore';
import { isDevModeEnabled, logDebugInfo, shouldClearAuthOnStartup } from './src/lib/debug-config';
import { connectSocket, disconnectSocket, getSocket } from './src/lib/socket';
import { useNotificationStore } from './src/stores/notificationStore';

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const setLoading = useAuthStore((s) => s.setLoading) as (loading: boolean) => void;
  const resetAuth = useAuthStore((s) => s.resetAuth);
  const user = useAuthStore((s) => s.user);
  const fetchFeed = useFeedStore((s) => s.fetch);

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
        if (debugScreen !== 'Login' && debugScreen !== 'Register') {
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
    if (!user?.uid) {
      disconnectSocket();
      useNotificationStore.getState().clear();
      return;
    }

    connectSocket(user.uid);
    const socket = getSocket();
    const notificationStore = useNotificationStore.getState();
    const handleNotification = (payload: unknown) => {
      notificationStore.upsertNotification(payload as any);
    };
    const handleMessage = (payload: unknown) => {
      useNotificationStore.getState().upsertMessage(payload as any, user.uid);
    };
    const handleFriendRequest = (payload: unknown) => {
      useNotificationStore.getState().upsertFriendRequest(payload as any);
    };

    socket.on('notification:new', handleNotification);
    socket.on('message:new', handleMessage);
    socket.on('friendRequestReceived', handleFriendRequest);

    return () => {
      socket.off('notification:new', handleNotification);
      socket.off('message:new', handleMessage);
      socket.off('friendRequestReceived', handleFriendRequest);
      disconnectSocket();
    };
  }, [user?.uid]);

  return (
    <SafeAreaProvider style={{ backgroundColor: '#0c1929' }}>
      <StatusBar style="light" />
      <Navigation />
    </SafeAreaProvider>
  );
}
