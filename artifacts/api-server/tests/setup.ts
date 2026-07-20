import { beforeAll, afterAll } from 'vitest';

// Set test environment variables before importing anything
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://test:test@localhost:5432/nexora_test';
process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-at-least-32-characters-long';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-at-least-32-characters-long';
process.env['WEBHOOK_SIGNING_SECRET'] = 'test-webhook-signing-secret-at-least-32-characters-long';
process.env['LOG_LEVEL'] = 'fatal';
process.env['LOG_PRETTY'] = 'false';

beforeAll(async () => {
  // Global test setup
});

afterAll(async () => {
  // Global test teardown
});
