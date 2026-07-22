import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { baileysManager } from '../engine/baileys.manager.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import { SOCKET_EVENTS } from '../config/constants.js';
import { env } from '../config/env.js';
import { prisma } from '../infrastructure/database.js';

interface SocketUserData {
  userId: string;
  email: string;
  role: string;
  subscribedSessions: Set<string>;
}

declare module 'socket.io' {
  interface Socket {
    _nexoraUser?: SocketUserData;
  }
}

let io: SocketIOServer | null = null;

export function createSocketGateway(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  // ─── Auth Middleware ─────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth['token'] as string | undefined) ??
        socket.handshake.headers['authorization']?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const payload = await verifyAccessToken(token);

      socket._nexoraUser = {
        userId: payload.sub as string,
        email: payload.email,
        role: payload.role,
        subscribedSessions: new Set(),
      };

      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // ─── Connection Handler ──────────────────────────────────────────────────
  io.on(SOCKET_EVENTS.CONNECT, (socket: Socket) => {
    const userData = socket._nexoraUser;
    const socketLog = logger.child({ socketId: socket.id, userId: userData?.userId });

    socketLog.info('Client connected to WebSocket gateway');

    socket.on(SOCKET_EVENTS.SESSION_SUBSCRIBE, async (sessionId: unknown) => {
      if (typeof sessionId !== 'string' || !userData) return;

      // Verify the authenticated user owns this session before joining the room.
      // Without this check any authenticated user could subscribe to any session.
      const owned = await prisma.session.findFirst({
        where: { id: sessionId, userId: userData.userId },
        select: { id: true },
      }).catch(() => null);

      if (!owned) {
        socketLog.warn({ sessionId }, 'Subscription rejected — session not owned by user');
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Session not found or access denied' });
        return;
      }

      socketLog.debug({ sessionId }, 'Client subscribed to session');
      userData.subscribedSessions.add(sessionId);
      void socket.join(`session:${sessionId}`);
    });

    socket.on(SOCKET_EVENTS.SESSION_UNSUBSCRIBE, (sessionId: unknown) => {
      if (typeof sessionId !== 'string') return;
      socketLog.debug({ sessionId }, 'Client unsubscribed from session');
      userData?.subscribedSessions.delete(sessionId);
      void socket.leave(`session:${sessionId}`);
    });

    socket.on(SOCKET_EVENTS.DISCONNECT, (reason: string) => {
      socketLog.info({ reason }, 'Client disconnected from WebSocket gateway');
    });

    socket.on(SOCKET_EVENTS.ERROR, (err: unknown) => {
      socketLog.error({ err }, 'Socket error');
    });
  });

  // ─── Bridge BaileysManager events → Socket rooms ─────────────────────────
  const sessionEvents = [
    SOCKET_EVENTS.SESSION_STATUS_CHANGED,
    SOCKET_EVENTS.SESSION_QR_UPDATED,
    SOCKET_EVENTS.SESSION_PAIRING_CODE,
    SOCKET_EVENTS.SESSION_CONNECTED,
    SOCKET_EVENTS.SESSION_DISCONNECTED,
    SOCKET_EVENTS.SESSION_ERROR,
  ];

  for (const event of sessionEvents) {
    baileysManager.on(event, (data: { sessionId: string } & Record<string, unknown>) => {
      if (data?.sessionId && io) {
        io.to(`session:${data.sessionId}`).emit(event, data);
      }
    });
  }

  logger.info('Socket.IO gateway initialized');
  return io;
}

export function getSocketGateway(): SocketIOServer | null {
  return io;
}

export function emitToSession(sessionId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`session:${sessionId}`).emit(event, data);
  }
}
