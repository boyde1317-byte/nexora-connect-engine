import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import * as c from './sessions.controller.js';

export async function sessionsRoutes(fastify: FastifyInstance) {
  // Stats
  fastify.get('/stats', { preHandler: authenticate }, c.getSessionStats);
  fastify.get(
    '/system-stats',
    { preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')] },
    c.getSystemStats,
  );

  // CRUD
  fastify.post('/', { preHandler: authenticate }, c.createSession);
  fastify.get('/', { preHandler: authenticate }, c.listSessions);
  fastify.get('/:id', { preHandler: authenticate }, c.getSession);
  fastify.patch('/:id', { preHandler: authenticate }, c.updateSession);
  fastify.delete('/:id', { preHandler: authenticate }, c.deleteSession);

  // Lifecycle
  fastify.post('/:id/connect', { preHandler: authenticate }, c.connectSession);
  fastify.post('/:id/disconnect', { preHandler: authenticate }, c.disconnectSession);
  fastify.post('/:id/restart', { preHandler: authenticate }, c.restartSession);

  // QR / Pairing
  fastify.get('/:id/qr', { preHandler: authenticate }, c.getQrCode);
  fastify.post('/:id/pairing-code', { preHandler: authenticate }, c.getPairingCode);

  // Events
  fastify.get('/:id/events', { preHandler: authenticate }, c.getSessionEvents);
}
