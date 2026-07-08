const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { sanitizeLog } = require('./log-sanitizer');

class LLMService {
  constructor() {
    if (!process.env.GROQ_API_KEY)      console.warn('⚠  GROQ_API_KEY not set in .env');
    if (!process.env.GEMINI_API_KEY)    console.warn('⚠  GEMINI_API_KEY not set in .env');
    if (!process.env.OPENROUTER_API_KEY) console.warn('⚠  OPENROUTER_API_KEY not set in .env');
  }

  async generate(messages, apiKey = null, provider = 'groq') {

    // ── Local (Ollama) ─────────────────────────────────────────
    if (provider === 'ollama') {
      try {
        const response = await axios.post(
          'http://localhost:11434/v1/chat/completions',
          {
            model:       process.env.OLLAMA_MODEL || 'tinyllama',
            messages,
            temperature: 0.2,
            max_tokens:  1024,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 240000
          }
        );
        return response.data.choices[0].message.content;
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error('Ollama is not running — start it with: ollama serve');
        }
        console.error('[ollama raw error]', sanitizeLog(error.response?.data));
        const ollamaMsg = typeof error.response?.data?.error === 'string'
          ? error.response.data.error
          : JSON.stringify(error.response?.data) || error.message;
        throw new Error(`Ollama error: ${ollamaMsg}`);
      }
    }

    // ── Gemini (native SDK) ────────────────────────────────────
    if (provider === 'gemini') {
      const key = apiKey || process.env.GEMINI_API_KEY;
      if (!key) throw new Error('No Gemini API key provided');

      const genAI   = new GoogleGenerativeAI(key);
      const modelId = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      const model   = genAI.getGenerativeModel({ model: modelId });

      // Convert OpenAI-style messages to Gemini content format
      const contents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      // Retry logic for 429 (quota/rate limit) errors
      const maxRetries = 3;
      let lastError = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await model.generateContent({
            contents,
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4096,
            }
          });

