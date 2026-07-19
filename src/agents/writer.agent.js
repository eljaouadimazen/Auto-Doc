const BaseAgent = require('./base.agent');

class WriterAgent extends BaseAgent {
  constructor() {
    super(
      'WriterAgent',
      `You are a senior technical writer creating professional software documentation.
You write clear, accurate, and useful documentation based on structured code analysis.
You NEVER invent functionality not evidenced in the data provided to you.
If you do not have enough information for a section, say so explicitly rather than hallucinating.
You write in markdown format. Be precise and professional.

CRITICAL RULE — NEVER use hedging or uncertain language:
  DO NOT use: "appears to", "likely", "may", "suggests", "probably", "might", "could", "seems to", "possibly"
  INSTEAD: State only what the code proves. If the evidence is insufficient, say:
    "The available code does not provide sufficient evidence to describe [X]."
  Every claim must be directly supported by the code analysis data provided to you.`,
      {
        temperature: 0.1,
        maxTokens:   3500,
        maxRetries:  2
      }
    );
  }

  typeFocus(section, nature) {
    const map = {
      architecture: {
        BACKEND:   'Focus on controller-service-repository layering, middleware chain, route registration, dependency injection. Emphasize how HTTP requests flow through the stack.',
        FRONTEND:  'Focus on component hierarchy, props/state flow, routing/navigation, service/API layer, state management (Context, Redux, etc.). Emphasize how UI renders from data.',
        FULLSTACK: 'Cover both frontend component hierarchy and backend service layering. Emphasize the API contract between client and server.',
        MOBILE:    'Focus on screen/route structure, platform layers (iOS/Android), native module bridging, state management. Emphasize the mobile-specific architecture patterns.',
        DEVOPS:    'Focus on pipeline stages, tool chain, environment topology, infrastructure-as-code modules, deployment targets. Emphasize automation flow rather than application layering.',
        LIBRARY:   'Focus on public API surface, module exports, build configuration, dependency graph. Emphasize how consumers interact with the library.',
      },
      api: {
        BACKEND:   'Document all REST/gRPC/GraphQL endpoints with methods, paths, request body schemas, response formats, authentication requirements. Be exhaustive.',
        FRONTEND:  'Document external API consumption: which endpoints are called, authentication patterns used, response handling, error handling in API calls.',
        FULLSTACK: 'Document both exposed backend endpoints and external APIs consumed by the frontend. Show the API contract between layers.',
        LIBRARY:   'Document exported functions, classes, interfaces, types with parameters, return types, and usage examples.',
      },
      setup: {
        BACKEND:   'Include server startup command, database migration steps, environment variable configuration, API key setup. Focus on what a backend developer needs to run the server locally.',
        FRONTEND:  'Include dev server command, build pipeline, proxy configuration for API calls, package manager commands. Focus on what a frontend developer needs to start developing.',
        FULLSTACK: 'Cover both backend and frontend setup. Include the full stack startup sequence.',
        MOBILE:    'Include platform-specific setup (Xcode, Android Studio), simulator/emulator launch commands, code signing, device provisioning.',
        DEVOPS:    'Include tool installation, cloud provider CLI setup, secrets management, CI runner configuration. Focus on infrastructure setup.',
        LIBRARY:   'Include installation command, import example, minimal usage example, peer dependencies.',
      },
      security: {
        BACKEND:   'Focus on authentication middleware, API key/ JWT validation, rate limiting, input validation, CORS configuration, Helmet middleware.',
        FRONTEND:  'Focus on token storage strategy, HTTP interceptor pattern for attaching credentials, route guards/navigation guards, output sanitization (DOMPurify).',
        FULLSTACK: 'Cover both frontend (token management, guards) and backend (auth middleware, rate limiting, validation) security layers.',
        MOBILE:    'Focus on secure storage (Keychain/KeyStore), biometric auth, certificate pinning, app transport security.',
        DEVOPS:    'Focus on secrets management (vault, GitHub secrets), network policies, IAM roles, container security scanning.',
      },
      data_flow: {
        BACKEND:   'Describe request lifecycle: HTTP request → middleware → controller → service → repository/model → database. Include authentication gate and error handling at each layer.',
        FRONTEND:  'Describe data flow from UI interaction → state update → API call → response handling → re-render. Include auth token lifecycle.',
        FULLSTACK: 'Describe end-to-end flow: user interaction → frontend state → API call → backend processing → database → response → UI update.',
        MOBILE:    'Describe data flow from user interaction through platform channels to backend and back.',
        DEVOPS:    'Describe artifact flow: source commit → CI trigger → build → test → package → deploy → health check.',
      },
      error_handling: {
        BACKEND:   'Focus on global error middleware, HTTP status code usage (400, 401, 403, 404, 500), validation error responses, structured error format.',
        FRONTEND:  'Focus on error boundaries, API error handling in services, user-facing error messages, form validation.',
      },
      configuration: {
        BACKEND:   'Focus on environment variables for DB connection, API keys, service URLs. Configuration file formats and loading order.',
        FRONTEND:  'Focus on build-time environment variables, proxy config, API base URL configuration, theme settings.',
        DEVOPS:    'Focus on environment-specific config per stage (dev/staging/prod), secrets injection, config-as-code.',
      },
      deployment: {
        BACKEND:   'Focus on server hosting, containerization (Docker), process manager (PM2), environment variables for production, database migrations in deployment.',
        FRONTEND:  'Focus on static hosting (Vercel, Netlify, S3), build optimization, CDN setup, environment-specific builds.',
        FULLSTACK: 'Cover both backend deployment (server/container) and frontend deployment (static/CDN). Include full-stack CI/CD pipeline.',
        MOBILE:    'Focus on App Store/Play Store deployment, code signing, TestFlight/internal testing, app versioning, over-the-air updates.',
        DEVOPS:    'Focus on multi-environment pipeline, GitOps, canary/blue-green deployment, rollback strategy, infrastructure provisioning.',
        LIBRARY:   'Focus on package registry publishing (npm, PyPI, etc.), semantic versioning, changelog generation.',
      },
    };
    return map[section]?.[nature] || '';
  }

