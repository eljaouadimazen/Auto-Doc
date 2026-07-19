const diagramService = require('../src/services/diagram.service');
const factExtractor = require('../src/services/fact-extractor.service');
const MermaidGenerator = require('../src/services/mermaid-generator.service');
const path = require('path');
const fs = require('fs');
const os = require('os');

let tmpDir;

const springBootFiles = [
  {
    path: 'src/main/java/com/example/model/BaseEntity.java',
    content: `package com.example.model;

public abstract class BaseEntity {
    private Long id;
}`,
  },
  {
    path: 'src/main/java/com/example/model/User.java',
    content: `package com.example.model;

import jakarta.persistence.Entity;

@Entity
public class User extends BaseEntity {
    private String name;
    private String email;
}`,
  },
  {
    path: 'src/main/java/com/example/model/Post.java',
    content: `package com.example.model;

import jakarta.persistence.Entity;
import jakarta.persistence.ManyToOne;

@Entity
public class Post extends BaseEntity {
    private String title;
    private String content;
    @ManyToOne
    private User user;
}`,
  },
  {
    path: 'src/main/java/com/example/repository/UserRepository.java',
    content: `package com.example.repository;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {
}`,
  },
  {
    path: 'src/main/java/com/example/service/UserService.java',
    content: `package com.example.service;

public class UserService {
    public void process() {}
}`,
  },
  {
    path: 'src/main/java/com/example/controller/UserController.java',
    content: `package com.example.controller;

public class UserController {
    public void handle() {}
}`,
  },
];

const reactFiles = [
  {
    path: 'src/components/Header.jsx',
    content: `function Header() {
  return <div>Header</div>;
}`,
  },
  {
    path: 'src/components/Footer.jsx',
    content: `const Footer = () => {
  return <div>Footer</div>;
};`,
  },
  {
    path: 'src/components/UserList.jsx',
    content: `function UserList() {
  return (
    <div>
      <Header></Header>
      <p>User List</p>
    </div>
  );
}`,
  },
  {
    path: 'src/App.jsx',
    content: `function App() {
  return (
    <div>
      <Header></Header>
      <UserList></UserList>
    </div>
  );
}`,
  },
];

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-e2e-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Pipeline E2E — Spring Boot CLASS diagram', () => {
  let filteredFiles;
  let facts;
  let mermaidOutput;

  test('filterHighSignalFiles selects entity model files with score > 0', () => {
    filteredFiles = diagramService.filterHighSignalFiles(springBootFiles, 'CLASS');
    expect(filteredFiles.length).toBeGreaterThan(0);
    filteredFiles.forEach(f => expect(f.score).toBeGreaterThan(0));

    const paths = filteredFiles.map(f => f.path);
    expect(paths).toContain('src/main/java/com/example/model/User.java');
    expect(paths).toContain('src/main/java/com/example/model/Post.java');
    expect(paths).toContain('src/main/java/com/example/model/BaseEntity.java');
  });

  test('factExtractor.extract CLASS produces allNames with entities but not architecture classes', () => {
    facts = factExtractor.extract(filteredFiles, 'CLASS');
    const names = [...facts.allNames];

    expect(names).toContain('User');
    expect(names).toContain('Post');
    expect(names).toContain('BaseEntity');
    expect(names).not.toContain('UserRepository');
    expect(names).not.toContain('UserService');
    expect(names).not.toContain('UserController');
  });

  test('factExtractor.extract CLASS populates members for User, Post, BaseEntity', () => {
    expect(facts.members.has('User')).toBe(true);
    const userMembers = facts.members.get('User');
    expect(userMembers.some(m => m.name === 'name' && m.type === 'String')).toBe(true);
    expect(userMembers.some(m => m.name === 'email' && m.type === 'String')).toBe(true);

    expect(facts.members.has('Post')).toBe(true);
    const postMembers = facts.members.get('Post');
    expect(postMembers.some(m => m.name === 'title' && m.type === 'String')).toBe(true);
    expect(postMembers.some(m => m.name === 'content' && m.type === 'String')).toBe(true);

    expect(facts.members.has('BaseEntity')).toBe(true);
    const baseMembers = facts.members.get('BaseEntity');
    expect(baseMembers.some(m => m.name === 'id' && m.type === 'Long')).toBe(true);
  });

  test('factExtractor.extract CLASS produces extends and association edges', () => {
    const extendsEdges = facts.highConfidenceEdges.filter(e => e.type === 'extends');
    expect(extendsEdges.length).toBeGreaterThanOrEqual(2);
    expect(extendsEdges.some(e => e.from === 'User' && e.to === 'BaseEntity')).toBe(true);
    expect(extendsEdges.some(e => e.from === 'Post' && e.to === 'BaseEntity')).toBe(true);

    const assocEdges = facts.highConfidenceEdges.filter(e => e.type === 'association');
    expect(assocEdges.some(e => e.from === 'Post' && e.to === 'User')).toBe(true);
  });

  test('MermaidGenerator.generate CLASS starts with classDiagram and contains classes with fields', () => {
    mermaidOutput = MermaidGenerator.generate(facts, 'CLASS');
    expect(mermaidOutput).toMatch(/^classDiagram/);
    expect(mermaidOutput).toContain('class User {');
    expect(mermaidOutput).toContain('class Post {');
    expect(mermaidOutput).toContain('class BaseEntity {');
    expect(mermaidOutput).toContain('+String name');
    expect(mermaidOutput).toContain('+String email');
    expect(mermaidOutput).toContain('+String title');
    expect(mermaidOutput).toContain('+Long id');
  });

  test('MermaidGenerator.generate CLASS does NOT contain architecture class names', () => {
    expect(mermaidOutput).not.toContain('UserRepository');
    expect(mermaidOutput).not.toContain('UserService');
    expect(mermaidOutput).not.toContain('UserController');
  });

  test('MermaidGenerator.generate CLASS contains extends and association relationships', () => {
    expect(mermaidOutput).toContain('User --|> BaseEntity');
    expect(mermaidOutput).toContain('Post --|> BaseEntity');
    expect(mermaidOutput).toContain('Post --> User');
  });
});

