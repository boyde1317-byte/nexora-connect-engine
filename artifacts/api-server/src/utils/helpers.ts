import { randomBytes, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export function generateId(): string {
  return uuidv4();
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const rawKey = `nck_${generateToken(24)}`;
  const hash = hashToken(rawKey);
  const prefix = rawKey.substring(0, 12);
  return { key: rawKey, hash, prefix };
}

export function maskString(value: string, visibleEnd = 4): string {
  if (value.length <= visibleEnd) return '****';
  return '*'.repeat(value.length - visibleEnd) + value.slice(-visibleEnd);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parsePhoneNumber(phone: string): string {
  // Strip all non-numeric chars, ensure E.164-ish format for WhatsApp
  return phone.replace(/\D/g, '');
}

export function toWhatsAppJid(phone: string): string {
  const clean = parsePhoneNumber(phone);
  return `${clean}@s.whatsapp.net`;
}

export function safeJson<T>(value: unknown): T | null {
  try {
    if (typeof value === 'string') {
      return JSON.parse(value) as T;
    }
    return value as T;
  } catch {
    return null;
  }
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

export function paginate(page: number, pageSize: number): { skip: number; take: number } {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(Math.max(1, pageSize), 100);
  return {
    skip: (safePage - 1) * safeSize,
    take: safeSize,
  };
}

export function buildPaginationMeta(total: number, page: number, pageSize: number) {
  const totalPages = Math.ceil(total / pageSize);
  return {
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
