import { admin, getDb } from '../config/firebase-admin.js';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Gửi thông báo đẩy đến một mảng các FCM tokens
 */
export async function sendPushToTokens(tokens: string[], payload: PushNotificationPayload) {
  if (!tokens || tokens.length === 0) return;

  try {
    const message: admin.messaging.MulticastMessage = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
      tokens: tokens,
      // Có thể cấu hình thêm android, apns, webpush tuỳ chọn ở đây
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    if (response.failureCount > 0) {
      console.warn(`Gửi thất bại ${response.failureCount} push notifications.`);
      // Có thể xóa các token hỏng (NotRegistered) ở đây nếu cần thiết
    }
  } catch (error) {
    console.error('Lỗi khi gửi Push Notification:', error);
  }
}

/**
 * Lấy danh sách token của user và gửi thông báo
 */
export async function sendPushToUser(userId: string, payload: PushNotificationPayload) {
  try {
    const db = getDb();
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) return;

    const userData = userDoc.data();
    const fcmTokens: string[] = userData?.fcmTokens || [];

    if (fcmTokens.length > 0) {
      await sendPushToTokens(fcmTokens, payload);
    }
  } catch (error) {
    console.error(`Lỗi khi lấy FCM tokens cho user ${userId}:`, error);
  }
}
