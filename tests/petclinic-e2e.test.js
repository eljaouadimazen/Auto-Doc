const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const diagramService = require('../src/services/diagram.service');
const factExtractor = require('../src/services/fact-extractor.service');
const MermaidGenerator = require('../src/services/mermaid-generator.service');

const PETCLINIC_REPO = 'https://github.com/spring-projects/spring-petclinic.git';
const PETCLINIC_BASE = '/tmp/spring-petclinic';
const PETCLINIC_DIR = PETCLINIC_BASE + '/src/main/java/org/springframework/samples/petclinic';

function ensurePetclinicData() {
  if (fs.existsSync(PETCLINIC_BASE)) return;
  console.log('Cloning Spring Petclinic test data...');
  execSync('git clone --depth 1 ' + PETCLINIC_REPO + ' ' + PETCLINIC_BASE, { stdio: 'inherit' });
}

function readPetclinicFiles() {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.endsWith('.java')) {
        files.push({
          path: fullPath.replace('/tmp/spring-petclinic/', ''),
          content: fs.readFileSync(fullPath, 'utf-8'),
        });
      }
    }
  }
  walk(PETCLINIC_DIR);
  return files;
}

describe('Spring Petclinic End-to-End', () => {
  let allFiles;

  beforeAll(() => {
    ensurePetclinicData();
    allFiles = readPetclinicFiles();
    expect(allFiles.length).toBeGreaterThan(20);
  });

  describe('filterHighSignalFiles', () => {
    test('selects entity/model files for CLASS diagram type', () => {
      const selected = diagramService.filterHighSignalFiles(allFiles, 'CLASS');
      expect(selected.length).toBeGreaterThan(0);
      expect(selected.length).toBeLessThanOrEqual(12);

      const paths = selected.map(f => f.path);
      expect(paths.some(p => p.includes('BaseEntity'))).toBe(true);
      expect(paths.some(p => p.includes('NamedEntity'))).toBe(true);
      expect(paths.some(p => p.includes('Person'))).toBe(true);
      expect(paths.some(p => p.includes('Owner'))).toBe(true);
      expect(paths.some(p => p.includes('Pet'))).toBe(true);
      expect(paths.some(p => p.includes('Visit'))).toBe(true);
    });
  });

  describe('factExtractor', () => {
    test('extracts real entity class names, filters architecture classes', () => {
      const diagramFiles = diagramService.filterHighSignalFiles(allFiles, 'CLASS');
      const facts = factExtractor.extract(diagramFiles, 'CLASS');

      expect(facts.allNames.size).toBeGreaterThan(0);

      const names = [...facts.allNames];
      expect(names).toContain('BaseEntity');
      expect(names).toContain('NamedEntity');
      expect(names).toContain('Person');
      expect(names).toContain('Owner');
      expect(names).toContain('Pet');
      expect(names).toContain('Visit');

      expect(names).not.toContain('OwnerController');
      expect(names).not.toContain('OwnerRepository');
      expect(names).not.toContain('PetController');
      expect(names).not.toContain('VisitController');
      expect(names).not.toContain('VetController');
      expect(names).not.toContain('PetTypeFormatter');
      expect(names).not.toContain('PetValidator');
    });

    test('populates members map with entity fields', () => {
      const diagramFiles = diagramService.filterHighSignalFiles(allFiles, 'CLASS');
      const facts = factExtractor.extract(diagramFiles, 'CLASS');

      expect(facts.members.size).toBeGreaterThan(0);

      const baseFields = facts.members.get('BaseEntity') || [];
      expect(baseFields.some(f => f.name === 'id')).toBe(true);

      const personFields = facts.members.get('Person') || [];
      expect(personFields.some(f => f.name === 'firstName')).toBe(true);
      expect(personFields.some(f => f.name === 'lastName')).toBe(true);
    });

    test('extracts inheritance and ORM relationship edges', () => {
      const diagramFiles = diagramService.filterHighSignalFiles(allFiles, 'CLASS');
      const facts = factExtractor.extract(diagramFiles, 'CLASS');
      expect(facts.highConfidenceEdges.length).toBeGreaterThan(0);

      const extendsEdges = facts.highConfidenceEdges.filter(e => e.type === 'extends');
      expect(extendsEdges.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('MermaidGenerator', () => {
    test('generates valid CLASS diagram with fields, no architecture classes', () => {
      const diagramFiles = diagramService.filterHighSignalFiles(allFiles, 'CLASS');
      const facts = factExtractor.extract(diagramFiles, 'CLASS');
      const mermaid = MermaidGenerator.generate(facts, 'CLASS');

      expect(mermaid.startsWith('classDiagram')).toBe(true);
      expect(mermaid).toContain('class BaseEntity');
      expect(mermaid).toContain('class Person');
      expect(mermaid).toContain('class Owner');

      expect(mermaid).not.toContain('OwnerController');
      expect(mermaid).not.toContain('OwnerRepository');

      const classBodyMatch = mermaid.match(/class \w+ \{[\s\S]*?\}/g);
      const classesWithBodies = classBodyMatch ? classBodyMatch.length : 0;
      expect(classesWithBodies).toBeGreaterThanOrEqual(1);

      const hasInheritance = /--\|>/.test(mermaid) || /\.\.\|>/.test(mermaid);
      expect(hasInheritance).toBe(true);
    });
  });
});
