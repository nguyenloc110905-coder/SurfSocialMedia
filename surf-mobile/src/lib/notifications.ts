import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// 1. Cấu hình hiển thị notification khi app đang chạy (Foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * 2. Xin quyền và lấy FCM Token
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Platform.OS === 'web') {
    console.warn('Push notifications are not supported on web');
    return null;
  }

  const existingStatus = await Notifications.getPermissionsAsync();
  let isGranted = (existingStatus as any).granted || (existingStatus as any).status === 'granted';

  if (!isGranted) {
    const newStatus = await Notifications.requestPermissionsAsync();
    isGranted = (newStatus as any).granted || (newStatus as any).status === 'granted';
  }

  if (!isGranted) {
    console.warn('Failed to get push token for push notification!');
    return null;
  }

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) {
      throw new Error('Project ID not found in app.json');
    }

    // We use the native FCM/APNS token because the server stores fcmToken.
    const deviceTokenInfo = await Notifications.getDevicePushTokenAsync();
    token = deviceTokenInfo.data;
  } catch (error) {
    console.error('Lỗi khi lấy Push Token:', error);
  }

  return token;
}

/**
 * 3. Gửi token lên server
 */
export async function sendPushTokenToServer(token: string) {
  try {
    const API_URL = process.env.EXPO_PUBLIC_API_URL;
    // Cần lấy auth token từ store hoặc firebase để gắn vào Authorization header.
    // Vì hàm này gọi sau khi login, ta import auth trực tiếp.
    const { auth } = await import('@/lib/firebase/auth');
    const user = auth.currentUser;
    
    if (!user) return;
    
    const idToken = await user.getIdToken();
    
    await fetch(`${API_URL}/api/users/me/fcm-token`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ fcmToken: token }),
    });
    
    console.log('Đã đăng ký FCM Token thành công lên server');
  } catch (error) {
    console.error('Lỗi đăng ký FCM Token lên server:', error);
  }
}

/**
 * 4. Xóa token trên server (khi logout)
 * Wait, API hiện tại chưa có api DELETE /api/users/me/fcm-token, 
 * Nhưng ta có thể skip nếu chưa có. Nếu có thể, hãy gọi để tránh báo rác.
 */
export async function removePushTokenFromServer(token: string) {
  try {
    // Nếu server chưa hỗ trợ API xóa, ta có thể bỏ qua.
    console.log('removePushTokenFromServer - need API endpoint');
  } catch (error) {
    console.error('Lỗi xóa FCM Token:', error);
  }
}
