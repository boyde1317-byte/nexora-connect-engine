import { getRedis, isRedisAvailable } from '../../infrastructure/redis.js';
import { logger } from '../../lib/logger.js';
import { SessionError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import type { JokeResponse, JokeCategory, JokeType } from './jokes.types.js';

const JOKO_API_BASE_URL = 'https://v2.jokeapi.dev';
const CACHE_TTL_SECONDS = 300; // 5 minutes
const CACHE_KEY_PREFIX = 'jokes:';
const REQUEST_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;

interface JokeApiResponse {
  error: boolean;
  category?: string;
  type?: string;
  setup?: string;
  delivery?: string;
  joke?: string;
  flags?: {
    nsfw: boolean;
    religious: boolean;
    political: boolean;
    racist: boolean;
    sexist: boolean;
    explicit: boolean;
  };
}

export class JokesService {
  private readonly log = logger.child({ component: 'JokesService' });

  /**
   * Fetch a random joke from JokeAPI with caching and retry logic.
   */
  async getRandomJoke(options?: {
    category?: JokeCategory;
    type?: JokeType;
    safe?: boolean;
  }): Promise<JokeResponse> {
    const cacheKey = this.buildCacheKey(options);

    // Attempt to retrieve from cache
    if (isRedisAvailable()) {
      try {
        const cached = await this.getFromCache(cacheKey);
        if (cached) {
          this.log.debug({ cacheKey }, 'Joke retrieved from cache');
          return cached;
        }
      } catch (error) {
        this.log.warn({ err: error }, 'Cache retrieval failed, continuing without cache');
      }
    }

    // Fetch from external API with retry logic
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const joke = await this.fetchFromApi(options);
        this.log.debug({ category: options?.category, type: options?.type }, 'Joke fetched from API');

        // Cache the result if Redis is available
        if (isRedisAvailable()) {
          await this.setInCache(cacheKey, joke).catch((err) => {
            this.log.warn({ err }, 'Failed to cache joke');
          });
        }

        return joke;
      } catch (error) {
        lastError = error as Error;
        if (attempt < MAX_RETRIES) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          this.log.warn(
            { attempt, backoffMs, err: lastError.message },
            'Joke API request failed, retrying with exponential backoff',
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    this.log.error({ err: lastError }, 'Failed to fetch joke after retries');
    throw new SessionError(
      'Failed to fetch joke after multiple retries',
      'JOKE_API_ERROR',
    );
  }

  /**
   * Fetch a specific joke by ID (if API supports it).
   */
  async getJokeById(id: string): Promise<JokeResponse> {
    const cacheKey = `${CACHE_KEY_PREFIX}id:${id}`;

    if (isRedisAvailable()) {
      try {
        const cached = await this.getFromCache(cacheKey);
        if (cached) {
          this.log.debug({ jokeId: id }, 'Joke by ID retrieved from cache');
          return cached;
        }
      } catch (error) {
        this.log.warn({ err: error }, 'Cache retrieval failed');
      }
    }

    try {
      const joke = await this.fetchFromApi({ id });
      if (isRedisAvailable()) {
        await this.setInCache(cacheKey, joke).catch(() => {});
      }
      return joke;
    } catch (error) {
      this.log.error({ jokeId: id, err: error }, 'Failed to fetch joke by ID');
      throw new SessionError('Joke not found', 'JOKE_NOT_FOUND');
    }
  }

  /**
   * Clear cache for a specific key or all jokes cache.
   */
  async clearCache(key?: string): Promise<void> {
    if (!isRedisAvailable()) {
      this.log.debug('Redis not available, skipping cache clear');
      return;
    }

    try {
      const redis = getRedis();
      if (key) {
        await redis.del(key);
        this.log.debug({ key }, 'Cache cleared for key');
      } else {
        const pattern = `${CACHE_KEY_PREFIX}*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          this.log.debug({ count: keys.length }, 'All jokes cache cleared');
        }
      }
    } catch (error) {
      this.log.error({ err: error }, 'Failed to clear cache');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ──────────────────────────────────────────────────────────────────────────

  private async fetchFromApi(options?: {
    category?: JokeCategory;
    type?: JokeType;
    safe?: boolean;
    id?: string;
  }): Promise<JokeResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      let url = `${JOKO_API_BASE_URL}/joke`;

      if (options?.id) {
        url += `/${options.id}`;
      } else if (options?.category) {
        url += `/${options.category}`;
      } else {
        url += '/Any';
      }

      const params = new URLSearchParams();
      if (options?.type) params.append('type', options.type);
      if (options?.safe !== undefined) params.append('safe-mode', options.safe ? 'true' : 'false');

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': `${env.APP_NAME}/${env.APP_VERSION}`,
        },
      });

      if (!response.ok) {
        throw new Error(`JokeAPI returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as JokeApiResponse;

      if (data.error) {
        throw new Error('JokeAPI returned error flag');
      }

      return this.parseJokeResponse(data);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('JokeAPI request timeout');
        }
        throw error;
      }
      throw new Error('Unknown error fetching from JokeAPI');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseJokeResponse(data: JokeApiResponse): JokeResponse {
    if (data.type === 'twopart') {
      return {
        type: 'twopart',
        setup: data.setup || 'No setup available',
        delivery: data.delivery || 'No delivery available',
        category: (data.category as JokeCategory) || 'General',
        flags: data.flags || {},
      };
    }

    return {
      type: 'single',
      joke: data.joke || 'No joke available',
      category: (data.category as JokeCategory) || 'General',
      flags: data.flags || {},
    };
  }

  private buildCacheKey(options?: {
    category?: JokeCategory;
    type?: JokeType;
    safe?: boolean;
  }): string {
    const parts = ['random'];
    if (options?.category) parts.push(options.category);
    if (options?.type) parts.push(options.type);
    if (options?.safe !== undefined) parts.push(options.safe ? 'safe' : 'all');
    return `${CACHE_KEY_PREFIX}${parts.join(':')}:${Date.now() % 1000}`; // Add time-based component for variation
  }

  private async getFromCache(key: string): Promise<JokeResponse | null> {
    const redis = getRedis();
    const cached = await redis.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as JokeResponse;
  }

  private async setInCache(key: string, value: JokeResponse): Promise<void> {
    const redis = getRedis();
    await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(value));
  }
}

export const jokesService = new JokesService();
