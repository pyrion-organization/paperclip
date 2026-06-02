export const EXTERNAL_INTAKE_RATE_LIMIT_WINDOW_MS = 60_000;
export const EXTERNAL_INTAKE_RATE_LIMIT_MAX_REQUESTS = 30;

export type ExternalIntakeRateLimitActor = {
  mailboxId: string;
  ip: string;
};

export type ExternalIntakeRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export type ExternalIntakeRateLimiter = {
  consume(actor: ExternalIntakeRateLimitActor): ExternalIntakeRateLimitResult;
};

export function createExternalIntakeRateLimiter(options: {
  windowMs?: number;
  maxRequests?: number;
  now?: () => number;
} = {}): ExternalIntakeRateLimiter {
  const windowMs = options.windowMs ?? EXTERNAL_INTAKE_RATE_LIMIT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? EXTERNAL_INTAKE_RATE_LIMIT_MAX_REQUESTS;
  const now = options.now ?? Date.now;
  const hitsByKey = new Map<string, number[]>();

  function key(actor: ExternalIntakeRateLimitActor) {
    return `${actor.mailboxId}:${actor.ip}`;
  }

  function prune(cutoff: number) {
    for (const [actorKey, hits] of hitsByKey) {
      const recentHits = hits.filter((hit) => hit > cutoff);
      if (recentHits.length > 0) hitsByKey.set(actorKey, recentHits);
      else hitsByKey.delete(actorKey);
    }
  }

  return {
    consume(actor) {
      const currentTime = now();
      const cutoff = currentTime - windowMs;
      prune(cutoff);
      const actorKey = key(actor);
      const recentHits = hitsByKey.get(actorKey) ?? [];

      if (recentHits.length >= maxRequests) {
        const oldestHit = recentHits[0] ?? currentTime;
        hitsByKey.set(actorKey, recentHits);
        return {
          allowed: false,
          limit: maxRequests,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((oldestHit + windowMs - currentTime) / 1000)),
        };
      }

      recentHits.push(currentTime);
      hitsByKey.set(actorKey, recentHits);
      return {
        allowed: true,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - recentHits.length),
        retryAfterSeconds: 0,
      };
    },
  };
}
