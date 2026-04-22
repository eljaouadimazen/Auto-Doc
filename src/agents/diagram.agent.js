/**
 * diagram.agent.js
 *
 * Two-pass pipeline aligned with gitdiagram's approach:
 *
 *   Pass 1 — Explain  : Read the file tree + key file snippets and write
 *                        a plain-English architecture explanation.
 *   Pass 2 — Generate : Turn that explanation into a Mermaid diagram,
 *                        using the actual names found in the code.
 *
 * Why two passes?
 *   Asking the LLM to produce a diagram directly from raw code in one shot
 *   leads to generic, hallucinated, or syntactically broken output.
 *   Separating "understand" from "draw" dramatically improves accuracy —
 *   this is the core technique gitdiagram uses.
 */
const BaseAgent = require('./base.agent');

class DiagramAgent extends BaseAgent {
  constructor() {
    super(
      'DiagramAgent',
      `You are a principal software architect and technical documentation expert.
You analyze codebases and produce accurate, structured architectural documentation.
You only use names, classes, methods, and relationships that actually exist in the provided code.
You never invent components. If something is unclear, you omit it rather than guess.`,
      {
        temperature: 0.1,
        maxTokens:   3000,
        maxRetries:  2
      }
    );
  }

  async execute(agentInput) {
    const { diagramType, files, projectNature } = agentInput.input;

    if (!files || files.length === 0) {
      throw new Error('DiagramAgent received no files to analyze');
    }

    // ── Build the file tree (like gitdiagram — structure is the primary signal)
    const fileTree = files.map(f => f.path).join('\n');

    // ── Build code context from actual file contents (our advantage over gitdiagram)
    // Each file is truncated to keep the total context manageable
    const codeContext = files
      .map(f => `// ── FILE: ${f.path}\n${(f.content || '').slice(0, 1200)}`)
      .join('\n\n---\n\n');

    // ── PASS 1: Architecture explanation ────────────────────────────────
    // gitdiagram calls this "explain" — convert raw code into structured prose
    // before asking for a diagram. This is the key quality improvement.
    const explanation = await this._explainArchitecture(
      projectNature,
      diagramType,
      fileTree,
      codeContext
    );

    // ── PASS 2: Mermaid generation ───────────────────────────────────────
    // Now generate the diagram using the explanation + file tree.
    // The explanation grounds the LLM in real names and structure.
    const rawMermaid = await this._generateMermaid(
      diagramType,
      projectNature,
      fileTree,
      explanation
    );

    // ── Clean and validate output ────────────────────────────────────────
    const cleanMermaid = this._extractMermaid(rawMermaid);
    this._validate(cleanMermaid, diagramType);

    return cleanMermaid;
  }

  // ── Pass 1: Explain ─────────────────────────────────────────────────────

  async _explainArchitecture(projectNature, diagramType, fileTree, codeContext) {
    const focusInstructions = {
      CLASS: `
- List every class, interface, and module you find with its exact name.
- For each class, list its public methods with signatures (name + params).
- Identify relationships: which class calls, extends, or depends on which.
- Identify the entry point(s) of the application.`,

      COMPONENT: `
- List every UI component, screen, page, and provider with its exact name.
- Describe what state each component manages or consumes.
- Map the parent → child component hierarchy.
- Identify data flow: where does data come from and how does it flow down?`,

      PIPELINE: `
- List every CI/CD stage, job, step, and tool with its exact name.
- Identify the trigger conditions (push, PR, schedule, manual).
- Map the stage sequence and any conditional branches.
- Identify target environments (staging, production) and deployment tools.`
    };

    const focus = focusInstructions[diagramType] || focusInstructions.CLASS;

    const prompt = `
You are analyzing a ${projectNature} project to prepare an architectural explanation.
This explanation will be used in the next step to generate a Mermaid diagram.

FILE TREE:
<file_tree>
${fileTree}
</file_tree>

KEY SOURCE FILES:
<source_code>
${codeContext}
</source_code>

Your task — write a detailed plain-English architectural explanation that covers:
${focus}

Rules:
- Use ONLY names that actually appear in the code or file tree above.
- Be specific: "UserController calls UserService.findById()" not "controller calls service".
- Do not write any Mermaid syntax yet — prose only.
- If a relationship or name is unclear, skip it rather than guess.
- Structure your explanation with clear sections.

Write the explanation now:`;

    return this.callLLM(prompt);
  }

