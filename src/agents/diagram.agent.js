const BaseAgent        = require('./base.agent');
const MermaidGenerator = require('../services/mermaid-generator.service');

const VALID_KEYWORDS = {
  CLASS:        ['classDiagram'],
  COMPONENT:    ['graph', 'flowchart'],
  PIPELINE:     ['flowchart', 'graph'],
  C4_CONTAINER: ['C4Container'],
  C4_CONTEXT:   ['C4Context'],
};

class DiagramAgent extends BaseAgent {
  constructor() {
    super(
      'DiagramAgent',
      `You are a principal software architect and technical documentation expert.
You analyze codebases and produce accurate, structured architectural documentation.`,
      { temperature: 0.1, maxTokens: 3000, maxRetries: 2 }
    );
  }

  async execute(agentInput) {
    const { diagramType, facts } = agentInput.input;

    if (!facts) {
      throw new Error('DiagramAgent requires facts — cannot generate without ground truth');
    }

    const mermaid = MermaidGenerator.generate(facts, diagramType);
    this._validate(mermaid, diagramType);
    console.info(`[DiagramAgent] Generated ${diagramType} diagram (${mermaid.length} chars): ${mermaid.slice(0, 100).replace(/\n/g, '\\n')}...`);

    return mermaid;
  }

  _validate(mermaid, diagramType) {
    if (!mermaid || mermaid.length < 20) {
      throw new Error('DiagramAgent produced output that is too short to be valid Mermaid');
    }

    const keywords = VALID_KEYWORDS[diagramType];
    if (keywords && !keywords.some(k => mermaid.includes(k))) {
      throw new Error(
        `DiagramAgent output does not contain expected keyword for ${diagramType}. ` +
        `Got: ${mermaid.slice(0, 80)}`
      );
    }
  }
}

module.exports = DiagramAgent;
