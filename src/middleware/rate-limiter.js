class RateLimiterStore {
  constructor() {
    this.hits = new Map();
    this.cleanupTimer = setInterval(() => this.purgeExpired(), 5 * 60 * 1000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  recordHit(key, windowMs) {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || now > entry.resetTime) {
      const resetTime = now + windowMs;
      this.hits.set(key, { count: 1, resetTime });
      return { count: 1, resetTime };
    }

    entry.count += 1;
    return { count: entry.count, resetTime: entry.resetTime };
  }

  purgeExpired() {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (now > entry.resetTime) {
        this.hits.delete(key);
      }
    }
  }

  reset() {
    this.hits.clear();
  }

  stop() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}

export const rateLimiterStore = new RateLimiterStore();

export function createRateLimiter({ windowMs, max, message, keyGenerator }) {
  return (req, res, next) => {
    const key = keyGenerator ? keyGenerator(req) : `${req.ip}_${req.baseUrl}${req.path}`;
    const { count, resetTime } = rateLimiterStore.recordHit(key, windowMs);
    const retryAfterSeconds = Math.ceil((resetTime - Date.now()) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));

    if (count > max) {
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        success: false,
        error: message || 'Too many requests. Please try again later.',
        retryAfter: retryAfterSeconds,
      });
    }

    next();
  };
}

// Rate limit upload endpoint (e.g. 5 uploads per 15 min per user)
export const uploadLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many file uploads initiated. Please wait before uploading again.',
  keyGenerator: (req) => `upload_${req.ip}_${req.user?.id || ''}`,
});

// Rate limit follow-up AI action
export const followUpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many AI follow-up actions requested. Please wait before retrying.',
  keyGenerator: (req) => `followup_${req.ip}_${req.user?.id || ''}`,
});
