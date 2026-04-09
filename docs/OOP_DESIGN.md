# Object-Oriented Design & Diagrams

While your `safe-file-generator` codebase does use Javascript `class` keywords (especially within your Agentic system), the project currently implements what's known as the **Singleton Pattern** and **Procedural-like Routing**. This means services are instantiated once globally and imported directly where needed, and data is passed around as raw objects (`{ path, content }`) instead of instances of Domain Models.

To make this a formal Object-Oriented Programming (OOP) project (which is exactly what's needed to build a proper Class Diagram for school, documentation, or presentations), you need to introduce three main concepts:

### 1. Domain Entities (Models)
Instead of passing JSON-like objects back and forth, create classes that represent the core "things" in your system.
* **`ProjectFile`**: Contains the file path, raw content, and AST metadata.
* **`SecurityAudit`**: Represents the risk level and redaction history.
* **`DocumentationResult`**: Contains the generated markdown and pipeline stats.

### 2. Dependency Injection (DI)
Currently, `GeneratorController` directly imports `github.service` and `llm.service`. In a strictly OOP system, tools depend on **Interfaces/Abstract Classes** and instances are passed into the constructor.
* Example: `class GeneratorController { constructor(repoService, llmService) { ... } }`
* Why? Because it shows true *Aggregation* and *Composition* in a Class Diagram rather than invisible local variables.

### 3. Abstract Classes and Interfaces
You already did a great job with this in your Agentic system using `BaseAgent`! You should carry this over to your services.
* **`BaseAgent`** (Abstract) → `OrchestratorAgent`, `SecurityAgent`
* **`IProviderService`** (Interface) → `GitHubService`
* **`ILLMService`** (Interface) → `GroqService`

Below are the Mermaid diagrams you requested based on this proposed strict-OOP approach.

---

## 1. Use Case Diagram
This diagram shows how users interact with the system and what external systems (GitHub, LLMs) are involved.

```mermaid
flowchart LR
    %% Actors
    User((User))
    GitHub[[GitHub API]]
    Groq[[Groq API \n Llama3]]

    %% System Boundary
    subgraph Auto-Doc System
        UC1([Submit Repo URL])
        UC2([Fetch Repository Contents])
        UC3([Sanitize Sensitive Data])
        UC4([Analyze Architecture & Code])
        UC5([Generate Documentation])
        UC6([Configure Custom Rules])
        UC7([View Audit Logs])
    end

    %% Relationships
    User --> UC1
    User --> UC6
    User --> UC7

    UC1 -.->|triggers| UC2
    UC1 -.->|triggers| UC3
    UC1 -.->|triggers| UC4
    UC1 -.->|triggers| UC5

    UC2 --> GitHub
    UC5 --> Groq
```

---

## 2. OOP Class Diagram
This captures the structural implementation of the system. Note the use of inheritance (`<|--`), aggregation (`o--`), and dependency injection.

```mermaid
classDiagram
    %% Pure Domain Model Strategy
    class User {
        -Id: Integer
        -ApiKey: String
        +SubmitRepository()
        +ValidateKey()
        +ViewAuditLogs()
        +ManageRules()
    }

    class Repository {
        -Url: String
        -Name: String
        -Owner: String
        +FetchFiles()
        +GenerateDocumentation()
    }

    class ProjectFile {
        -Path: String
        -RawContent: String
        -IsSanitized: Boolean
        -AstTree: Object
        +Sanitize()
        +ExtractAST()
    }

    class Documentation {
        -Content: String
        -GeneratedAt: Date
        -Stats: Object
        +SaveToDisk()
        +PublishToPages()
    }

    class AuditLog {
        -Timestamp: Date
        -FilesScanned: Integer
        -TotalRedacted: Integer
        +RecordEntry()
        +GetSummary()
    }

    class SanitizationRule {
        -Id: String
        -Name: String
        -Pattern: String
        -Flags: String
        +TestMatch(content: String) Boolean
    }

    User "1" -- "1..*" Repository 
    Repository "1" -- "1..*" ProjectFile 
    Repository "1" -- "1" Documentation 
    ProjectFile "*" -- "1..*" SanitizationRule 
    Repository "1" -- "1..*" AuditLog 
```

---

## 3. CI/CD Pipeline Diagram
This is a flowchart representing the operational workflow documented in your `CI-CD.md`, illustrating the two-layer smart triggering system.

```mermaid
flowchart TD
    Start((Push to Repo)) --> PathCheck{L1: Did src/ or \npackage.json change?}
    PathCheck -- No --> Skip1(Skip Pipeline)
    PathCheck -- Yes --> Checkout[Checkout Repo & Setup Node.js]
    Checkout --> Install[npm ci]
    Install --> SemDiff[Run Semantic Diff Check\nAST Fingerprinting]
    
    SemDiff --> StructCheck{L2: Is Semantic \nFingerprint Different?}
    StructCheck -- No \n(Logic Only) --> Skip2(Skip Generate Docs)
    StructCheck -- Yes \n(Structure Changed) --> Generate[Run generate-docs-ci.js\nRequest LLM]
    
    Generate --> SuccessCheck{Docs Generated?}
    SuccessCheck -- Yes --> Deploy[Publish to GitHub Pages \n'gh-pages' branch]
    Deploy --> End((Docs Live!))
```
