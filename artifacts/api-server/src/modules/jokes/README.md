# Jokes Module

## Overview

The Jokes module provides a production-grade random joke generator API with external JokeAPI integration, Redis caching, and comprehensive error handling.

## Features

✨ **External API Integration**
- Integrates with [JokeAPI](https://jokeapi.dev) for diverse joke content
- Supports multiple categories: General, Programming, Knock-Knock, Custom
- Two joke formats: single-part and two-part (setup/delivery)
- Content filtering flags (NSFW, religious, political, racist, sexist, explicit)

🚀 **Performance & Caching**
- Redis-backed caching with 5-minute TTL
- Graceful degradation when Redis is unavailable
- Exponential backoff retry logic (up to 3 attempts)
- Request timeout handling (5-second timeout)

🔒 **Production-Grade Features**
- Full Zod schema validation
- Comprehensive error handling
- Request logging with structured context
- Cache invalidation via admin endpoint

📊 **Type Safety**
- Fully typed TypeScript interfaces
- Runtime validation with Zod schemas
- Discriminated unions for joke types

## API Endpoints

### Public Endpoints

#### Get Random Joke
```
GET /api/jokes/random
```

Query Parameters:
- `category` (optional): 'General' | 'Programming' | 'Knock-Knock' | 'Custom'
- `type` (optional): 'single' | 'twopart'
- `safe` (optional): boolean

Example Request:
```bash
curl "http://localhost:5000/api/jokes/random?category=Programming&safe=true"
```

Example Response (Single-Part):
```json
{
  "success": true,
  "data": {
    "type": "single",
    "joke": "Why did the programmer quit his job? Because he did not get arrays.",
    "category": "Programming",
    "flags": {
      "nsfw": false,
      "religious": false,
      "political": false,
      "racist": false,
      "sexist": false,
      "explicit": false
    }
  },
  "timestamp": "2026-07-22T18:52:53.000Z"
}
```

Example Response (Two-Part):
```json
{
  "success": true,
  "data": {
    "type": "twopart",
    "setup": "How many programmers does it take to change a light bulb?",
    "delivery": "None, that is a hardware problem.",
    "category": "Programming",
    "flags": {
      "nsfw": false,
      "religious": false,
      "political": false,
      "racist": false,
      "sexist": false,
      "explicit": false
    }
  },
  "timestamp": "2026-07-22T18:52:53.000Z"
}
```

#### Get Joke by Category
```
GET /api/jokes/random/:category
```

Path Parameters:
- `category`: 'General' | 'Programming' | 'Knock-Knock' | 'Custom'

Example Request:
```bash
curl "http://localhost:5000/api/jokes/random/Programming"
```

### Admin Endpoints

#### Clear Jokes Cache
```
POST /api/jokes/clear-cache
Authorization: Bearer <ACCESS_TOKEN>
```

Requires: ADMIN or SUPER_ADMIN role

Example Request:
```bash
curl -X POST "http://localhost:5000/api/jokes/clear-cache" \
  -H "Authorization: Bearer eyJ..."
```

Example Response:
```json
{
  "success": true,
  "message": "Jokes cache cleared successfully"
}
```

## Error Handling

The module implements comprehensive error handling:

### API Errors

**Invalid Category** (400)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "category": ["Invalid enum value"]
    }
  }
}
```

**API Failure** (500)
```json
{
  "success": false,
  "error": {
    "code": "JOKE_API_ERROR",
    "message": "Failed to fetch joke after multiple retries"
  }
}
```

**Unauthorized Cache Clear** (403)
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Only admins can clear the jokes cache"
  }
}
```

## Architecture

### Service Layer (`jokes.service.ts`)

The `JokesService` class manages:
- External API communication with retry logic
- Redis caching layer integration
- Error handling and logging
- Request timeout management

**Key Methods:**
- `getRandomJoke(options)` - Fetch a random joke with optional filters
- `getJokeById(id)` - Fetch a specific joke (if API supports)
- `clearCache(key)` - Clear cache entries

### Controller Layer (`jokes.controller.ts`)

The controller handles:
- HTTP request parsing and validation
- Service invocation
- Response formatting
- Authorization checks (for admin endpoints)

### Routes (`jokes.routes.ts`)

Defines all joke endpoints and their middleware:
- Public endpoints (no authentication)
- Admin-only endpoints (with role-based access control)

### Types (`jokes.types.ts`)

Provides TypeScript interfaces:
- `JokeCategory` - Supported categories
- `JokeType` - Joke format types
- `JokeFlags` - Content filtering flags
- `JokeResponse` - Union of all joke types

### Schemas (`jokes.schema.ts`)

Zod schemas for:
- Query parameter validation
- Response type validation
- Type-safe inference

## Caching Strategy

### Cache Key Structure
```
jokeS:random[:{category}][:{type}][:{safe}]:{timestamp}
```

Examples:
- `jokes:random:1234` - Any random joke
- `jokes:random:Programming:single:1234` - Programming single-part joke
- `jokes:random:General:twopart:safe:1234` - General safe two-part joke

### TTL
- Default: 5 minutes (300 seconds)
- Configurable via `CACHE_TTL_SECONDS` in `jokes.service.ts`

### Cache Invalidation
- Manual: Admin endpoint `/api/jokes/clear-cache`
- Automatic: 5-minute expiration
- Error: Failures are logged but don't break functionality

## Retry Logic

The service implements exponential backoff:

```
Attempt 1: Immediate
Attempt 2: 1s (2^1 - 1)
Attempt 3: 2s (2^2 - 1)
Max Wait: 5s
```

## Testing

Run the test suite:
```bash
pnpm test src/modules/jokes
```

Test Coverage:
- ✅ Random joke fetching
- ✅ Category filtering
- ✅ Safe-mode filtering
- ✅ Two-part joke parsing
- ✅ Retry logic on failures
- ✅ Max retries exceeded
- ✅ Cache operations

## Environment Variables

No specific environment variables required. Uses:
- `NODE_ENV` - For logging levels
- `LOG_LEVEL` - For structured logging
- `APP_NAME`, `APP_VERSION` - For User-Agent header

## Dependencies

- `fastify` - HTTP framework
- `zod` - Schema validation
- `ioredis` - Redis client
- `pino` - Logging

## Production Considerations

### Rate Limiting
- Jokes endpoints are subject to global rate limiting
- Configure via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW`

### Logging
- All requests logged with structured context
- Errors logged with full stack traces
- API failures logged with retry attempts

### Monitoring
- Track cache hit/miss rates
- Monitor API response times
- Alert on repeated API failures

### Security
- Public endpoints (no authentication required)
- Admin endpoints protected with role-based access control
- All inputs validated with Zod schemas
- Sensitive data redacted from logs

## Future Enhancements

- [ ] Joke history per user
- [ ] User-specific joke preferences
- [ ] Integration with additional joke APIs
- [ ] Joke rating/feedback system
- [ ] Custom joke submission
- [ ] Batch joke fetching
- [ ] Webhook notifications for new jokes
