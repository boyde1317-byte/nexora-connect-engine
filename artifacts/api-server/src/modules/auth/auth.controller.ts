import type { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service.js';
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
} from './auth.schema.js';

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const body = registerSchema.parse(request.body);
  const result = await authService.register(body);
  return reply.status(201).send({
    data: {
      user: result.user,
      tokens: result.tokens,
    },
    message: 'Registration successful',
  });
}

export async function login(request: FastifyRequest, reply: FastifyReply) {
  const body = loginSchema.parse(request.body);
  const result = await authService.login(body);
  return reply.send({
    data: {
      user: result.user,
      tokens: result.tokens,
    },
    message: 'Login successful',
  });
}

export async function refreshToken(request: FastifyRequest, reply: FastifyReply) {
  const body = refreshTokenSchema.parse(request.body);
  const tokens = await authService.refreshTokens(body.refreshToken);
  return reply.send({ data: tokens });
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  const body = refreshTokenSchema.safeParse(request.body);
  if (body.success) {
    await authService.logout(body.data.refreshToken);
  }
  return reply.status(204).send();
}

export async function logoutAll(request: FastifyRequest, reply: FastifyReply) {
  await authService.logoutAll(request.user!.id);
  return reply.status(204).send();
}

export async function me(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: request.user });
}
