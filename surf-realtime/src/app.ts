import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { registerMessageRoutes } from './routes/messages.js';

export const buildApp = async () => {
  const app = Fastify({
    logger: {
      level: env.nodeEnv === 'production' ? 'info' : 'debug',
    },
  });

  await app.register(cors, {
    origin: env.frontendOrigins.length > 0 ? env.frontendOrigins : true,
    credentials: true,
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  }));

  await registerMessageRoutes(app);
  return app;
};
