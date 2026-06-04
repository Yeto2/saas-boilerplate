import { buildApp } from './app.js';
import { env } from './config/env.js';

async function main(): Promise<void> {
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`SaaS API listening on http://${env.HOST}:${env.PORT}`);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
