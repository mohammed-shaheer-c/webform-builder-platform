import Redis from 'ioredis';
import { env } from './env';

let redisInstance: Redis | null = null;

/**
 * Returns connection options formatted for BullMQ and Redis clients.
 */
export function getRedisConnectionOptions() {
  try {
    const parsed = new URL(env.REDIS_URL);
    return {
      host: parsed.hostname || 'localhost',
      port: Number(parsed.port || 6379),
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}

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
