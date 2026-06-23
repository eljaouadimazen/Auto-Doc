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

const sanitizerService = require('./sanitizer.service');
const SECRET_PATTERNS = sanitizerService.builtinPatterns;

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
