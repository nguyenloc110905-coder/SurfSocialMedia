import { Platform } from 'react-native';
import type * as ExpoNotifications from 'expo-notifications';
import type { RealtimeMessagePayload } from '@/stores/notificationStore';

export const MESSAGE_NOTIFICATION_CHANNEL = 'surf_messages';
export const INCOMING_CALL_NOTIFICATION_CHANNEL = 'surf_incoming_calls';
export const INCOMING_CALL_CATEGORY = 'surf_incoming_call';
export const ONGOING_CALL_CATEGORY = 'surf_ongoing_call';
export const ACCEPT_CALL_ACTION = 'surf_accept_call';
export const DECLINE_CALL_ACTION = 'surf_decline_call';
export const OPEN_CALL_ACTION = 'surf_open_call';
export const DEFAULT_NOTIFICATION_ACTION = 'expo.modules.notifications.actions.DEFAULT';
const CALL_NOTIFICATION_PREFIX = 'call-';
const RESPONSE_DEDUP_TTL_MS = 1500;
const CALL_NOTIFICATION_KEEPALIVE_MS = 10_000;

type NotificationsModule = typeof ExpoNotifications;

export type IncomingCallPayload = {
  callId?: string;
  conversationId?: string;
  fromUserId?: string;
  toUserId?: string;
  fromName?: string;
  fromAvatarUrl?: string | null;
  conversationTitle?: string;
  callKind?: 'direct' | 'group';
  mode?: 'audio' | 'video';
};

export type OngoingCallPayload = {
  callId?: string;
  conversationId?: string;
  peerUserId?: string;
  peerName?: string;
  peerAvatarUrl?: string | null;
  conversationTitle?: string;
  mode?: 'audio' | 'video';
  direction?: 'incoming' | 'outgoing';
  callKind?: 'direct' | 'group';
  state?: 'ringing' | 'connecting' | 'active';
};

export type SystemNotificationResponse = {
  actionIdentifier: string;
  notificationId: string;
  data: Record<string, unknown>;
};

let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;
let configured = false;
const handledResponseKeys = new Map<string, number>();
const persistentCallNotifications = new Map<
  string,
  { payload: OngoingCallPayload; timer: ReturnType<typeof setInterval> }
>();

