/**
 * rate-limiter.middleware.js
 *
 * In-memory rate limiter — no external dependency needed.
 * Tracks requests per IP using a sliding window.
 *
 * Limits:
 *  - /fetch        → 10 requests / 15 min  (GitHub API is expensive)
 *  - /build        → 20 requests / 15 min
 *  - /generate-docs → 10 requests / 15 min  (LLM calls cost tokens)
 *  - default       → 60 requests / 15 min
 */

class RateLimiter {
  constructor() {
    // Map<ip, { count, windowStart }>
    this.store = new Map();

    // Clean up stale entries every 10 minutes
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /**
   * Returns an Express middleware for a specific limit
   * @param {number} maxRequests
   * @param {number} windowMs
   */
  limit(maxRequests, windowMs = 15 * 60 * 1000) {
    return (req, res, next) => {
      const ip  = req.ip || req.connection.remoteAddress || 'unknown';
      const key = `${ip}:${req.path}`;
      const now = Date.now();

      const entry = this.store.get(key);

      if (!entry || now - entry.windowStart > windowMs) {
        // New window
        this.store.set(key, { count: 1, windowStart: now });
        this.setHeaders(res, maxRequests, maxRequests - 1, windowMs);
        return next();
      }

      if (entry.count >= maxRequests) {
        const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
        res.set('Retry-After', retryAfter);
        return res.status(429).json({
          error:      'Too many requests',
          retryAfter: `${retryAfter} seconds`,
          limit:      maxRequests,
          window:     `${windowMs / 60000} minutes`
        });
      }

      entry.count++;
      this.setHeaders(res, maxRequests, maxRequests - entry.count, windowMs);
      next();
    };
  }

  setHeaders(res, limit, remaining, windowMs) {
    res.set({
      'X-RateLimit-Limit':     limit,
      'X-RateLimit-Remaining': Math.max(0, remaining),
      'X-RateLimit-Reset':     Math.ceil(Date.now() / 1000) + windowMs / 1000
    });
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.windowStart > 15 * 60 * 1000) {
        this.store.delete(key);
      }
    }
  }
}

const limiter = new RateLimiter();

module.exports = {
  fetchLimit:    limiter.limit(10,  15 * 60 * 1000),
  buildLimit:    limiter.limit(20,  15 * 60 * 1000),
  generateLimit: limiter.limit(10,  15 * 60 * 1000),
  defaultLimit:  limiter.limit(60,  15 * 60 * 1000),
};