  getSections(targetAudience, docStrategy, forbiddenSections = []) {
    const base = {
      USER: ['overview', 'setup'],
      DEVELOPER: ['overview', 'architecture', 'api', 'security', 'setup', 'technical', 'business_model', 'data_flow', 'entities', 'error_handling', 'configuration', 'deployment', 'dependencies'],
      PROJECT_MANAGER: ['overview', 'architecture', 'api', 'security', 'business_model', 'progress', 'deployment'],
      PRODUCT_OWNER: ['overview', 'business_model', 'progress']
    };
    const sections = base[targetAudience] || base.DEVELOPER;
    return sections.filter(s => !forbiddenSections.includes(s));
  }

  async execute(agentInput) {
    const {
      projectNature       = 'BACKEND',
      docStrategy         = 'FULL_SOFTWARE',
      logicSignals        = [],
      techStack           = [],
      fileAnalyses        = [],
      securityResults     = [],
      architectureDiagram = null,
      stakeholderDiagram  = null,
      targetAudience      = 'DEVELOPER',
      businessModel       = '',
      projectProgress     = '',
      forbiddenSections   = [],
      godNodes            = [],
      manifestDependencies = [],
    } = agentInput.input;

    const { repository } = agentInput.context;
    const moduleSummary = this.buildModuleSummary(fileAnalyses);

    if (docStrategy === 'RESOURCE_LIST') {
      const doc = await this.writeResourceDoc(repository, fileAnalyses);
      return { documentation: doc, sections: 3 };
    }

    const sections = this.getSections(targetAudience, docStrategy, forbiddenSections);

    const tasks = {};
    if (sections.includes('overview')) {
      tasks.overview = this.writeOverview(repository, projectNature, logicSignals, moduleSummary, targetAudience, godNodes);
    }
    if (sections.includes('architecture')) {
      tasks.architecture = this.writeArchitecture(projectNature, logicSignals, fileAnalyses, architectureDiagram, targetAudience, godNodes, stakeholderDiagram);
    }
    if (docStrategy === 'LIBRARY' && targetAudience === 'DEVELOPER') {
      tasks.library_ref = this.writeLibraryReference(fileAnalyses, projectNature, logicSignals, techStack);
    } else if (sections.includes('api')) {
      tasks.api = this.writeAPIReference(fileAnalyses, projectNature, targetAudience);
    }
    if (sections.includes('security')) {
      tasks.security = this.writeSecuritySection(securityResults, logicSignals, fileAnalyses, projectNature, targetAudience);
    }
    if (sections.includes('setup')) {
      tasks.setup = this.writeSetupUsage(repository, projectNature, logicSignals, techStack, targetAudience);
    }
    if (sections.includes('technical')) {
      tasks.technical = this.writeTechnicalModules(moduleSummary, projectNature, targetAudience);
    }
    if (sections.includes('business_model')) {
      tasks.business_model = this.writeBusinessModel(businessModel, projectNature, logicSignals, repository);
    }
    if (sections.includes('progress')) {
      tasks.progress = this.writeProgress(projectProgress, repository);
    }
    if (sections.includes('data_flow')) {
      tasks.data_flow = this.writeDataFlow(fileAnalyses, projectNature, logicSignals, targetAudience);
    }
    if (sections.includes('entities')) {
      tasks.entities = this.writeEntityModel(fileAnalyses, projectNature, targetAudience);
    }
    if (sections.includes('error_handling')) {
      tasks.error_handling = this.writeErrorHandling(fileAnalyses, logicSignals, projectNature, targetAudience);
    }
    if (sections.includes('configuration')) {
      tasks.configuration = this.writeConfiguration(fileAnalyses, projectNature, targetAudience);
    }
    if (sections.includes('deployment')) {
      tasks.deployment = this.writeDeployment(fileAnalyses, logicSignals, projectNature, targetAudience);
    }
    if (sections.includes('dependencies')) {
      tasks.dependencies = this.writeDependencies(fileAnalyses, projectNature, targetAudience, manifestDependencies);
    }

    const results = await Promise.all(Object.values(tasks));
    const keys = Object.keys(tasks);
    const parts = [];
    keys.forEach((key, i) => {
      if (results[i]) parts.push(results[i]);
    });

    parts.push(this.writeFooter(repository, targetAudience));
    const documentation = parts.join('\n\n---\n\n');

    return { documentation, sections: parts.length };
  }

