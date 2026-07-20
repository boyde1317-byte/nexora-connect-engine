export const QUEUE_NAMES = {
  SESSION_CONNECT: 'session:connect',
  SESSION_DISCONNECT: 'session:disconnect',
  SESSION_RECONNECT: 'session:reconnect',
  WEBHOOK_DELIVERY: 'webhook:delivery',
  EVENT_PROCESSING: 'event:processing',
} as const;

export const REDIS_KEYS = {
  SESSION_STATUS: (id: string) => `nexora:session:${id}:status`,
  SESSION_QR: (id: string) => `nexora:session:${id}:qr`,
  SESSION_LOCK: (id: string) => `nexora:session:${id}:lock`,
  USER_SESSIONS: (userId: string) => `nexora:user:${userId}:sessions`,
  RATE_LIMIT: (ip: string) => `nexora:ratelimit:${ip}`,
} as const;

export const SOCKET_EVENTS = {
  // Client → Server
  SESSION_SUBSCRIBE: 'session:subscribe',
  SESSION_UNSUBSCRIBE: 'session:unsubscribe',

  // Server → Client
  SESSION_STATUS_CHANGED: 'session:status_changed',
  SESSION_QR_UPDATED: 'session:qr_updated',
  SESSION_PAIRING_CODE: 'session:pairing_code',
  SESSION_CONNECTED: 'session:connected',
  SESSION_DISCONNECTED: 'session:disconnected',
  SESSION_ERROR: 'session:error',

  // Connection events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
} as const;

export const JWT_AUDIENCE = 'nexora-connect-engine';
export const JWT_ISSUER = 'nexora-connect-engine';

export const BCRYPT_ROUNDS = 12;

export const API_KEY_PREFIX_LENGTH = 8;
export const API_KEY_LENGTH = 32;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
