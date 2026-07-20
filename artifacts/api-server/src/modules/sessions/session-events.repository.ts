import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database.js';
import { paginate } from '../../utils/helpers.js';

export interface FindSessionEventsOptions {
  page?: number;
  pageSize?: number;
  type?: string;
}

export class SessionEventsRepository {
  async log(
    sessionId: string,
    type: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await prisma.sessionEvent.create({
      data: {
        sessionId,
        type,
        payload: (payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findEvents(
    sessionId: string,
    options: FindSessionEventsOptions = {},
  ): Promise<{ events: Array<{ id: string; sessionId: string; type: string; payload: unknown; createdAt: Date }>; total: number }> {
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

export const sessionEventsRepository = new SessionEventsRepository();