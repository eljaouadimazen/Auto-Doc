const { Octokit } = require('@octokit/rest');

class GitHubService {
    constructor() {
        this.octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN || ''
        });
    }

    /**
     * Extracts owner and repo from GitHub URL
     * @param {string} url - GitHub repository URL
     * @returns {Object} {owner, repo} or null if invalid URL
     */
    parseGitHubUrl(url) {
        try {
            const match = url.match(/github\.com\/([^/]+)\/([^/]+)/i);
            if (!match) return null;
            return {
                owner: match[1],
                repo: match[2].replace(/\.git$/, '')
            };
        } catch (error) {
            console.error('Error parsing GitHub URL:', error);
            return null;
        }
    }

    /**
     * Fetches repository content recursively
     */
    async getRepoContent(owner, repo, path = '') {
        try {
            const { data } = await this.octokit.repos.getContent({
                owner,
                repo,
                path,
                headers: {
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            let content = '';
            
            // If it's a file
            if (data.type === 'file') {
                const fileContent = Buffer.from(data.content, 'base64').toString('utf-8');
                return `\n## File: ${data.path}\n\`\`\`\n${fileContent}\n\`\`\`\n`;
            }
            
            // If it's a directory, process each item
            if (Array.isArray(data)) {
                for (const item of data) {
                    if (item.type === 'dir') {
                        content += await this.getRepoContent(owner, repo, item.path);
                    } else if (item.type === 'file') {
                        content += await this.getRepoContent(owner, repo, item.path);
                    }
                }
            }
            
            return content;
        } catch (error) {
            console.error(`Error fetching content for ${owner}/${repo}/${path}:`, error.message);
            return '';
        }
    }

    /**
     * Generates content from a GitHub repository
     * @param {string} url - GitHub repository URL
     * @returns {Promise<string>} Generated content
     */
    async generateFromUrl(url) {
        const repoInfo = this.parseGitHubUrl(url);
        if (!repoInfo) {
            throw new Error('Invalid GitHub repository URL');
        }

        const { owner, repo } = repoInfo;
        
        try {
            // Get repository details
            const { data: repoData } = await this.octokit.repos.get({
                owner,
                repo
            });

            // Generate markdown content
            let content = `# ${repoData.full_name}\n\n`;
            content += `${repoData.description ? `${repoData.description}\n\n` : ''}`;
            
            // Add repository content
            const repoContent = await this.getRepoContent(owner, repo);
            content += repoContent;
            
            return content;
        } catch (error) {
            console.error('Error generating content from GitHub:', error);
            throw new Error(`Failed to generate content: ${error.message}`);
        }


    }
}

module.exports = new GitHubService();