  // ── Pass 2: Generate Mermaid ────────────────────────────────────────────

  async _generateMermaid(diagramType, projectNature, fileTree, explanation) {
    const syntaxGuides = {
      CLASS: `
Use: classDiagram
- Classes:      class ClassName { +field: Type \n +method(param: Type): ReturnType }
- Inheritance:  ChildClass --|> ParentClass
- Composition:  ContainerClass *-- ContainedClass
- Association:  ClassA --> ClassB
- Dependency:   ClassA ..> ClassB : "label"
- Do NOT use angle brackets in method signatures (breaks parser).
- Max 15 classes — focus on the most important ones.`,

      COMPONENT: `
Use: graph TD
- Components as nodes:  ComponentName["ComponentName\\n(description)"]
- Parent → child:       ParentComponent --> ChildComponent
- Data/state flow:      Store -->|state| Component
- Use subgraphs to group related components:
    subgraph "Feature Name"
      ComponentA
      ComponentB
    end`,

      PIPELINE: `
Use: flowchart LR
- Stages as nodes:  StageName["Stage Label"]
- Decisions:        condition{{"condition?"}}
- Flow:             StageA --> StageB
- Group by environment with subgraphs:
    subgraph "Production"
      Deploy --> HealthCheck
    end
- Use --> for sequential flow, -->|label| for conditional branches.`
    };

    const syntax = syntaxGuides[diagramType] || syntaxGuides.CLASS;

    const prompt = `
You are generating a Mermaid.js diagram for a ${projectNature} project.
Diagram type requested: ${diagramType}

Use this architectural explanation as your source of truth — it contains the real
class names, relationships, and structure extracted from the codebase:

<architecture_explanation>
${explanation}
</architecture_explanation>

Reference file tree (for path context):
<file_tree>
${fileTree}
</file_tree>

─── MERMAID SYNTAX GUIDE FOR ${diagramType} ─────────────────────────────────
${syntax}

─── STRICT RULES ────────────────────────────────────────────────────────────
1. Output ONLY the raw Mermaid code — no prose, no explanation, no code fences.
2. Every class/component/stage name must come from the explanation above.
3. Do not invent any node that does not appear in the explanation or file tree.
4. Ensure valid Mermaid syntax — the output will be rendered directly.
5. Aim for completeness within the node limit — capture the full architecture.

Generate the Mermaid diagram now:`;

    return this.callLLM(prompt);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Strip markdown fences and extract pure Mermaid code.
   * Handles: ```mermaid ... ```, ``` ... ```, or raw code.
   */
  _extractMermaid(raw) {
    if (!raw || typeof raw !== 'string') {
      throw new Error('DiagramAgent received empty response from LLM');
    }

    // Remove ```mermaid or ``` fences
    const fenceMatch = raw.match(/```(?:mermaid)?\s*([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();

    // If no fences, check if it starts with a valid diagram keyword
    const trimmed = raw.trim();
    const validStarts = ['classDiagram', 'graph ', 'flowchart ', 'sequenceDiagram', 'erDiagram'];
    if (validStarts.some(s => trimmed.startsWith(s))) return trimmed;

    // Last resort: return as-is (writer will handle gracefully)
    return trimmed;
  }

  /**
   * Basic structural validation — catch obvious failures early
   * so the orchestrator can log a meaningful warning instead of
   * passing broken Mermaid to the writer.
   */
  _validate(mermaid, diagramType) {
    if (!mermaid || mermaid.length < 20) {
      throw new Error(`DiagramAgent produced output that is too short to be valid Mermaid`);
    }

    const expectedKeywords = {
      CLASS:     ['classDiagram'],
      COMPONENT: ['graph', 'flowchart'],
      PIPELINE:  ['flowchart', 'graph']
    };

    const keywords = expectedKeywords[diagramType];
    if (keywords && !keywords.some(k => mermaid.includes(k))) {
      throw new Error(
        `DiagramAgent output does not contain expected keyword for ${diagramType}. ` +
        `Got: ${mermaid.slice(0, 80)}`
      );
    }
  }
}

module.exports = DiagramAgent;