const axios = require('axios'); // ← FIX #1: was missing

class LLMService {
  constructor() {
    if (!process.env.GROQ_API_KEY) {
      console.warn(' GROQ_API_KEY not set — /generate-docs will fail');
    }
  }

  async generate(messages) {
    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: messages,
          temperature: 0.2,
          max_tokens: 4096
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30s timeout — Groq can be slow on large prompts
        }
      );

      return response.data.choices[0].message.content;

    } catch (error) {
      // Surface Groq's error message properly
      if (error.response) {
        const msg = error.response.data?.error?.message || 'Unknown Groq error';
        throw new Error(`Groq API error (${error.response.status}): ${msg}`);
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('Groq request timed out — try a smaller repository');
      }
      throw error;
    }
  }
}

module.exports = new LLMService();