const DiagramAgent = require('../src/agents/diagram.agent');
const MermaidGenerator = require('../src/services/mermaid-generator.service');

jest.mock('../src/services/mermaid-generator.service', () => ({
  generate: jest.fn(),
}));

describe('DiagramAgent', () => {
  let agent;

  beforeAll(() => {
    agent = new DiagramAgent();
  });

  describe('execute', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('throws when facts is not provided', async () => {
      await expect(agent.execute({
        input: { diagramType: 'CLASS' }
      })).rejects.toThrow('requires facts');
    });

    test('delegates to MermaidGenerator.generate with facts and diagramType', async () => {
      MermaidGenerator.generate.mockReturnValue('classDiagram\n    class User\n    class Post\n    User --> Post');

      const facts = {
        allNames: ['User', 'Post'],
        highConfidenceEdges: [{ from: 'User', to: 'Post', type: 'association' }],
        members: new Map(),
      };

      const result = await agent.execute({
        input: { diagramType: 'CLASS', facts }
      });

      expect(result).toContain('classDiagram');
      expect(result).toContain('class User');
      expect(result).toContain('class Post');
      expect(MermaidGenerator.generate).toHaveBeenCalledWith(facts, 'CLASS');
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
