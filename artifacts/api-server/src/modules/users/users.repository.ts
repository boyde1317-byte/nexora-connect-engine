import type { User, Role, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database.js';
import { paginate } from '../../utils/helpers.js';

export interface FindUsersOptions {
  page?: number;
  pageSize?: number;
  role?: Role;
  isActive?: boolean;
  search?: string;
}

export class UsersRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  }

  async delete(id: string): Promise<User> {
    return prisma.user.delete({ where: { id } });
  }

  async findMany(options: FindUsersOptions = {}): Promise<{ users: User[]; total: number }> {
    const { page = 1, pageSize = 20, role, isActive, search } = options;
    const { skip, take } = paginate(page, pageSize);

    const where: Prisma.UserWhereInput = {};

    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async count(): Promise<number> {
    return prisma.user.count();
  }

  async existsByEmail(email: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return !!user;
  }
}

export const usersRepository = new UsersRepository();
