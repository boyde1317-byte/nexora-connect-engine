import type { Worker } from 'bullmq';
import { buildApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database.js';
import { connectRedis, disconnectRedis } from './infrastructure/redis.js';
import { baileysManager } from './engine/baileys.manager.js';
import { createSocketGateway } from './gateway/socket.gateway.js';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';

const workers: Worker[] = [];

async function bootstrap() {
  logger.info({ app: env.APP_NAME, version: env.APP_VERSION }, 'Starting Nexora Connect Engine');

  // ── Phase 1: Database ──────────────────────────────────────────────────────
  await connectDatabase();

  // ── Phase 2: Redis (non-fatal — graceful degradation) ─────────────────────
  await connectRedis();

  // ── Phase 3: Build Fastify app ─────────────────────────────────────────────
  const app = await buildApp();

  // ── Phase 4: Socket.IO attached to Fastify's server ───────────────────────
  // Fastify exposes its underlying http.Server via app.server
  createSocketGateway(app.server);

  // ── Phase 5: Queue Workers (requires Redis — optional) ────────────────────
  try {
    const { createSessionWorkers } = await import('./infrastructure/queue/workers/session.worker.js');
    workers.push(...createSessionWorkers(baileysManager));

    const { createWebhookWorkers } = await import('./infrastructure/queue/workers/webhook.worker.js');
    workers.push(...createWebhookWorkers());

    logger.info({ workerCount: workers.length }, 'Queue workers started');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Queue workers skipped — Redis may be unavailable');
  }

  // ── Phase 6: Resume persisted WhatsApp sessions ───────────────────────────
  baileysManager.resumePersistedSessions().catch((err) => {
    logger.warn({ err: (err as Error).message }, 'Failed to resume some persisted sessions');
  });

  // ── Phase 7: Start listening ───────────────────────────────────────────────
  const rawPort = process.env['PORT'];
  const port = rawPort ? Number(rawPort) : env.PORT;

  await app.listen({ port, host: env.HOST });

  logger.info(
    {
      port,
      host: env.HOST,
      docs: `http://0.0.0.0:${port}${env.BASE_PATH}/docs`,
      health: `http://0.0.0.0:${port}${env.BASE_PATH}/healthz`,
    },
    '🚀 Nexora Connect Engine is running',
  );
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received — graceful shutdown starting');

  try {
    if (workers.length > 0) {
      await Promise.allSettled(workers.map((w) => w.close()));
      logger.info({ count: workers.length }, 'Queue workers closed');
    }
    await baileysManager.shutdown();
    await disconnectRedis();
    await disconnectDatabase();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)); });
process.on('SIGINT', () => { shutdown('SIGINT').catch(() => process.exit(1)); });
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — process will exit');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection — process will exit');
  process.exit(1);
});

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start Nexora Connect Engine');
  process.exit(1);
});
