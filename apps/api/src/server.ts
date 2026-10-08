import { app } from './app';
import { env } from './config/env';
import { closeRedisConnection } from './config/redis';

const server = app.listen(env.PORT, () => {
  console.log(`[Server] Webform API running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  console.log(`[Server] Health check endpoint: http://localhost:${env.PORT}/api/health`);
});

const handleShutdown = async (signal: string) => {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    try {
      await closeRedisConnection();
      console.log('[Server] Connections closed. Exiting process.');
      process.exit(0);
    } catch (err) {
      console.error('[Server] Error during shutdown:', err);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds if not closed
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
