const axios = require('axios');
const { sanitizeLog } = require('./log-sanitizer');

const PROVIDER_CONFIG = {
  groq: {
    model:      process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    baseUrl:    'https://api.groq.com/openai/v1',
    chatPath:   '/chat/completions',
    modelsPath: '/models',
    envKey:     'GROQ_API_KEY',
    maxTokens:  4096,
    timeout:    120000,
  },
  gemini: {
    model:   process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    envKey:  'GEMINI_API_KEY',
    maxTokens: 4096,
  },
  openrouter: {
    model:    process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-8b-instruct:free',
    baseUrl:  'https://openrouter.ai/api/v1',
    envKey:   'OPENROUTER_API_KEY',
    maxTokens: 4096,
    timeout:  120000,
  },
  ollama: {
    model:   process.env.OLLAMA_MODEL || 'tinyllama',
    baseUrl: 'http://localhost:11434/v1',
    envKey:  null,
    maxTokens: 1024,
    timeout: 240000,
  },
};

function resolveApiKey(provider, perRequestKey) {
  if (provider === 'ollama') return null;
  const key = perRequestKey || process.env[PROVIDER_CONFIG[provider]?.envKey];
  if (!key) throw new Error(`No API key provided for ${provider}`);
  return key;
}

function getModelName(provider) {
  return PROVIDER_CONFIG[provider]?.model || PROVIDER_CONFIG.groq.model;
}

function buildChatUrl(provider) {
  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);
  return cfg.chatPath ? `${cfg.baseUrl}${cfg.chatPath}` : cfg.baseUrl;
}

async function callWithRetry(fn, options = {}) {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelay = options.baseDelay ?? 1000;
  const retryOnStatus = options.retryOnStatus || [429, 500, 502, 503];
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const isRetryable = retryOnStatus.includes(status) || error.code === 'ECONNRESET';

      if (isRetryable && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        console.log(`[llm-provider] Retryable error (${status || error.code}), retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

function wrapError(error, provider) {
  if (error.code === 'ECONNREFUSED') {
    const names = { groq: 'Groq API', openrouter: 'OpenRouter', ollama: 'Ollama' };
    return new Error(`${names[provider] || provider} is not reachable — check your connection`);
  }

  const data = error.response?.data;
  const msg = typeof data?.error === 'string'
    ? data.error
    : JSON.stringify(data) || error.message;

  return new Error(`${provider} error: ${msg}`);
}

async function validateKey(apiKey, provider) {
  if (provider === 'ollama') {
    return { valid: true, reason: 'Ollama (local) — no key required' };
  }

  if (provider === 'gemini') {
    try {
      const url = `${PROVIDER_CONFIG.gemini.baseUrl}/models?key=${apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { method: 'GET', signal: controller.signal });
      clearTimeout(timeout);

      const data = await response.json();
      if (response.ok && Array.isArray(data.models)) {
        return { valid: true, reason: 'Key is valid — Gemini accessible' };
      }

      const errorMsg = data.error?.message || '';
      if (errorMsg.includes('API key not valid') || errorMsg.includes('API_KEY_INVALID')) {
        return { valid: false, reason: 'Invalid API key — check your Gemini key' };
      }

      return { valid: false, reason: errorMsg || `Gemini error: ${response.status}` };
    } catch (error) {
      if (error.name === 'AbortError') {
        return { valid: false, reason: 'Request timed out — check your connection' };
      }
      return { valid: false, reason: `Gemini error: ${error.message}` };
    }
  }

  if (provider === 'openrouter') {
    try {
      const response = await axios.get(`${PROVIDER_CONFIG.openrouter.baseUrl}/auth/key`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 8000,
      });
      if (response.data?.data) {
        const kd = response.data.data;
        return { valid: true, reason: `Key is valid — label: ${kd.label || 'unknown'}, credits: $${kd.remainingCredits?.toFixed(2) ?? 'N/A'}` };
      }
      return { valid: false, reason: 'OpenRouter returned unexpected response' };
    } catch (error) {
      if (error.response?.status === 401) {
        return { valid: false, reason: 'Invalid API key — check your OpenRouter key' };
      }
      return { valid: false, reason: `OpenRouter error: ${error.message}` };
    }
  }

  // Groq (default)
  try {
    const response = await axios.get(`${PROVIDER_CONFIG.groq.baseUrl}${PROVIDER_CONFIG.groq.modelsPath}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 8000,
    });
    const modelCount = response.data?.data?.length || 0;
    return { valid: true, reason: `Key is valid — ${modelCount} models available`, models: modelCount };
  } catch (error) {
    if (error.response?.status === 401) {
      return { valid: false, reason: 'Invalid API key — check your Groq console' };
    }
    if (error.response?.status === 429) {
      return { valid: true, reason: 'Key is valid (rate limited — wait a moment)' };
    }
    if (error.code === 'ECONNABORTED') {
      return { valid: false, reason: 'Request timed out — check your connection' };
    }
    return { valid: false, reason: error.message };
  }
}

module.exports = {
  PROVIDER_CONFIG,
  resolveApiKey,
  getModelName,
  buildChatUrl,
  callWithRetry,
  wrapError,
  validateKey,
};
