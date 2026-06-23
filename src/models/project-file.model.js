const astParser = require('../services/ast-parser.service');

class ProjectFile {
  #path;
  #rawContent;
  #astTree;
  #extension;
  #size;

  constructor(path, content, extension, size) {
    this.#path = path;
    this.#rawContent = content;
    this.#extension = extension;
    this.#size = size;
    this.#astTree = null;
  }

  get path() { return this.#path; }
  get content() { return this.#rawContent; }
  get extension() { return this.#extension; }
  get size() { return this.#size; }
  get astTree() { return this.#astTree; }

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
      astTree: this.#astTree
    };
  }
}
module.exports = ProjectFile;
