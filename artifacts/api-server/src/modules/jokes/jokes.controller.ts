import type { FastifyRequest, FastifyReply } from 'fastify';
import { jokesService } from './jokes.service.js';
import { randomJokeQuerySchema } from './jokes.schema.js';
import { logger } from '../../lib/logger.js';

const log = logger.child({ component: 'JokesController' });

/**
 * GET /api/jokes/random
 * Fetch a random joke with optional filtering.
 */
export async function getRandomJoke(request: FastifyRequest, reply: FastifyReply) {
  const query = randomJokeQuerySchema.parse(request.query);

  try {
    const joke = await jokesService.getRandomJoke({
      category: query.category as any,
      type: query.type as any,
      safe: query.safe,
    });

    log.debug(
      { category: query.category, type: query.type, safe: query.safe },
      'Joke retrieved successfully',
    );

    return reply.send({
      success: true,
      data: joke,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ err: error, query }, 'Failed to fetch random joke');
    throw error;
  }
}

/**
 * GET /api/jokes/random/:category
 * Fetch a random joke from a specific category.
 */
export async function getJokeByCategory(
  request: FastifyRequest<{ Params: { category: string } }>,
  reply: FastifyReply,
) {
  const { category } = request.params;

  // Validate category
  const validCategories = ['General', 'Programming', 'Knock-Knock', 'Custom'];
  if (!validCategories.includes(category)) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'INVALID_CATEGORY',
        message: `Category must be one of: ${validCategories.join(', ')}`,
      },
    });
  }

  try {
    const joke = await jokesService.getRandomJoke({
      category: category as any,
    });

    log.debug({ category }, 'Joke by category retrieved successfully');

    return reply.send({
      success: true,
      data: joke,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ err: error, category }, 'Failed to fetch joke by category');
    throw error;
  }
}

/**
 * POST /api/jokes/clear-cache
 * Clear the jokes cache (admin only).
 */
export async function clearJokesCache(request: FastifyRequest, reply: FastifyReply) {
  const isAdmin = request.user && ['ADMIN', 'SUPER_ADMIN'].includes(request.user.role);
  if (!isAdmin) {
    return reply.status(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Only admins can clear the jokes cache',
      },
    });
  }

  try {
    await jokesService.clearCache();
    log.info({ userId: request.user?.id }, 'Jokes cache cleared by admin');

    return reply.send({
      success: true,
      message: 'Jokes cache cleared successfully',
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to clear jokes cache');
    throw error;
  }
}
