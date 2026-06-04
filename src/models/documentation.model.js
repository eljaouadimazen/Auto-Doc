const fs = require('fs');
const path = require('path');
const ViewerGeneratorService = require('../services/viewer-generator.service');
const PublisherService = require('../services/publisher.service');

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
    const fileName = `${repoName}_docs_${this.#generatedAt.getTime()}.html`;
    const fullPath = path.join(pubDir, fileName);
    const html = ViewerGeneratorService.generateViewerHtml(
      this.#content,
      repoName,
      { ...this.#stats, generatedAt: this.#generatedAt.toISOString() }
    );
    fs.writeFileSync(fullPath, html, 'utf8');
    return `/docs/${fileName}`;
  }

  async PublishToPages(targetRepo, githubToken, repoName) {
    return await PublisherService.publishToGitHubPages(
      { content: this.#content, stats: { ...this.#stats, generatedAt: this.#generatedAt.toISOString() } },
      targetRepo,
      githubToken,
      repoName
    );
  }
}
module.exports = Documentation;
