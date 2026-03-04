const crypto = require('crypto');

class LLMInputBuilder {
    constructor() {
        this.MAX_FILE_CHARS = 12000;     // hard guard per file
        this.MAX_TOTAL_CHARS = 120000;   // global guard
        this.IGNORED_EXT = [
            '.png','.jpg','.jpeg','.gif','.svg','.ico',
            '.lock','.map','.min.js','.min.css',
            '.pdf','.zip','.tar','.gz'
        ];
    }

    async build(markdownContent, options = {}) {
        const parsed = this.parseMarkdown(markdownContent);
        const filtered = this.filterFiles(parsed);
        const budgeted = this.applyTokenBudget(filtered);
        const enhanced = this.addMetadata(budgeted, options);
        return this.formatForLLM(enhanced);
    }

    /**
     * CRITICAL: reconstruct file structure from your markdown format
     */
    parseMarkdown(content) {
        const fileRegex = /## File: (.+?)\n```([\s\S]*?)```/g;

        const files = [];
        let match;



        while ((match = fileRegex.exec(content)) !== null) {
            const filePath = match[1].trim();
            const code = match[2];

            files.push({
                path: filePath,
                extension: this.getExtension(filePath),
                size: code.length,
                hash: crypto.createHash('sha1').update(code).digest('hex'),
                content: code
            });
        }

        return {
            repository: this.extractRepoName(content),
            files
        };
    }

    extractRepoName(content) {
        const match = content.match(/^# (.+)$/m);
        return match ? match[1].trim() : 'unknown-repo';
    }

    getExtension(path) {
        const idx = path.lastIndexOf('.');
        return idx === -1 ? '' : path.slice(idx).toLowerCase();
    }

    /**
     * Remove useless or dangerous files
     */
    filterFiles(parsed) {
        const filtered = parsed.files.filter(f => {
            if (!f.content) return false;
            if (this.IGNORED_EXT.includes(f.extension)) return false;
            if (f.size === 0) return false;
            return true;
        });

        return {
            ...parsed,
            files: filtered
        };
    }

    /**
     * Prevent LLM context overflow
     */
    applyTokenBudget(parsed) {
        let total = 0;
        const kept = [];

        for (const file of parsed.files) {
            let content = file.content;

            // per-file truncation
            if (content.length > this.MAX_FILE_CHARS) {
                content =
                    content.slice(0, this.MAX_FILE_CHARS) +
                    '\n/* FILE TRUNCATED */';
            }

            if (total + content.length > this.MAX_TOTAL_CHARS) break;

            total += content.length;

            kept.push({
                ...file,
                content
            });
        }

        return {
            ...parsed,
            files: kept,
            stats: {
                fileCount: kept.length,
                totalChars: total
            }
        };
    }

    addMetadata(parsedContent, options) {
        return {
            ...parsedContent,
            metadata: {
                timestamp: new Date().toISOString(),
                source: 'github',
                schemaVersion: '1.0',
                ...options.metadata
            }
        };
    }

    /**
     * High-quality prompt shaping
     */
    formatForLLM(content) {
    const prompt = `
SYSTEM INSTRUCTION:
You are a senior software architect and technical writer.
Your task:
- Analyze the repository structure
- Infer architecture and technologies
- Produce professional documentation
- Be precise and avoid speculation
- Highlight uncertainties explicitly

REPOSITORY DATA:
${JSON.stringify(content, null, 2)}
`;
    return {
        messages: [
            {
                role: "user",
                content: prompt
            }
        ],
};

    };

}

module.exports = new LLMInputBuilder();
