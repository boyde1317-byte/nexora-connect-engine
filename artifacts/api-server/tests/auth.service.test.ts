import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (must come before imports that use them) ──────────────────────────
vi.mock('../src/infrastructure/database.js', () => {
  const refreshToken = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn(),
  };
  return { prisma: { refreshToken } };
});

const userCreateMock = vi.fn();
const userFindByEmailMock = vi.fn();
const userCountMock = vi.fn();
const userExistsByEmailMock = vi.fn();

vi.mock('../src/modules/users/users.repository.js', () => ({
  usersRepository: {
    create: (...args: unknown[]) => userCreateMock(...args),
    findByEmail: (...args: unknown[]) => userFindByEmailMock(...args),
    count: (...args: unknown[]) => userCountMock(...args),
    existsByEmail: (...args: unknown[]) => userExistsByEmailMock(...args),
  },
}));

import { authService } from '../src/modules/auth/auth.service.js';
import { prisma } from '../src/infrastructure/database.js';
import { ConflictError, UnauthorizedError } from '../src/lib/errors.js';
import type { User } from '@prisma/client';

const baseUser: User = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  passwordHash: '$2a$12$dummyhashfor.testing.only',
  role: 'USER',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('JWT expiry metadata', () => {
  it('exposes expiresIn derived from JWT_ACCESS_EXPIRES_IN', async () => {
    const { env } = await import('../src/config/env.js');
    userExistsByEmailMock.mockResolvedValue(false);
    userCountMock.mockResolvedValue(0);
    userCreateMock.mockResolvedValue({ ...baseUser, role: 'SUPER_ADMIN' });

    const result = await authService.register({
      email: 'fresh@example.com',
      name: 'Fresh',
      password: 'supersecret123',
    });

    expect(result.tokens.expiresIn).toBeGreaterThan(0);
    // Sanity: 15m is the default
    expect(result.tokens.expiresIn).toBe(900);
    expect(env.JWT_ACCESS_EXPIRES_IN).toBe('15m');
  });
});

describe('AuthService.register', () => {
  it('creates the first user as SUPER_ADMIN', async () => {
    userExistsByEmailMock.mockResolvedValue(false);
    userCountMock.mockResolvedValue(0);
    userCreateMock.mockResolvedValue({ ...baseUser, role: 'SUPER_ADMIN' });

    const result = await authService.register({
      email: 'first@example.com',
      name: 'First User',
      password: 'supersecret123',
    });

    expect(result.user.role).toBe('SUPER_ADMIN');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.tokens.accessToken).toBeTypeOf('string');
    expect(result.tokens.refreshToken).toBeTypeOf('string');
  });

  it('creates subsequent users as USER', async () => {
    userExistsByEmailMock.mockResolvedValue(false);
    userCountMock.mockResolvedValue(3);
    userCreateMock.mockResolvedValue({ ...baseUser, role: 'USER' });

    const result = await authService.register({
      email: 'fourth@example.com',
      name: 'Fourth',
      password: 'supersecret123',
    });

    expect(result.user.role).toBe('USER');
  });

  it('rejects duplicate emails with ConflictError', async () => {
    userExistsByEmailMock.mockResolvedValue(true);

    await expect(
      authService.register({
        email: 'dup@example.com',
        name: 'Dup',
        password: 'supersecret123',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('AuthService.login', () => {
  it('returns tokens on successful login', async () => {
    // Hash of "password123" with bcrypt cost 12 — generated once and reused.
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash('password123', 12);
    userFindByEmailMock.mockResolvedValue({ ...baseUser, passwordHash });

    const result = await authService.login({
      email: 'alice@example.com',
      password: 'password123',
    });

    expect(result.user.id).toBe(baseUser.id);
    expect(result.tokens.accessToken).toBeTypeOf('string');
  });

  it('rejects unknown email', async () => {
    userFindByEmailMock.mockResolvedValue(null);

    await expect(
      authService.login({ email: 'missing@example.com', password: 'password123' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects disabled account', async () => {
    userFindByEmailMock.mockResolvedValue({ ...baseUser, isActive: false });
    await expect(
      authService.login({ email: 'alice@example.com', password: 'password123' }),
    ).rejects.toThrow(/disabled/i);
  });

  it('rejects wrong password', async () => {
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash('correct-password', 12);
    userFindByEmailMock.mockResolvedValue({ ...baseUser, passwordHash });

    await expect(
      authService.login({ email: 'alice@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('AuthService.refreshTokens', () => {
  it('rotates the refresh token', async () => {
    const { signRefreshToken } = await import('../src/lib/jwt.js');
    const refreshToken = await signRefreshToken({
      sub: baseUser.id,
      email: baseUser.email,
      role: baseUser.role,
    });

    const stored = {
      id: 'rt-1',
      token: 'hashed-old',
      userId: baseUser.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: null,
      createdAt: new Date(),
      user: baseUser,
    };
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(stored as never);
    vi.mocked(prisma.refreshToken.update).mockResolvedValue({ ...stored, revokedAt: new Date() } as never);
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as never);
    vi.mocked(prisma.refreshToken.findMany).mockResolvedValue([]);
    vi.mocked(prisma.refreshToken.deleteMany).mockResolvedValue({ count: 0 } as never);

    const result = await authService.refreshTokens(refreshToken);
    expect(result.accessToken).toBeTypeOf('string');
    expect(result.refreshToken).toBeTypeOf('string');
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: stored.id },
        data: { revokedAt: expect.any(Date) },
      }),
    );
  });

  it('rejects an already-revoked refresh token', async () => {
    const { signRefreshToken } = await import('../src/lib/jwt.js');
    const refreshToken = await signRefreshToken({
      sub: baseUser.id,
      email: baseUser.email,
      role: baseUser.role,
    });

    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      id: 'rt-1',
      token: 'hashed',
      userId: baseUser.id,
      expiresAt: new Date(Date.now() + 1000 * 60),
      revokedAt: new Date(), // already revoked
      createdAt: new Date(),
      user: baseUser,
    } as never);

    await expect(authService.refreshTokens(refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('AuthService.logout / logoutAll', () => {
  it('logout revokes the matching refresh token', async () => {
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({ count: 1 } as never);
    await authService.logout('opaque-token');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { revokedAt: expect.any(Date) },
      }),
    );
  });

  it('logoutAll revokes every active refresh token for the user', async () => {
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({ count: 4 } as never);
    await authService.logoutAll(baseUser.id);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: baseUser.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      }),
    );
  });
});