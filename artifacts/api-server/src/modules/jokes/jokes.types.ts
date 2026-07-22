/**
 * Supported joke categories from JokeAPI.
 */
export type JokeCategory = 'General' | 'Programming' | 'Knock-Knock' | 'Custom';

/**
 * Joke format types.
 */
export type JokeType = 'single' | 'twopart';

/**
 * Content flags for offensive content filtering.
 */
export interface JokeFlags {
  nsfw: boolean;
  religious: boolean;
  political: boolean;
  racist: boolean;
  sexist: boolean;
  explicit: boolean;
}

/**
 * Single-part joke response.
 */
export interface SinglePartJoke {
  type: 'single';
  joke: string;
  category: JokeCategory;
  flags: JokeFlags;
}

/**
 * Two-part joke response (setup + delivery).
 */
export interface TwoPartJoke {
  type: 'twopart';
  setup: string;
  delivery: string;
  category: JokeCategory;
  flags: JokeFlags;
}

/**
 * Union type for all joke responses.
 */
export type JokeResponse = SinglePartJoke | TwoPartJoke;
