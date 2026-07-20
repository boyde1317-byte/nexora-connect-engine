import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../lib/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import { prisma } from '../infrastructure/database.js';
import type { Role } from '@prisma/client';
import { hashToken } from '../utils/helpers.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      role: Role;
      name: string;
    };
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  const apiKeyHeader = request.headers['x-api-key'] as string | undefined;

  // ─── API Key Auth ──────────────────────────────────────────────────────
  if (apiKeyHeader) {
    try {
      const hash = hashToken(apiKeyHeader);
      const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash: hash },
        include: { user: true },
      });

      if (!apiKey || !apiKey.isActive) {
        throw new UnauthorizedError('Invalid API key');
      }

      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        throw new UnauthorizedError('API key expired');
      }

      if (!apiKey.user.isActive) {
        throw new UnauthorizedError('Account disabled');
      }

      // Update lastUsedAt async (don't await)
      prisma.apiKey
        .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {});

      request.user = {
        id: apiKey.user.id,
        email: apiKey.user.email,
        role: apiKey.user.role,
        name: apiKey.user.name,
      };
      return;
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
      throw new UnauthorizedError('Invalid API key');
    }
  }

  // ─── JWT Bearer Auth ───────────────────────────────────────────────────
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication required');
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verifyAccessToken(token);

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedError('Account not found or disabled');
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError();
    }
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError(
        `Required role: ${roles.join(' or ')}. Your role: ${request.user.role}`,
      );
    }
  };
}

export function requireOwnerOrAdmin(getResourceUserId: (req: FastifyRequest) => string | undefined) {
  return async (request: FastifyRequest): Promise<void> => {
    if (!request.user) throw new UnauthorizedError();

    const resourceUserId = getResourceUserId(request);
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(request.user.role);
    const isOwner = resourceUserId === request.user.id;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenError('Access denied to this resource');
    }
  };
}
