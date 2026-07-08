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
      jest.spyOn(agent, '_explainArchitecture').mockResolvedValue('ClassA calls ClassB.doWork() to process the request.');
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

  describe('_sanitizeMermaid', () => {
    test('auto-repairs a generic aggregate class instead of leaving the diagram broken', () => {
      const raw = [
        'classDiagram',
        'class Services {',
        '}',
        'class ChatService {',
        '  +getAllChats()',
        '}',
        'class ChatRepository {',
        '}',
        'Services ..> ChatRepository : "uses"',
        'ChatService --> ChatRepository',
      ].join('\n');

      const result = agent._sanitizeMermaid(raw, 'CLASS');

      expect(result).not.toMatch(/class\s+Services\s*\{/);
      expect(result).not.toContain('Services ..> ChatRepository');
      expect(result).toContain('class ChatService');
      expect(result).toContain('class ChatRepository');
      expect(result).toContain('ChatService --> ChatRepository');

      // Sanitized output should pass validation now that the generic class is gone.
      expect(() => agent._validate(result, 'CLASS')).not.toThrow();
    });

    test('leaves a diagram with only real class names untouched', () => {
      const raw = 'classDiagram\nclass AuthController {\n}\nclass UserService {\n}\nAuthController --> UserService';
      const result = agent._sanitizeMermaid(raw, 'CLASS');
      expect(result).toContain('class AuthController');
      expect(result).toContain('class UserService');
      expect(result).toContain('AuthController --> UserService');
    });

    test('does not run the generic-class strip for non-CLASS diagrams', () => {
      const raw = 'graph TD\nServices["Services"] --> Database';
      const result = agent._sanitizeMermaid(raw, 'COMPONENT');
      expect(result).toContain('Services["Services"]');
    });

    test('skips the groundedness check when no explanation or file tree is provided', () => {
      const raw = 'classDiagram\nclass Nonexistent {\n}\nNonexistent --> AlsoFake';
      const result = agent._sanitizeMermaid(raw, 'CLASS');
      expect(result).toContain('class Nonexistent');
    });

    test('strips a COMPONENT node copied verbatim from the syntax guide with no basis in the explanation', () => {
      const explanation = 'LoginPage renders a form and calls AuthApi.login() to authenticate the user.';
      const fileTree = 'src/components/LoginPage.jsx\nsrc/services/AuthApi.js';
      const raw = [
        'graph TD',
        'LoginPage["LoginPage"] --> AuthApi["AuthApi"]',
        'AuthApi --> AuthGuard["AuthGuard"]',
        'AuthGuard --> BackendAPI["Backend API"]',
      ].join('\n');

      const result = agent._sanitizeMermaid(raw, 'COMPONENT', explanation, fileTree);

      expect(result).toContain('LoginPage["LoginPage"] --> AuthApi["AuthApi"]');
      expect(result).not.toContain('AuthGuard');
      expect(result).not.toContain('BackendAPI');
    });

    test('strips a PIPELINE stage copied verbatim from the syntax guide with no basis in the explanation', () => {
      const explanation = 'The lint job runs eslint, then the test job runs jest.';
      const fileTree = '.github/workflows/ci.yml';
      const raw = [
        'flowchart LR',
        'lint["lint"] --> test["test"]',
        'subgraph "Production"',
        'Deploy["Deploy"] --> HealthCheck["HealthCheck"]',
        'end',
      ].join('\n');

      const result = agent._sanitizeMermaid(raw, 'PIPELINE', explanation, fileTree);

      expect(result).toContain('lint["lint"] --> test["test"]');
      expect(result).not.toContain('Deploy["Deploy"]');
      expect(result).not.toContain('HealthCheck["HealthCheck"]');
    });

    test('keeps a real class name found only in the file tree, not the explanation prose', () => {
      const explanation = 'The controller handles incoming requests and delegates to the service layer.';
      const fileTree = 'src/main/java/com/example/AuthController.java';
      const raw = 'classDiagram\nclass AuthController {\n}\nclass UserService {\n}\nAuthController --> UserService';

      const result = agent._sanitizeMermaid(raw, 'CLASS', explanation, fileTree);

      expect(result).toContain('class AuthController');
    });
  });

  describe('_extractNodeNames', () => {
    test('extracts class declarations and relationship endpoints for CLASS diagrams', () => {
      const mermaid = 'classDiagram\nclass Foo {\n}\nFoo --> Bar\nBar ..> Baz';
      const names = agent._extractNodeNames(mermaid, 'CLASS');
      expect(names).toEqual(new Set(['Foo', 'Bar', 'Baz']));
    });

    test('extracts labeled nodes and edges for COMPONENT/PIPELINE diagrams, excluding subgraph titles', () => {
      const mermaid = 'graph TD\nsubgraph "Frontend Layer"\nCompA["CompA"] --> CompB["CompB"]\nend';
      const names = agent._extractNodeNames(mermaid, 'COMPONENT');
      expect(names).toEqual(new Set(['CompA', 'CompB']));
      expect(names.has('Frontend')).toBe(false);
    });

    test('excludes mermaid keywords from extracted names', () => {
      const mermaid = 'flowchart LR\nA --> B';
      const names = agent._extractNodeNames(mermaid, 'PIPELINE');
      expect(names.has('flowchart')).toBe(false);
      expect(names.has('LR')).toBe(false);
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

    test('throws when a generic aggregate class like "Services" is invented', () => {
      const diagram = 'classDiagram\nclass Services {\n}\nclass ChatService {\n}\nServices ..> ChatRepository';
      expect(() => agent._validate(diagram, 'CLASS')).toThrow('generic aggregate class "Services"');
    });

    test('throws for other generic layer names (Controllers, Repositories, Utils)', () => {
      expect(() => agent._validate('classDiagram\nclass Controllers {\n}', 'CLASS')).toThrow('generic aggregate class "Controllers"');
      expect(() => agent._validate('classDiagram\nclass Repositories {\n}', 'CLASS')).toThrow('generic aggregate class "Repositories"');
      expect(() => agent._validate('classDiagram\nclass Utils {\n}', 'CLASS')).toThrow('generic aggregate class "Utils"');
    });

    test('does not flag real class names that merely resemble layer names', () => {
      const diagram = 'classDiagram\nclass ChatService {\n}\nclass UserRepository {\n}\nclass AuthController {\n}';
      expect(() => agent._validate(diagram, 'CLASS')).not.toThrow();
    });

    test('does not apply the generic-name check to non-CLASS diagram types', () => {
      const diagram = 'graph TD\nServices["Services"] --> Database';
      expect(() => agent._validate(diagram, 'COMPONENT')).not.toThrow();
    });
  });
});
