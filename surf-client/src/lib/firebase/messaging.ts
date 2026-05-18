import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { app } from './config';
import { api } from '../api';

export const requestNotificationPermission = async () => {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn('Firebase Messaging is not supported in this browser.');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const messaging = getMessaging(app);
      // Let firebase use the default SW registration or register it implicitly
      const currentToken = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY // Optional, we can omit it if not strict, but usually better to have one. If undefined, it may still work for simple setup.
      });

      if (currentToken) {
        console.log('FCM Token:', currentToken);
        // Gửi token lên server
        try {
          await api.put('/api/users/me/fcm-token', { fcmToken: currentToken });
        } catch (e) {
          console.warn('Failed to save FCM token to backend', e);
        }
        return currentToken;
      } else {
        console.log('No registration token available. Request permission to generate one.');
        return null;
      }
    } else {
      console.log('Unable to get permission to notify.');
      return null;
    }
  } catch (error) {
    console.error('An error occurred while retrieving token. ', error);
    return null;
  }
};

export const onMessageListener = async () => {
  const supported = await isSupported();
  if (!supported) return null;
  
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    console.log('Message received in foreground. ', payload);
    return payload;
  });
};
