import { buildApp } from './app.js';
import { env } from './config/env.js';
import { createSocketServer } from './realtime/socket.js';

const bootstrap = async () => {
  const app = await buildApp();
  await createSocketServer(app);

  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
    app.log.info(`realtime service listening at http://0.0.0.0:${env.port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

bootstrap();
