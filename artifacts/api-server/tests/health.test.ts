import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

// Mock infrastructure
vi.mock('../src/infrastructure/database.js', () => ({
  prisma: { user: { count: vi.fn().mockResolvedValue(0) } },
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
}));

vi.mock('../src/infrastructure/redis.js', () => ({
  getRedis: vi.fn(),
  isRedisAvailable: vi.fn().mockReturnValue(false),
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
}));

vi.mock('../src/engine/baileys.manager.js', () => ({
  baileysManager: {
    on: vi.fn(),
    emit: vi.fn(),
    getActiveSessionCount: vi.fn().mockReturnValue(0),
  },
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Health endpoint', () => {
  it('GET /api/healthz returns 200', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/healthz',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.app).toBe('Nexora Connect Engine');
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/nonexistent',
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
