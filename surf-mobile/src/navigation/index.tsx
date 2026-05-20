import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '@/stores/authStore';
import AuthScreen from '@/screens/AuthScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import AIScreen from '@/screens/AIScreen';
import MessagesScreen from '@/screens/MessagesScreen';
import ChatScreen from '@/screens/ChatScreen';
import SplashScreen from '@/screens/SplashScreen';
import MainTabsScreen from '@/screens/MainTabsScreen';
import { isDevModeEnabled, getDebugScreen } from '@/lib/debug-config';
import ForgotPasswordScreen from '@/screens/ForgotPasswordScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import CreatePostScreen from '@/screens/CreatePostScreen';
import CreateClipScreen from '@/screens/CreateClipScreen';
import MarketplaceScreen from '@/screens/MarketplaceScreen';
import MarketplaceDetailScreen from '@/screens/MarketplaceDetailScreen';
import CreateListingScreen from '@/screens/CreateListingScreen';
import MyListingsScreen from '@/screens/MyListingsScreen';
import { NotificationPostDetailScreen } from '@/screens/NotificationCenterScreen';
import EditProfileScreen from '@/screens/EditProfileScreen';
import SearchScreen from '@/screens/SearchScreen';

export type RootStackParamList = {
  Auth: { initialTab?: 'login' | 'register' };
  ForgotPassword: undefined;
  MainTabs: undefined;
  Home: undefined;
  Feed: undefined;
  Profile: { userId?: string };
  AI: undefined;
  Messages: undefined;
  Chat: { conversationId: string; title: string; peerUid?: string | null; peerAvatar?: string | null; };
  Settings: undefined;
  CreatePost: undefined;
  CreateClip: undefined;
  Marketplace: undefined;
  MarketplaceDetail: { listingId: string };
  CreateListing: undefined;
  MyListings: undefined;
  NotificationPost: { postId: string };
  EditProfile: undefined;
  Search: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Navigation() {
  const { user, loading } = useAuthStore();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const devMode = isDevModeEnabled();

  console.log(`🧭 Navigation render - user=${user ? user.email : 'null'}, loading=${loading}, devMode=${devMode}`);

  // Normal mode: auth flow
  // Chỉ hiện splash khi Firebase đang kiểm tra auth (~200-500ms thực tế)
  if (loading) return <SplashScreen />;

  if (!user) {
    console.log('📱 No user logged in, showing auth screens');
  } else {
    console.log(`✅ User logged in: ${user.email}`);
  }

  const initialRoute = devMode ? getDebugScreen() : undefined;

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: '#0c1929',
    },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator 
        screenOptions={{ 
          headerShown: false,
          contentStyle: { backgroundColor: '#0c1929' },
          animation: 'slide_from_right',
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
        initialRouteName={initialRoute as any}
      >
        {user ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabsScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="AI" component={AIScreen} />
            <Stack.Screen name="Messages" component={MessagesScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen
              name="CreatePost"
              component={CreatePostScreen}
              options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: true }}
            />
            <Stack.Screen
              name="CreateClip"
              component={CreateClipScreen}
              options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: true }}
            />
            <Stack.Screen name="Marketplace" component={MarketplaceScreen} />
            <Stack.Screen name="MarketplaceDetail" component={MarketplaceDetailScreen} />
            <Stack.Screen name="NotificationPost" component={NotificationPostDetailScreen} />
            <Stack.Screen
              name="EditProfile"
              component={EditProfileScreen}
              options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: true }}
            />
            <Stack.Screen
              name="Search"
              component={SearchScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="CreateListing"
              component={CreateListingScreen}
              options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: true }}
            />
            <Stack.Screen name="MyListings" component={MyListingsScreen} />
          </>
        ) : (
          <>
            <Stack.Screen 
              name="Auth" 
              component={AuthScreen} 
            />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
