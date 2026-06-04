import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'cache_';
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export type CachedPost = {
  id: string;
  content: string;
  mediaUrls: string[];
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  likes: number;
  comments: number;
  liked: boolean;
};

export type CachedMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type?: 'text' | 'image' | 'file' | 'audio' | 'call_log';
  text: string;
  mediaUrl: string | null;
  fileName?: string;
  createdAt: string;
  senderName: string;
  senderAvatarUrl: string | null;
  editedAt?: string;
  isForwarded?: boolean;
  isRecalled?: boolean;
  recalledForEveryone?: boolean;
  pinnedBy?: string[];
  reactions?: Record<string, Record<string, { uid: string; name: string; avatarUrl: string | null }>>;
  callMode?: 'audio' | 'video';
  callOutcome?: 'completed' | 'missed' | 'declined' | 'busy' | 'failed' | 'ended' | 'started';
  durationSeconds?: number;
};

function getCachedMessageCreatedAtMs(message: CachedMessage): number {
  const timestamp = new Date(message.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function uniqueCachedMessages(messages: CachedMessage[]): CachedMessage[] {
  const byId = new Map<string, CachedMessage>();
  messages.forEach(message => {
    if (!message?.id) return;
    const existing = byId.get(message.id);
    byId.set(message.id, existing ? { ...existing, ...message } : message);
  });

  return Array.from(byId.values()).sort(
    (a, b) => getCachedMessageCreatedAtMs(b) - getCachedMessageCreatedAtMs(a)
  );
}

function getCacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

async function setItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(getCacheKey(key), value);
}

async function getItem(key: string): Promise<string | null> {
  return await AsyncStorage.getItem(getCacheKey(key));
}

async function removeItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(getCacheKey(key));
}

async function setItemWithExpiry(key: string, value: string, expiryMs: number = CACHE_EXPIRY_MS): Promise<void> {
  const data = {
    value,
    expiry: Date.now() + expiryMs,
  };
  await setItem(key, JSON.stringify(data));
}

async function getItemWithExpiry(key: string): Promise<string | null> {
  const item = await getItem(key);
  if (!item) return null;

  try {
    const data = JSON.parse(item) as { value: string; expiry: number };
    if (Date.now() > data.expiry) {
      await removeItem(key);
      return null;
    }
    return data.value;
  } catch {
    await removeItem(key);
    return null;
  }
}

// Feed cache
export const feedCache = {
  setPosts: async (posts: CachedPost[]): Promise<void> => {
    await setItemWithExpiry('feed_posts', JSON.stringify(posts));
  },

  getPosts: async (): Promise<CachedPost[] | null> => {
    const cached = await getItemWithExpiry('feed_posts');
    if (!cached) return null;
    try {
      return JSON.parse(cached) as CachedPost[];
    } catch {
      return null;
    }
  },

  clearPosts: async (): Promise<void> => {
    await removeItem('feed_posts');
  },
};

// Messages cache per conversation
export const messagesCache = {
  setMessages: async (conversationId: string, messages: CachedMessage[]): Promise<void> => {
    const key = `messages_${conversationId}`;
    const unique = uniqueCachedMessages(messages);
    console.log('💾 Saving to cache key:', key, 'messages:', unique.length);
    await setItemWithExpiry(key, JSON.stringify(unique));
  },

  getMessages: async (conversationId: string): Promise<CachedMessage[] | null> => {
    const key = `messages_${conversationId}`;
    console.log('📦 Reading from cache key:', key);
    const cached = await getItemWithExpiry(key);
    if (!cached) {
      console.log('📦 Cache miss for key:', key);
      return null;
    }
    try {
      const parsed = uniqueCachedMessages(JSON.parse(cached) as CachedMessage[]);
      console.log('📦 Cache hit for key:', key, 'messages:', parsed.length);
      return parsed;
    } catch (e) {
      console.log('📦 Cache parse error for key:', key, e);
      return null;
    }
  },

  addMessage: async (conversationId: string, message: CachedMessage): Promise<void> => {
    const existing = (await messagesCache.getMessages(conversationId)) || [];
    const updated = uniqueCachedMessages([message, ...existing]);
    await setItemWithExpiry(`messages_${conversationId}`, JSON.stringify(updated));
  },

  removeMessage: async (conversationId: string, messageId: string): Promise<void> => {
    const existing = (await messagesCache.getMessages(conversationId)) || [];
    const updated = existing.filter((item) => item.id !== messageId);
    await setItemWithExpiry(`messages_${conversationId}`, JSON.stringify(updated));
  },

  clearConversation: async (conversationId: string): Promise<void> => {
    await removeItem(`messages_${conversationId}`);
  },

  clearAll: async (): Promise<void> => {
    const allKeys = await AsyncStorage.getAllKeys();
    const messageKeys = allKeys.filter((key) => key.startsWith(`${CACHE_PREFIX}messages_`));
    await AsyncStorage.multiRemove(messageKeys);
  },
};

// Clear all cache
export const clearAllCache = async (): Promise<void> => {
  const allKeys = await AsyncStorage.getAllKeys();
  const cacheKeys = allKeys.filter((key) => key.startsWith(CACHE_PREFIX));
  await AsyncStorage.multiRemove(cacheKeys);
};
