import type { FastifyRequest, FastifyReply } from 'fastify';
import { usersService } from './users.service.js';
import {
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  createApiKeySchema,
  listUsersQuerySchema,
} from './users.schema.js';

export async function getMe(request: FastifyRequest, reply: FastifyReply) {
  const user = await usersService.getUserById(request.user!.id);
  return reply.send({ data: user });
}

export async function updateMe(request: FastifyRequest, reply: FastifyReply) {
  const body = updateUserSchema.parse(request.body);
  const user = await usersService.updateUser(request.user!.id, body);
  return reply.send({ data: user });
}

export async function changeMyPassword(request: FastifyRequest, reply: FastifyReply) {
  const body = changePasswordSchema.parse(request.body);
  await usersService.changePassword(request.user!.id, body);
  return reply.status(204).send();
}

export async function listUsers(request: FastifyRequest, reply: FastifyReply) {
  const query = listUsersQuerySchema.parse(request.query);
  const result = await usersService.listUsers(query);
  return reply.send(result);
}

export async function getUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const user = await usersService.getUserById(request.params.id);
  return reply.send({ data: user });
}

export async function createUser(request: FastifyRequest, reply: FastifyReply) {
  const body = createUserSchema.parse(request.body);
  const user = await usersService.createUser(body);
  return reply.status(201).send({ data: user });
}

export async function updateUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const body = updateUserSchema.parse(request.body);
  const user = await usersService.updateUser(request.params.id, body);
  return reply.send({ data: user });
}

export async function deleteUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await usersService.deleteUser(request.params.id);
  return reply.status(204).send();
}

// API Keys
export async function listApiKeys(request: FastifyRequest, reply: FastifyReply) {
  const keys = await usersService.listApiKeys(request.user!.id);
  return reply.send({ data: keys });
}

export async function createApiKey(request: FastifyRequest, reply: FastifyReply) {
  const body = createApiKeySchema.parse(request.body);
  const result = await usersService.createApiKey(request.user!.id, body.name);
  return reply.status(201).send({
    data: result,
    message: 'Save this key now — it will not be shown again',
  });
}

export async function revokeApiKey(
  request: FastifyRequest<{ Params: { keyId: string } }>,
  reply: FastifyReply,
) {
  await usersService.revokeApiKey(request.user!.id, request.params.keyId);
  return reply.status(204).send();
}
