import { Queue, type ConnectionOptions } from 'bullmq';
import { env } from '../../config/env.js';
import { QUEUE_NAMES } from '../../config/constants.js';
import { logger } from '../../lib/logger.js';

let connection: ConnectionOptions | null = null;

function getConnection(): ConnectionOptions {
  if (!connection) {
    connection = {
      host: new URL(env.REDIS_URL).hostname,
      port: Number(new URL(env.REDIS_URL).port) || 6379,
      password: env.REDIS_PASSWORD || undefined,
      tls: env.REDIS_TLS ? {} : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
  return connection;
}

// ─── Queue instances ──────────────────────────────────────────────────────────

let sessionConnectQueue: Queue | null = null;
let sessionDisconnectQueue: Queue | null = null;
let sessionReconnectQueue: Queue | null = null;
let webhookQueue: Queue | null = null;

export function getSessionConnectQueue(): Queue {
  if (!sessionConnectQueue) {
    sessionConnectQueue = new Queue(QUEUE_NAMES.SESSION_CONNECT, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
    logger.info({ queue: QUEUE_NAMES.SESSION_CONNECT }, 'Queue initialized');
  }
  return sessionConnectQueue;
}

export function getSessionDisconnectQueue(): Queue {
  if (!sessionDisconnectQueue) {
    sessionDisconnectQueue = new Queue(QUEUE_NAMES.SESSION_DISCONNECT, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 1000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return sessionDisconnectQueue;
}

export function getSessionReconnectQueue(): Queue {
  if (!sessionReconnectQueue) {
    sessionReconnectQueue = new Queue(QUEUE_NAMES.SESSION_RECONNECT, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: env.SESSION_MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: env.SESSION_RECONNECT_DELAY,
        },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return sessionReconnectQueue;
}

export function getWebhookQueue(): Queue {
  if (!webhookQueue) {
    webhookQueue = new Queue(QUEUE_NAMES.WEBHOOK_DELIVERY, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: env.WEBHOOK_MAX_RETRIES,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return webhookQueue;
}

// ─── Job helpers ──────────────────────────────────────────────────────────────

export async function enqueueSessionConnect(sessionId: string, delay = 0): Promise<void> {
  try {
    await getSessionConnectQueue().add(
      'connect',
      { sessionId },
      { delay, jobId: `connect:${sessionId}` },
    );
  } catch (err) {
    logger.warn({ err, sessionId }, 'Failed to enqueue session connect — BullMQ unavailable');
  }
}

export async function enqueueSessionDisconnect(sessionId: string): Promise<void> {
  try {
    await getSessionDisconnectQueue().add(
      'disconnect',
      { sessionId },
      { jobId: `disconnect:${sessionId}` },
    );
  } catch (err) {
    logger.warn({ err, sessionId }, 'Failed to enqueue session disconnect');
  }
}

export async function enqueueSessionReconnect(
  sessionId: string,
  delay = 5000,
): Promise<void> {
  try {
    await getSessionReconnectQueue().add(
      'reconnect',
      { sessionId },
      { delay, jobId: `reconnect:${sessionId}:${Date.now()}` },
    );
  } catch (err) {
    logger.warn({ err, sessionId }, 'Failed to enqueue session reconnect');
  }
}

export async function enqueueWebhook(
  sessionId: string,
  event: string,
  payload: unknown,
  webhookUrl: string,
): Promise<void> {
  try {
    await getWebhookQueue().add('deliver', { sessionId, event, payload, webhookUrl });
  } catch (err) {
    logger.warn({ err, sessionId }, 'Failed to enqueue webhook delivery');
  }
}
