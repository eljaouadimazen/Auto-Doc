const BaseAgent = require('../src/agents/base.agent');

describe('BaseAgent', () => {
  let agent;

  beforeAll(() => {
    agent = new BaseAgent('TestAgent', 'You are a test agent.');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('truncate', () => {
    test('returns text as-is when under max tokens', () => {
      const text = 'Hello world';
      expect(agent.truncate(text, 100)).toBe(text);
    });

    test('truncates text that exceeds max tokens', () => {
      const text = 'a'.repeat(500);
      const result = agent.truncate(text, 10);
      const suffix = '\n\n[... truncated to fit context window]';
      expect(result.length).toBe(40 + suffix.length);
      expect(result).toContain('[... truncated to fit context window]');
    });

    test('returns empty string for empty input', () => {
      expect(agent.truncate('', 100)).toBe('');
    });

    test('uses default maxTokens of 3000', () => {
      const text = 'a'.repeat(100);
      expect(agent.truncate(text)).toBe(text);
    });

    test('handles text exactly at the limit', () => {
      const text = 'a'.repeat(40);
      expect(agent.truncate(text, 10)).toBe(text);
    });

    test('handles text one character over the limit', () => {
      const text = 'a'.repeat(41);
      const result = agent.truncate(text, 10);
      expect(result).toContain('[... truncated to fit context window]');
      expect(result).not.toBe(text);
    });
  });

  describe('_createLlm', () => {
    test('creates groq instance', () => {
      const llm = BaseAgent._createLlm('groq', 'test-key', 0.1, 2048);
      expect(llm).toBeDefined();
      expect(typeof llm.invoke).toBe('function');
    });

    test('creates gemini instance', () => {
      const llm = BaseAgent._createLlm('gemini', 'test-key', 0.1, 2048);
      expect(llm).toBeDefined();
    });

    test('creates openrouter instance', () => {
      const llm = BaseAgent._createLlm('openrouter', 'test-key', 0.1, 2048);
      expect(llm).toBeDefined();
    });

    test('creates ollama instance', () => {
      const llm = BaseAgent._createLlm('ollama', 'test-key', 0.1, 2048);
      expect(llm).toBeDefined();
    });

    test('throws for unknown provider', () => {
      expect(() => BaseAgent._createLlm('unknown', 'key', 0.1, 1024)).toThrow('Unknown LLM provider');
    });
  });

  describe('callLLM', () => {
    test('returns content from default LLM invoke', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({ content: 'LLM response' });
      agent.llm = { invoke: mockInvoke };

      const result = await agent.callLLM('test prompt');
      expect(result).toBe('LLM response');
    });

    test('uses dynamic provider when _currentProvider is set', async () => {
      const mockDynamicInvoke = jest.fn().mockResolvedValue({ content: 'dynamic response' });
      jest.spyOn(BaseAgent, '_createLlm').mockReturnValue({ invoke: mockDynamicInvoke });

      agent._currentProvider = 'ollama';
      const result = await agent.callLLM('test prompt');

      expect(result).toBe('dynamic response');
      expect(BaseAgent._createLlm).toHaveBeenCalledWith('ollama', null, expect.any(Number), expect.any(Number));
    });
  });

  describe('callLLMJSON', () => {
    test('parses valid JSON response', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('{"key": "value"}');
      const result = await agent.callLLMJSON('prompt');
      expect(result).toEqual({ key: 'value' });
    });

    test('strips markdown code fences', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('```json\n{"key": "value"}\n```');
      const result = await agent.callLLMJSON('prompt');
      expect(result).toEqual({ key: 'value' });
    });

    test('parses array response', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('["a", "b"]');
      const result = await agent.callLLMJSON('prompt');
      expect(result).toEqual(['a', 'b']);
    });

    test('returns fallback on invalid JSON when fallback provided', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('not json at all');
      const result = await agent.callLLMJSON('prompt', { fallback: true });
      expect(result).toEqual({ fallback: true });
    });

    test('throws on invalid JSON when no fallback', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('invalid json');
      await expect(agent.callLLMJSON('prompt')).rejects.toThrow('LLM returned invalid JSON');
    });
  });

  describe('run', () => {
    test('calls execute and returns success output', async () => {
      jest.spyOn(agent, 'execute').mockResolvedValue('result data');

      const output = await agent.run({
        task: 'test task',
        context: {},
        input: { data: 'test' }
      });

      expect(output.status).toBe('success');
      expect(output.result).toBe('result data');
      expect(output.agentName).toBe('TestAgent');
      expect(output.meta.attempts).toBe(1);
    });

    test('retries on failure and returns fallback on max retries', async () => {
      agent.maxRetries = 1;
      jest.spyOn(agent, 'execute').mockRejectedValue(new Error('execution failed'));
      jest.spyOn(agent, 'sleep').mockResolvedValue();

      const output = await agent.run({
        task: 'failing task',
        context: {},
        input: {}
      });

      expect(output.status).toBe('failed');
      expect(output.error).toContain('execution failed');
      expect(output.meta.attempts).toBe(2);
    });
  });

  describe('execute', () => {
    test('throws not implemented error by default', async () => {
      await expect(agent.execute({})).rejects.toThrow('must implement execute()');
    });
  });

  describe('sleep', () => {
    test('returns a promise', () => {
      const result = agent.sleep(1);
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
