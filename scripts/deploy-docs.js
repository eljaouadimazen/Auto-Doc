#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'devops', '.env') });

const Repository = require('../src/models/repository.model');
const ViewerGeneratorService = require('../src/services/viewer-generator.service');
const PublisherService = require('../src/services/publisher.service');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--repo': case '-u':
        opts.repo = args[++i];
        break;
      case '--token': case '-t':
        opts.token = args[++i];
        break;
      case '--api-key': case '-k':
        opts.apiKey = args[++i];
        break;
      case '--provider': case '-p':
        opts.provider = args[++i];
        break;
      case '--mode': case '-m':
        opts.mode = args[++i];
        break;
      case '--help': case '-h':
        console.log(`
Usage: node scripts/deploy-docs.js --repo <url> --token <github_token>

Options:
  --repo, -u         GitHub repository URL (required)
  --token, -t        GitHub PAT with repo scope (required)
  --api-key, -k      LLM API key (falls back to GROQ_API_KEY env)
  --provider, -p     LLM provider: groq (default), gemini, openrouter, ollama
  --mode, -m         Pipeline mode: agentic (default), classic
  --help, -h         Show this help

Example:
  node scripts/deploy-docs.js --repo https://github.com/expressjs/express --token ghp_xxx
`);
        process.exit(0);
    }
  }

  if (!opts.repo) {
    console.error('Error: --repo is required');
    process.exit(1);
  }
  if (!opts.token && !process.env.GITHUB_TOKEN) {
    console.error('Error: --token is required (or set GITHUB_TOKEN in devops/.env)');
    process.exit(1);
  }

  opts.token = opts.token || process.env.GITHUB_TOKEN;
  opts.provider = opts.provider || 'groq';
  opts.mode = opts.mode || 'agentic';

  return opts;
}

async function main() {
  const opts = parseArgs();

  console.log(`\n📦 Auto-Doc Deploy Pipeline`);
  console.log(`   Repo:     ${opts.repo}`);
  console.log(`   Provider: ${opts.provider}`);
  console.log(`   Mode:     ${opts.mode}\n`);

  const repoUrl = opts.repo.replace(/\.git$/, '');
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!match) {
    console.error('Error: Invalid GitHub URL');
    process.exit(1);
  }
  const targetRepo = `${match[1]}/${match[2]}`;

  process.stdout.write('⏳ Fetching repository... ');
  const repository = new Repository(repoUrl);
  await repository.FetchFiles();
  console.log(`✓ (${repository.files.length} files)`);

  process.stdout.write('⏳ Generating documentation... ');
  const docs = await repository.GenerateDocumentation(opts.mode, opts.provider, opts.apiKey);
  const preview = docs.content.slice(0, 200).replace(/\n/g, ' ').trim();
  console.log(`✓`);
  console.log(`   Preview: ${preview}...`);

  process.stdout.write('⏳ Generating interactive viewer... ');
  const html = ViewerGeneratorService.generateViewerHtml(
    docs.content,
    targetRepo,
    { ...docs.stats, mode: opts.mode, generatedAt: new Date().toISOString() }
  );
  console.log('✓');

  process.stdout.write('⏳ Publishing to GitHub Pages... ');
  try {
    const result = await PublisherService.publishToGitHubPages(
      { content: docs.content, stats: { mode: opts.mode, generatedAt: new Date().toISOString() } },
      targetRepo,
      opts.token,
      targetRepo
    );
    console.log('✓');
    console.log(`\n✅ Published successfully!`);
    console.log(`   Live at: ${result.url}`);
    console.log(`   (may take 1-2 minutes to appear)\n`);
  } catch (err) {
    console.log('✗');
    console.error(`\n❌ Publish failed: ${err.message}\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n❌ Error: ${err.message}\n`);
  process.exit(1);
});
