const axios = require('axios');

class LLMService {
  constructor() {
    if (!process.env.GROQ_API_KEY) {
      console.warn('⚠  GROQ_API_KEY not set in .env — users must provide their own key');
    }
  }

  /**
   * Generate documentation from messages
   * @param {Array}  messages - LLM message array
   * @param {string} apiKey   - optional per-request key (overrides .env)
   */
  async generate(messages, apiKey = null) {
    const key = apiKey || process.env.GROQ_API_KEY;

    if (!key) {
      throw new Error('No Groq API key provided. Add your key in the settings panel or set GROQ_API_KEY in .env');
    }

    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model:       'llama-3.3-70b-versatile',
          messages,
          temperature: 0.2,
          max_tokens:  4096
        },
        {
          headers: {
            Authorization:  `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.choices[0].message.content;

    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const msg    = error.response.data?.error?.message || 'Unknown Groq error';
        if (status === 401) throw new Error('Invalid API key — check your Groq key and try again');
        if (status === 413) throw new Error('Prompt too large — try a smaller repository');
        if (status === 429) throw new Error('Rate limit reached — wait a moment and try again');
        throw new Error(`Groq API error (${status}): ${msg}`);
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out — Groq took too long to respond');
      }
      throw error;
    }
  }

  /**
   * Validate a Groq API key using the /models endpoint
   * - No chat completion = zero tokens consumed
   * - Just a GET request that lists available models
   * - Returns 401 if key is invalid, 200 if valid
   *
   * @param {string} apiKey
   * @returns {{ valid: boolean, reason: string, models?: number }}
   */
  async validateKey(apiKey) {
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

      // 200 means the key is valid — return how many models are available
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
          // Rate limited but key itself IS valid
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