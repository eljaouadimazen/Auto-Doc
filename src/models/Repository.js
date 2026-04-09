const githubService = require('../services/github.service');
const ProjectFile = require('./ProjectFile');

class Repository {
    constructor(url) {
        const repoInfo = githubService.parseGitHubUrl(url);
        if (!repoInfo) throw new Error('Invalid GitHub repository URL');
        this.url = url;
        this.owner = repoInfo.owner;
        this.name = repoInfo.repo;
        this.files = [];
    }

    _parseMarkdownToFiles(markdown) {
        const fileRegex = /## File: (.+?)\n```(?:\\w+)?\n?([\\s\\S]*?)```/g;
        const files = [];
        let match;
        while ((match = fileRegex.exec(markdown)) !== null) {
            files.push(new ProjectFile(match[1].trim(), match[2]));
        }
        return files;
    }

    async fetchFiles() {
        const rawMarkdown = await githubService.generateFromUrl(this.url);
        this.files = this._parseMarkdownToFiles(rawMarkdown);
        return this.files;
    }
}

module.exports = Repository;
