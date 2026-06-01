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
  text: string;
  mediaUrl: string | null;
  createdAt: string;
  senderName: string;
  senderAvatarUrl: string | null;
};

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
    console.log('💾 Saving to cache key:', key, 'messages:', messages.length);
    await setItemWithExpiry(key, JSON.stringify(messages));
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
      const parsed = JSON.parse(cached) as CachedMessage[];
      console.log('📦 Cache hit for key:', key, 'messages:', parsed.length);
      return parsed;
    } catch (e) {
      console.log('📦 Cache parse error for key:', key, e);
      return null;
    }
  },

  addMessage: async (conversationId: string, message: CachedMessage): Promise<void> => {
    const existing = (await messagesCache.getMessages(conversationId)) || [];
    const updated = [...existing, message].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
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
