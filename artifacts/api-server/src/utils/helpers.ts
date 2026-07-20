import { randomBytes, createHash } from 'crypto';

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

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
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

/**
 * Convert a duration string (e.g. "15m", "7d", "1h", "30s") to seconds.
 * Throws on unparseable input. Supports s/m/h/d units.
 */
export function durationToSeconds(input: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*([smhd])$/.exec(input.trim().toLowerCase());
  if (!match) {
    throw new Error(`Invalid duration: ${input}`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: throw new Error(`Invalid unit: ${unit}`);
  }
}