  buildModuleSummary(fileAnalyses) {
    return fileAnalyses.map(f => {
      if (f.purpose && f.responsibilities) {
        return `**${f.path}** (${f.type || 'source'})
- Purpose: ${f.purpose}
- Responsibilities: ${(f.responsibilities || []).join(', ')}
- Dependencies: ${(f.dependencies || []).join(', ') || 'none'}
- Routes: ${(f.routes || []).map(r => `${r.method} ${r.path}`).join(', ') || 'none'}
- Complexity: ${f.complexity || 'unknown'}`;
      }
      return `**${f.path}** (${f.type || 'source'})
${f.snippet ? `\`\`\`\n${f.snippet.slice(0, 200)}\n\`\`\`` : '(no content)'}`;
    }).join('\n\n');
  }

  async writeOverview(repository, nature, signals, moduleSummary, audience, godNodes = []) {
    const audienceInstruction = audience === 'USER'
      ? 'Write for end users with minimal technical knowledge. Explain what the project does in simple terms. Focus on the problem it solves and the value it provides. Avoid technical jargon, architecture details, and implementation specifics.'
      : audience === 'PROJECT_MANAGER'
      ? 'Write for project managers. Provide a high-level overview of the project scope, business context, objectives, and key deliverables. Emphasize business value and strategic importance.'
      : audience === 'PRODUCT_OWNER'
      ? 'Write for product owners. Focus on features, capabilities, and user-facing value. Describe what the system does from a product perspective.'
      : 'Write for developers. Provide a comprehensive overview including technical context, the problem domain, architecture philosophy, and key technologies.';

    const godNodeSummary = godNodes.length > 0
      ? `\nHub files (most connected in the dependency graph — central modules):
${godNodes.map(n => `  - ${n.path} (${n.degree} connections, community ${n.community})`).join('\n')}
These are the central modules of the project. Describe their role in the overall architecture.\n`
      : '';

    return this.callLLM(`Write a "## Project Overview" section for this repository.

Repository: ${repository}
Project type: ${nature}
Detected signals: ${signals.join(', ')}${godNodeSummary}
Key files:
${moduleSummary.slice(0, 1500)}

${audienceInstruction}

Write 3-5 sentences. Use definitive language based ONLY on the data provided. Never use hedging words.`);
  }

  async writeArchitecture(nature, signals, fileAnalyses, architectureDiagram, audience, godNodes = [], stakeholderDiagram = null) {
    const layers = this.inferLayers(fileAnalyses);
    const typeGuide = this.typeFocus('architecture', nature);

    const depthInstruction = audience === 'PROJECT_MANAGER'
      ? 'Write a high-level architecture summary for project managers. Focus on major system components, how they interact, and technology choices. Skip low-level implementation details.'
      : `Write a detailed architecture section for developers. ${typeGuide}`;

    const godNodeSummary = godNodes.length > 0
      ? `\nMost connected files (architectural hubs):
${godNodes.map(n => `  - ${n.path} (${n.degree} connections) — connects to: ${n.connections.slice(0, 5).map(c => c.path).join(', ')}`).join('\n')}
These files form the architectural core — describe how they relate to the layered structure above.\n`
      : '';

    const architectureText = await this.callLLM(`Write an "## Architecture" section.

Project type: ${nature}
Detected signals: ${signals.join(', ')}
Detected layers: ${JSON.stringify(layers)}${godNodeSummary}
${depthInstruction}

Base your description ONLY on the provided layer data.`);

    let result = architectureText;
    if (architectureDiagram) {
      result += `

### Architecture Visualization

\`\`\`mermaid
${architectureDiagram}
\`\`\``;
    }
    if (stakeholderDiagram) {
      const heading = audience === 'PROJECT_MANAGER' || audience === 'PRODUCT_OWNER'
        ? '### System Context (C4 Container View)'
        : '### Stakeholder View';
      result += `

${heading}

\`\`\`mermaid
${stakeholderDiagram}
\`\`\``;
    }
    return result;
  }

