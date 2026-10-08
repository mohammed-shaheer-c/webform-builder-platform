import Redis from 'ioredis';
import { env } from './env';

let redisInstance: Redis | null = null;

/**
 * Returns a singleton Redis client instance.
 * Configured with lazyConnect to prevent connection blocking on startup.
 */
export const getRedisClient = (): Redis => {
  if (!redisInstance) {
    redisInstance = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      retryStrategy(times) {
        // Retry with backoff, max 2 seconds
        const delay = Math.min(times * 100, 2000);
        return delay;
      },
      maxRetriesPerRequest: null,
    });

    redisInstance.on('error', (err) => {
      // Log connection error without crashing the process
      console.warn(`[Redis] Connection warning: ${err.message}`);
    });

    redisInstance.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });
  }

  return redisInstance;
};

export const closeRedisConnection = async (): Promise<void> => {
  if (redisInstance) {
    await redisInstance.quit().catch(() => redisInstance?.disconnect());
    redisInstance = null;
  }
};
