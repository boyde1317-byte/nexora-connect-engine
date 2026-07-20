import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/lib/jwt.js';
import { env } from '../src/config/env.js';
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/config/constants.js';
import { UnauthorizedError } from '../src/lib/errors.js';

describe('JWT sign/verify', () => {
  const payload = { sub: 'user-1', email: 'alice@example.com', role: 'USER' };

  it('round-trips an access token', async () => {
    const token = await signAccessToken(payload);
    const decoded = await verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.type).toBe('access');
  });

  it('round-trips a refresh token', async () => {
    const token = await signRefreshToken(payload);
    const decoded = await verifyRefreshToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.type).toBe('refresh');
  });

  it('rejects an access token signed with a different secret', async () => {
    const forged = await new SignJWT({ ...payload, type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .setAudience(JWT_AUDIENCE)
      .setIssuer(JWT_ISSUER)
      .sign(new TextEncoder().encode('a-different-secret-at-least-32-characters-long'));

    await expect(verifyAccessToken(forged)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects an expired access token', async () => {
    const expired = await new SignJWT({ ...payload, type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .setAudience(JWT_AUDIENCE)
      .setIssuer(JWT_ISSUER)
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));

    await expect(verifyAccessToken(expired)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a refresh token when verified against the access secret', async () => {
    const refresh = await signRefreshToken(payload);
    await expect(verifyAccessToken(refresh)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects garbage', async () => {
    await expect(verifyAccessToken('not.a.token')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});