  async writeAPIReference(fileAnalyses, nature, audience) {
    const routes = fileAnalyses.flatMap(f => f.routes || []);
    const apiCalls = fileAnalyses.flatMap(f => f.apiCalls || []);
    const isFrontend = nature === 'FRONTEND' || nature === 'FULLSTACK' || apiCalls.length > routes.length;
    const typeGuide = this.typeFocus('api', nature);

    if (audience === 'PROJECT_MANAGER') {
      const allEndpoints = routes.length > 0
        ? routes.map(r => `${r.method} ${r.path}`)
        : apiCalls.map(c => `${c.method} ${c.url}`);
      return this.callLLM(`Write a brief "## API Overview" section for project managers.
${isFrontend ? 'APIs consumed' : 'Endpoints exposed'}: ${allEndpoints.length > 0 ? JSON.stringify(allEndpoints) : 'none'}
Provide a high-level summary of API capabilities and integration points. One paragraph.`);
    }

    // Frontend project: list consumed APIs
    if (isFrontend && apiCalls.length > 0) {
      return this.callLLM(`Write an "## API Reference" section documenting the external APIs consumed by this frontend application.

${typeGuide}

Consumed API endpoints:
${apiCalls.map(c => `- ${c.method} ${c.url} (via ${c.source})`).join('\n')}

For each endpoint, document:
- Method and full URL path
- What the call is used for (based on context from the source file)
- Authentication requirements if evident

Base every claim on the API calls listed above. Never use hedging language.`);
    }

    // Backend project: list exposed routes
    if (routes.length === 0) {
      const controllers = fileAnalyses.filter(f => /controller/i.test(f.path));
      if (controllers.length === 0) {
        return '## API Reference\n\n*No API routes could be detected.*';
      }
      return this.callLLM(`Write an "## API Reference" section.

${typeGuide}

Inferred from: ${controllers.map(c => c.path).join(', ')}
List likely endpoints based on controller names.`);
    }

    return this.callLLM(`Write an "## API Reference" section.

${typeGuide}

Routes: ${JSON.stringify(routes, null, 2)}
Document each endpoint with method, path, and purpose.`);
  }

  async writeSecuritySection(securityResults, signals, fileAnalyses, nature, audience) {
    const typeGuide = this.typeFocus('security', nature);
    const securityFiles = fileAnalyses.filter(f => f.securityRelevant);
    const authSignals = signals.filter(s => /jwt|auth|token|oauth|login|password|bcrypt|guard|interceptor/i.test(s));
    const authMechanisms = fileAnalyses.flatMap(f => f.authMechanisms || []);
    const hasIssues = securityResults.filter(s => s.riskLevel !== 'clean');
    const authFiles = securityFiles.filter(f =>
      /auth|login|register|guard|interceptor|jwt|token/i.test(f.path)
    );

    const securityContext = `
Security-relevant files:
${securityFiles.map(f => `- ${f.path}: ${f.purpose || ''}${f.securityNotes ? ' — ' + f.securityNotes : ''}`).join('\n') || '  (none detected)'}

Auth-specific files:
${authFiles.map(f => `- ${f.path}: ${f.purpose || ''}`).join('\n') || '  (none detected)'}

Auth signals detected in codebase: ${authSignals.join(', ') || 'none'}
Auth mechanisms found: ${[...new Set(authMechanisms)].join(', ') || 'none'}
Total security issues flagged: ${hasIssues.length}`;

    if (audience === 'PROJECT_MANAGER') {
      return this.callLLM(`Write a "## Security Overview" section for project managers.

${securityContext}

${typeGuide}

Summarize the security approach at a high level. One paragraph.`);
    }

    return this.callLLM(`Write a detailed "## Security" section for developers.

${securityContext}

${typeGuide}

Describe:
1. Authentication mechanisms in use (JWT, OAuth, session-based, API keys) — state exactly what the code proves
2. How authentication tokens/credentials are stored and transmitted
3. Authorization approach (route guards, role-based access, permissions)
4. Password security (hashing algorithm, reset flow)
5. API security (rate limiting, input validation, CORS, Helmet)
6. Additional security measures detected (WebSocket auth, CSRF protection, audit logging)

Base every claim on the security-relevant files listed above. If a security aspect is not evidenced in the code, state: "No evidence of [X] was found in the codebase." Never use hedging language.`);
  }