describe('Pipeline E2E — React COMPONENT diagram', () => {
  let filteredFiles;
  let facts;
  let mermaidOutput;

  test('filterHighSignalFiles selects React component files', () => {
    filteredFiles = diagramService.filterHighSignalFiles(reactFiles, 'COMPONENT');
    expect(filteredFiles.length).toBeGreaterThan(0);
    filteredFiles.forEach(f => expect(f.score).toBeGreaterThan(0));
  });

  test('factExtractor.extract COMPONENT detects function components and renders edges', () => {
    facts = factExtractor.extract(filteredFiles, 'COMPONENT');
    const names = [...facts.allNames];

    expect(names).toContain('Header');
    expect(names).toContain('Footer');
    expect(names).toContain('UserList');
    expect(names).toContain('App');

    const rendersEdges = facts.highConfidenceEdges.filter(e => e.type === 'renders');
    expect(rendersEdges.some(e => e.from === 'App' && e.to === 'Header')).toBe(true);
    expect(rendersEdges.some(e => e.from === 'App' && e.to === 'UserList')).toBe(true);
    expect(rendersEdges.some(e => e.from === 'UserList' && e.to === 'Header')).toBe(true);
  });

  test('MermaidGenerator.generate COMPONENT starts with graph TD and has component nodes', () => {
    mermaidOutput = MermaidGenerator.generate(facts, 'COMPONENT');
    expect(mermaidOutput).toMatch(/^graph TD/);
    expect(mermaidOutput).toContain('App["App"]');
    expect(mermaidOutput).toContain('Header["Header"]');
    expect(mermaidOutput).toContain('UserList["UserList"]');
    expect(mermaidOutput).toContain('Footer["Footer"]');
  });

  test('MermaidGenerator.generate COMPONENT contains renders edges', () => {
    expect(mermaidOutput).toContain('App --> Header');
    expect(mermaidOutput).toContain('App --> UserList');
    expect(mermaidOutput).toContain('UserList --> Header');
  });
});

