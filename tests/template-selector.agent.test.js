const TemplateSelectorAgent = require('../src/agents/template-selector.agent');

describe('TemplateSelectorAgent', () => {
  let agent;

  beforeAll(() => {
    agent = new TemplateSelectorAgent();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('execute', () => {
    test('returns CLASS diagramType for BACKEND nature', async () => {
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue({
        templateId: 'FULL_SOFTWARE',
        diagramType: 'CLASS',
        requiredSections: ['Overview', 'Architecture', 'API'],
        forbiddenSections: [],
        reasoning: 'Backend project'
      });

      const result = await agent.execute({
        input: { projectNature: 'BACKEND', logicSignals: ['express'], hasExecutableCode: true }
      });

      expect(result.templateId).toBe('FULL_SOFTWARE');
      expect(result.diagramType).toBe('CLASS');
    });

    test('forces NONE diagramType for RESOURCE_LIST template', async () => {
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue({
        templateId: 'RESOURCE_LIST',
        diagramType: 'CLASS',
        requiredSections: [],
        forbiddenSections: [],
        reasoning: 'Resource list'
      });

      const result = await agent.execute({
        input: { projectNature: 'RESOURCE_LIST', logicSignals: [], hasExecutableCode: false }
      });

      expect(result.diagramType).toBe('NONE');
    });

    test('fills default CLASS diagramType when missing with executable code', async () => {
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue({
        templateId: 'FULL_SOFTWARE',
        diagramType: null,
        requiredSections: [],
        forbiddenSections: [],
        reasoning: 'test'
      });

      const result = await agent.execute({
        input: { projectNature: 'BACKEND', logicSignals: [], hasExecutableCode: true }
      });

      expect(result.diagramType).toBe('CLASS');
    });

    test('fills NONE diagramType when missing without executable code', async () => {
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue({
        templateId: 'LIBRARY',
        diagramType: undefined,
        requiredSections: [],
        forbiddenSections: [],
        reasoning: 'test'
      });

      const result = await agent.execute({
        input: { projectNature: 'LIBRARY', logicSignals: [], hasExecutableCode: false }
      });

      expect(result.diagramType).toBe('NONE');
    });

    test('uses fallback returned by callLLMJSON', async () => {
      const fallback = {
        templateId: 'FULL_SOFTWARE',
        diagramType: 'CLASS',
        requiredSections: ['Overview', 'Architecture', 'API', 'Setup', 'Technical Specs'],
        forbiddenSections: [],
        reasoning: 'Default fallback'
      };
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue(fallback);

      const result = await agent.execute({
        input: { projectNature: 'UNKNOWN', logicSignals: [], hasExecutableCode: false }
      });

      expect(result.templateId).toBe('FULL_SOFTWARE');
      expect(result.diagramType).toBe('CLASS');
    });

    test('handles COMPONENT diagramType for FRONTEND nature', async () => {
      jest.spyOn(agent, 'callLLMJSON').mockResolvedValue({
        templateId: 'FULL_SOFTWARE',
        diagramType: 'COMPONENT',
        requiredSections: ['Overview', 'Architecture'],
        forbiddenSections: [],
        reasoning: 'Frontend project'
      });

      const result = await agent.execute({
        input: { projectNature: 'FRONTEND', logicSignals: ['react'], hasExecutableCode: true }
      });

      expect(result.diagramType).toBe('COMPONENT');
    });
  });
});
