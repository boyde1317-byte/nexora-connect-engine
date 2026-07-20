import { sessionEventsRepository } from './session-events.repository.js';
import { prisma } from '../../infrastructure/database.js';
import { logger } from '../../lib/logger.js';
import { enqueueWebhook } from '../../infrastructure/queue/queues.js';
import type { SessionEventType } from '../../engine/types.js';

/**
 * SessionEventsService — append-only audit log for session lifecycle.
 *
 * Every logged event is also forwarded to the session's configured
 * webhook URL (if any) via the WEBHOOK_DELIVERY queue. Failures are
 * logged and swallowed so that a broken audit/webhook path never
 * disrupts the live WhatsApp session.
 */
export class SessionEventsService {
  async log(
    sessionId: string,
    type: SessionEventType,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await sessionEventsRepository.log(sessionId, type, payload);
    } catch (err) {
      logger.warn({ err, sessionId, type }, 'Failed to persist session event');
    }

    // Best-effort webhook fan-out — non-blocking.
    void this.dispatchWebhook(sessionId, type, payload).catch((err) => {
      logger.warn({ err, sessionId, type }, 'Webhook dispatch failed');
    });
  }

  private async dispatchWebhook(
    sessionId: string,
    type: SessionEventType,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { webhookUrl: true },
    });
    const url = session?.webhookUrl;
    if (!url) return;

    await enqueueWebhook(sessionId, type, payload ?? {}, url);
  }
}

export const sessionEventsService = new SessionEventsService();