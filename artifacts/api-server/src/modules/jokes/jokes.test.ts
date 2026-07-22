import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { jokesService } from './jokes.service.js';
import type { JokeResponse } from './jokes.types.js';

// Mock fetch for tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('JokesService', () => {
  beforeAll(() => {
    // Reset mocks before all tests
    mockFetch.mockClear();
  });

  afterAll(() => {
    mockFetch.mockClear();
  });

  describe('getRandomJoke', () => {
    it('should fetch a random joke successfully', async () => {
      const mockJoke: JokeResponse = {
        type: 'single',
        joke: 'Why did the programmer quit his job? Because he did not get arrays.',
        category: 'Programming',
        flags: {
          nsfw: false,
          religious: false,
          political: false,
          racist: false,
          sexist: false,
          explicit: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: false,
          type: 'single',
          joke: mockJoke.joke,
          category: 'Programming',
          flags: mockJoke.flags,
        }),
      });

      const joke = await jokesService.getRandomJoke();
      expect(joke).toBeDefined();
      expect(joke.type).toBe('single');
      if (joke.type === 'single') {
        expect(joke.joke).toContain('programmer');
      }
    });

    it('should handle two-part jokes correctly', async () => {
      const mockJoke = {
        error: false,
        type: 'twopart',
        setup: 'How many programmers does it take to change a light bulb?',
        delivery: 'None, that is a hardware problem.',
        category: 'Programming',
        flags: {
          nsfw: false,
          religious: false,
          political: false,
          racist: false,
          sexist: false,
          explicit: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockJoke,
      });

      const joke = await jokesService.getRandomJoke();
      expect(joke.type).toBe('twopart');
      if (joke.type === 'twopart') {
        expect(joke.setup).toContain('programmers');
        expect(joke.delivery).toContain('hardware');
      }
    });

    it('should retry on API failure', async () => {
      const mockJoke = {
        error: false,
        type: 'single',
        joke: 'Test joke',
        category: 'General',
        flags: {
          nsfw: false,
          religious: false,
          political: false,
          racist: false,
          sexist: false,
          explicit: false,
        },
      };

      // Fail twice, succeed on third attempt
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockJoke,
        });

      const joke = await jokesService.getRandomJoke();
      expect(joke).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries exceeded', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(jokesService.getRandomJoke()).rejects.toThrow(
        'Failed to fetch joke after multiple retries',
      );
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should accept category filter', async () => {
      const mockJoke = {
        error: false,
        type: 'single',
        joke: 'A programming joke',
        category: 'Programming',
        flags: {
          nsfw: false,
          religious: false,
          political: false,
          racist: false,
          sexist: false,
          explicit: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockJoke,
      });

      const joke = await jokesService.getRandomJoke({ category: 'Programming' });
      expect(joke).toBeDefined();
      expect(joke.category).toBe('Programming');
    });

    it('should accept safe-mode filter', async () => {
      const mockJoke = {
        error: false,
        type: 'single',
        joke: 'A safe joke',
        category: 'General',
        flags: {
          nsfw: false,
          religious: false,
          political: false,
          racist: false,
          sexist: false,
          explicit: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockJoke,
      });

      const joke = await jokesService.getRandomJoke({ safe: true });
      expect(joke).toBeDefined();
    });
  });

  describe('clearCache', () => {
    it('should handle missing Redis gracefully', async () => {
      // Should not throw even if Redis is unavailable
      await expect(jokesService.clearCache()).resolves.not.toThrow();
    });
  });
});
