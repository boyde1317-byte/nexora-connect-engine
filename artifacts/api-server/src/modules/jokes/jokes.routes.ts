import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import * as c from './jokes.controller.js';

/**
 * Jokes routes — public endpoints for fetching jokes with caching.
 */
export async function jokesRoutes(fastify: FastifyInstance) {
  // Public routes (no auth required)
  fastify.get('/random', c.getRandomJoke);
  fastify.get('/random/:category', c.getJokeByCategory);

  // Admin routes
  fastify.post(
    '/clear-cache',
    { preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')] },
    c.clearJokesCache,
  );
}
