import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { isAppError } from './lib/errors.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { sessionsRoutes } from './modules/sessions/sessions.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // ─── Swagger / OpenAPI ─────────────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Nexora Connect Engine API',
        description:
          'Production-grade backend platform for managing WhatsApp sessions via Baileys',
        version: env.APP_VERSION,
        contact: { name: 'Nexora', url: 'https://nexora.io' },
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        },
      },
      tags: [
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Users', description: 'User management' },
        { name: 'Sessions', description: 'WhatsApp session lifecycle management' },
        { name: 'Health', description: 'System health and monitoring' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: `${env.BASE_PATH}/docs`,
    uiConfig: { docExpansion: 'list', deepLinking: false },
  });

  // ─── Security ──────────────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-request-id'],
    credentials: true,
  });

  // ─── Rate Limiting ─────────────────────────────────────────────────────────
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    errorResponseBuilder: () => ({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded' },
    }),
  });

  // ─── Health Check ──────────────────────────────────────────────────────────
  app.get(`${env.BASE_PATH}/healthz`, async (_request, reply) => {
    return reply.send({
      status: 'ok',
      app: env.APP_NAME,
      version: env.APP_VERSION,
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // ─── Routes ────────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: `${env.BASE_PATH}/auth` });
  await app.register(usersRoutes, { prefix: `${env.BASE_PATH}/users` });
  await app.register(sessionsRoutes, { prefix: `${env.BASE_PATH}/sessions` });

  // ─── 404 Handler ──────────────────────────────────────────────────────────
  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // ─── Global Error Handler ─────────────────────────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.flatten().fieldErrors,
        },
      });
    }

    if (isAppError(error)) {
      if (error.statusCode >= 500) {
        logger.error({ err: error, requestId }, error.message);
      }
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      });
    }

    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests' },
      });
    }

    const unknownErr = error as Error;
    logger.error({ err: unknownErr, requestId }, 'Unhandled error');
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: env.NODE_ENV === 'production' ? 'Internal server error' : unknownErr.message,
      },
    });
  });

  return app;
}
