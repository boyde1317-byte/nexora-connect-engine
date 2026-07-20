import type { FastifyRequest, FastifyReply } from 'fastify';
import { sessionsService } from './sessions.service.js';
import {
  createSessionSchema,
  updateSessionSchema,
  requestPairingCodeSchema,
  listSessionsQuerySchema,
  sessionEventsQuerySchema,
} from './sessions.schema.js';

type SessionParams = { Params: { id: string } };

export async function createSession(request: FastifyRequest, reply: FastifyReply) {
  const body = createSessionSchema.parse(request.body);
  const session = await sessionsService.createSession(request.user!.id, body);
  return reply.status(201).send({ data: session });
}

export async function listSessions(request: FastifyRequest, reply: FastifyReply) {
  const query = listSessionsQuerySchema.parse(request.query);
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(request.user!.role);
  const result = await sessionsService.listSessions(request.user!.id, query, isAdmin);
  return reply.send(result);
}

export async function getSession(
  request: FastifyRequest<SessionParams>,
  reply: FastifyReply,
) {
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(request.user!.role);
  const session = await sessionsService.getSession(
    request.params.id,
    isAdmin ? undefined : request.user!.id,
  );
  return reply.send({ data: session });
}

export async function updateSession(
  request: FastifyRequest<SessionParams>,
  reply: FastifyReply,
) {
  const body = updateSessionSchema.parse(request.body);
  const session = await sessionsService.updateSession(
    request.params.id,
    request.user!.id,
    body,
  );
  return reply.send({ data: session });
}

export async function deleteSession(
  request: FastifyRequest<SessionParams>,
  reply: FastifyReply,
) {
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(request.user!.role);
  await sessionsService.deleteSession(request.params.id, request.user!.id, isAdmin);
  return reply.status(204).send();
}

export async function connectSession(
  request: FastifyRequest<SessionParams>,
  reply: FastifyReply,
) {
  const result = await sessionsService.connectSession(request.params.id, request.user!.id);
  return reply.send({ data: result });
}

export async function disconnectSession(
  request: FastifyRequest<SessionParams>,
  reply: FastifyReply,
) {
  await sessionsService.disconnectSession(request.params.id, request.user!.id);
  return reply.status(204).send();
}

export async function restartSession(
  request: FastifyRequest<SessionParams>,
  reply: FastifyReply,
) {
  const result = await sessionsService.restartSession(request.params.id, request.user!.id);
  return reply.send({ data: result });
}

export async function getQrCode(
  request: FastifyRequest<SessionParams>,
  reply: FastifyReply,
) {
  const session = await sessionsService.requestQrCode(request.params.id, request.user!.id);
  return reply.send({
    data: {
      sessionId: session.id,
      status: session.status,
      qrCode: session.qrCode,
      expiresAt: session.updatedAt,
    },
  });
}

export async function getPairingCode(
  request: FastifyRequest<SessionParams>,
  reply: FastifyReply,
) {
  const body = requestPairingCodeSchema.parse(request.body);
  const result = await sessionsService.requestPairingCode(
    request.params.id,
    request.user!.id,
    body.phoneNumber,
  );
  return reply.send({ data: result });
}

export async function getSessionStats(request: FastifyRequest, reply: FastifyReply) {
  const stats = await sessionsService.getSessionStats(request.user!.id);
  return reply.send({ data: stats });
}

export async function getSessionEvents(
  request: FastifyRequest<SessionParams>,
  reply: FastifyReply,
) {
  const query = sessionEventsQuerySchema.parse(request.query);
  const result = await sessionsService.getSessionEvents(
    request.params.id,
    request.user!.id,
    query,
  );
  return reply.send(result);
}

export async function getSystemStats(request: FastifyRequest, reply: FastifyReply) {
  const stats = await sessionsService.getSystemStats();
  return reply.send({ data: stats });
}
