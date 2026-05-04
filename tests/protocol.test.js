const protocol = require('../src/agents/protocol');

describe('Agent Protocol', () => {
  describe('buildInput', () => {
    test('builds valid AgentInput', () => {
      const input = protocol.buildInput('Test task', { repository: 'my-repo' }, { data: 'test' });
      expect(input.task).toBe('Test task');
      expect(input.context.repository).toBe('my-repo');
      expect(input.context.runId).toBeDefined();
      expect(input.input).toEqual({ data: 'test' });
    });

    test('uses defaults for missing context', () => {
      const input = protocol.buildInput('Task', {}, null);
      expect(input.context.repository).toBe('unknown');
      expect(input.context.previous).toEqual({});
      expect(input.context.apiKey).toBeNull();
      expect(input.context.provider).toBe('groq');
    });

    test('accepts custom provider', () => {
      const input = protocol.buildInput('Task', { provider: 'gemini' }, {});
      expect(input.context.provider).toBe('gemini');
    });
  });

  describe('buildSuccess', () => {
    test('builds valid AgentOutput', () => {
      const output = protocol.buildSuccess('TestAgent', { result: 'ok' }, { durationMs: 100 });
      expect(output.agentName).toBe('TestAgent');
      expect(output.status).toBe('success');
      expect(output.result).toEqual({ result: 'ok' });
      expect(output.meta.attempts).toBe(1);
      expect(output.error).toBeNull();
    });

    test('defaults meta values', () => {
      const output = protocol.buildSuccess('Agent', {});
      expect(output.meta.tokensUsed).toBe(0);
      expect(output.meta.durationMs).toBe(0);
      expect(output.meta.attempts).toBe(1);
    });
  });

  describe('buildFailure', () => {
    test('builds failure output with error message', () => {
      const output = protocol.buildFailure('Agent', new Error('test error'), { attempts: 3 });
      expect(output.status).toBe('failed');
      expect(output.error).toBe('test error');
      expect(output.result).toBeNull();
      expect(output.meta.attempts).toBe(3);
    });

    test('handles non-Error objects', () => {
      const output = protocol.buildFailure('Agent', 'string error');
      expect(output.error).toBe('string error');
    });
  });

  describe('buildSkipped', () => {
    test('builds skipped output', () => {
      const output = protocol.buildSkipped('Agent', 'cached', { cached: true });
      expect(output.status).toBe('skipped');
      expect(output.reason).toBe('cached');
      expect(output.meta.tokensUsed).toBe(0);
      expect(output.meta.durationMs).toBe(0);
      expect(output.result).toEqual({ cached: true });
    });
  });

  describe('validateOutput', () => {
    test('accepts valid output', () => {
      const output = protocol.buildSuccess('Agent', {});
      expect(protocol.validateOutput(output)).toBe(true);
    });

    test('rejects missing required fields', () => {
      expect(() => {
        protocol.validateOutput({ agentName: 'Test', status: 'success' });
      }).toThrow(/missing fields/);
    });

    test('rejects invalid status', () => {
      expect(() => {
        protocol.validateOutput({
          agentName: 'Test',
          status: 'invalid',
          result: null,
          meta: { tokensUsed: 0, durationMs: 0, attempts: 1 },
          error: null
        });
      }).toThrow(/Invalid agent status/);
    });

    test('accepts all valid statuses', () => {
      ['success', 'failed', 'skipped'].forEach(status => {
        const output = {
          agentName: 'Test',
          status,
          result: null,
          meta: { tokensUsed: 0, durationMs: 0, attempts: 1 },
          error: null
        };
        expect(protocol.validateOutput(output)).toBe(true);
      });
    });
  });

  describe('generateRunId', () => {
    test('generates unique IDs', () => {
      const id1 = protocol.generateRunId();
      const id2 = protocol.generateRunId();
      expect(id1).not.toBe(id2);
    });

    test('starts with run_ prefix', () => {
      const id = protocol.generateRunId();
      expect(id.startsWith('run_')).toBe(true);
    });
  });
});