  async writeSetupUsage(repository, nature, signals, techStack, audience) {
    const typeGuide = this.typeFocus('setup', nature);
    const isMobile = nature === 'MOBILE';
    const instruction = audience === 'USER'
      ? 'Write a detailed walkthrough for end users. Include step-by-step instructions for getting started, running the project, and using its core features. Assume the reader is not a developer. Use simple language and avoid command-line instructions where possible.'
      : 'Write a "## Setup & Usage" section for developers. Use SPECIFIC commands based on the detected tech stack — do NOT list generic alternatives.';

    const mobileInstruction = isMobile ? `
Mobile-specific requirements:
- Include BOTH iOS and Android setup if applicable (Xcode, CocoaPods, Android Studio, Gradle).
- Emulator/simulator commands: "npx react-native run-ios", "flutter run", "npx react-native run-android".
- Platform-specific dependencies: Podfile for iOS, build.gradle for Android.
- Code signing and provisioning profiles for iOS.
- Physical device testing instructions.
- If Flutter: include "flutter doctor" to verify setup.` : '';

    return this.callLLM(`Write a "## Setup & Usage" section.
Repository: ${repository}
Project type: ${nature}
Signals: ${signals.join(', ')}
Detected tech stack: ${techStack.join(', ')}

${typeGuide}

${instruction}
${mobileInstruction}

Requirements:
- Use ONLY the specific package manager and build tool detected (e.g., npm, yarn, pnpm, Maven, Gradle).
- List the specific framework commands (e.g., "ng serve" for Angular, "npm run dev" for React/Vite, "mvn spring-boot:run" for Spring Boot).
- Include required environment variables with their purpose.
- Reference framework-specific configuration files (e.g., application.properties, environment.ts, .env).
- Include Docker commands if Docker is detected in the stack.
- Include production build steps and deployment commands.
- NEVER list alternatives like "npm install or yarn install" — pick the one detected.
- Base everything on the detected tech stack. Never use hedging language.`);
  }

  async writeTechnicalModules(moduleSummary, nature, audience) {
    if (audience !== 'DEVELOPER') return null;

    return this.callLLM(`Write a "## Technical Specifications" section.
${moduleSummary.slice(0, 3000)}
Group related files and describe their specific roles in detail.`);
  }

  async writeBusinessModel(businessModel, projectNature, logicSignals, repository) {
    if (!businessModel) {
      return this.callLLM(`Write a "## Business Context" section for this repository.

Repository: ${repository}
Project type: ${projectNature}
Detected features (from code evidence): ${logicSignals.join(', ')}

Describe the business context, target users, and value proposition based ONLY on the detected features listed above. Reference actual entity/model names, route paths, module names, and package structure found in the codebase. If the evidence is insufficient to describe a specific aspect, state: "The available code does not provide sufficient evidence to describe [X]." Never use hedging language.`);
    }

    return this.callLLM(`Write a "## Business Context" section for this repository.

Repository: ${repository}
Project type: ${projectNature}
Detected features (from code evidence): ${logicSignals.join(', ')}

Based on the following business context provided by the project owner, write a professional Business Context section:

${businessModel}

Include: problem statement, target audience, value proposition, and key business drivers. Cross-reference the provided business context with the detected features from code evidence. Never use hedging language.`);
  }

  async writeProgress(projectProgress, repository) {
    if (!projectProgress) {
      return `## Project Status

*No project progress information was provided.*`;
    }

    return this.callLLM(`Write a "## Project Status" section for this repository.

Repository: ${repository}

Based on the following project progress information provided by the project owner, write a status section covering: current phase, completed milestones, next steps, and timeline.

${projectProgress}`);
  }

  async writeResourceDoc(repository, fileAnalyses) {
    const fileTree = fileAnalyses.map(f => f.path).sort().join('\n');
    return this.callLLM(`Write a "## Directory Structure" section for ${repository}.

Files in this repository:
\`\`\`
${fileTree}
\`\`\`

For each file or directory, describe its purpose based on its path and naming conventions.

Then write a "## Usage" section explaining how this resource list can be used.

Then write a "## Contents by Category" section grouping related files together.

Do NOT write any code documentation — this repository contains configuration files, documentation, and non-code resources. Focus on organization and purpose of each item. Never use hedging language.`);
  }

