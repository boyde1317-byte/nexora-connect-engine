import Redis, { type RedisOptions } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

let redisClient: Redis | null = null;
let redisAvailable = false;

function createRedisClient(): Redis {
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    reconnectOnError: (err) => {
      logger.warn({ err: err.message }, 'Redis reconnecting on error');
      return true;
    },
    retryStrategy: (times) => {
      if (times > 3) {
        logger.warn({ times }, 'Redis max retries reached, giving up');
        return null;
      }
      return Math.min(times * 1000, 3000);
    },
  };

  if (env.REDIS_PASSWORD) {
    options.password = env.REDIS_PASSWORD;
  }

  if (env.REDIS_TLS) {
    options.tls = {};
  }

  const client = new Redis(env.REDIS_URL, options);

  client.on('connect', () => {
    redisAvailable = true;
    logger.info('Redis connected');
  });

  client.on('ready', () => {
    redisAvailable = true;
    logger.info('Redis ready');
  });

  client.on('error', (err) => {
    redisAvailable = false;
    logger.warn({ err: err.message }, 'Redis error — continuing without cache');
  });

  client.on('close', () => {
    redisAvailable = false;
    logger.warn('Redis connection closed');
  });

  return client;
}

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export async function connectRedis(): Promise<void> {
  try {
    const client = getRedis();
    await client.ping();
    redisAvailable = true;
    logger.info('Redis ping successful');
  } catch (error) {
    redisAvailable = false;
    logger.warn({ err: error }, 'Redis not available — running without cache');
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisAvailable = false;
    logger.info('Redis disconnected');
  }
}
