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

// Class names that represent a whole layer/group instead of one real class —
// a recurring LLM hallucination pattern where it invents a stand-in node
// (e.g. "Services") to hold relationships it can't attribute to a specific class.
const GENERIC_CLASS_NAME_REGEX = /^(Services?|Controllers?|Repositories|Repository|Models?|Utils?|Helpers?|Components?|Handlers?|Managers?|Providers?|Middlewares?)$/i;

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
    const { diagramType, files, projectNature, retrievalFiles } = agentInput.input;

    if (!files || files.length === 0) {
      throw new Error('DiagramAgent received no files to analyze');
    }

    // ── Build the file tree (like gitdiagram — structure is the primary signal)
    const fileTree = files.map(f => f.path).join('\n');

    // ── Build code context from actual file contents (our advantage over gitdiagram)
    // Each file is truncated to keep the total context manageable
    const fileContext = files
      .map(f => `// ── FILE: ${f.path}\n${(f.content || '').slice(0, 1200)}`)
      .join('\n\n---\n\n');

    // ── Include related files from knowledge graph ─
    let retrievalContext = '';
    if (retrievalFiles && retrievalFiles.length > 0) {
      retrievalContext = '\n\n// ── ADDITIONAL RELATED FILES (from knowledge graph) ──\n' +
        retrievalFiles
          .map(f => `// ── RELATED: ${f.path}${f.relationType ? ` (${f.relationType})` : ''}`)
          .join('\n');
    }
    const codeContext = fileContext + retrievalContext;

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

    // ── Clean, sanitize, and validate output ─────────────────────────────
    const cleanMermaid = this._extractMermaid(rawMermaid);
    const sanitized = this._sanitizeMermaid(cleanMermaid, diagramType, explanation, fileTree);
    this._validate(sanitized, diagramType);

    return sanitized;
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
- List every service, guard, interceptor, pipe, and directive with its exact name.
- Describe what state each component manages or consumes.
- Map the parent → child component hierarchy.
- Identify the data service layer: which files make HTTP calls, what backend APIs they connect to.
- Identify the auth flow: guards, interceptors, token management, login/register components.
- Map the full data flow: Component → Service → HTTP Client → Backend API → Database.
- Identify state management: context providers, stores, NgRx, Redux, React context.`,

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
- NEVER summarize a group of classes as a single collective concept (e.g. do not write
  "the service layer uses X, Y, Z repositories"). Attribute every relationship to the ONE
  specific class that actually has it: "ChatService uses ChatRepository", "CloudinaryService
  uses Cloudinary" — as separate, individually-attributed statements, even if that means
  repeating similar sentences for each class.
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
- Service layer:        ComponentName --> ServiceName["ServiceName\\n(HTTP calls)"]
- Auth flow:            ComponentName --> AuthGuard["AuthGuard"] --> LoginComponent
- Backend API:          ServiceName -->|HTTP| BackendAPI["Backend API\\n(/api/...)"]
- Use subgraphs to group related layers:
    subgraph "Frontend Layer"
      ComponentA
      ComponentB
    end
    subgraph "Service Layer"
      DataService
      AuthService
    end
    subgraph "Backend API"
      RESTEndpoint
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
4. NEVER create a generic or aggregate node to represent a group or layer
   (e.g. "Services", "Controllers", "Repositories", "Utils", "Helpers"). Every
   node must be ONE specific, real class/component name. If the explanation
   describes something at the layer level without naming a specific class,
   omit that relationship entirely rather than inventing a container for it.
5. Ensure valid Mermaid syntax — the output will be rendered directly.
6. Aim for completeness within the node limit — capture the full architecture.

Generate the Mermaid diagram now:`;

    return this.callLLM(prompt);
  }

  /**
   * Sanitize generated Mermaid code to fix common LLM-generated syntax issues
   * before it reaches the renderer.
   *
   * @param {string} explanation - Pass 1's architecture prose (grounding source)
   * @param {string} fileTree    - Repo file paths (grounding source)
   */
  _sanitizeMermaid(code, diagramType, explanation = '', fileTree = '') {
    if (!code || typeof code !== 'string') return code;

    let sanitized = code.trim();

    if (diagramType === 'CLASS' || sanitized.startsWith('classDiagram')) {
      // Angle brackets <> inside class bodies break Mermaid's parser.
      // Replace them with square brackets [] to preserve type info.
      sanitized = sanitized.replace(/<([^>]*)>/g, '[$1]');

      // Auto-repair the "generic aggregate class" hallucination (e.g. "Services")
      // instead of discarding the whole diagram over one bad node — rejecting
      // and retrying the identical prompt tends to reproduce the same mistake.
      sanitized = this._stripGenericAggregateClasses(sanitized);
    }

    // General groundedness check (all diagram types): every node name in the
    // output must trace back to something pass 1 actually wrote about, or to
    // a real file path. Catches not just invented aggregate layers but also
    // verbatim reuse of the illustrative placeholder names in the syntax
    // guide (e.g. "AuthGuard", "HealthCheck") for a project that has none.
    // Skipped when no grounding context is available (nothing to check against).
    if (explanation || fileTree) {
      sanitized = this._stripUngroundedNodes(sanitized, diagramType, explanation, fileTree);
    }

    // Strip trailing whitespace on every line
    sanitized = sanitized.replace(/[ \t]+$/gm, '');

    // Collapse runs of 3+ blank lines to 2 (keep paragraph separation valid)
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

    return sanitized;
  }

  /**
   * Remove any class block whose name is a generic layer/group name
   * (e.g. "Services", "Controllers") instead of one real class, along with
   * every relationship line that references it. Leaves the rest of the
   * diagram — the real classes and their real relationships — intact.
   */
  _stripGenericAggregateClasses(code) {
    let result = code;
    const classDeclRegex = /class\s+(\w+)\s*\{[^}]*\}/g;
    const genericNames = new Set();

    let m;
    while ((m = classDeclRegex.exec(code)) !== null) {
      if (GENERIC_CLASS_NAME_REGEX.test(m[1])) genericNames.add(m[1]);
    }

    genericNames.forEach(name => {
      result = result.replace(new RegExp(`class\\s+${name}\\s*\\{[^}]*\\}`, 'g'), '');
      // Drop any relationship line mentioning this class as a whole word
      // (mermaid relationship lines are always self-contained on one line).
      result = result.replace(new RegExp(`^.*\\b${name}\\b.*$`, 'gm'), '');
      console.warn(`[DiagramAgent] Stripped generic aggregate class "${name}" and its relationships from the diagram`);
    });

    return result;
  }

  /**
   * Extract every node identifier the diagram declares or references,
   * regardless of diagram type. Used by _stripUngroundedNodes() to verify
   * each one traces back to something real.
   */
  _extractNodeNames(mermaid, diagramType) {
    const names = new Set();
    const isClass = diagramType === 'CLASS' || mermaid.trim().startsWith('classDiagram');

    if (isClass) {
      // Explicit declarations: class Foo { ... }
      let m;
      const classDeclRegex = /class\s+(\w+)/g;
      while ((m = classDeclRegex.exec(mermaid)) !== null) names.add(m[1]);

      // Relationship endpoints: A --> B, A ..> B, A --|> B, A ..|> B, A *-- B, A o-- B
      const relRegex = /(\w+)\s*(?:-->|\.\.>|--\|>|\.\.\|>|--\*|--o|--)\s*(\w+)/g;
      while ((m = relRegex.exec(mermaid)) !== null) {
        names.add(m[1]);
        names.add(m[2]);
      }
    } else {
      // COMPONENT/PIPELINE — graph/flowchart syntax.
      // Subgraph titles are conceptual groupings ("Frontend Layer"), not
      // entities that need to trace back to a real name — exclude them.
      const withoutSubgraphTitles = mermaid.replace(/^\s*subgraph\s+.*$/gm, '');

      let m;
      // Node declarations with a shape: NodeId["label"], NodeId{{"label"}}, NodeId("label")
      const nodeDeclRegex = /(\w+)\s*(?:\[[^\]]*\]|\{\{[^}]*\}\}|\([^)]*\))/g;
      while ((m = nodeDeclRegex.exec(withoutSubgraphTitles)) !== null) names.add(m[1]);

      // Bare edges: A --> B, A -->|label| B
      const edgeRegex = /(\w+)\s*-->(?:\|[^|]*\|)?\s*(\w+)/g;
      while ((m = edgeRegex.exec(withoutSubgraphTitles)) !== null) {
        names.add(m[1]);
        names.add(m[2]);
      }
    }

    // Drop mermaid keywords that inevitably get swept up by the regexes above
    ['classDiagram', 'graph', 'flowchart', 'TD', 'LR', 'TB', 'RL', 'BT', 'end', 'subgraph']
      .forEach(k => names.delete(k));

    return names;
  }

  /**
   * Strip any node whose name doesn't appear anywhere in pass 1's
   * architecture explanation or the repo file tree — a general,
   * type-agnostic groundedness check that catches fabricated nodes
   * regardless of *how* they were fabricated (invented aggregate,
   * copied syntax-guide placeholder, etc).
   */
  _stripUngroundedNodes(mermaid, diagramType, explanation, fileTree) {
    const names = this._extractNodeNames(mermaid, diagramType);
    if (names.size === 0) return mermaid;

    const groundingText = `${explanation}\n${fileTree}`.toLowerCase();
    const ungrounded = [...names].filter(name =>
      name.length >= 3 && !groundingText.includes(name.toLowerCase())
    );

    if (ungrounded.length === 0) return mermaid;

    let result = mermaid;
    ungrounded.forEach(name => {
      result = result.replace(new RegExp(`class\\s+${name}\\s*\\{[^}]*\\}`, 'g'), '');
      result = result.replace(new RegExp(`^.*\\b${name}\\b.*$`, 'gm'), '');
      console.warn(`[DiagramAgent] Stripped ungrounded node "${name}" — not found in explanation or file tree`);
    });

    return result.replace(/\n{3,}/g, '\n\n').trim();
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

    // Backstop for the "generic aggregate class" hallucination — _sanitizeMermaid
    // already strips these before _validate runs, so this should rarely fire.
    // Kept in case a class body shape slips past the strip regex (e.g. a
    // brace inside a method signature breaking the non-greedy match).
    if (diagramType === 'CLASS') {
      const classDeclRegex = /class\s+(\w+)\s*\{/g;
      let cm;
      while ((cm = classDeclRegex.exec(mermaid)) !== null) {
        if (GENERIC_CLASS_NAME_REGEX.test(cm[1])) {
          throw new Error(
            `DiagramAgent invented a generic aggregate class "${cm[1]}" instead of naming a specific ` +
            `real class — this does not correspond to an actual class in the codebase.`
          );
        }
      }
    }

    // Check for remaining angle brackets (should have been caught by sanitize,
    // but check anyway in case a new diagram type is added later)
    const angleBracketCount = (mermaid.match(/<[^>]*(?:>|$)/g) || []).length;
    if (angleBracketCount > 2) {
      throw new Error(
        `DiagramAgent output contains ${angleBracketCount} angle brackets which break the Mermaid parser. ` +
        `First 120 chars: ${mermaid.slice(0, 120)}`
      );
    }
  }
}

module.exports = DiagramAgent;