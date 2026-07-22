/**
 * Baileys Session — WhatsApp connection lifecycle per session.
 *
 * @whiskeysockets/baileys is an OPTIONAL dependency. Install it separately:
 *   pnpm --filter @workspace/api-server add @whiskeysockets/baileys
 *
 * The REST API, auth, users, and sessions endpoints work without Baileys.
 * Only the live WhatsApp connection requires it.
 */
import { EventEmitter } from 'events';
import { usePrismaAuthState, clearAuthState } from './auth-state.js';
import { prisma } from '../infrastructure/database.js';
import { logger } from '../lib/logger.js';
import { enqueueSessionReconnect } from '../infrastructure/queue/queues.js';
import { sessionEventsService } from '../modules/sessions/session-events.service.js';
import { SOCKET_EVENTS } from '../config/constants.js';
import type { SessionStateUpdate, BaileysSessionOptions } from './types.js';
import { SessionStatus } from '@prisma/client';

type WASocket = {
  ws?: { readyState?: number };
  user?: { name?: string; id?: string };
  ev: EventEmitter;
  logout: () => Promise<void>;
  end: (err: unknown) => void;
  requestPairingCode: (phone: string) => Promise<string>;
};

// Dynamically resolved at runtime when Baileys is installed
let makeWASocketFn: ((opts: unknown) => WASocket) | null = null;
let disconnectReasonLoggedOut: number | null = null;
let fetchVersionFn: (() => Promise<{ version: [number, number, number] }>) | null = null;

async function loadBaileys(): Promise<boolean> {
  if (makeWASocketFn) return true;
  try {
    // Use string interpolation to prevent TypeScript from resolving the import at compile time
    const pkgName = '@whiskeysockets/baileys';
    const b = await import(/* @vite-ignore */ pkgName) as Record<string, unknown>;
    makeWASocketFn = (b['default'] ?? b['makeWASocket']) as typeof makeWASocketFn;
    const reasons = b['DisconnectReason'] as Record<string, number> | undefined;
    disconnectReasonLoggedOut = reasons?.['loggedOut'] ?? 401;
    fetchVersionFn = b['fetchLatestBaileysVersion'] as typeof fetchVersionFn;
    return !!makeWASocketFn;
  } catch {
    return false;
  }
}

export class BaileysSession extends EventEmitter {
  private socket: WASocket | null = null;
  private sessionLog: ReturnType<typeof logger.child>;
  private isClosing = false;
  private readonly options: BaileysSessionOptions;

  constructor(options: BaileysSessionOptions) {
    super();
    this.options = options;
    this.sessionLog = logger.child({ sessionId: options.sessionId });
    this.setMaxListeners(50);
  }

  get sessionId(): string {
    return this.options.sessionId;
  }

  get isConnected(): boolean {
    return this.socket?.ws?.readyState === 1;
  }

