import { z } from 'zod';

export const createSessionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  connectionType: z.enum(['QR_CODE', 'PAIRING_CODE']).default('QR_CODE'),
  phoneNumber: z.string().optional(),
  webhookUrl: z.string().url().optional(),
});

export const updateSessionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  webhookUrl: z.string().url().optional(), // undefined removes, string updates
  metadata: z.record(z.unknown()).optional(),
});

export const requestPairingCodeSchema = z.object({
  phoneNumber: z.string().min(10).max(20),
});

export const listSessionsQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  pageSize: z.coerce.number().positive().max(100).default(20),
  status: z
    .enum([
      'CONNECTING',
      'QR_PENDING',
      'PAIRING_PENDING',
      'CONNECTED',
      'DISCONNECTED',
      'BANNED',
      'EXPIRED',
      'ERROR',
    ])
    .optional(),
  search: z.string().optional(),
});

export const sessionEventsQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  pageSize: z.coerce.number().positive().max(100).default(50),
  type: z.string().optional(),
});
