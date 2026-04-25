const fs = require('fs');
const path = require('path');

class Documentation {
  #content;
  #generatedAt;
  #stats;

  constructor(content, stats) {
    this.#content = content;
    this.#generatedAt = new Date();
    this.#stats = stats;
  }

  get content() { return this.#content; }
  get generatedAt() { return this.#generatedAt; }
  get stats() { return this.#stats; }

  SaveToDisk(repoName) {
    const pubDir = path.join(__dirname, '../../public/docs');
    if (!fs.existsSync(pubDir)) {
      fs.mkdirSync(pubDir, { recursive: true });
    }
    const fileName = `${repoName}_docs_${this.#generatedAt.getTime()}.md`;
    const fullPath = path.join(pubDir, fileName);
    fs.writeFileSync(fullPath, this.#content, 'utf8');
    return `/docs/${fileName}`;
  }

  PublishToPages() {
    // Placeholder logic for deploying documentation directly to GitHub Pages
    console.info('[Documentation] Publishing to GitHub Pages...');
    return true;
  }
}
module.exports = Documentation;