          const response = await result.response;
          return response.text();
        } catch (error) {
          lastError = error;

          // Check if it's a 429 rate limit error
          const isRateLimit = error?.status === 429 ||
                             error?.message?.includes('429') ||
                             error?.message?.includes('Quota exceeded') ||
                             error?.errorDetails?.some(e => e['@type']?.includes('RetryInfo'));

          if (isRateLimit && attempt < maxRetries) {
            // Extract retry delay from error (default to 60s if not found)
            let retryDelay = 60000;
            try {
              const retryInfo = error.errorDetails?.find(e => e['@type']?.includes('RetryInfo'));
              if (retryInfo?.retryDelay) {
                const match = retryInfo.retryDelay.match(/^(\d+\.?\d*)(s|ms|m)/);
                if (match) {
                  const value = parseFloat(match[1]);
                  const unit = match[2];
                  retryDelay = unit === 's' ? value * 1000 : unit === 'm' ? value * 60000 : value;
                }
              }
            } catch (e) { /* use default */ }

            console.log(`[Gemini] Rate limited. Retrying in ${retryDelay}ms (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay + Math.random() * 1000));
            continue;
          }

          break;
        }
      }

      // All retries failed
      const errorMsg = lastError?.message || 'Unknown Gemini error';
      if (errorMsg.includes('Quota exceeded') || errorMsg.includes('429')) {
        throw new Error(`Gemini quota exceeded: ${errorMsg}`);
      }
      if (errorMsg.includes('API key not valid') || errorMsg.includes('401')) {
        throw new Error('Invalid API key — check your Gemini key');
      }
      throw new Error(`Gemini error: ${errorMsg}`);
    }

    // ── OpenRouter ─────────────────────────────────────────────
    if (provider === 'openrouter') {
      const key = apiKey || process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error('No OpenRouter API key provided');

      try {
        const response = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model:    process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-8b-instruct:free',
            messages,
            temperature: 0.2,
            max_tokens: 4096
          },
          {
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type':  'application/json',
              'HTTP-Referer':  process.env.HTTP_REFERER  || 'http://localhost:3000',
              'X-Title':       process.env.X_TITLE       || 'Auto-Doc'
            },
            timeout: 120000
          }
        );
        return response.data.choices[0].message.content;
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error('OpenRouter is not reachable — check your connection');
        }
        console.error('[openrouter raw error]', sanitizeLog(error.response?.data));
        const orMsg = typeof error.response?.data?.error === 'string'
          ? error.response.data.error
          : JSON.stringify(error.response?.data) || error.message;
        throw new Error(`OpenRouter error: ${orMsg}`);
      }
    }

    // ── Groq (default) ────────────────────────────────────────
    const key   = apiKey || process.env.GROQ_API_KEY;
    if (!key) throw new Error('No Groq API key provided');

    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model:    process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.2,
          max_tokens: 4096
        },
        {
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        }
      );
      return response.data.choices[0].message.content;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Groq API is not reachable — check your connection');
      }
      console.error('[groq raw error]', sanitizeLog(error.response?.data));
      const groqMsg = typeof error.response?.data?.error === 'string'
        ? error.response.data.error
        : JSON.stringify(error.response?.data) || error.message;
      throw new Error(`Groq error: ${groqMsg}`);
    }
  }

  /**
   * Validate an API key for the current provider
   * @param {string} apiKey
   * @param {string} provider - 'groq' | 'ollama' | 'gemini' | 'openrouter'
   * @returns {{ valid: boolean, reason: string }}
   */
  async validateKey(apiKey, provider = 'groq') {

    // Ollama — local, no key needed
    if (provider === 'ollama') {
      return { valid: true, reason: 'Ollama (local) — no key required' };
    }

    // Gemini — validate via REST API using models list endpoint
    if (provider === 'gemini') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal
        });

        const data = await response.json();

        // Successfully listed models = valid key
        if (response.ok && Array.isArray(data.models)) {
          return { valid: true, reason: 'Key is valid — Gemini accessible' };
        }

        // Check specifically for invalid key error
        const errorMsg = data.error?.message || '';
        const isInvalidKey = errorMsg.includes('API key not valid') ||
                            errorMsg.includes('API_KEY_INVALID') ||
                            data.error?.status === 'INVALID_ARGUMENT';

        if (isInvalidKey) {
          return { valid: false, reason: 'Invalid API key — check your Gemini key' };
        }

        return { valid: false, reason: errorMsg || `Gemini error: ${response.status}` };
      } catch (error) {
        if (error.name === 'AbortError') {
          return { valid: false, reason: 'Request timed out — check your connection' };
        }
        return { valid: false, reason: `Gemini error: ${error.message}` };
      } finally {
        clearTimeout(timeout);
      }
    }

    // OpenRouter — validate via /auth/key endpoint
    if (provider === 'openrouter') {
      try {
        const response = await axios.get(
          'https://openrouter.ai/api/v1/auth/key',
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 8000
          }
        );
        if (response.data?.data) {
          const keyData = response.data.data;
          return {
            valid: true,
            reason: `Key is valid — label: ${keyData.label || 'unknown'}, credits: $${keyData.remainingCredits?.toFixed(2) ?? 'N/A'}`
          };
        }
        return { valid: false, reason: 'OpenRouter returned unexpected response' };
      } catch (error) {
        if (error.response?.status === 401) {
          return { valid: false, reason: 'Invalid API key — check your OpenRouter key' };
        }
        return { valid: false, reason: `OpenRouter error: ${error.message}` };
      }
    }

    // Groq — validate via /models endpoint
    try {
      const response = await axios.get(
        'https://api.groq.com/openai/v1/models',
        {
          headers: {
            Authorization:  `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 8000
        }
      );

      const modelCount = response.data?.data?.length || 0;
      return {
        valid:  true,
        reason: `Key is valid — ${modelCount} models available`,
        models: modelCount
      };

    } catch (error) {
      if (error.response) {
        const status = error.response.status;

        if (status === 401) {
          return { valid: false, reason: 'Invalid API key — check your Groq console' };
        }
        if (status === 429) {
          return { valid: true, reason: 'Key is valid (rate limited — wait a moment)' };
        }

        return { valid: false, reason: `Groq returned ${status}` };
      }

      if (error.code === 'ECONNABORTED') {
        return { valid: false, reason: 'Request timed out — check your connection' };
      }

      return { valid: false, reason: error.message };
    }
  }
}

module.exports = new LLMService();
