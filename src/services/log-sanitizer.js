/**
 * log-sanitizer.js
 *
 * Sanitizes log output to prevent secrets and API keys from leaking
 * into server logs, error stacks, or monitoring systems.
 *
 * Usage:
 *   const { sanitizeLog } = require('./log-sanitizer');
 *   console.error(sanitizeLog(err.stack));
 */

const SECRET_PATTERNS = [
  { name: 'groq_key',      regex: /gsk_[A-Za-z0-9]{20,}/g },
  { name: 'openai_key',    regex: /sk-(?:proj-)?[A-Za-z0-9]{20,}/g },
  { name: 'github_pat',    regex: /ghp_[A-Za-z0-9]{20,}/g },
  { name: 'github_actions',regex: /ghs_[A-Za-z0-9]{20,}/g },
  { name: 'aws_key',       regex: /AKIA[A-Z0-9]{16}/g },
  { name: 'gemini_key',    regex: /AIza[0-9A-Za-z\-_]{35}/g },
  { name: 'stripe_key',    regex: /(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,}/g },
  { name: 'bearer_token',  regex: /Bearer\s+[A-Za-z0-9\-_.]{20,}/gi },
  { name: 'api_key_header',regex: /x-api-key["']?\s*[:=]\s*["']?[A-Za-z0-9\-_.]{16,}["']?/gi },
  { name: 'authorization', regex: /authorization["']?\s*[:=]\s*["']?[A-Za-z0-9\-_.]{20,}["']?/gi },
  { name: 'dotenv_secret', regex: /^([A-Z][A-Z0-9_]{2,}(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|API_KEY))\s*=\s*["']?([^\s"'\n]{8,})["']?$/gm },
  { name: 'mongodb_uri',   regex: /mongodb(?:\+srv)?:\/\/[^\s"')]+/gi },
  { name: 'postgres_uri',  regex: /postgres(?:ql)?:\/\/[^\s"')]+/gi },
  { name: 'redis_uri',     regex: /redis:\/\/[^\s"')]+/gi },
  { name: 'private_key',   regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'slack_token',   regex: /xox[baprs]-[A-Za-z0-9\-]{10,}/g },
  { name: 'sendgrid_key',  regex: /SG\.[A-Za-z0-9\-_]{22}\.[A-Za-z0-9\-_]{43}/g },
];

/**
 * Sanitize a string by replacing known secret patterns with [REDACTED].
 * Handles strings, errors, and recursively sanitizes object values.
 *
 * @param {*} input - String, Error, or object to sanitize
 * @returns {string|object} Sanitized output
 */
function sanitizeLog(input) {
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') {
    return _sanitizeString(input);
  }

  if (input instanceof Error) {
    return _sanitizeString(input.stack || input.message);
  }

  if (typeof input === 'object') {
    return _sanitizeObject(input);
  }

  return input;
}

function _sanitizeString(str) {
  let result = str;
  for (const { regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    result = result.replace(regex, (match) => {
      if (match.includes('x-api-key') || match.includes('authorization')) {
        const eqIdx = match.indexOf('=');
        const colonIdx = match.indexOf(':');
        const splitIdx = eqIdx !== -1 ? eqIdx : colonIdx;
        if (splitIdx !== -1) {
          return match.slice(0, splitIdx + 1) + ' [REDACTED]';
        }
      }
      return '[REDACTED]';
    });
  }
  return result;
}

function _sanitizeObject(obj, depth = 0) {
  if (depth > 5 || obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'string') return _sanitizeString(item);
      if (typeof item === 'object' && item !== null) return _sanitizeObject(item, depth + 1);
      return item;
    });
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (_isSensitiveKey(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      sanitized[key] = _sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = _sanitizeObject(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function _isSensitiveKey(key) {
  return [
    'api_key', 'apikey', 'api-key',
    'secret', 'secret_key', 'secretkey',
    'token', 'access_token', 'auth', 'authorization',
    'password', 'passwd', 'pwd',
    'private_key', 'privatekey',
    'x-api-key', 'x-apikey',
  ].some(sensitive => key.includes(sensitive));
}

module.exports = { sanitizeLog };
