import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN
      })
    : null;

/**
 * Simple sliding-window rate limiter.
 * Returns true if the request is allowed, false if rate limited.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<boolean> {
  if (!redis) return true; // Allow if Redis not configured

  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const redisKey = `ratelimit:${key}`;

  const pipe = redis.pipeline();
  pipe.zremrangebyscore(redisKey, 0, windowStart);
  pipe.zadd(redisKey, { score: now, member: now.toString() });
  pipe.zcard(redisKey);
  pipe.expire(redisKey, windowSeconds);

  const results = await pipe.exec();
  const count = results[2] as number;

  return count <= maxRequests;
}
