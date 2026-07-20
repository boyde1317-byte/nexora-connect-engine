import { EventEmitter } from 'events';
import { BaileysSession } from './baileys.session.js';
import { prisma } from '../infrastructure/database.js';
import { logger } from '../lib/logger.js';
import { SessionStatus } from '@prisma/client';
import { NotFoundError, SessionError } from '../lib/errors.js';
import { env } from '../config/env.js';
import type { BaileysSessionOptions } from './types.js';

/**
 * BaileysManager — Central manager for all active WhatsApp sessions.
 * Singleton that owns the lifecycle of every BaileysSession instance.
 */
export class BaileysManager extends EventEmitter {
  private readonly sessions = new Map<string, BaileysSession>();
  private readonly log = logger.child({ component: 'BaileysManager' });

  constructor() {
    super();
    this.setMaxListeners(200);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async startSession(sessionId: string): Promise<BaileysSession> {
    // Already running
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.log.debug({ sessionId }, 'Session already active');
      return existing;
    }

    const dbSession = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!dbSession) throw new NotFoundError('Session', sessionId);

    const session = new BaileysSession({
      sessionId: dbSession.id,
      userId: dbSession.userId,
      usePairingCode: dbSession.connectionType === 'PAIRING_CODE',
      phoneNumber: dbSession.phoneNumber ?? undefined,
    });

    // Bubble session events to the manager
    for (const event of [
      'session:status_changed',
      'session:qr_updated',
      'session:pairing_code',
      'session:connected',
      'session:disconnected',
      'session:error',
      'messages',
    ] as const) {
      session.on(event, (data: unknown) => this.emit(event, data));
    }

    this.sessions.set(sessionId, session);

    try {
      await session.start();
      this.log.info({ sessionId }, 'Session started');
      return session;
    } catch (error) {
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.log.debug({ sessionId }, 'Session not active, nothing to stop');
      return;
    }

    try {
      await session.stop();
    } finally {
      this.sessions.delete(sessionId);
      this.log.info({ sessionId }, 'Session stopped and removed from manager');
    }
  }

  async restartSession(sessionId: string): Promise<BaileysSession> {
    await this.stopSession(sessionId);
    return this.startSession(sessionId);
  }

  getSession(sessionId: string): BaileysSession | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  isSessionActive(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async requestPairingCode(sessionId: string, phoneNumber: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Start session first for pairing
      const started = await this.startSession(sessionId);
      // Give socket a moment to initialize
      await new Promise((r) => setTimeout(r, 2000));
      return started.requestPairingCode(phoneNumber);
    }
    return session.requestPairingCode(phoneNumber);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async resumePersistedSessions(): Promise<void> {
    const activeSessions = await prisma.session.findMany({
      where: {
        status: {
          in: [SessionStatus.CONNECTED, SessionStatus.CONNECTING, SessionStatus.QR_PENDING],
        },
      },
      select: { id: true, userId: true, name: true },
    });

    if (activeSessions.length === 0) {
      this.log.info('No persisted sessions to resume');
      return;
    }

    this.log.info({ count: activeSessions.length }, 'Resuming persisted sessions');

    const chunks = chunkArray(activeSessions, 5);
    for (const chunk of chunks) {
      await Promise.allSettled(
        chunk.map((s) =>
          this.startSession(s.id).catch((err) => {
            this.log.error({ err, sessionId: s.id }, 'Failed to resume session');
          }),
        ),
      );
    }

    this.log.info({ resumed: this.sessions.size }, 'Sessions resumed');
  }

  async shutdown(): Promise<void> {
    this.log.info({ count: this.sessions.size }, 'Shutting down all sessions');

    await Promise.allSettled(
      Array.from(this.sessions.keys()).map((id) => this.stopSession(id)),
    );

    this.log.info('All sessions shut down');
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Singleton instance
export const baileysManager = new BaileysManager();
