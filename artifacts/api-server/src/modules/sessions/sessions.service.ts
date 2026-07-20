import type { Session } from '@prisma/client';
import { sessionsRepository, type FindSessionsOptions } from './sessions.repository.js';
import { sessionEventsService } from './session-events.service.js';
import { baileysManager } from '../../engine/baileys.manager.js';
import { NotFoundError, ConflictError, SessionError } from '../../lib/errors.js';
import { buildPaginationMeta } from '../../utils/helpers.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../infrastructure/database.js';
import { enqueueSessionConnect, enqueueSessionDisconnect } from '../../infrastructure/queue/queues.js';
import { clearAuthState } from '../../engine/auth-state.js';

export interface CreateSessionInput {
  name: string;
  description?: string;
  connectionType?: 'QR_CODE' | 'PAIRING_CODE';
  phoneNumber?: string;
  webhookUrl?: string;
}

export interface UpdateSessionInput {
  name?: string;
  description?: string;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export class SessionsService {
  async createSession(userId: string, input: CreateSessionInput): Promise<Session> {
    const count = await sessionsRepository.countByUser(userId);
    if (count >= env.MAX_SESSIONS_PER_USER) {
      throw new ConflictError(`Maximum sessions per user (${env.MAX_SESSIONS_PER_USER}) reached`);
    }
    if (input.connectionType === 'PAIRING_CODE' && !input.phoneNumber) {
      throw new SessionError('Phone number required for pairing code connection');
    }
    const session = await sessionsRepository.create({
      name: input.name,
      description: input.description,
      connectionType: input.connectionType ?? 'QR_CODE',
      phoneNumber: input.phoneNumber,
      webhookUrl: input.webhookUrl,
      status: 'DISCONNECTED',
      user: { connect: { id: userId } },
    });
    logger.info({ sessionId: session.id, userId }, 'Session created');
    await sessionEventsService.log(session.id, 'session.created', {
      userId,
      connectionType: session.connectionType,
      phoneNumber: session.phoneNumber ?? null,
    });
    return session;
  }

  async getSession(sessionId: string, userId?: string): Promise<Session> {
    const session = userId
      ? await sessionsRepository.findByIdAndUser(sessionId, userId)
      : await sessionsRepository.findById(sessionId);
    if (!session) throw new NotFoundError('Session', sessionId);
    return session;
  }

  async updateSession(sessionId: string, userId: string, input: UpdateSessionInput): Promise<Session> {
    const session = await sessionsRepository.findByIdAndUser(sessionId, userId);
    if (!session) throw new NotFoundError('Session', sessionId);

    return sessionsRepository.update(sessionId, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.webhookUrl !== undefined && { webhookUrl: input.webhookUrl }),
      // Cast metadata to Prisma's InputJsonValue via unknown
      ...(input.metadata !== undefined && { metadata: input.metadata as unknown as import('@prisma/client').Prisma.InputJsonValue }),
    });
  }

  async deleteSession(sessionId: string, userId: string, isAdmin = false): Promise<void> {
    const session = isAdmin
      ? await sessionsRepository.findById(sessionId)
      : await sessionsRepository.findByIdAndUser(sessionId, userId);
    if (!session) throw new NotFoundError('Session', sessionId);

    if (baileysManager.isSessionActive(sessionId)) {
      await baileysManager.stopSession(sessionId);
    }
    await clearAuthState(sessionId);
    await sessionEventsService.log(sessionId, 'session.deleted', { userId });
    await sessionsRepository.delete(sessionId);
    logger.info({ sessionId, userId }, 'Session deleted');
  }

  async listSessions(userId: string, options: FindSessionsOptions, isAdmin = false) {
    const queryOptions: FindSessionsOptions = isAdmin ? options : { ...options, userId };
    const { sessions, total } = await sessionsRepository.findMany(queryOptions);
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const enriched = sessions.map((s) => ({ ...s, isActive: baileysManager.isSessionActive(s.id) }));
    return { data: enriched, meta: buildPaginationMeta(total, page, pageSize) };
  }

  async connectSession(sessionId: string, userId: string): Promise<{ message: string }> {
    const session = await sessionsRepository.findByIdAndUser(sessionId, userId);
    if (!session) throw new NotFoundError('Session', sessionId);
    if (baileysManager.isSessionActive(sessionId)) throw new ConflictError('Session is already active');

    const enqueued = await enqueueSessionConnect(sessionId).then(() => true).catch(() => false);
    if (!enqueued) {
      baileysManager.startSession(sessionId).catch((err: unknown) => {
        logger.error({ err, sessionId }, 'Direct session start failed');
      });
    }
    return { message: 'Session connection initiated' };
  }

  async disconnectSession(sessionId: string, userId: string): Promise<void> {
    const session = await sessionsRepository.findByIdAndUser(sessionId, userId);
    if (!session) throw new NotFoundError('Session', sessionId);
    const enqueued = await enqueueSessionDisconnect(sessionId).then(() => true).catch(() => false);
    if (!enqueued) await baileysManager.stopSession(sessionId);
  }

  async restartSession(sessionId: string, userId: string): Promise<{ message: string }> {
    const session = await sessionsRepository.findByIdAndUser(sessionId, userId);
    if (!session) throw new NotFoundError('Session', sessionId);
    await baileysManager.stopSession(sessionId);
    const enqueued = await enqueueSessionConnect(sessionId, 1000).then(() => true).catch(() => false);
    if (!enqueued) { baileysManager.startSession(sessionId).catch(() => {}); }
    return { message: 'Session restart initiated' };
  }

  async requestQrCode(sessionId: string, userId: string): Promise<Session> {
    const session = await sessionsRepository.findByIdAndUser(sessionId, userId);
    if (!session) throw new NotFoundError('Session', sessionId);
    if (session.status === 'CONNECTED') throw new ConflictError('Session is already connected');
    if (!baileysManager.isSessionActive(sessionId)) await this.connectSession(sessionId, userId);
    return (await sessionsRepository.findById(sessionId)) as Session;
  }

  async requestPairingCode(sessionId: string, userId: string, phoneNumber: string): Promise<{ pairingCode: string }> {
    const session = await sessionsRepository.findByIdAndUser(sessionId, userId);
    if (!session) throw new NotFoundError('Session', sessionId);
    if (session.status === 'CONNECTED') throw new ConflictError('Session is already connected');
    const code = await baileysManager.requestPairingCode(sessionId, phoneNumber);
    return { pairingCode: code };
  }

  async getSessionStats(userId: string) {
    const { sessions, total } = await sessionsRepository.findMany({ userId });
    const activeCount = sessions.filter((s) => baileysManager.isSessionActive(s.id)).length;
    const byStatus = sessions.reduce<Record<string, number>>((acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    }, {});
    return { total, active: activeCount, byStatus };
  }

  async getSessionEvents(sessionId: string, userId: string, options: { page?: number; pageSize?: number; type?: string } = {}) {
    const session = await sessionsRepository.findByIdAndUser(sessionId, userId);
    if (!session) throw new NotFoundError('Session', sessionId);
    const { events, total } = await sessionsRepository.findEvents(sessionId, options);
    return { data: events, meta: buildPaginationMeta(total, options.page ?? 1, options.pageSize ?? 50) };
  }

  async getSystemStats() {
    const [totalSessions, connectedSessions, totalUsers] = await Promise.all([
      prisma.session.count(),
      prisma.session.count({ where: { status: 'CONNECTED' } }),
      prisma.user.count(),
    ]);
    return {
      sessions: { total: totalSessions, connected: connectedSessions, activeInMemory: baileysManager.getActiveSessionCount() },
      users: { total: totalUsers },
      uptime: process.uptime(),
    };
  }
}

export const sessionsService = new SessionsService();