  async writeLibraryReference(fileAnalyses, nature, signals, techStack) {
    const exports = fileAnalyses.flatMap(f =>
      (f.classes || []).map(c => ({ name: c.name, type: 'class', role: c.role }))
        .concat((f.functions || []).map(fn => ({ name: fn.name, type: 'function', role: fn.purpose })))
    );
    const deps = [...new Set(fileAnalyses.flatMap(f => f.dependencies || []))].sort();
    const techStackStr = techStack.join(', ');

    return this.callLLM(`Write a "## API / Usage Reference" section for this library/SDK.

Project type: ${nature === 'LIBRARY' ? 'Library/SDK/package' : nature}
Tech stack: ${techStackStr || 'unknown'}
Dependencies: ${deps.join(', ') || 'none'}

Exported API surface:
${exports.slice(0, 30).map(e => `- ${e.type}: ${e.name} — ${e.role || ''}`).join('\n') || '  (could not detect specific exports from code)'}

Write:
1. **Installation** — the specific package manager command (e.g., "npm install <package>", "pip install <package>", "gem install <package>") based on the tech stack
2. **Import / Usage** — how to import and use the library in code with a concrete example
3. **API Reference** — document each exported class/function with its purpose, parameters, and return value
4. **Peer Dependencies** — list runtime dependencies required
5. **Compatibility** — supported environments (Node.js version, browser, React Native, etc.)

Base every claim on the exported API surface and dependencies listed above. Never use hedging language.`);
  }

  async writeDataFlow(fileAnalyses, nature, signals, audience) {
    const typeGuide = this.typeFocus('data_flow', nature);
    const authFiles = fileAnalyses.filter(f =>
      /auth|login|register|jwt|token|guard|interceptor/i.test(f.path)
    );
    const apiCalls = fileAnalyses.flatMap(f => f.apiCalls || []);
    const components = fileAnalyses.filter(f =>
      /component|screen|page|view/i.test(f.path)
    );
    const services = fileAnalyses.filter(f =>
      /service|api|http|store|provider/i.test(f.path)
    );
    const backendFiles = fileAnalyses.filter(f =>
      /controller|repository|route|handler/i.test(f.path)
    );

    return this.callLLM(`Write a "## Data Flow" section for ${audience === 'PROJECT_MANAGER' ? 'project managers' : 'developers'}.

Project type: ${nature}
Detected signals: ${signals.join(', ')}

${typeGuide}

Components found:
${components.map(f => `- ${f.path}: ${f.purpose || ''}`).join('\n') || '  (none detected)'}

Services found:
${services.map(f => `- ${f.path}: ${f.purpose || ''}`).join('\n') || '  (none detected)'}

Auth-related files:
${authFiles.map(f => `- ${f.path}: ${f.purpose || ''}`).join('\n') || '  (none detected)'}

Backend files:
${backendFiles.map(f => `- ${f.path}: ${f.purpose || ''}`).join('\n') || '  (none detected)'}

API calls detected in frontend:
${apiCalls.map(c => `- ${c.method} ${c.url}`).join('\n') || '  (none detected)'}

${audience === 'PROJECT_MANAGER'
  ? 'Write a high-level data flow overview. One paragraph.'
  : `Describe the complete data flow:
1. Frontend → Backend: how the UI communicates with the server
2. Authentication flow: login → token issuance → token storage → authorized requests → backend validation
3. Data layer: services → repositories → database
4. Real-time communication: WebSocket paths or polling if detected

Include a Mermaid sequence diagram showing the authentication flow:
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database

Base every claim on the files and API calls listed above. Never use hedging language.`}`);
  }

  async writeEntityModel(fileAnalyses, nature, audience) {
    if (audience !== 'DEVELOPER') return null;

    const dbEntities = fileAnalyses.flatMap(f => f.dbEntities || []);
    const dbTech = [...new Set(fileAnalyses.map(f => f.dbTechnology).filter(Boolean))];
    const ormLib = [...new Set(fileAnalyses.map(f => f.ormLibrary).filter(Boolean))];

    if (dbEntities.length === 0) {
      return `## Database / Entity Model

*No database entities could be detected in the codebase.*`;
    }

    return this.callLLM(`Write a "## Database / Entity Model" section for developers.

Database technology detected: ${dbTech.join(', ') || 'unknown'}
ORM library detected: ${ormLib.join(', ') || 'unknown'}

Entities found:
${JSON.stringify(dbEntities, null, 2)}

Describe:
1. Database technology and ORM framework
2. Each entity/table, its fields, and its purpose
3. Relationships between entities (one-to-many, many-to-many, etc.)
4. Include a Mermaid ER diagram showing the entities and their relationships:
   erDiagram
       ENTITY_NAME {
           type field_name
       }

Base every claim on the entities listed above. If relationships are not evident from the code, state that. Never use hedging language.`);
  }

