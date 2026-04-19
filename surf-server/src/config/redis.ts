import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { Server } from 'socket.io';

type AppRedisClient = ReturnType<typeof createClient>;

let redisClient: AppRedisClient | null = null;

const createRedisConnection = (): AppRedisClient | null => {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const client = createClient({ url });
  client.on('error', (err: Error) => console.error('Redis Client Error', err));
  return client;
};

export const initRedis = async (): Promise<void> => {
  if (!process.env.REDIS_URL) {
    console.warn('Redis url is empty, continue without Redis');
    return;
  }
  if (redisClient) return;

  const client = createRedisConnection();
  if (!client) return;

  await client.connect();
  redisClient = client;
  console.log('Connected to Redis');
};

export const getRedis = (): AppRedisClient | null => redisClient;

export const initSocketRedisAdapter = async (io: Server): Promise<void> => {
  if (!process.env.REDIS_URL) return;

  const pubClient = redisClient ?? createRedisConnection();
  if (!pubClient) return;

  if (!pubClient.isOpen) {
    await pubClient.connect();
  }

  if (!redisClient) {
    redisClient = pubClient;
  }

  const subClient = pubClient.duplicate();
  subClient.on('error', (err: Error) => console.error('Redis Sub Client Error', err));
  await subClient.connect();

  io.adapter(createAdapter(pubClient, subClient));
  console.log('Socket.IO Redis adapter enabled');
};
