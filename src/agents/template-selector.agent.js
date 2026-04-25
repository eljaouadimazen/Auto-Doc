/**
 * template-selector.agent.js
 *
 * Selects the documentation template AND the diagram type.
 * DiagramType drives diagram.agent.js — must always be returned.
 */
const BaseAgent = require('./base.agent');

class TemplateSelectorAgent extends BaseAgent {
  constructor() {
    super(
      'TemplateSelector',
      `You are a software architecture classifier.
You receive signals about a codebase and return a strict JSON decision.
You never add prose — only valid JSON.`
    );
  }

  async execute(agentInput) {
    const { projectNature, logicSignals, hasExecutableCode } = agentInput.input;

    const prompt = `
Classify this project and select the correct documentation template and diagram type.

Project nature : ${projectNature}
Logic signals  : ${logicSignals.join(', ')}
Executable code: ${hasExecutableCode}

─── TEMPLATE RULES ────────────────────────────────────────────
FULL_SOFTWARE  → backend APIs, servers, CLI tools, microservices
LIBRARY        → npm packages, SDKs, shared utilities
RESOURCE_LIST  → pure config repos, link collections, no runnable code

─── DIAGRAM TYPE RULES ────────────────────────────────────────
CLASS          → backend / API / library / fullstack (shows classes, methods, relationships)
COMPONENT      → frontend / mobile / UI-heavy (shows component tree, state, data flow)
PIPELINE       → devops / CI-CD / infrastructure (shows stages, tools, environments)
NONE           → RESOURCE_LIST template or repos with no executable code

─── MAPPING (follow exactly) ──────────────────────────────────
BACKEND        → FULL_SOFTWARE  + CLASS
FRONTEND       → FULL_SOFTWARE  + COMPONENT
FULLSTACK      → FULL_SOFTWARE  + CLASS
MOBILE         → FULL_SOFTWARE  + COMPONENT
DEVOPS         → FULL_SOFTWARE  + PIPELINE
LIBRARY        → LIBRARY        + CLASS
RESOURCE_LIST  → RESOURCE_LIST  + NONE

Signals that force PIPELINE regardless of nature:
  dockerfile, docker-compose, .github/workflows, jenkinsfile, terraform, k8s, kubernetes, ansible

Signals that force COMPONENT:
  react, vue, angular, svelte, flutter, widget, component, screen

Return ONLY this JSON — no extra keys, no prose:
{
  "templateId"       : "FULL_SOFTWARE | LIBRARY | RESOURCE_LIST",
  "diagramType"      : "CLASS | COMPONENT | PIPELINE | NONE",
  "requiredSections" : ["string"],
  "forbiddenSections": ["string"],
  "reasoning"        : "one sentence"
}`;

    const result = await this.callLLMJSON(prompt, {
      templateId:        'FULL_SOFTWARE',
      diagramType:       'CLASS',
      requiredSections:  ['Overview', 'Architecture', 'API', 'Setup', 'Technical Specs'],
      forbiddenSections: [],
      reasoning:         'Default fallback'
    });

    // Guarantee diagramType is always present — never let it be undefined
    if (!result.diagramType) {
      result.diagramType = hasExecutableCode ? 'CLASS' : 'NONE';
    }

    // If template is RESOURCE_LIST, diagram makes no sense
    if (result.templateId === 'RESOURCE_LIST') {
      result.diagramType = 'NONE';
    }

    return result;
  }
}

module.exports = TemplateSelectorAgent;