import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from '@/stores/authStore';
import { useCallStore } from '@/stores/callStore';
import IncomingCallModal from '@/components/call/IncomingCallModal';
import AuthScreen from '@/screens/AuthScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import AIScreen from '@/screens/AIScreen';
import MessagesScreen from '@/screens/MessagesScreen';
import ChatScreen from '@/screens/ChatScreen';
import ChatInfoScreen from '@/screens/ChatInfoScreen';
import CallScreen from '@/screens/CallScreen';
import SplashScreen from '@/screens/SplashScreen';
import MainTabsScreen from '@/screens/MainTabsScreen';
import { isDevModeEnabled, getDebugScreen } from '@/lib/debug-config';
import ForgotPasswordScreen from '@/screens/ForgotPasswordScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import EditProfileScreen from '@/screens/EditProfileScreen';
import ProfilePhotoPickerScreen from '@/screens/ProfilePhotoPickerScreen';
import CreatePostScreen from '@/screens/CreatePostScreen';
import CreateMomentScreen from '@/screens/CreateMomentScreen';
import CreateClipScreen from '@/screens/CreateClipScreen';
import MarketplaceScreen from '@/screens/MarketplaceScreen';
import MarketplaceDetailScreen from '@/screens/MarketplaceDetailScreen';
import CreateListingScreen from '@/screens/CreateListingScreen';
import MyListingsScreen from '@/screens/MyListingsScreen';
import { NotificationPostDetailScreen } from '@/screens/NotificationCenterScreen';
import SearchScreen from '@/screens/SearchScreen';
import SavedPostsScreen from '@/screens/SavedPostsScreen';
import ArchivedPostsScreen from '@/screens/ArchivedPostsScreen';
import GroupsScreen from '@/screens/GroupsScreen';
import GroupDetailScreen from '@/screens/GroupDetailScreen';
import { getSocket } from '@/lib/socket';

export type RootStackParamList = {
  Auth: { initialTab?: 'login' | 'register'; initialEmail?: string };
  ForgotPassword: undefined;
  MainTabs: undefined;
  Home: undefined;
  Feed: undefined;
  Profile: { userId?: string };
  AI: undefined;
  Messages: undefined;
  ChatInfo: {
    conversationId: string;
    title: string;
    peerUid?: string | null;
    peerAvatar?: string | null;
    conversationType?: 'dm' | 'group' | 'marketplace';
    marketplaceTitle?: string | null;
  };
  Chat: {
    conversationId: string;
    title: string;
    peerUid?: string | null;
    peerAvatar?: string | null;
    conversationType?: 'dm' | 'group' | 'marketplace';
    marketplaceTitle?: string | null;
  };
  Settings: undefined;
  EditProfile: undefined;
  ProfilePhotoPicker: { mode: 'avatarUpload' | 'coverUpload' | 'coverPosted' };
  CreatePost: { groupId?: string; groupName?: string } | undefined;
  CreateMoment: undefined;
  CreateClip: undefined;
  Marketplace: undefined;
  MarketplaceDetail: { listingId: string };
  CreateListing: undefined;
  MyListings: undefined;
  NotificationPost: { postId: string };
  Search: undefined;
  SavedPosts: undefined;
  ArchivedPosts: undefined;
  Groups: undefined;
  GroupDetail: { groupId: string };
  Call: {
    conversationId: string;
    peerUid: string;
    isHost?: boolean;
    callId?: string;
    peerName?: string;
    peerAvatar?: string | null;
    mode?: 'audio' | 'video';
    acceptOnReady?: boolean;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Navigation() {
  const { user, loading } = useAuthStore();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const devMode = isDevModeEnabled();

  console.log(`🧭 Navigation render - user=${user ? user.email : 'null'}, loading=${loading}, devMode=${devMode}`);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    
    const onCallIncoming = (payload: any) => {
      useCallStore.getState().setIncomingCall({
        callId: payload.callId,
        conversationId: payload.conversationId,
        peer: {
          uid: payload.fromUserId,
          name: payload.fromName,
          avatarUrl: payload.fromAvatarUrl,
        },
        mode: payload.mode,
      });
    };

    socket.on('call:incoming', onCallIncoming);

    return () => {
      socket.off('call:incoming', onCallIncoming);
    };
  }, [user]);

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
            <Stack.Screen name="ChatInfo" component={ChatInfoScreen} />
            <Stack.Screen name="Call" component={CallScreen} options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="ProfilePhotoPicker" component={ProfilePhotoPickerScreen} />
            <Stack.Screen
              name="CreatePost"
              component={CreatePostScreen}
              options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: true }}
            />
            <Stack.Screen
              name="CreateMoment"
              component={CreateMomentScreen}
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
            <Stack.Screen name="SavedPosts" component={SavedPostsScreen} />
            <Stack.Screen name="ArchivedPosts" component={ArchivedPostsScreen} />
            <Stack.Screen name="Groups" component={GroupsScreen} />
            <Stack.Screen name="GroupDetail" component={GroupDetailScreen} />
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
      <IncomingCallModal />
    </NavigationContainer>
  );
}
