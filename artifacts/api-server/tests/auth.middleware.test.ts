import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// ─── Mocks ───────────────────────────────────────────────────────────────────
const apiKeyFindUniqueMock = vi.fn();
const userFindUniqueMock = vi.fn();
const apiKeyUpdateMock = vi.fn();

vi.mock('../src/infrastructure/database.js', () => ({
  prisma: {
    apiKey: {
      findUnique: (...args: unknown[]) => apiKeyFindUniqueMock(...args),
      update: (...args: unknown[]) => apiKeyUpdateMock(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
    },
  },
}));

import { authenticate, requireRole, requireOwnerOrAdmin } from '../src/middleware/auth.middleware.js';
import { signAccessToken } from '../src/lib/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../src/lib/errors.js';
import { hashToken } from '../src/utils/helpers.js';

function makeReq(headers: Record<string, string> = {}): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

const noopReply = {} as FastifyReply;

beforeEach(() => {
  vi.clearAllMocks();
  apiKeyUpdateMock.mockResolvedValue({});
});

describe('authenticate (Bearer JWT)', () => {
  it('rejects when no auth header is present', async () => {
    await expect(authenticate(makeReq(), noopReply)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects an invalid token', async () => {
    const req = makeReq({ authorization: 'Bearer not.a.real.token' });
    await expect(authenticate(req, noopReply)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('attaches the user when token is valid and user exists + active', async () => {
    const token = await signAccessToken({
      sub: 'user-1',
      email: 'alice@example.com',
      role: 'USER',
    });
    userFindUniqueMock.mockResolvedValue({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      role: 'USER',
      isActive: true,
    });

    const req = makeReq({ authorization: `Bearer ${token}` });
    await authenticate(req, noopReply);
    expect(req.user).toEqual({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      role: 'USER',
    });
  });

  it('rejects a valid token whose user no longer exists', async () => {
    const token = await signAccessToken({
      sub: 'missing',
      email: 'gone@example.com',
      role: 'USER',
    });
    userFindUniqueMock.mockResolvedValue(null);

    const req = makeReq({ authorization: `Bearer ${token}` });
    await expect(authenticate(req, noopReply)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a valid token whose user is disabled', async () => {
    const token = await signAccessToken({
      sub: 'user-1',
      email: 'alice@example.com',
      role: 'USER',
    });
    userFindUniqueMock.mockResolvedValue({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      role: 'USER',
      isActive: false,
    });

    const req = makeReq({ authorization: `Bearer ${token}` });
    await expect(authenticate(req, noopReply)).rejects.toThrow(/disabled|not found/i);
  });
});

describe('authenticate (API Key)', () => {
  it('attaches user when key is valid', async () => {
    const rawKey = 'nck_abcdef1234567890abcdef1234567890';
    apiKeyFindUniqueMock.mockResolvedValue({
      id: 'key-1',
      keyHash: hashToken(rawKey),
      isActive: true,
      expiresAt: null,
      user: {
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        role: 'USER',
        isActive: true,
      },
    });

    const req = makeReq({ 'x-api-key': rawKey });
    await authenticate(req, noopReply);
    expect(req.user?.id).toBe('user-1');
    expect(apiKeyUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'key-1' } }),
    );
  });

  it('rejects an unknown API key', async () => {
    apiKeyFindUniqueMock.mockResolvedValue(null);
    const req = makeReq({ 'x-api-key': 'nck_unknown' });
    await expect(authenticate(req, noopReply)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a deactivated API key', async () => {
    const rawKey = 'nck_disabled';
    apiKeyFindUniqueMock.mockResolvedValue({
      id: 'key-1',
      keyHash: hashToken(rawKey),
      isActive: false,
      expiresAt: null,
      user: { id: 'u', email: 'a', name: 'a', role: 'USER', isActive: true },
    });

    const req = makeReq({ 'x-api-key': rawKey });
    await expect(authenticate(req, noopReply)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects an expired API key', async () => {
    const rawKey = 'nck_expired';
    apiKeyFindUniqueMock.mockResolvedValue({
      id: 'key-1',
      keyHash: hashToken(rawKey),
      isActive: true,
      expiresAt: new Date(Date.now() - 1000),
      user: { id: 'u', email: 'a', name: 'a', role: 'USER', isActive: true },
    });

    const req = makeReq({ 'x-api-key': rawKey });
    await expect(authenticate(req, noopReply)).rejects.toThrow(/expired/i);
  });
});

describe('requireRole', () => {
  it('grants a user with the required role', async () => {
    const req = { user: { id: 'u', email: 'a', name: 'a', role: 'ADMIN' } } as FastifyRequest;
    await expect(requireRole('ADMIN', 'SUPER_ADMIN')(req, noopReply)).resolves.toBeUndefined();
  });

  it('rejects a user without the required role', async () => {
    const req = { user: { id: 'u', email: 'a', name: 'a', role: 'USER' } } as FastifyRequest;
    await expect(requireRole('ADMIN')(req, noopReply)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects when no user is attached', async () => {
    const req = {} as FastifyRequest;
    await expect(requireRole('ADMIN')(req, noopReply)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('requireOwnerOrAdmin', () => {
  it('grants the resource owner', async () => {
    const req = { user: { id: 'user-1', email: 'a', name: 'a', role: 'USER' } } as FastifyRequest;
    const guard = requireOwnerOrAdmin((r) => r.user?.id);
    await expect(guard(req)).resolves.toBeUndefined();
  });

  it('grants an admin even when not the owner', async () => {
    const req = { user: { id: 'admin-1', email: 'a', name: 'a', role: 'ADMIN' } } as FastifyRequest;
    const guard = requireOwnerOrAdmin(() => 'someone-else');
    await expect(guard(req)).resolves.toBeUndefined();
  });

  it('grants a super admin', async () => {
    const req = { user: { id: 'sa-1', email: 'a', name: 'a', role: 'SUPER_ADMIN' } } as FastifyRequest;
    const guard = requireOwnerOrAdmin(() => 'someone-else');
    await expect(guard(req)).resolves.toBeUndefined();
  });

  it('rejects a non-owner non-admin', async () => {
    const req = { user: { id: 'user-1', email: 'a', name: 'a', role: 'USER' } } as FastifyRequest;
    const guard = requireOwnerOrAdmin(() => 'someone-else');
    await expect(guard(req)).rejects.toBeInstanceOf(ForbiddenError);
  });
});