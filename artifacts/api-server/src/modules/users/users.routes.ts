import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import * as c from './users.controller.js';

export async function usersRoutes(fastify: FastifyInstance) {
  // Me endpoints
  fastify.get('/me', { preHandler: authenticate }, c.getMe);
  fastify.patch('/me', { preHandler: authenticate }, c.updateMe);
  fastify.post('/me/change-password', { preHandler: authenticate }, c.changeMyPassword);

  // API Keys
  fastify.get('/me/api-keys', { preHandler: authenticate }, c.listApiKeys);
  fastify.post('/me/api-keys', { preHandler: authenticate }, c.createApiKey);
  fastify.delete('/me/api-keys/:keyId', { preHandler: authenticate }, c.revokeApiKey);

  // Admin-only: manage all users
  fastify.get(
    '/',
    { preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')] },
    c.listUsers,
  );
  fastify.post(
    '/',
    { preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')] },
    c.createUser,
  );
  fastify.get(
    '/:id',
    { preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')] },
    c.getUser,
  );
  fastify.patch(
    '/:id',
    { preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')] },
    c.updateUser,
  );
  fastify.delete(
    '/:id',
    { preHandler: [authenticate, requireRole('SUPER_ADMIN')] },
    c.deleteUser,
  );
}
