const githubService = require('../services/github.service');
const llmInputBuilder = require('../services/llm-input-builder.service');
const llmService = require('../services/llm.service');
const sanitizerService = require('../services/sanitizer.service');
class GeneratorController {

    // STEP 1 — fetch repo
    async fetchRepo(req, res) {
    const { githubUrl } = req.body;

    const rawMarkdown =
        await githubService.generateFromUrl(githubUrl);

    // ADD SANITIZATION HERE
    const safeMarkdown =
        await sanitizerService.clean(rawMarkdown);

    res.json({
        step: 'fetch',
        rawMarkdown: safeMarkdown,   // ← pipeline data
        size: rawMarkdown.length,
        preview: safeMarkdown.substring(0, 1000)
    });
}

    // STEP 2 — build safe input
    async buildInput(req, res) {
        const { rawMarkdown } = req.body;

        const llmInput =
            await llmInputBuilder.build(rawMarkdown);

        res.json({
            step: 'build',
            messages: llmInput.messages
        });
    }

    // STEP 3 — call LLM
    async generateDocs(req, res) {
        const { messages } = req.body;

        const documentation =
            await llmService.generate(messages);

        res.json({
            step: 'generate',
            documentation
        });
    }

    // OPTIONAL — full pipeline
    async generate(req, res) {
        // ton ancien code ici
    }
}

module.exports = new GeneratorController();