export const QUEUE_NAMES = {
  SESSION_CONNECT: 'session-connect',
  SESSION_DISCONNECT: 'session-disconnect',
  SESSION_RECONNECT: 'session-reconnect',
  WEBHOOK_DELIVERY: 'webhook-delivery',
  EVENT_PROCESSING: 'event-processing',
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

