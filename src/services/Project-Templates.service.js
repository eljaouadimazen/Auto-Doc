/**
 * templates.js
 * Nature-aware README prompt templates for the Writer Agent.
 *
 * KEY FIX — Why diagrams were not being generated:
 *   The old design had diagramHint and structureHint as separate blocks.
 *   The LLM never connected them — it read "here is a Mermaid example" and
 *   then separately "here is the README structure" and wrote prose for the
 *   Architecture section instead of a diagram.
 *
 *   Fix: the diagram example is now embedded DIRECTLY inside structureHint
 *   at the exact section where it belongs, with MANDATORY language
 *   ("You MUST output", "do not replace with prose").
 *
 * Mermaid syntax rules enforced in every example:
 *   - Arrow labels:  -->|text|   (never -->|text|>)
 *   - Participants:  one word or CamelCase — no spaces
 *   - activate/deactivate blocks must be balanced
 *   - Node IDs:      alphanumeric only
 *   - flowchart TD   (not graph TD — deprecated in Mermaid v10+)
 */

const TEMPLATES = {

  // ─── BACKEND / API ────────────────────────────────────────────────────────────
  Backend: {
    label: 'Backend / API',
    diagramType: 'sequenceDiagram',

    structureHint: `
You MUST generate a complete README.md with ALL of the following sections in order.
Do not skip any section. Do not replace the Architecture diagram with prose.

---

## 1. Project Overview
What problem does this API solve? Who consumes it? (2-4 sentences)

## 2. Tech Stack
| Layer | Technology |
|-------|-----------|
| Language | ... |
| Framework | ... |
| ORM | ... |
| Database | ... |

## 3. Getting Started

### Prerequisites
- List Node/Java/Python version, database engine required

### Installation
\`\`\`bash
# clone, install deps, configure env
\`\`\`

### Environment variables
| Variable | Required | Description |
|----------|----------|-------------|
| ... | Yes | ... |

## 4. API Reference
| Method | Route | Description | Auth required |
|--------|-------|-------------|---------------|
| POST | /api/... | ... | Yes |

## 5. Data Models
Brief description of key entities and their relationships. Refer to schema files for full definition.

## 6. Architecture

You MUST output the following Mermaid block. Replace participant names and message labels
with real names found in the code. Do not write prose here — output only the diagram.

\`\`\`mermaid
sequenceDiagram
  participant Client
  participant Controller
  participant Service
  participant Repository
  participant Database

  Client->>Controller: POST /api/resource
  Controller->>Service: processRequest(data)
  Service->>Repository: findOrCreate(data)
  Repository->>Database: SQL query
  Database-->>Repository: result rows
  Repository-->>Service: entity
  Service-->>Controller: response DTO
  Controller-->>Client: 201 Created { id, ... }
\`\`\`

> ✏️ [Edit this diagram](https://mermaid.live)

Mermaid rules:
- ->> for calls (solid line), -->> for returns (dashed line)
- Participant names: one word or CamelCase, no spaces
- Do not use activate/deactivate unless every block is symmetrically closed

## 7. Authentication
Auth strategy (JWT / OAuth / sessions), how to obtain a token, how to pass it in requests.

## 8. Testing
How to run the test suite. Command example.

## 9. Contributing
Branch strategy, PR checklist.`,
  },

  // ─── FRONTEND / UI ───────────────────────────────────────────────────────────
  Frontend: {
    label: 'Frontend / UI',
    diagramType: 'flowchart TD',

    structureHint: `
You MUST generate a complete README.md with ALL of the following sections in order.
Do not skip any section. Do not replace the Architecture diagram with prose.

---

## 1. Project Overview
What does the UI do? Who is the end user? (2-4 sentences)

## 2. Tech Stack
| Concern | Technology |
|---------|-----------|
| Framework | ... |
| Styling | ... |
| State management | ... |
| Build tool | ... |

## 3. Getting Started

### Prerequisites
### Installation & dev server
\`\`\`bash
npm install
npm run dev
\`\`\`
### Environment variables
| Variable | Required | Description |
|----------|----------|-------------|

## 4. Project Structure
Key directories: src/components, src/pages, src/hooks, src/store — describe each briefly.

## 5. Component Architecture

You MUST output the following Mermaid block. Replace all node names with real component
and page names found in the code. Do not write prose here — output only the diagram.

\`\`\`mermaid
flowchart TD
  App --> Router
  Router --> PageHome
  Router --> PageDashboard
  Router --> PageSettings

  PageHome --> HeroSection
  PageHome --> FeatureList

  PageDashboard --> Sidebar
  PageDashboard --> MainContent
  MainContent --> DataTable
  MainContent --> ChartWidget

  App --> GlobalStore["Global store (Context / Redux)"]
  GlobalStore -.->|state| PageDashboard
  GlobalStore -.->|state| PageSettings
\`\`\`

> ✏️ [Edit this diagram](https://mermaid.live)

Mermaid rules:
- --> for parent-child relationships, -.-> for state/data flow
- Node IDs alphanumeric only; use NodeId["Display label"] for labels with spaces
- Keep tree to 2-3 levels deep — do not list every leaf component

## 6. State Management
How global state is handled. Store structure if applicable.

## 7. Routing
Route definitions. Protected routes and auth guards.

## 8. Styling
CSS strategy: Tailwind classes, CSS modules, styled-components, etc.

## 9. Building & Deployment
Build command, output directory, deployment target.

## 10. Contributing
Component naming conventions, lint/format rules, PR process.`,
  },

  // ─── DEVOPS / INFRASTRUCTURE ─────────────────────────────────────────────────
  DevOps: {
    label: 'DevOps / Infrastructure',
    diagramType: 'flowchart LR',

    structureHint: `
You MUST generate a complete README.md with ALL of the following sections in order.
Do not skip any section. Do not replace the Architecture diagram with prose.

---

## 1. Project Overview
What infrastructure or pipeline does this repo manage? (2-4 sentences)

## 2. Architecture

You MUST output the following Mermaid block. Adapt node labels to match the actual
pipeline stages found in the code. Do not write prose here — output only the diagram.

\`\`\`mermaid
flowchart LR
  A[Code push] -->|trigger| B[Build and test]
  B -->|success| C[Push to ACR]
  C -->|success| D[Deploy to App Service]
  D -->|success| E[Smoke test]
  E -->|failure| F[Notify and stop]
  B -->|failure| F
  C -->|failure| F
  D -->|failure| F
\`\`\`

> ✏️ [Edit this diagram](https://mermaid.live)

Mermaid rules:
- Arrow labels: -->|text| — never -->|text|> (no trailing >)
- Node IDs: single letters or short alphanumeric strings, no spaces
- Adapt stages: swap ACR for DockerHub, App Service for ECS, etc. as needed

## 3. Prerequisites
Required CLIs, cloud credentials, access levels needed to use this repo.

## 4. Environment Variables & Secrets
| Name | Where set | Purpose |
|------|-----------|---------|

## 5. Infrastructure Overview
Key resources managed: VMs, containers, cloud services, networking.

## 6. Deployment
- How to trigger a deployment
- Manual deployment steps (if any)
- Rollback procedure

## 7. Monitoring & Alerts
Where to find logs, dashboards, alert channels.

## 8. Runbooks
Links to incident response documentation.

## 9. Contributing
How to safely add new pipeline stages or infrastructure resources.`,
  },

  // ─── GENERAL / LIBRARY ───────────────────────────────────────────────────────
  General: {
    label: 'General / Library',
    diagramType: 'flowchart TD',

    structureHint: `
You MUST generate a complete README.md with ALL of the following sections in order.
Do not skip any section. Do not replace the Architecture diagram with prose.

---

## 1. Project Overview
What does this project do? Who is it for? (2-4 sentences)

## 2. Tech Stack
Languages, frameworks, key dependencies.

## 3. Getting Started

### Prerequisites
### Installation
\`\`\`bash
npm install   # or pip install, mvn install, etc.
\`\`\`

## 4. Usage
Code examples or command-line usage showing the most common use case.

## 5. Project Structure
Key directories and what each one contains.

## 6. Architecture

You MUST output the following Mermaid block. Replace generic node names with real
module or file names found in the code. Do not write prose here — output only the diagram.

\`\`\`mermaid
flowchart TD
  Input["Input / Entry point"] --> CoreModule
  CoreModule --> ModuleA
  CoreModule --> ModuleB
  ModuleA --> Util["Shared utilities"]
  ModuleB --> Util
  ModuleA --> Output["Output / Result"]
  ModuleB --> Output
\`\`\`

> ✏️ [Edit this diagram](https://mermaid.live)

Mermaid rules:
- Arrow labels: -->|text| — never -->|text|> (no trailing >)
- Node IDs alphanumeric; use NodeId["Display label"] for labels with spaces or slashes
- Keep to 6-8 nodes maximum — show the skeleton, not every function

## 7. Configuration
Key config options and how to set them.

## 8. Testing
How to run tests. Command example.

## 9. Contributing
Branching strategy, PR process.

## 10. License
License type and link.`,
  },
};

/**
 * Build the nature-aware instruction block to inject into the Writer Agent prompt.
 *
 * @param {string} nature - One of: 'Backend', 'Frontend', 'DevOps', 'General'
 * @returns {string} The instruction block as a prompt string
 */
const buildNaturePrompt = (nature) => {
  const template = TEMPLATES[nature] || TEMPLATES.General;

  return `
## Nature Detection Result
The detected project nature is: **${template.label}**

## Output Contract
You MUST produce a fenced \`\`\`mermaid\`\`\` code block in the Architecture section.
This is not optional. Do not replace the diagram with prose. Do not skip it.
The diagram type for this project is: \`${template.diagramType}\`

## README Structure and Content to Generate
${template.structureHint.trim()}
`.trim();
};

module.exports = { TEMPLATES, buildNaturePrompt };