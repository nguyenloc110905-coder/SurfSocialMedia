import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '@/stores/authStore';
import LoginScreen from '@/screens/LoginScreen';
import RegisterScreen from '@/screens/RegisterScreen';
import FeedScreen from '@/screens/FeedScreen';
import ProfileScreen from '@/screens/ProfileScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Feed: undefined;
  Profile: { userId?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Navigation() {
  const { user, loading } = useAuthStore();

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Feed" component={FeedScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
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
