import { createClient } from 'redis';

type AppRedisClient = ReturnType<typeof createClient>;

let redisClient: AppRedisClient | null = null;
export const initRedis = async (): Promise<void> => {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('Redis url is empty, continue without Redis');
    return;
  }
  if (redisClient) return;
  const client = createClient({ url });
  client.on('error', (err) => console.error('Redis Client Error', err));
  await client.connect();
  redisClient = client;
  console.log('Connected to Redis');
};

export const getRedis = (): AppRedisClient | null => redisClient;
