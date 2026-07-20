import bcrypt from 'bcryptjs';
import { usersRepository } from '../users/users.repository.js';
import { prisma } from '../../infrastructure/database.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { UnauthorizedError, ConflictError } from '../../lib/errors.js';
import { BCRYPT_ROUNDS } from '../../config/constants.js';
import { generateToken, hashToken, omit } from '../../utils/helpers.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import type { User } from '@prisma/client';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult {
  user: Omit<User, 'passwordHash'>;
  tokens: AuthTokens;
}

export class AuthService {
  async register(input: RegisterInput): Promise<AuthResult> {
    const exists = await usersRepository.existsByEmail(input.email);
    if (exists) {
      throw new ConflictError(`Email '${input.email}' is already registered`);
    }

    // First user becomes SUPER_ADMIN
    const userCount = await usersRepository.count();
    const role = userCount === 0 ? 'SUPER_ADMIN' : 'USER';

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await usersRepository.create({
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      passwordHash,
      role,
    });

    logger.info({ userId: user.id, role }, 'New user registered');

    const tokens = await this.generateTokens(user);
    return { user: omit(user, ['passwordHash']), tokens };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await usersRepository.findByEmail(input.email.toLowerCase().trim());

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is disabled');
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    logger.info({ userId: user.id }, 'User logged in');

    const tokens = await this.generateTokens(user);
    return { user: omit(user, ['passwordHash']), tokens };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    // Verify JWT first
    const payload = await verifyRefreshToken(refreshToken);

    // Check token in DB
    const tokenHash = hashToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token is invalid or expired');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedError('Account is disabled');
    }

    // Rotate: revoke old, issue new
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(stored.user);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const tokenHash = hashToken(refreshToken);
      await prisma.refreshToken.updateMany({
        where: { token: tokenHash },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Ignore errors on logout
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    logger.info({ userId }, 'All sessions revoked');
  }

  private async generateTokens(user: User): Promise<AuthTokens> {
    const jwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, rawRefreshToken] = await Promise.all([
      signAccessToken(jwtPayload),
      Promise.resolve(generateToken(32)),
    ]);

    const refreshToken = await signRefreshToken(jwtPayload);
    const tokenHash = hashToken(refreshToken);

    // Persist refresh token (hashed)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    // Cleanup old tokens (keep last 10)
    const tokens = await prisma.refreshToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      select: { id: true },
    });
    if (tokens.length > 0) {
      await prisma.refreshToken.deleteMany({
        where: { id: { in: tokens.map((t) => t.id) } },
      });
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }
}

export const authService = new AuthService();