  async writeErrorHandling(fileAnalyses, signals, nature, audience) {
    if (audience !== 'DEVELOPER') return null;

    const typeGuide = this.typeFocus('error_handling', nature);
    const errorPatterns = fileAnalyses.flatMap(f => f.errorHandling || []);
    const uniquePatterns = [...new Set(errorPatterns)];
    const globalHandlers = fileAnalyses.filter(f =>
      /error|exception|handler|advice|middleware/i.test(f.path)
    );

    if (uniquePatterns.length === 0 && globalHandlers.length === 0) {
      return `## Error Handling

*No specific error handling patterns could be detected in the codebase.*`;
    }

    return this.callLLM(`Write a "## Error Handling" section for developers.

Error handling patterns detected: ${uniquePatterns.join(', ') || 'none'}
Error-handling files:
${globalHandlers.map(f => `- ${f.path}: ${f.purpose || ''}`).join('\n') || '  (none detected)'}

${typeGuide}

Describe:
1. Global error handling strategy (middleware, @ControllerAdvice, error boundaries)
2. HTTP status codes used (400, 401, 403, 404, 500)
3. Input validation approach (Joi, Zod, class-validator, bean validation)
4. Error response format
5. Logging and error tracking

Base every claim on the detected patterns and files above. Never use hedging language.`);
  }

  async writeConfiguration(fileAnalyses, nature, audience) {
    if (audience !== 'DEVELOPER') return null;

    const typeGuide = this.typeFocus('configuration', nature);
    const configFiles = fileAnalyses.filter(f =>
      /config|\.env|application\.properties|application\.yml|environment/i.test(f.path)
    );
    const envVars = [...new Set(fileAnalyses.flatMap(f => f.envVars || []))];
    const configVars = [...new Set(fileAnalyses.flatMap(f => f.configVars || []))];

    if (configFiles.length === 0 && envVars.length === 0) {
      return `## Configuration

*No configuration files or environment variables could be detected.*`;
    }

    return this.callLLM(`Write a "## Configuration" section for developers.

${typeGuide}

Configuration files detected:
${configFiles.map(f => `- ${f.path}: ${f.purpose || ''}`).join('\n') || '  (none detected)'}

Environment variables used:
${envVars.join('\n') || '  (none detected)'}

Config variables:
${configVars.join('\n') || '  (none detected)'}

Describe:
1. Configuration approach (environment variables, config files, application.properties)
2. Required environment variables and their purpose
3. Configuration files and their structure
4. Environment-specific configuration (dev, staging, production)

Base every claim on the files and variables listed above. Never use hedging language.`);
  }

  async writeDeployment(fileAnalyses, signals, nature, audience) {
    const typeGuide = this.typeFocus('deployment', nature);
    const isMobile = nature === 'MOBILE';
    const deployFiles = fileAnalyses.filter(f =>
      /docker|ci|cd|deploy|github\/workflows|render|heroku|kubernetes|nginx|Dockerfile/i.test(f.path)
    );
    const deployConfigs = [...new Set(fileAnalyses.flatMap(f => f.deploymentConfig || []))];
    const mobileFiles = fileAnalyses.filter(f =>
      /Podfile|build\.gradle|Info\.plist|AndroidManifest|app\.json|fastlane/i.test(f.path)
    );

    if (deployFiles.length === 0 && deployConfigs.length === 0 && !isMobile) {
      return `## Deployment

*No deployment configuration could be detected in the codebase.*`;
    }

    const mobileContext = isMobile ? `
Mobile platform files:
${mobileFiles.map(f => `- ${f.path}: ${f.purpose || ''}`).join('\n') || '  (none detected)'}` : '';

    return this.callLLM(`Write a "## Deployment" section for ${audience === 'PROJECT_MANAGER' ? 'project managers' : 'developers'}.

Project type: ${nature}
Deployment files detected:
${deployFiles.map(f => `- ${f.path}: ${f.purpose || ''}`).join('\n') || '  (none detected)'}

Deployment configs: ${deployConfigs.join(', ') || 'none'}${mobileContext}

${typeGuide}

${audience === 'PROJECT_MANAGER'
  ? 'Write a high-level deployment overview covering infrastructure, environments, and CI/CD pipeline. One paragraph.'
  : isMobile
  ? `Describe:
1. App Store deployment (App Store Connect, TestFlight, code signing, provisioning profiles)
2. Google Play Store deployment (Play Console, app signing, release tracks)
3. CI/CD for mobile (Fastlane, Bitrise, GitHub Actions for mobile)
4. Build variants (debug/release, staging/production)
5. Version management (versionName, versionCode, build numbers)
6. Over-the-air updates (CodePush, Expo updates) if applicable

Base every claim on the files and configs listed above. Never use hedging language.`
  : `Describe:
1. Container setup (Dockerfile, docker-compose)
2. CI/CD pipeline (GitHub Actions, GitLab CI, Jenkins)
3. Hosting/deployment platform (Render, Heroku, AWS, self-hosted)
4. Production build steps
5. Environment variables required for production

Base every claim on the files and configs listed above. Never use hedging language.`}`);
  }

