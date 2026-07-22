import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.middleware.js';
import * as c from './auth.controller.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', c.register);
  fastify.post('/login', c.login);
  fastify.post('/refresh', c.refreshToken);
  fastify.post('/logout', c.logout);
  fastify.post('/logout-all', { preHandler: authenticate }, c.logoutAll);
  // GET /auth/me removed — use GET /users/me instead (identical response, avoids duplication)
}
