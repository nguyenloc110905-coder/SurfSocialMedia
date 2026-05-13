import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '@/stores/authStore';
import AuthScreen from '@/screens/AuthScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import AIScreen from '@/screens/AIScreen';
import MessagesScreen from '@/screens/MessagesScreen';
import SplashScreen from '@/screens/SplashScreen';
import MainTabsScreen from '@/screens/MainTabsScreen';
import { isDevModeEnabled, getDebugScreen } from '@/lib/debug-config';

import ForgotPasswordScreen from '@/screens/ForgotPasswordScreen';

export type RootStackParamList = {
  Auth: { initialTab?: 'login' | 'register' };
  ForgotPassword: undefined;
  MainTabs: undefined;
  Home: undefined;
  Feed: undefined;
  Profile: { userId?: string };
  AI: undefined;
  Messages: undefined;
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
          contentStyle: { backgroundColor: '#0c1929' }
        }}
        initialRouteName={initialRoute as any}
      >
        {user ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabsScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="AI" component={AIScreen} />
            <Stack.Screen name="Messages" component={MessagesScreen} />
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
