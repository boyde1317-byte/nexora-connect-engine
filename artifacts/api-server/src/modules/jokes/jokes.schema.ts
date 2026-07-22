import { z } from 'zod';

/**
 * Query schema for random joke requests.
 */
export const randomJokeQuerySchema = z.object({
  category: z.enum(['General', 'Programming', 'Knock-Knock', 'Custom']).optional(),
  type: z.enum(['single', 'twopart']).optional(),
  safe: z.boolean().optional(),
});

export type RandomJokeQuery = z.infer<typeof randomJokeQuerySchema>;

/**
 * Response schema for single-part jokes.
 */
export const singlePartJokeSchema = z.object({
  type: z.literal('single'),
  joke: z.string(),
  category: z.string(),
  flags: z.object({
    nsfw: z.boolean(),
    religious: z.boolean(),
    political: z.boolean(),
    racist: z.boolean(),
    sexist: z.boolean(),
    explicit: z.boolean(),
  }),
});

/**
 * Response schema for two-part jokes.
 */
export const twoPartJokeSchema = z.object({
  type: z.literal('twopart'),
  setup: z.string(),
  delivery: z.string(),
  category: z.string(),
  flags: z.object({
    nsfw: z.boolean(),
    religious: z.boolean(),
    political: z.boolean(),
    racist: z.boolean(),
    sexist: z.boolean(),
    explicit: z.boolean(),
  }),
});

/**
 * Combined joke response schema.
 */
export const jokeResponseSchema = z.union([singlePartJokeSchema, twoPartJokeSchema]);

export type JokeResponse = z.infer<typeof jokeResponseSchema>;
