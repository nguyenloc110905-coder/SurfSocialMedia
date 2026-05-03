import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '@/stores/authStore';
import LoginScreen from '@/screens/LoginScreen';
import RegisterScreen from '@/screens/RegisterScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import AIScreen from '@/screens/AIScreen';
import MessagesScreen from '@/screens/MessagesScreen';
import SplashScreen from '@/screens/SplashScreen';
import MainTabsScreen from '@/screens/MainTabsScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import CreatePostScreen from '@/screens/CreatePostScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  MainTabs: undefined;
  Home: undefined;
  Feed: undefined;
  Profile: { userId?: string };
  AI: undefined;
  Messages: undefined;
  Settings: undefined;
  CreatePost: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Navigation() {
  const { user, loading } = useAuthStore();

  // Chỉ hiện splash khi Firebase đang kiểm tra auth (~200-500ms thực tế)
  if (loading) return <SplashScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabsScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="AI" component={AIScreen} />
            <Stack.Screen name="Messages" component={MessagesScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen 
              name="CreatePost" 
              component={CreatePostScreen} 
              options={{ presentation: 'fullScreenModal' }} 
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