  async writeDependencies(fileAnalyses, nature, audience, manifestDependencies = []) {
    if (audience !== 'DEVELOPER') return null;

    // Prefer real manifest data (pom.xml, package.json, etc.) — actual
    // package coordinates and versions — over import statements scraped
    // from the handful of files CodeIntelligenceAgent had budget to analyze.
    if (manifestDependencies.length > 0) {
      const manifestList = manifestDependencies
        .map(m => `**${m.ecosystem}** (\`${m.file}\`):\n${m.dependencies.map(d => `- ${d}`).join('\n')}`)
        .join('\n\n');

      return this.callLLM(`Write a "## Dependencies" section for developers.

Project type: ${nature}
Dependencies detected from manifest file(s):

${manifestList}

Group the dependencies by category:
1. **Framework & Runtime** - web framework, language runtime
2. **Security & Auth** - authentication, encryption, security middleware
3. **Database & ORM** - database drivers, ORM libraries
4. **Testing** - test frameworks, assertion libraries
5. **Build & Dev Tools** - build tools, dev servers, linters
6. **Other** - remaining dependencies

For each group, list the dependencies with their version where given, and briefly describe their role. Base this ONLY on the manifest dependencies listed above. Never use hedging language.`);
    }

    const allDeps = fileAnalyses.flatMap(f => f.dependencies || []);
    const uniqueDeps = [...new Set(allDeps)].sort();

    if (uniqueDeps.length === 0) {
      return `## Dependencies

*No external dependencies could be detected.*`;
    }

    return this.callLLM(`Write a "## Dependencies" section for developers.

Project type: ${nature}
External dependencies detected: ${uniqueDeps.join(', ')}

Group the dependencies by category:
1. **Framework & Runtime** - web framework, language runtime
2. **Security & Auth** - authentication, encryption, security middleware
3. **Database & ORM** - database drivers, ORM libraries
4. **Testing** - test frameworks, assertion libraries
5. **Build & Dev Tools** - build tools, dev servers, linters
6. **Other** - remaining dependencies

For each group, list the dependencies and briefly describe their role. Base this ONLY on the detected dependencies list. Never use hedging language.`);
  }

  inferLayers(fileAnalyses) {
    const layers = {
      controllers: [], services: [], repositories: [], models: [],
      components: [], guards: [], interceptors: [], pipes: [], directives: [],
      modules: [], config: [], other: []
    };
    fileAnalyses.forEach(f => {
      const p = f.path.toLowerCase();
      if (/controller/i.test(p))              layers.controllers.push(f.path);
      else if (/service/i.test(p))            layers.services.push(f.path);
      else if (/repository|repo/i.test(p))    layers.repositories.push(f.path);
      else if (/entity|model|dto/i.test(p))   layers.models.push(f.path);
      else if (/component|screen|page|view/i.test(p)) layers.components.push(f.path);
      else if (/guard/i.test(p))              layers.guards.push(f.path);
      else if (/interceptor/i.test(p))        layers.interceptors.push(f.path);
      else if (/pipe/i.test(p))               layers.pipes.push(f.path);
      else if (/directive/i.test(p))          layers.directives.push(f.path);
      else if (/module/i.test(p))             layers.modules.push(f.path);
      else if (/config/i.test(p))             layers.config.push(f.path);
      else                                    layers.other.push(f.path);
    });
    return layers;
  }

  writeFooter(repository, audience) {
    return `*Documentation generated automatically for \`${repository}\` using the Multi-Agent Pipeline. Target audience: ${audience.toLowerCase()}.*`;
  }
}

module.exports = WriterAgent;