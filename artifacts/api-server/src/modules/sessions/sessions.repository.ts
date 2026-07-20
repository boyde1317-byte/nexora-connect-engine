import type { Session, SessionStatus, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database.js';
import { paginate } from '../../utils/helpers.js';

export interface FindSessionsOptions {
  userId?: string;
  status?: SessionStatus;
  page?: number;
  pageSize?: number;
  search?: string;
}

export class SessionsRepository {
  async findById(id: string): Promise<Session | null> {
    return prisma.session.findUnique({ where: { id } });
  }

  async findByIdAndUser(id: string, userId: string): Promise<Session | null> {
    return prisma.session.findFirst({ where: { id, userId } });
  }

  async create(data: Prisma.SessionCreateInput): Promise<Session> {
    return prisma.session.create({ data });
  }

  async update(id: string, data: Prisma.SessionUpdateInput): Promise<Session> {
    return prisma.session.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Session> {
    return prisma.session.delete({ where: { id } });
  }

  async findMany(
    options: FindSessionsOptions = {},
  ): Promise<{ sessions: Session[]; total: number }> {
    const { userId, status, page = 1, pageSize = 20, search } = options;
    const { skip, take } = paginate(page, pageSize);

    const where: Prisma.SessionWhereInput = {};

    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.session.count({ where }),
    ]);

    return { sessions, total };
  }

  async countByUser(userId: string): Promise<number> {
    return prisma.session.count({ where: { userId } });
  }

  async findByStatus(status: SessionStatus): Promise<Session[]> {
    return prisma.session.findMany({ where: { status } });
  }

  async findEvents(
    sessionId: string,
    options: { page?: number; pageSize?: number; type?: string } = {},
  ) {
    const { page = 1, pageSize = 50, type } = options;
    const { skip, take } = paginate(page, pageSize);

    const where: Prisma.SessionEventWhereInput = { sessionId };
    if (type) where.type = type;

    const [events, total] = await Promise.all([
      prisma.sessionEvent.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sessionEvent.count({ where }),
    ]);

    return { events, total };
  }
}

export const sessionsRepository = new SessionsRepository();
