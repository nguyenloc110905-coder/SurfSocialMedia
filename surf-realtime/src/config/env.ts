import 'dotenv/config';

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const splitCsv = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const env = {
  port: numberFromEnv(process.env.PORT, 4100),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  frontendOrigins: splitCsv(process.env.FRONTEND_URL),
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  presenceTtlSeconds: numberFromEnv(process.env.PRESENCE_TTL_SECONDS, 60),
  inboxLimit: numberFromEnv(process.env.INBOX_LIMIT, 20),
  messageLimit: numberFromEnv(process.env.MESSAGE_LIMIT, 30),
};