  async start(): Promise<void> {
    this.isClosing = false;
    this.sessionLog.info('Starting Baileys session');

    const available = await loadBaileys();
    if (!available) {
      this.sessionLog.error(
        'Baileys not installed. Run: pnpm --filter @workspace/api-server add @whiskeysockets/baileys',
      );
      await this.updateStatus(SessionStatus.ERROR, {
        error: 'Baileys library not installed on this server',
      });
      return;
    }

    try {
      const { version } = await fetchVersionFn!();
      const { state, saveCreds } = await usePrismaAuthState(this.options.sessionId);

      const sock = makeWASocketFn!({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: logger.child({ sessionId: this.options.sessionId, component: 'baileys' }),
        browser: ['Nexora Connect Engine', 'Chrome', '10.0'],
        connectTimeoutMs: 60_000,
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
      });

      this.socket = sock;

      sock.ev.on('creds.update', saveCreds);
      sock.ev.on('connection.update', async (update: Record<string, unknown>) => {
        await this.handleConnectionUpdate(update);
      });
      sock.ev.on('messages.upsert', async ({ messages, type }: Record<string, unknown>) => {
        if (type === 'notify') {
          const list = Array.isArray(messages) ? messages : [];
          for (const msg of list) {
            await sessionEventsService.log(this.sessionId, 'message.received', {
              message: msg as Record<string, unknown>,
            });
          }
          this.emit('messages', { sessionId: this.sessionId, messages });
        }
      });

      this.sessionLog.info({ version }, 'Baileys socket created');
    } catch (error) {
      this.sessionLog.error({ err: error }, 'Failed to start Baileys session');
      await this.updateStatus(SessionStatus.ERROR, { error: String(error) });
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isClosing = true;
    this.sessionLog.info('Stopping Baileys session');
    try {
      if (this.socket) {
        this.socket.ev.removeAllListeners();
        // Use end() — not logout(). logout() unpairs the device from WhatsApp;
        // end() closes the socket connection gracefully without removing the pairing.
        this.socket.end(undefined);
        this.socket = null;
      }
      await this.updateStatus(SessionStatus.DISCONNECTED);
    } catch (error) {
      this.sessionLog.error({ err: error }, 'Error stopping session');
    }
  }

  async requestPairingCode(phoneNumber: string): Promise<string> {
    if (!this.socket) throw new Error('Socket not initialized');
    const code = await this.socket.requestPairingCode(phoneNumber);
    const formatted = code.match(/.{1,4}/g)?.join('-') ?? code;
    await this.updateStatus(SessionStatus.PAIRING_PENDING, { pairingCode: formatted });
    await sessionEventsService.log(this.sessionId, 'pairing.code', {
      phoneNumber,
      pairingCode: formatted,
    });
    this.emit(SOCKET_EVENTS.SESSION_PAIRING_CODE, { sessionId: this.sessionId, pairingCode: formatted });
    return formatted;
  }

  private async handleConnectionUpdate(update: Record<string, unknown>): Promise<void> {
    const { connection, lastDisconnect, qr } = update;

    await sessionEventsService.log(this.sessionId, 'connection.update', { update });

    if (typeof qr === 'string') {
      await this.updateStatus(SessionStatus.QR_PENDING, { qrCode: qr });
      await sessionEventsService.log(this.sessionId, 'qr.update', { qrCode: qr });
      this.emit(SOCKET_EVENTS.SESSION_QR_UPDATED, { sessionId: this.sessionId, qrCode: qr });
    }

    if (connection === 'connecting') {
      await this.updateStatus(SessionStatus.CONNECTING);
    }

    if (connection === 'open') {
      const pushName = this.socket?.user?.name;
      const phoneNumber = this.socket?.user?.id?.split(':')[0];
      await this.updateStatus(SessionStatus.CONNECTED, {
        phoneNumber: phoneNumber ?? null,
        pushName: pushName ?? null,
        qrCode: null,
        pairingCode: null,
      });
      await sessionEventsService.log(this.sessionId, 'connected', {
        phoneNumber: phoneNumber ?? null,
        pushName: pushName ?? null,
      });
      this.emit(SOCKET_EVENTS.SESSION_CONNECTED, { sessionId: this.sessionId, phoneNumber, pushName });
      this.sessionLog.info({ pushName, phoneNumber }, 'WhatsApp session connected');
    }

    if (connection === 'close') {
      const err = (lastDisconnect as Record<string, unknown> | undefined)?.['error'];
      const output = (err as Record<string, unknown> | undefined)?.['output'] as Record<string, unknown> | undefined;
      const code = output?.['statusCode'] as number | undefined;
      const shouldReconnect = code !== (disconnectReasonLoggedOut ?? 401);

      await sessionEventsService.log(this.sessionId, 'disconnected', {
        statusCode: code ?? null,
        shouldReconnect,
        error: err ? String(err) : null,
      });

      this.emit(SOCKET_EVENTS.SESSION_DISCONNECTED, { sessionId: this.sessionId, statusCode: code, shouldReconnect });

      if (!shouldReconnect) {
        await clearAuthState(this.sessionId);
        await this.updateStatus(SessionStatus.DISCONNECTED);
      } else if (!this.isClosing) {
        await this.updateStatus(SessionStatus.DISCONNECTED);
        await enqueueSessionReconnect(this.sessionId, 5000).catch(() => {
          setTimeout(() => { this.start().catch(() => {}); }, 5000);
        });
      }
    }
  }

  private async updateStatus(
    status: SessionStatus,
    extra: Partial<Omit<SessionStateUpdate, 'sessionId' | 'status'>> = {},
  ): Promise<void> {
    try {
      const data: Record<string, unknown> = { status };
      if ('qrCode' in extra) data['qrCode'] = extra.qrCode ?? null;
      if ('pairingCode' in extra) data['pairingCode'] = extra.pairingCode ?? null;
      if ('phoneNumber' in extra) data['phoneNumber'] = extra.phoneNumber;
      if ('pushName' in extra) data['pushName'] = extra.pushName;
      if ('error' in extra) data['lastError'] = extra.error ?? null;
      if (status === SessionStatus.CONNECTED) {
        data['lastConnectedAt'] = new Date();
        data['retryCount'] = 0;
      }
      if (status === SessionStatus.ERROR) data['lastErrorAt'] = new Date();

      await prisma.session.update({ where: { id: this.sessionId }, data });
      this.emit(SOCKET_EVENTS.SESSION_STATUS_CHANGED, { sessionId: this.sessionId, status, ...extra });
    } catch (err) {
      this.sessionLog.error({ err, status }, 'Failed to update session status');
    }
  }
}
