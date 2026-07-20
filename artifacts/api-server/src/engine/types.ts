import type { SessionStatus } from '@prisma/client';

export interface BaileysSessionOptions {
  sessionId: string;
  userId: string;
  usePairingCode?: boolean;
  phoneNumber?: string;
}

export interface SessionStateUpdate {
  sessionId: string;
  status: SessionStatus;
  qrCode?: string | null;
  pairingCode?: string | null;
  phoneNumber?: string | null;
  pushName?: string | null;
  error?: string | null;
}

export interface ActiveSession {
  sessionId: string;
  userId: string;
  status: SessionStatus;
  startedAt: Date;
}

export type SessionEventType =
  | 'connection.update'
  | 'qr.update'
  | 'pairing.code'
  | 'connected'
  | 'disconnected'
  | 'message.received'
  | 'session.created'
  | 'session.deleted'
  | 'error';

export interface SessionEvent {
  sessionId: string;
  type: SessionEventType;
  payload?: unknown;
  timestamp: Date;
}
