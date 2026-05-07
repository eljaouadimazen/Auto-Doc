const rateLimiter = require('../src/services/rate-limiter.middleware');

describe('RateLimiter', () => {
  let counter = 0;

  function uniquePath(prefix) {
    counter++;
    return `/${prefix}-${counter}-${Date.now()}`;
  }

  function createMocks(path) {
    const req = {
      ip: '127.0.0.1',
      path,
      connection: { remoteAddress: '127.0.0.1' },
    };
    const res = {
      _json: null,
      _status: null,
      _headers: {},
      set(key, value) {
        if (typeof key === 'object') {
          Object.assign(this._headers, key);
        } else {
          this._headers[key] = value;
        }
      },
      status(code) {
        this._status = code;
        return this;
      },
      json(obj) {
        this._json = obj;
        return this;
      },
    };
    const next = jest.fn();
    return { req, res, next };
  }

  describe('defaultLimit', () => {
    test('calls next() on first request', () => {
      const { req, res, next } = createMocks(uniquePath('health'));
      rateLimiter.defaultLimit(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('sets rate limit headers', () => {
      const { req, res, next } = createMocks(uniquePath('headers'));
      rateLimiter.defaultLimit(req, res, next);
      expect(res._headers['X-RateLimit-Limit']).toBe(60);
      expect(res._headers['X-RateLimit-Remaining']).toBe(59);
    });
  });

  describe('fetchLimit', () => {
    test('returns 429 after exceeding limit for same IP and path', () => {
      const path = uniquePath('fetch');
      for (let i = 0; i < 10; i++) {
        const { req, res, next } = createMocks(path);
        rateLimiter.fetchLimit(req, res, next);
      }
      const { req, res, next } = createMocks(path);
      rateLimiter.fetchLimit(req, res, next);
      expect(res._status).toBe(429);
      expect(res._json.error).toBe('Too many requests');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('buildLimit', () => {
    test('allows up to 20 requests', () => {
      const path = uniquePath('build');
      for (let i = 0; i < 20; i++) {
        const { req, res, next } = createMocks(path);
        rateLimiter.buildLimit(req, res, next);
        expect(next).toHaveBeenCalled();
      }
    });

    test('blocks the 21st request', () => {
      const path = uniquePath('build-block');
      for (let i = 0; i < 20; i++) {
        const { req, res, next } = createMocks(path);
        rateLimiter.buildLimit(req, res, next);
      }
      const { req, res, next } = createMocks(path);
      rateLimiter.buildLimit(req, res, next);
      expect(res._status).toBe(429);
    });
  });

  describe('generateLimit', () => {
    test('limits to 10 requests', () => {
      const path = uniquePath('generate');
      for (let i = 0; i < 10; i++) {
        const { req, res, next } = createMocks(path);
        rateLimiter.generateLimit(req, res, next);
      }
      const { req, res, next } = createMocks(path);
      rateLimiter.generateLimit(req, res, next);
      expect(res._status).toBe(429);
    });
  });

  describe('per-path isolation', () => {
    test('different paths have independent counters', () => {
      const path1 = uniquePath('fetch-iso');
      const path2 = uniquePath('build-iso');

      for (let i = 0; i < 10; i++) {
        const { req, res, next } = createMocks(path1);
        rateLimiter.fetchLimit(req, res, next);
      }

      const { req, res, next } = createMocks(path2);
      rateLimiter.buildLimit(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