function warnNotificationIssue(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn('System notifications unavailable:', message);
}

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') return null;
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications').catch((error) => {
      warnNotificationIssue(error);
      return null;
    });
  }
  return notificationsModulePromise;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function trimNotificationBody(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function stripReplyMetadata(value: string): string {
  return value
    .replace(/^__reply_to:[^\n]+__\n?/u, '')
    .replace(/^__reply_sender:[^\n]+__\n?/u, '')
    .replace(/__reply_to:[^\s]+__/gu, ' ')
    .replace(/__reply_sender:[^\s]+__/gu, ' ')
    .replace(/^↪\s*.+?:\s*.+\n/u, '')
    .trim();
}

function messageNotificationPreview(payload: RealtimeMessagePayload): string {
  const message = payload.message;
  const serverPreview = payload.conversation?.lastMessagePreview;
  if (serverPreview) return trimNotificationBody(serverPreview);
  if (!message) return 'Tin nhắn mới';
  if (message.isRecalled || message.recalledForEveryone) return 'Tin nhắn đã được thu hồi';

  const body = stripReplyMetadata(message.text ?? '');
  if (body) return trimNotificationBody(body);
  if (message.type === 'image') return '📷 Hình ảnh';
  if (message.type === 'audio') return '🎤 Tin nhắn thoại';
  if (message.type === 'file') return message.fileName ? `📎 ${message.fileName}` : '📎 Tệp đính kèm';
  if (message.type === 'call_log') return trimNotificationBody(message.text ?? 'Cuộc gọi Surf');
  return 'Tin nhắn mới';
}

function messageNotificationData(payload: RealtimeMessagePayload) {
  const message = payload.message;
  const conversationId = message?.conversationId ?? payload.conversation?.id;
  const preview = messageNotificationPreview(payload);

  return {
    messageId: message?.id,
    senderId: message?.senderId,
    conversationId,
    preview,
  };
}

function rememberPersistentCallNotification(callId: string, payload: OngoingCallPayload) {
  const existing = persistentCallNotifications.get(callId);
  if (existing) {
    existing.payload = payload;
    return;
  }

  const timer = setInterval(() => {
    const current = persistentCallNotifications.get(callId);
    if (!current) return;
    void showOngoingCallSystemNotification(current.payload);
  }, CALL_NOTIFICATION_KEEPALIVE_MS);

  persistentCallNotifications.set(callId, { payload, timer });
}

function forgetPersistentCallNotification(callId: string) {
  const existing = persistentCallNotifications.get(callId);
  if (!existing) return;
  clearInterval(existing.timer);
  persistentCallNotifications.delete(callId);
}

export async function configureSystemNotifications() {
  if (configured) return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(MESSAGE_NOTIFICATION_CHANNEL, {
        name: 'Tin nhắn Surf',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 160, 100, 160],
        enableVibrate: true,
        showBadge: true,
        lightColor: '#0ea5e9',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      await Notifications.setNotificationChannelAsync(INCOMING_CALL_NOTIFICATION_CHANNEL, {
        name: 'Cuộc gọi Surf',
        importance: Notifications.AndroidImportance.MAX,
        bypassDnd: true,
        sound: 'default',
        vibrationPattern: [0, 420, 240, 420, 240, 700],
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
        lightColor: '#0ea5e9',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      });
    }

    await Notifications.setNotificationCategoryAsync(INCOMING_CALL_CATEGORY, [
      {
        identifier: DECLINE_CALL_ACTION,
        buttonTitle: 'Từ chối',
        options: { isDestructive: true, opensAppToForeground: true },
      },
      {
        identifier: ACCEPT_CALL_ACTION,
        buttonTitle: 'Trả lời',
        options: { opensAppToForeground: true },
      },
    ]);
    await Notifications.setNotificationCategoryAsync(ONGOING_CALL_CATEGORY, [
      {
        identifier: OPEN_CALL_ACTION,
        buttonTitle: 'Mở',
        options: { opensAppToForeground: true },
      },
    ]);

    const currentPermission = await Notifications.getPermissionsAsync();
    if (!currentPermission.granted) {
      await Notifications.requestPermissionsAsync();
    }

    configured = true;
  } catch (error) {
    warnNotificationIssue(error);
  }
}

export async function showMessageSystemNotification(payload: RealtimeMessagePayload, currentUserId: string) {
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  const data = messageNotificationData(payload);
  if (!data.messageId || !data.conversationId || data.senderId === currentUserId) return;

  try {
    await configureSystemNotifications();
    await Notifications.scheduleNotificationAsync({
      identifier: `message-${data.messageId}`,
      content: {
        title: 'Tin nhắn mới trên Surf',
        body: data.preview,
        sound: 'default',
        color: '#0ea5e9',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          type: 'message',
          messageId: data.messageId,
          conversationId: data.conversationId,
          senderId: data.senderId,
        },
      },
      trigger: Platform.OS === 'android' ? { channelId: MESSAGE_NOTIFICATION_CHANNEL } : null,
    });
  } catch (error) {
    warnNotificationIssue(error);
  }
}

