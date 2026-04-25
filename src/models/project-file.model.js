const astParser = require('../services/ast-parser.service');

class ProjectFile {
  #path;
  #rawContent;
  #isSanitized;
  #astTree;
  #extension;
  #size;

  constructor(path, content, extension, size) {
    this.#path = path;
    this.#rawContent = content;
    this.#extension = extension;
    this.#size = size;
    this.#isSanitized = false;
    this.#astTree = null;
  }

  get path() { return this.#path; }
  get content() { return this.#rawContent; }
  get extension() { return this.#extension; }
  get size() { return this.#size; }
  get isSanitized() { return this.#isSanitized; }
  get astTree() { return this.#astTree; }

  Sanitize(rules) {
    let content = this.#rawContent;
    let findings = [];
    
    for (const rule of rules) {
      if (rule.TestMatch(content)) {
        findings.push(rule.name);
        content = rule.Apply(content);
      }
    }
    
    this.#rawContent = content;
    this.#isSanitized = true;
    return findings; // Return matches for AuditLog
  }

  ExtractAST() {
    const ext = this.#extension || this.#path.substring(this.#path.lastIndexOf('.')).toLowerCase();
    const parsed = astParser.parseFiles([{ 
      path: this.#path, 
      content: this.#rawContent, 
      extension: ext 
    }]);
    
    if (parsed && parsed.length > 0) {
      this.#astTree = parsed[0]?.ast || null;
    }
  }

  toJSON() {
    return {
      path: this.#path,
      content: this.#rawContent,
      extension: this.#extension,
      size: this.#size,
      isSanitized: this.#isSanitized,
      astTree: this.#astTree
    };
  }
}
module.exports = ProjectFile;
