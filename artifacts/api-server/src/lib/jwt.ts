import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../config/env.js';
import { JWT_AUDIENCE, JWT_ISSUER } from '../config/constants.js';
import { UnauthorizedError } from './errors.js';

export interface TokenPayload extends JWTPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
}

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export async function signAccessToken(payload: Omit<TokenPayload, 'type'>): Promise<string> {
  return new SignJWT({ ...payload, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
    .setAudience(JWT_AUDIENCE)
    .setIssuer(JWT_ISSUER)
    .sign(accessSecret);
}

export async function signRefreshToken(payload: Omit<TokenPayload, 'type'>): Promise<string> {
  return new SignJWT({ ...payload, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_REFRESH_EXPIRES_IN)
    .setAudience(JWT_AUDIENCE)
    .setIssuer(JWT_ISSUER)
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, {
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
    });
    return payload as TokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret, {
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
    });
    return payload as TokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}