export async function showIncomingCallSystemNotification(payload: IncomingCallPayload) {
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  const callId = text(payload.callId);
  const conversationId = text(payload.conversationId);
  const fromUserId = text(payload.fromUserId);
  const fromName = text(payload.fromName, 'Ai đó');
  const isGroupCall = payload.callKind === 'group';
  const conversationTitle = text(payload.conversationTitle, 'Cuộc gọi nhóm');
  const mode = payload.mode === 'audio' ? 'audio' : 'video';
  if (!callId || !conversationId || !fromUserId) return;

  try {
    await configureSystemNotifications();
    rememberPersistentCallNotification(callId, {
      callId,
      conversationId,
      peerUserId: fromUserId,
      peerName: isGroupCall ? conversationTitle : fromName,
      peerAvatarUrl: payload.fromAvatarUrl ?? null,
      conversationTitle: isGroupCall ? conversationTitle : undefined,
      mode,
      direction: 'incoming',
      callKind: isGroupCall ? 'group' : 'direct',
      state: 'ringing',
    });
    await Notifications.scheduleNotificationAsync({
      identifier: `${CALL_NOTIFICATION_PREFIX}${callId}`,
      content: {
        title: isGroupCall ? conversationTitle : fromName,
        subtitle: isGroupCall
          ? (mode === 'video' ? 'Cuộc gọi video nhóm Surf' : 'Cuộc gọi thoại nhóm Surf')
          : (mode === 'video' ? 'Cuộc gọi video Surf' : 'Cuộc gọi thoại Surf'),
        body: isGroupCall
          ? `${fromName} đang mời bạn vào cuộc gọi ${mode === 'video' ? 'video nhóm' : 'thoại nhóm'}`
          : mode === 'video'
            ? 'Đang gọi video cho bạn'
            : 'Đang gọi thoại cho bạn',
        sound: 'default',
        color: '#0ea5e9',
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 420, 240, 420, 240, 700],
        sticky: true,
        autoDismiss: false,
        categoryIdentifier: INCOMING_CALL_CATEGORY,
        data: {
          type: 'incoming-call',
          callId,
          conversationId,
          fromUserId,
          fromName,
          fromAvatarUrl: payload.fromAvatarUrl ?? null,
          conversationTitle,
          callKind: isGroupCall ? 'group' : 'direct',
          mode,
        },
      },
      trigger: Platform.OS === 'android' ? { channelId: INCOMING_CALL_NOTIFICATION_CHANNEL } : null,
    });
  } catch (error) {
    warnNotificationIssue(error);
  }
}

export async function showOngoingCallSystemNotification(payload: OngoingCallPayload) {
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  const callId = text(payload.callId);
  const conversationId = text(payload.conversationId);
  const peerUserId = text(payload.peerUserId);
  const peerName = text(payload.peerName, 'Surf user');
  const mode = payload.mode === 'audio' ? 'audio' : 'video';
  const state = payload.state ?? 'active';
  const direction = payload.direction ?? 'incoming';
  const isGroupCall = payload.callKind === 'group';
  const displayName = isGroupCall ? text(payload.conversationTitle, peerName) : peerName;
  if (!callId || !conversationId || !peerUserId) return;

  const isActive = state === 'active';
  const isIncomingRinging = state === 'ringing' && direction === 'incoming';
  const modeLabel = mode === 'video' ? 'video' : 'thoại';
  const title =
    isIncomingRinging
      ? displayName
      : isActive
      ? `Đang trong cuộc gọi ${modeLabel}`
      : direction === 'outgoing'
        ? `Đang gọi ${modeLabel}`
        : `Đang kết nối cuộc gọi ${modeLabel}`;
  const body = isIncomingRinging
    ? isGroupCall
      ? `Đang chờ tham gia cuộc gọi ${mode === 'video' ? 'video nhóm' : 'thoại nhóm'}`
      : mode === 'video'
      ? 'Đang gọi video cho bạn'
      : 'Đang gọi thoại cho bạn'
    : 'Chạm để quay lại cuộc gọi trên Surf';
  const data = isIncomingRinging
    ? {
        type: 'incoming-call',
        callId,
        conversationId,
        fromUserId: peerUserId,
        fromName: displayName,
        fromAvatarUrl: payload.peerAvatarUrl ?? null,
        peerUserId,
        peerName: displayName,
        peerAvatarUrl: payload.peerAvatarUrl ?? null,
        conversationTitle: isGroupCall ? displayName : undefined,
        mode,
        direction,
        callKind: isGroupCall ? 'group' : 'direct',
        state,
      }
    : {
        type: 'active-call',
        callId,
        conversationId,
        peerUserId,
        peerName: displayName,
        peerAvatarUrl: payload.peerAvatarUrl ?? null,
        conversationTitle: isGroupCall ? displayName : undefined,
        mode,
        direction,
        callKind: isGroupCall ? 'group' : 'direct',
        state,
      };

  try {
    await configureSystemNotifications();
    rememberPersistentCallNotification(callId, {
      ...payload,
      callId,
      conversationId,
      peerUserId,
      peerName: displayName,
      peerAvatarUrl: payload.peerAvatarUrl ?? null,
      conversationTitle: isGroupCall ? displayName : undefined,
      mode,
      direction,
      callKind: isGroupCall ? 'group' : 'direct',
      state,
    });
    await Notifications.scheduleNotificationAsync({
      identifier: `${CALL_NOTIFICATION_PREFIX}${callId}`,
      content: {
        title,
        subtitle: isIncomingRinging
          ? isGroupCall
            ? (mode === 'video' ? 'Cuộc gọi video nhóm Surf' : 'Cuộc gọi thoại nhóm Surf')
            : (mode === 'video' ? 'Cuộc gọi video Surf' : 'Cuộc gọi thoại Surf')
          : displayName,
        body,
        sound: state === 'ringing' ? 'default' : false,
        color: '#0ea5e9',
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: state === 'ringing' ? [0, 420, 240, 420, 240, 700] : undefined,
        sticky: true,
        autoDismiss: false,
        categoryIdentifier: isIncomingRinging ? INCOMING_CALL_CATEGORY : ONGOING_CALL_CATEGORY,
        data,
      },
      trigger: Platform.OS === 'android' ? { channelId: INCOMING_CALL_NOTIFICATION_CHANNEL } : null,
    });
  } catch (error) {
    warnNotificationIssue(error);
  }
}

