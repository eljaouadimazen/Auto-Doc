const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { sanitizeLog } = require('./log-sanitizer');
const llmProvider = require('./llm-provider.service');

class LLMService {
  constructor() {
    if (!process.env.GROQ_API_KEY)      console.warn('⚠  GROQ_API_KEY not set in .env');
    if (!process.env.GEMINI_API_KEY)    console.warn('⚠  GEMINI_API_KEY not set in .env');
    if (!process.env.OPENROUTER_API_KEY) console.warn('⚠  OPENROUTER_API_KEY not set in .env');
  }

  async generate(messages, apiKey = null, provider = 'groq') {
    if (provider === 'ollama') return this._callOllama(messages);
    if (provider === 'gemini') return this._callGemini(messages, apiKey);
    if (provider === 'openrouter') return this._callOpenRouter(messages, apiKey);
    return this._callGroq(messages, apiKey);
  }

  async _callOllama(messages) {
    return llmProvider.callWithRetry(async () => {
      const response = await axios.post(
        llmProvider.buildChatUrl('ollama'),
        {
          model:       llmProvider.getModelName('ollama'),
          messages,
          temperature: 0.2,
          max_tokens:  llmProvider.PROVIDER_CONFIG.ollama.maxTokens,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: llmProvider.PROVIDER_CONFIG.ollama.timeout,
        }
      );
      return response.data.choices[0].message.content;
    }, { maxRetries: 2, baseDelay: 1000 });
  }

  async _callGemini(messages, apiKey) {
    const key = llmProvider.resolveApiKey('gemini', apiKey);
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: llmProvider.getModelName('gemini') });

    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await model.generateContent({
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: llmProvider.PROVIDER_CONFIG.gemini.maxTokens,
          }
        });
        const response = await result.response;
        return response.text();
      } catch (error) {
        lastError = error;
        const isRateLimit = error?.status === 429 ||
                           error?.message?.includes('429') ||
                           error?.message?.includes('Quota exceeded') ||
                           error?.errorDetails?.some(e => e['@type']?.includes('RetryInfo'));

        if (isRateLimit && attempt < maxRetries) {
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

    const errorMsg = lastError?.message || 'Unknown Gemini error';
    if (errorMsg.includes('Quota exceeded') || errorMsg.includes('429')) {
      throw new Error(`Gemini quota exceeded: ${errorMsg}`);
    }
    if (errorMsg.includes('API key not valid') || errorMsg.includes('401')) {
      throw new Error('Invalid API key — check your Gemini key');
    }
    throw new Error(`Gemini error: ${errorMsg}`);
  }

  async _callOpenRouter(messages, apiKey) {
    const key = llmProvider.resolveApiKey('openrouter', apiKey);
    return llmProvider.callWithRetry(async () => {
      const response = await axios.post(
        llmProvider.buildChatUrl('openrouter'),
        {
          model:       llmProvider.getModelName('openrouter'),
          messages,
          temperature: 0.2,
          max_tokens:  llmProvider.PROVIDER_CONFIG.openrouter.maxTokens,
        },
        {
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type':  'application/json',
            'HTTP-Referer':  process.env.HTTP_REFERER  || 'http://localhost:3000',
            'X-Title':       process.env.X_TITLE       || 'Auto-Doc',
          },
          timeout: llmProvider.PROVIDER_CONFIG.openrouter.timeout,
        }
      );
      return response.data.choices[0].message.content;
    }, { maxRetries: 2, baseDelay: 1000 });
  }

  async _callGroq(messages, apiKey) {
    const key = llmProvider.resolveApiKey('groq', apiKey);
    return llmProvider.callWithRetry(async () => {
      const response = await axios.post(
        llmProvider.buildChatUrl('groq'),
        {
          model:       llmProvider.getModelName('groq'),
          messages,
          temperature: 0.2,
          max_tokens:  llmProvider.PROVIDER_CONFIG.groq.maxTokens,
        },
        {
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          timeout: llmProvider.PROVIDER_CONFIG.groq.timeout,
        }
      );
      return response.data.choices[0].message.content;
    }, { maxRetries: 2, baseDelay: 1000 });
  }

  async validateKey(apiKey, provider = 'groq') {
    return llmProvider.validateKey(apiKey, provider);
  }
}

module.exports = new LLMService();
