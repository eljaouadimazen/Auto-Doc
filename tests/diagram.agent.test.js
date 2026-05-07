const DiagramAgent = require('../src/agents/diagram.agent');

describe('DiagramAgent', () => {
  let agent;

  beforeAll(() => {
    agent = new DiagramAgent();
  });

  describe('_extractMermaid', () => {
    test('extracts from code fences with mermaid tag', () => {
      const raw = 'Some text\n```mermaid\nclassDiagram\n  ClassA --> ClassB\n```\nmore text';
      expect(agent._extractMermaid(raw)).toBe('classDiagram\n  ClassA --> ClassB');
    });

    test('extracts from plain code fences', () => {
      const raw = '```\nclassDiagram\n  ClassA --> ClassB\n```';
      expect(agent._extractMermaid(raw)).toBe('classDiagram\n  ClassA --> ClassB');
    });

    test('returns raw text if it starts with a valid diagram keyword', () => {
      const raw = 'classDiagram\n  ClassA --> ClassB';
      expect(agent._extractMermaid(raw)).toBe(raw);
    });

    test('returns raw text for flowchart keyword', () => {
      const raw = 'flowchart LR\nA --> B';
      expect(agent._extractMermaid(raw)).toBe(raw);
    });

    test('returns raw text for graph keyword', () => {
      const raw = 'graph TD\nA --> B';
      expect(agent._extractMermaid(raw)).toBe(raw);
    });

    test('returns trimmed text when no fences or keywords found', () => {
      expect(agent._extractMermaid('  some random text  ')).toBe('some random text');
    });

    test('throws on empty string', () => {
      expect(() => agent._extractMermaid('')).toThrow('empty response from LLM');
    });

    test('throws on null input', () => {
      expect(() => agent._extractMermaid(null)).toThrow('empty response from LLM');
    });

    test('throws on non-string input', () => {
      expect(() => agent._extractMermaid(undefined)).toThrow('empty response from LLM');
    });
  });

  describe('execute', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('throws when files array is empty', async () => {
      await expect(agent.execute({
        input: { diagramType: 'CLASS', projectNature: 'BACKEND', files: [] }
      })).rejects.toThrow('received no files to analyze');
    });

    test('executes two-pass pipeline and returns clean mermaid', async () => {
      jest.spyOn(agent, '_explainArchitecture').mockResolvedValue('Architecture explanation');
      jest.spyOn(agent, '_generateMermaid').mockResolvedValue('```mermaid\nclassDiagram\nClassA --> ClassB\n```');

      const result = await agent.execute({
        input: {
          diagramType: 'CLASS',
          projectNature: 'BACKEND',
          files: [{ path: 'src/app.js', content: 'const x = 1;' }]
        }
      });

      expect(result).toContain('classDiagram');
      expect(result).toContain('ClassA --> ClassB');
      expect(agent._explainArchitecture).toHaveBeenCalled();
      expect(agent._generateMermaid).toHaveBeenCalled();
    });
  });

  describe('_explainArchitecture', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('calls callLLM with architecture prompt', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('architecture explanation text');

      const result = await agent._explainArchitecture(
        'BACKEND', 'CLASS', 'src/app.js\nsrc/utils.js', 'file contents here'
      );

      expect(result).toBe('architecture explanation text');
      expect(agent.callLLM).toHaveBeenCalledTimes(1);
    });

    test('uses focus instructions matching diagramType', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('explanation');

      await agent._explainArchitecture(
        'FRONTEND', 'COMPONENT', 'src/App.jsx', 'component code'
      );

      const prompt = agent.callLLM.mock.calls[0][0];
      expect(prompt).toContain('UI component');
      expect(prompt).toContain('parent');
    });

    test('defaults to CLASS focus for unknown diagramType', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('explanation');

      await agent._explainArchitecture(
        'BACKEND', 'UNKNOWN', 'src/app.js', 'code'
      );

      const prompt = agent.callLLM.mock.calls[0][0];
      expect(prompt).toContain('class');
    });
  });

  describe('_generateMermaid', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('calls callLLM with mermaid generation prompt', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('```mermaid\ngraph TD\nA --> B\n```');

      const result = await agent._generateMermaid(
        'COMPONENT', 'FRONTEND', 'src/App.jsx', 'Architecture explanation'
      );

      expect(result).toContain('graph TD');
      expect(agent.callLLM).toHaveBeenCalledTimes(1);
    });

    test('includes syntax guide for PIPELINE type', async () => {
      jest.spyOn(agent, 'callLLM').mockResolvedValue('flowchart LR');

      await agent._generateMermaid(
        'PIPELINE', 'DEVOPS', 'ci.yml', 'CI/CD pipeline'
      );

      const prompt = agent.callLLM.mock.calls[0][0];
      expect(prompt).toContain('flowchart');
      expect(prompt).toContain('Stages as nodes');
    });
  });

  describe('_validate', () => {
    test('passes valid classDiagram for CLASS type', () => {
      expect(() => agent._validate('classDiagram\nClassA --> ClassB', 'CLASS')).not.toThrow();
    });

    test('passes valid graph for COMPONENT type', () => {
      expect(() => agent._validate('graph TD\nA[Start] --> B[End]\nC[Process] --> D[Finish]', 'COMPONENT')).not.toThrow();
    });

    test('passes valid flowchart for COMPONENT type', () => {
      expect(() => agent._validate('flowchart LR\nA[Start] --> B[End]\nC[Process] --> D[Finish]', 'COMPONENT')).not.toThrow();
    });

    test('passes valid flowchart for PIPELINE type', () => {
      expect(() => agent._validate('flowchart LR\nA[Start] --> B[End]\nC[Process] --> D[Finish]', 'PIPELINE')).not.toThrow();
    });

    test('passes valid graph for PIPELINE type', () => {
      expect(() => agent._validate('graph LR\nA[Start] --> B[End]\nC[Process] --> D[Finish]', 'PIPELINE')).not.toThrow();
    });

    test('throws for output shorter than 20 characters', () => {
      expect(() => agent._validate('short', 'CLASS')).toThrow('too short to be valid Mermaid');
    });

    test('throws when CLASS keyword is missing for CLASS type', () => {
      const diagram = 'graph TD\nA[Start] --> B[End]\nC[Process] --> D[Finish]';
      expect(() => agent._validate(diagram, 'CLASS')).toThrow('expected keyword for CLASS');
    });

    test('throws when COMPONENT keyword is missing for COMPONENT type', () => {
      const diagram = 'classDiagram\nClassA --> ClassB\nClassC --> ClassD';
      expect(() => agent._validate(diagram, 'COMPONENT')).toThrow('expected keyword for COMPONENT');
    });
  });
});
