import React from 'react';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '@/stores/authStore';
import AuthScreen from '@/screens/AuthScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import AIScreen from '@/screens/AIScreen';
import MessagesScreen from '@/screens/MessagesScreen';
import ChatScreen from '@/screens/ChatScreen';
import CallScreen from '@/screens/CallScreen';
import SplashScreen from '@/screens/SplashScreen';
import MainTabsScreen from '@/screens/MainTabsScreen';
import { isDevModeEnabled, getDebugScreen } from '@/lib/debug-config';
import ForgotPasswordScreen from '@/screens/ForgotPasswordScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import EditProfileScreen from '@/screens/EditProfileScreen';
import ProfilePhotoPickerScreen from '@/screens/ProfilePhotoPickerScreen';
import CreatePostScreen from '@/screens/CreatePostScreen';
import CreateClipScreen from '@/screens/CreateClipScreen';
import MarketplaceScreen from '@/screens/MarketplaceScreen';
import MarketplaceDetailScreen from '@/screens/MarketplaceDetailScreen';
import CreateListingScreen from '@/screens/CreateListingScreen';
import MyListingsScreen from '@/screens/MyListingsScreen';
import { NotificationPostDetailScreen } from '@/screens/NotificationCenterScreen';
import SearchScreen from '@/screens/SearchScreen';
import SavedPostsScreen from '@/screens/SavedPostsScreen';
import GroupsScreen from '@/screens/GroupsScreen';
import GroupDetailScreen from '@/screens/GroupDetailScreen';

export type RootStackParamList = {
  Auth: { initialTab?: 'login' | 'register' };
  ForgotPassword: undefined;
  MainTabs: undefined;
  Home: undefined;
  Feed: undefined;
  Profile: { userId?: string };
  AI: undefined;
  Messages: undefined;
  Chat: {
    conversationId: string;
    title: string;
    peerUid?: string | null;
    peerName?: string | null;
    peerAvatar?: string | null;
    muted?: boolean;
    members?: Array<{ uid: string; name: string; avatarUrl: string | null }>;
    memberCount?: number;
    marketplace?: {
      listingId: string;
      title: string;
      imageUrl: string | null;
      price?: number;
      location?: string;
      sellerId?: string;
    } | null;
  };
  Call: {
    conversationId: string;
    peerUid?: string | null;
    peerName: string;
    peerAvatar?: string | null;
    mode: 'audio' | 'video';
    callKind?: 'direct' | 'group';
    callId?: string;
    direction?: 'outgoing' | 'incoming';
    autoAccept?: boolean;
    resume?: boolean;
    resumeState?: 'ringing' | 'connecting' | 'active';
    conversationTitle?: string;
    hostUserId?: string | null;
    participantIds?: string[];
  };
  Settings: undefined;
  EditProfile: undefined;
  ProfilePhotoPicker: { mode: 'avatarUpload' | 'coverUpload' | 'coverPosted' };
  CreatePost: { groupId?: string; groupName?: string } | undefined;
  CreateClip: undefined;
  Marketplace: undefined;
  MarketplaceDetail: { listingId: string };
  CreateListing: undefined;
  MyListings: undefined;
  NotificationPost: { postId: string };
  Search: undefined;
  SavedPosts: undefined;
  Groups: undefined;
  GroupDetail: { groupId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function Navigation() {
  const { user, loading } = useAuthStore();
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
            <Stack.Screen name="Call" component={CallScreen} options={{ animation: 'fade' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="ProfilePhotoPicker" component={ProfilePhotoPickerScreen} />
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
    </NavigationContainer>
  );
}
