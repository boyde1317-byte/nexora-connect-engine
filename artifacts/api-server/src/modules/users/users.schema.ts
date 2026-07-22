import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
  role: z.enum(['USER', 'ADMIN', 'VIEWER', 'SUPER_ADMIN']).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(['USER', 'ADMIN', 'VIEWER', 'SUPER_ADMIN']).optional(),
  isActive: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  pageSize: z.coerce.number().positive().max(100).default(20),
  role: z.enum(['USER', 'ADMIN', 'VIEWER', 'SUPER_ADMIN']).optional(),
  isActive: z
    .string()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined))
    .optional(),
  search: z.string().optional(),
});
