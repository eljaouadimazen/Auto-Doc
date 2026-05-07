jest.mock('axios');
jest.mock('@google/generative-ai');

const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const llmService = require('../src/services/llm.service');

describe('LLMService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generate', () => {
    test('calls Groq API by default and returns content', async () => {
      axios.post.mockResolvedValue({
        data: { choices: [{ message: { content: 'Generated documentation content' } }] }
      });

      const result = await llmService.generate(
        [{ role: 'user', content: 'write docs' }],
        'test-key',
        'groq'
      );

      expect(result).toBe('Generated documentation content');
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/chat/completions',
        expect.objectContaining({
          model: expect.any(String),
          messages: [{ role: 'user', content: 'write docs' }],
        }),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
        })
      );
    });

    test('throws when Groq key is missing', async () => {
      await expect(llmService.generate([{ role: 'user', content: 'test' }], null, 'groq'))
        .rejects.toThrow('No Groq API key provided');
    });

    test('calls Ollama provider', async () => {
      axios.post.mockResolvedValue({
        data: { choices: [{ message: { content: 'Ollama response' } }] }
      });

      const result = await llmService.generate(
        [{ role: 'user', content: 'hello' }],
        null,
        'ollama'
      );

      expect(result).toBe('Ollama response');
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:11434/v1/chat/completions',
        expect.any(Object),
        expect.any(Object)
      );
    });

    test('throws friendly error when Ollama is not running', async () => {
      axios.post.mockRejectedValue({ code: 'ECONNREFUSED' });

      await expect(llmService.generate(
        [{ role: 'user', content: 'hi' }], null, 'ollama'
      )).rejects.toThrow('Ollama is not running');
    });

    test('handles Ollama generic error with response data', async () => {
      axios.post.mockRejectedValue({
        response: { data: { error: 'Model not found' } }
      });

      await expect(llmService.generate(
        [{ role: 'user', content: 'hi' }], null, 'ollama'
      )).rejects.toThrow('Ollama error');
    });

    test('calls OpenRouter provider', async () => {
      axios.post.mockResolvedValue({
        data: { choices: [{ message: { content: 'OpenRouter response' } }] }
      });

      const result = await llmService.generate(
        [{ role: 'user', content: 'analyze' }],
        'or-key-123',
        'openrouter'
      );

      expect(result).toBe('OpenRouter response');
      expect(axios.post).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer or-key-123',
          }),
        })
      );
    });

    test('throws when OpenRouter key is missing', async () => {
      await expect(llmService.generate(
        [{ role: 'user', content: 'test' }], null, 'openrouter'
      )).rejects.toThrow('No OpenRouter API key provided');
    });

    test('handles OpenRouter ECONNREFUSED', async () => {
      axios.post.mockRejectedValue({ code: 'ECONNREFUSED' });

      await expect(llmService.generate(
        [{ role: 'user', content: 'test' }], 'key', 'openrouter'
      )).rejects.toThrow('OpenRouter is not reachable');
    });

    test('handles OpenRouter generic error', async () => {
      axios.post.mockRejectedValue({
        response: { data: { error: 'Rate limited' } }
      });

      await expect(llmService.generate(
        [{ role: 'user', content: 'test' }], 'key', 'openrouter'
      )).rejects.toThrow('OpenRouter error');
    });

    test('handles Groq API error with response data', async () => {
      axios.post.mockRejectedValue({
        response: { data: { error: { message: 'Rate limit exceeded' } } }
      });

      await expect(llmService.generate(
        [{ role: 'user', content: 'test' }], 'key', 'groq'
      )).rejects.toThrow('Groq error');
    });

    test('handles Groq ECONNREFUSED', async () => {
      axios.post.mockRejectedValue({ code: 'ECONNREFUSED' });

      await expect(llmService.generate(
        [{ role: 'user', content: 'test' }], 'key', 'groq'
      )).rejects.toThrow('Groq API is not reachable');
    });

    describe('Gemini provider', () => {
      beforeEach(() => {
        const mockTextFn = jest.fn().mockResolvedValue('Gemini generated content');
        GoogleGenerativeAI.mockImplementation(() => ({
          getGenerativeModel: jest.fn().mockReturnValue({
            generateContent: jest.fn().mockResolvedValue({
              response: { text: mockTextFn }
            })
          })
        }));
      });

      test('generates content with Gemini provider', async () => {
        const result = await llmService.generate(
          [{ role: 'user', content: 'write docs' }],
          'gemini-key',
          'gemini'
        );

        expect(result).toBe('Gemini generated content');
      });

      test('throws when Gemini key is missing', async () => {
        await expect(llmService.generate(
          [{ role: 'user', content: 'test' }], null, 'gemini'
        )).rejects.toThrow('No Gemini API key provided');
      });

      test('falls back to env var GEMINI_API_KEY', async () => {
        const origKey = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'env-gemini-key';
        GoogleGenerativeAI.mockClear();

        const result = await llmService.generate(
          [{ role: 'user', content: 'hello' }], null, 'gemini'
        );

        expect(result).toBe('Gemini generated content');
        process.env.GEMINI_API_KEY = origKey;
      });

      test('handles Gemini unknown error without retry', async () => {
        const mockGenContent = jest.fn().mockRejectedValue(new Error('Unknown Gemini failure'));

        GoogleGenerativeAI.mockImplementation(() => ({
          getGenerativeModel: jest.fn().mockReturnValue({
            generateContent: mockGenContent
          })
        }));

        await expect(llmService.generate(
          [{ role: 'user', content: 'test' }],
          'gemini-key',
          'gemini'
        )).rejects.toThrow('Gemini error: Unknown Gemini failure');
      });

      test('throws invalid key error for Gemini', async () => {
        const mockGenContent = jest.fn().mockRejectedValue({
          message: 'API key not valid'
        });

        GoogleGenerativeAI.mockImplementation(() => ({
          getGenerativeModel: jest.fn().mockReturnValue({
            generateContent: mockGenContent
          })
        }));

        await expect(llmService.generate(
          [{ role: 'user', content: 'test' }],
          'bad-gemini-key',
          'gemini'
        )).rejects.toThrow('Invalid API key');
      });
    });
  });

  describe('validateKey', () => {
    test('returns valid for Ollama without checking', async () => {
      const result = await llmService.validateKey('any', 'ollama');
      expect(result).toEqual({ valid: true, reason: 'Ollama (local) — no key required' });
    });

    test('validates Groq key successfully', async () => {
      axios.get.mockResolvedValue({
        data: { data: [{ id: 'llama-3.3-70b' }, { id: 'mixtral-8x7b' }] }
      });

      const result = await llmService.validateKey('valid-groq-key', 'groq');
      expect(result.valid).toBe(true);
      expect(result.models).toBe(2);
      expect(result.reason).toContain('Key is valid');
    });

    test('rejects invalid Groq key with 401', async () => {
      axios.get.mockRejectedValue({ response: { status: 401 } });

      const result = await llmService.validateKey('bad-key', 'groq');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid API key');
    });

    test('returns valid on Groq rate limit (429)', async () => {
      axios.get.mockRejectedValue({ response: { status: 429 } });

      const result = await llmService.validateKey('good-key', 'groq');
      expect(result.valid).toBe(true);
      expect(result.reason).toContain('rate limited');
    });

    test('handles Groq non-401/429 HTTP error', async () => {
      axios.get.mockRejectedValue({ response: { status: 500 } });

      const result = await llmService.validateKey('key', 'groq');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Groq returned 500');
    });

    test('handles Groq network timeout', async () => {
      axios.get.mockRejectedValue({ code: 'ECONNABORTED' });

      const result = await llmService.validateKey('key', 'groq');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('timed out');
    });

    test('handles Groq generic error', async () => {
      axios.get.mockRejectedValue(new Error('Network failure'));

      const result = await llmService.validateKey('key', 'groq');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Network failure');
    });

    test('validates OpenRouter key successfully', async () => {
      axios.get.mockResolvedValue({
        data: { data: { label: 'My Key', remainingCredits: 5.50 } }
      });

      const result = await llmService.validateKey('valid-or-key', 'openrouter');
      expect(result.valid).toBe(true);
      expect(result.reason).toContain('Key is valid');
    });

    test('rejects invalid OpenRouter key', async () => {
      axios.get.mockRejectedValue({ response: { status: 401 } });

      const result = await llmService.validateKey('bad-or-key', 'openrouter');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid API key');
    });

    test('handles OpenRouter unexpected response (no data)', async () => {
      axios.get.mockResolvedValue({ data: {} });

      const result = await llmService.validateKey('key', 'openrouter');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('unexpected response');
    });

    test('handles OpenRouter non-401 error', async () => {
      axios.get.mockRejectedValue({ response: { status: 500 } });

      const result = await llmService.validateKey('key', 'openrouter');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('OpenRouter error');
    });

    describe('Gemini validateKey', () => {
      beforeEach(() => {
        global.fetch = jest.fn();
      });

      afterEach(() => {
        delete global.fetch;
      });

      test('validates Gemini key successfully', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({ models: [{ name: 'gemini-1.5-flash' }] })
        });

        const result = await llmService.validateKey('valid-gemini-key', 'gemini');
        expect(result.valid).toBe(true);
        expect(result.reason).toContain('Key is valid');
      });

      test('rejects invalid Gemini key', async () => {
        global.fetch.mockResolvedValue({
          ok: false,
          status: 400,
          json: jest.fn().mockResolvedValue({
            error: { message: 'API key not valid', status: 'INVALID_ARGUMENT' }
          })
        });

        const result = await llmService.validateKey('bad-gemini-key', 'gemini');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Invalid API key');
      });

      test('handles Gemini fetch abort/timeout', async () => {
        global.fetch.mockRejectedValue({ name: 'AbortError' });

        const result = await llmService.validateKey('key', 'gemini');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('timed out');
      });

      test('handles Gemini generic fetch error', async () => {
        global.fetch.mockRejectedValue(new Error('Network failure'));

        const result = await llmService.validateKey('key', 'gemini');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Gemini error');
      });
    });
  });
});
