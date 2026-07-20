import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES } from '../../../config/constants.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import { BaileysManager } from '../../../engine/baileys.manager.js';

interface SessionJobData {
  sessionId: string;
}

const connection = {
  host: new URL(env.REDIS_URL).hostname,
  port: Number(new URL(env.REDIS_URL).port) || 6379,
  password: env.REDIS_PASSWORD || undefined,
  tls: env.REDIS_TLS ? {} : undefined,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};

export function createSessionWorkers(manager: BaileysManager): Worker[] {
  const workers: Worker[] = [];

  // ─── Connect Worker ───────────────────────────────────────────────────────
  const connectWorker = new Worker<SessionJobData>(
    QUEUE_NAMES.SESSION_CONNECT,
    async (job: Job<SessionJobData>) => {
      const { sessionId } = job.data;
      const workerLog = logger.child({ sessionId, jobId: job.id, worker: 'connect' });

      workerLog.info('Processing session connect job');

      try {
        await manager.startSession(sessionId);
        workerLog.info('Session connect job completed');
      } catch (error) {
        workerLog.error({ err: error }, 'Session connect job failed');
        throw error;
      }
    },
    { connection, concurrency: 10 },
  );

  // ─── Disconnect Worker ────────────────────────────────────────────────────
  const disconnectWorker = new Worker<SessionJobData>(
    QUEUE_NAMES.SESSION_DISCONNECT,
    async (job: Job<SessionJobData>) => {
      const { sessionId } = job.data;
      const workerLog = logger.child({ sessionId, jobId: job.id, worker: 'disconnect' });

      workerLog.info('Processing session disconnect job');

      try {
        await manager.stopSession(sessionId);
        workerLog.info('Session disconnect job completed');
      } catch (error) {
        workerLog.error({ err: error }, 'Session disconnect job failed');
        throw error;
      }
    },
    { connection, concurrency: 20 },
  );

  // ─── Reconnect Worker ─────────────────────────────────────────────────────
  const reconnectWorker = new Worker<SessionJobData>(
    QUEUE_NAMES.SESSION_RECONNECT,
    async (job: Job<SessionJobData>) => {
      const { sessionId } = job.data;
      const workerLog = logger.child({ sessionId, jobId: job.id, worker: 'reconnect' });

      workerLog.info({ attempt: job.attemptsMade }, 'Processing session reconnect job');

      try {
        const session = manager.getSession(sessionId);
        if (session) {
          await manager.stopSession(sessionId);
        }
        await manager.startSession(sessionId);
        workerLog.info('Session reconnect job completed');
      } catch (error) {
        workerLog.error({ err: error }, 'Session reconnect job failed');
        throw error;
      }
    },
    { connection, concurrency: 5 },
  );

  for (const worker of [connectWorker, disconnectWorker, reconnectWorker]) {
    worker.on('completed', (job) => {
      logger.debug({ jobId: job.id, queue: job.queueName }, 'Job completed');
    });

    worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, queue: job?.queueName, err }, 'Job failed');
    });

    worker.on('error', (err) => {
      logger.error({ err }, 'Worker error');
    });

    workers.push(worker);
  }

  logger.info(`Session workers initialized (connect, disconnect, reconnect)`);
  return workers;
}
