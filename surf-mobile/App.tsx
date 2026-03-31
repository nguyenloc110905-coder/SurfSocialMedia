import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Navigation from './src/navigation';
import { useAuthStore } from './src/stores/authStore';
import { useFeedStore } from './src/stores/feedStore';

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const user = useAuthStore((s) => s.user);
  const fetchFeed = useFeedStore((s) => s.fetch);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  // Prefetch feed ngay khi auth xong — chạy song song với navigation render
  useEffect(() => {
    if (user) fetchFeed();
  }, [user, fetchFeed]);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Navigation />
    </SafeAreaProvider>
  );
}
