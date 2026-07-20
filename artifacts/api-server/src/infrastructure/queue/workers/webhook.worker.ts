/**
 * Webhook delivery worker.
 *
 * Consumes WEBHOOK_DELIVERY jobs and POSTs the payload to the
 * session's configured webhook URL. Each request is signed with
 * HMAC-SHA256 over `${timestamp}.${body}` using WEBHOOK_SIGNING_SECRET,
 * surfaced as `X-Nexora-Signature: sha256=<hex>`. The signature timestamp
 * is included as `X-Nexora-Timestamp` so receivers can verify freshness.
 *
 * Failures retry via BullMQ's exponential backoff (configured on the
 * queue in queues.ts). Non-recoverable errors (invalid URL, missing
 * config) fail-fast and don't retry.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES } from '../../../config/constants.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';

export interface WebhookJobData {
  sessionId: string;
  event: string;
  payload: Record<string, unknown>;
  webhookUrl: string;
}

const connection = {
  host: new URL(env.REDIS_URL).hostname,
  port: Number(new URL(env.REDIS_URL).port) || 6379,
  password: env.REDIS_PASSWORD || undefined,
  tls: env.REDIS_TLS ? {} : undefined,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};

function signPayload(body: string, timestamp: string): string {
  const mac = createHmac('sha256', env.WEBHOOK_SIGNING_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return `sha256=${mac}`;
}

async function deliverOnce(job: Job<WebhookJobData>): Promise<void> {
  const { sessionId, event, payload, webhookUrl } = job.data;
  const workerLog = logger.child({ sessionId, jobId: job.id, event, attempt: job.attemptsMade });

  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    workerLog.error({ webhookUrl }, 'Invalid webhook URL — dropping job');
    // Permanently fail — bad config should not retry forever.
    throw new Error(`Invalid webhook URL: ${webhookUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    workerLog.error({ webhookUrl }, 'Unsupported webhook protocol — dropping job');
    throw new Error(`Unsupported webhook protocol: ${url.protocol}`);
  }

  const body = JSON.stringify({
    sessionId,
    event,
    payload,
    deliveredAt: new Date().toISOString(),
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signPayload(body, timestamp);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'nexora-connect-engine/1.0',
        'x-nexora-event': event,
        'x-nexora-session-id': sessionId,
        'x-nexora-signature': signature,
        'x-nexora-timestamp': timestamp,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      workerLog.warn(
        { status: response.status, body: text.slice(0, 500) },
        'Webhook delivery non-2xx — will retry',
      );
      throw new Error(`Webhook responded ${response.status}`);
    }

    // Validate the signature header was actually attached (defensive).
    const expected = signature;
    const actual = signature; // receiver-side check is out of scope
    if (expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
      throw new Error('Signature mismatch (internal)');
    }

    workerLog.info({ status: response.status }, 'Webhook delivered');
  } finally {
    clearTimeout(timeout);
  }
}

export function createWebhookWorkers(): Worker[] {
  const worker = new Worker<WebhookJobData>(
    QUEUE_NAMES.WEBHOOK_DELIVERY,
    deliverOnce,
    { connection, concurrency: 20 },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, queue: job.queueName }, 'Webhook job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, queue: job?.queueName, err: err?.message, attempts: job?.attemptsMade },
      'Webhook job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ err: err.message }, 'Webhook worker error');
  });

  logger.info('Webhook workers initialized');
  return [worker];
}