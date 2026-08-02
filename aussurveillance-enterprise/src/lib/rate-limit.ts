export class RateLimitError extends Error {
  status: number;
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.status = 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface RateLimitRule {
  keyPrefix: string;
  maxRequests: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0]?.trim();
    if (ip) {
      return ip;
    }
  }
  return "unknown";
}

function currentWindow(now: number, windowMs: number): number {
  return Math.floor(now / windowMs);
}

export function enforceRateLimit(
  request: Request,
  rule: RateLimitRule,
  actorId = "anonymous",
) {
  const now = Date.now();
  const ip = getClientIp(request);
  const windowId = currentWindow(now, rule.windowMs);
  const key = `${rule.keyPrefix}:${windowId}:${actorId}:${ip}`;
  const existing = buckets.get(key);
  const resetAt = (windowId + 1) * rule.windowMs;

  if (!existing) {
    buckets.set(key, { count: 1, resetAt });
    return {
      remaining: Math.max(rule.maxRequests - 1, 0),
      resetAt,
    };
  }

  if (existing.count >= rule.maxRequests) {
    const retryAfterSeconds = Math.max(
      Math.ceil((existing.resetAt - now) / 1000),
      1,
    );
    throw new RateLimitError(
      `Rate limit exceeded for ${rule.keyPrefix}. Retry in ${retryAfterSeconds}s.`,
      retryAfterSeconds,
    );
  }

  existing.count += 1;
  buckets.set(key, existing);
  return {
    remaining: Math.max(rule.maxRequests - existing.count, 0),
    resetAt: existing.resetAt,
  };
}

