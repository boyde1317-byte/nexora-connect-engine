/**
 * Prisma-backed Baileys auth state.
 * Works without @whiskeysockets/baileys installed — types are inlined.
 */
import { prisma } from '../infrastructure/database.js';
import { logger } from '../lib/logger.js';

// Inline minimal types so we don't need Baileys installed to compile
interface AuthCreds {
  [key: string]: unknown;
}

interface AuthKeys {
  get: <T>(type: string, ids: string[]) => Promise<{ [id: string]: T }>;
  set: (data: Record<string, Record<string, unknown> | null>) => Promise<void>;
}

export interface AuthState {
  creds: AuthCreds;
  keys: AuthKeys;
}

const BUFFER_JSON_REPLACER = (_key: string, value: unknown): unknown => {
  if (value instanceof Uint8Array || Buffer.isBuffer(value as Buffer)) {
    return { type: 'Buffer', data: Array.from(value as Uint8Array) };
  }
  return value;
};

const BUFFER_JSON_REVIVER = (_key: string, value: unknown): unknown => {
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>)['type'] === 'Buffer' &&
    Array.isArray((value as Record<string, unknown>)['data'])
  ) {
    return Buffer.from((value as { data: number[] }).data);
  }
  return value;
};

function initCreds(): AuthCreds {
  // Minimal placeholder creds — real init happens via Baileys when installed
  return {
    noiseKey: null,
    pairingEphemeralKeyPair: null,
    signedIdentityKey: null,
    signedPreKey: null,
    registrationId: null,
    advSecretKey: null,
    nextPreKeyId: 1,
    firstUnuploadedPreKeyId: 1,
    serverHasPreKeys: false,
    account: null,
    me: null,
    signalIdentities: [],
    myAppStateKeyId: null,
    firstAppStateSyncError: null,
    lastAppStateStats: null,
    lastPropHash: null,
    accountSyncCounter: 0,
    accountSettings: { unarchiveChats: false },
    deviceId: '',
    phoneId: '',
    identityId: null,
    registered: false,
    backupToken: null,
    registration: null,
    pairingCode: undefined,
    lastPairingLinkId: undefined,
    routingInfo: null,
    _imported: false,
  };
}

export async function usePrismaAuthState(
  sessionId: string,
): Promise<{ state: AuthState; saveCreds: () => Promise<void> }> {
  const sessionLog = logger.child({ sessionId });

  let authRecord = await prisma.sessionAuthState.findUnique({ where: { sessionId } });

  if (!authRecord) {
    // Try to use Baileys initAuthCreds if installed, else use our placeholder
    let creds: AuthCreds = initCreds();
    try {
      const b = await import('@whiskeysockets/baileys' as string);
      const initFn = (b as Record<string, unknown>)['initAuthCreds'] as (() => AuthCreds) | undefined;
      if (initFn) creds = initFn();
    } catch {
      // Baileys not installed — use placeholder
    }

    authRecord = await prisma.sessionAuthState.create({
      data: {
        sessionId,
        creds: JSON.parse(JSON.stringify(creds, BUFFER_JSON_REPLACER)) as object,
        keys: {},
      },
    });
    sessionLog.debug('Created new auth state');
  }

  const creds = JSON.parse(JSON.stringify(authRecord.creds), BUFFER_JSON_REVIVER) as AuthCreds;
  let storedKeys = (authRecord.keys ?? {}) as Record<string, Record<string, unknown>>;

  const state: AuthState = {
    creds,
    keys: {
      get: async <T>(type: string, ids: string[]): Promise<{ [id: string]: T }> => {
        const data: { [id: string]: T } = {};
        for (const id of ids) {
          const keyData = storedKeys[type]?.[id];
          if (keyData !== undefined) {
            data[id] = JSON.parse(JSON.stringify(keyData), BUFFER_JSON_REVIVER) as T;
          }
        }
        return data;
      },
      set: async (data: Record<string, Record<string, unknown> | null>): Promise<void> => {
        for (const category of Object.keys(data)) {
          const categoryData = data[category];
          if (!categoryData) {
            delete storedKeys[category];
          } else {
            storedKeys[category] ??= {};
            for (const id of Object.keys(categoryData)) {
              const value = categoryData[id];
              if (value === null || value === undefined) {
                delete storedKeys[category]![id];
              } else {
                storedKeys[category]![id] = JSON.parse(
                  JSON.stringify(value, BUFFER_JSON_REPLACER),
                );
              }
            }
          }
        }
        try {
          await prisma.sessionAuthState.update({
            where: { sessionId },
            data: { keys: storedKeys as object },
          });
        } catch (err) {
          sessionLog.error({ err }, 'Failed to persist auth state keys');
        }
      },
    },
  };

  const saveCreds = async () => {
    try {
      await prisma.sessionAuthState.update({
        where: { sessionId },
        data: { creds: JSON.parse(JSON.stringify(state.creds, BUFFER_JSON_REPLACER)) as object },
      });
      sessionLog.debug('Credentials saved');
    } catch (err) {
      sessionLog.error({ err }, 'Failed to save credentials');
    }
  };

  return { state, saveCreds };
}

export async function clearAuthState(sessionId: string): Promise<void> {
  await prisma.sessionAuthState.deleteMany({ where: { sessionId } });
  logger.debug({ sessionId }, 'Auth state cleared');
}
