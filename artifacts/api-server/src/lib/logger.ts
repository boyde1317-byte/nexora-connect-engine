import pino from 'pino';
import { env } from '../config/env.js';

const transport =
  env.LOG_PRETTY
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined;

export const logger = pino({
  name: env.APP_NAME,
  level: env.LOG_LEVEL,
  transport,
  base: {
    app: env.APP_NAME,
    version: env.APP_VERSION,
    env: env.NODE_ENV,
  },
  redact: {
    paths: ['password', 'passwordHash', 'token', 'accessToken', 'refreshToken', 'apiKey'],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