describe('Pipeline E2E — C4_CONTAINER with manifest dependencies', () => {
  let facts;
  let mermaidOutput;

  test('factExtractor.extract C4_CONTAINER with node+spring deps produces expected names', () => {
    const manifestDependencies = [{ type: 'node' }, { type: 'spring' }];
    facts = factExtractor.extract([], 'C4_CONTAINER', { manifestDependencies });
    const names = [...facts.allNames];

    expect(names).toContain('Web App');
    expect(names).toContain('Frontend');
    expect(names).toContain('Database');
    expect(names).toContain('API Server');
    expect(names).toContain('Backend');
  });

  test('factExtractor.extract C4_CONTAINER produces Frontend→API Server and API Server→Database edges', () => {
    const feToBe = facts.highConfidenceEdges.find(
      e => e.from === 'Frontend' && e.to === 'API Server' && e.type === 'calls'
    );
    expect(feToBe).toBeDefined();

    const beToDb = facts.highConfidenceEdges.find(
      e => e.from === 'API Server' && e.to === 'Database' && e.type === 'reads/writes'
    );
    expect(beToDb).toBeDefined();
  });

  test('MermaidGenerator.generate C4_CONTAINER outputs valid C4Container diagram', () => {
    mermaidOutput = MermaidGenerator.generate(facts, 'C4_CONTAINER');
    expect(mermaidOutput).toMatch(/^C4Container/);
    expect(mermaidOutput).toContain('Person(user,');
    expect(mermaidOutput).toContain('System_Boundary(app,');
    expect(mermaidOutput).toContain('Container(fe,');
    expect(mermaidOutput).toContain('Container(be,');
    expect(mermaidOutput).toContain('ContainerDb(db,');
    expect(mermaidOutput).toContain('Rel(fe, be, "calls")');
    expect(mermaidOutput).toContain('Rel(be, db, "reads/writes")');
  });
});

describe('Pipeline E2E — C4_CONTEXT with techStack and businessModel', () => {
  let facts;
  let mermaidOutput;

  test('factExtractor.extract C4_CONTEXT derives system name from techStack', () => {
    facts = factExtractor.extract([], 'C4_CONTEXT', {
      techStack: 'Spring app',
      businessModel: 'SaaS platform',
    });
    const names = [...facts.allNames];

    expect(names).toContain('User');
    expect(names).toContain('Spring');
    expect(names).toContain('Spring API');
  });

  test('factExtractor.extract C4_CONTEXT produces User→System edge', () => {
    const userEdge = facts.highConfidenceEdges.find(
      e => e.from === 'User' && e.type === 'uses'
    );
    expect(userEdge).toBeDefined();
    expect(userEdge.to).toBe('Spring');
  });

  test('MermaidGenerator.generate C4_CONTEXT outputs valid C4Context diagram', () => {
    mermaidOutput = MermaidGenerator.generate(facts, 'C4_CONTEXT');
    expect(mermaidOutput).toMatch(/^C4Context/);
    expect(mermaidOutput).toContain('Person(user,');
    expect(mermaidOutput).toContain('System(sys,');
    expect(mermaidOutput).toContain('Rel(user, sys,');
  });

  test('C4_CONTEXT falls back to System when techStack has no recognizable keyword', () => {
    const fallback = factExtractor.extract([], 'C4_CONTEXT', {
      techStack: 'random words',
      businessModel: 'B2B',
    });
    const names = [...fallback.allNames];
    expect(names).toContain('System');
    expect(names).toContain('System API');
  });
});

describe('Pipeline E2E — filesystem integration', () => {
  test('writes Spring Boot files to disk and reads them back through filter', () => {
    const writtenFiles = [];
    for (const file of springBootFiles) {
      const fullPath = path.join(tmpDir, file.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.content, 'utf8');
      writtenFiles.push({ path: file.path, content: fs.readFileSync(fullPath, 'utf8') });
    }

    const filtered = diagramService.filterHighSignalFiles(writtenFiles, 'CLASS');
    expect(filtered.length).toBeGreaterThan(0);
    filtered.forEach(f => expect(f.score).toBeGreaterThan(0));

    const facts = factExtractor.extract(filtered, 'CLASS');
    const names = [...facts.allNames];
    expect(names).toContain('User');
    expect(names).toContain('Post');
    expect(names).toContain('BaseEntity');

    const mermaid = MermaidGenerator.generate(facts, 'CLASS');
    expect(mermaid).toMatch(/^classDiagram/);
    expect(mermaid).toContain('class User {');
    expect(mermaid).toContain('class Post {');
  });

  test('writes React files to disk and reads them back through filter', () => {
    const writtenFiles = [];
    for (const file of reactFiles) {
      const fullPath = path.join(tmpDir, file.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.content, 'utf8');
      writtenFiles.push({ path: file.path, content: fs.readFileSync(fullPath, 'utf8') });
    }

    const filtered = diagramService.filterHighSignalFiles(writtenFiles, 'COMPONENT');
    expect(filtered.length).toBeGreaterThan(0);

    const facts = factExtractor.extract(filtered, 'COMPONENT');
    expect([...facts.allNames]).toContain('Header');
    expect([...facts.allNames]).toContain('App');

    const mermaid = MermaidGenerator.generate(facts, 'COMPONENT');
    expect(mermaid).toMatch(/^graph TD/);
    expect(mermaid).toContain('Header["Header"]');
  });
});