export async function dismissCallSystemNotification(callId?: string | null) {
  if (!callId) return;
  forgetPersistentCallNotification(callId);
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  try {
    const notificationId = `${CALL_NOTIFICATION_PREFIX}${callId}`;
    await Notifications.dismissNotificationAsync(notificationId);
  } catch {
    // The notification may already be gone.
  }

  try {
    const notificationId = `${CALL_NOTIFICATION_PREFIX}${callId}`;
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // The scheduled notification may already have fired or been cancelled.
  }
}

export const dismissIncomingCallNotification = dismissCallSystemNotification;

export async function refreshCallSystemNotification(callId?: string | null) {
  const id = text(callId);
  if (!id) return;
  const existing = persistentCallNotifications.get(id);
  if (!existing) return;
  await showOngoingCallSystemNotification(existing.payload);
}

export async function refreshAllCallSystemNotifications() {
  const activeCalls = Array.from(persistentCallNotifications.values());
  await Promise.all(activeCalls.map((entry) => showOngoingCallSystemNotification(entry.payload)));
}

export function subscribeSystemNotificationResponses(
  handler: (response: SystemNotificationResponse) => void
) {
  let active = true;
  let subscription: { remove: () => void } | null = null;

  const processResponse = (response: ExpoNotifications.NotificationResponse | null) => {
    if (!active || !response) return;
    const notificationId = response.notification.request.identifier;
    const key = `${notificationId}:${response.actionIdentifier}`;
    const now = Date.now();
    const handledAt = handledResponseKeys.get(key);
    if (handledAt && now - handledAt < RESPONSE_DEDUP_TTL_MS) return;
    handledResponseKeys.set(key, now);
    handledResponseKeys.forEach((timestamp, handledKey) => {
      if (now - timestamp > RESPONSE_DEDUP_TTL_MS) {
        handledResponseKeys.delete(handledKey);
      }
    });

    handler({
      actionIdentifier: response.actionIdentifier,
      notificationId,
      data: response.notification.request.content.data ?? {},
    });
  };

  void loadNotifications().then((Notifications) => {
    if (!Notifications || !active) return;
    processResponse(Notifications.getLastNotificationResponse());
    subscription = Notifications.addNotificationResponseReceivedListener(processResponse);
  });

  return () => {
    active = false;
    subscription?.remove();
  };
}
