import bcrypt from 'bcryptjs';
import type { User, Role } from '@prisma/client';
import { usersRepository, type FindUsersOptions } from './users.repository.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';
import { BCRYPT_ROUNDS } from '../../config/constants.js';
import { omit, buildPaginationMeta, generateApiKey } from '../../utils/helpers.js';
import { prisma } from '../../infrastructure/database.js';

export type SafeUser = Omit<User, 'passwordHash'>;

function toSafeUser(user: User): SafeUser {
  return omit(user, ['passwordHash']);
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role?: Role;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: Role;
  isActive?: boolean;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export class UsersService {
  async createUser(input: CreateUserInput): Promise<SafeUser> {
    const exists = await usersRepository.existsByEmail(input.email);
    if (exists) {
      throw new ConflictError(`User with email '${input.email}' already exists`);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await usersRepository.create({
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      passwordHash,
      role: input.role ?? 'USER',
    });

    return toSafeUser(user);
  }

  async getUserById(id: string): Promise<SafeUser> {
    const user = await usersRepository.findById(id);
    if (!user) throw new NotFoundError('User', id);
    return toSafeUser(user);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return usersRepository.findByEmail(email);
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<SafeUser> {
    const existing = await usersRepository.findById(id);
    if (!existing) throw new NotFoundError('User', id);

    if (input.email && input.email !== existing.email) {
      const conflict = await usersRepository.existsByEmail(input.email);
      if (conflict) throw new ConflictError(`Email '${input.email}' already in use`);
    }

    const user = await usersRepository.update(id, {
      ...(input.name && { name: input.name }),
      ...(input.email && { email: input.email.toLowerCase().trim() }),
      ...(input.role && { role: input.role }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });

    return toSafeUser(user);
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User', userId);

    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) throw new ConflictError('Current password is incorrect');

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    await usersRepository.update(userId, { passwordHash });
  }

  async deleteUser(id: string): Promise<void> {
    const user = await usersRepository.findById(id);
    if (!user) throw new NotFoundError('User', id);
    await usersRepository.delete(id);
  }

  async listUsers(options: FindUsersOptions) {
    const { users, total } = await usersRepository.findMany(options);
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;

    return {
      data: users.map(toSafeUser),
      meta: buildPaginationMeta(total, page, pageSize),
    };
  }

  async createApiKey(userId: string, name: string) {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User', userId);

    const { key, hash, prefix } = generateApiKey();

    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        keyHash: hash,
        keyPrefix: prefix,
        userId,
      },
    });

    // Return the raw key ONCE (not stored again)
    return { ...apiKey, key };
  }

  async listApiKeys(userId: string) {
    return prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeApiKey(userId: string, keyId: string) {
    const key = await prisma.apiKey.findFirst({
      where: { id: keyId, userId },
    });
    if (!key) throw new NotFoundError('API key', keyId);

    return prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });
  }
}

export const usersService = new UsersService();
