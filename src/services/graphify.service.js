const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const { randomUUID } = require('crypto');

const execAsync = util.promisify(exec);

const NON_CODE_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.odt', '.odp', '.ods',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff',
  '.mp4', '.mov', '.avi', '.mp3', '.wav',
]);

class GraphifyService {
  constructor() {
    this._bin = this._resolveBin();
  }

  _resolveBin() {
    const envBin = process.env.GRAPHFIY_BIN;
    if (envBin) return envBin;
    const candidates = [
      'graphify',
      path.join(os.homedir(), '.local', 'bin', 'graphify'),
      '/usr/local/bin/graphify',
    ];
    for (const c of candidates) {
      try { fs.accessSync(c, fs.constants.X_OK); return c; } catch {}
    }
    return 'graphify';
  }

  async extract(githubUrl, { onProgress } = {}) {
    const repoDir = path.join(os.tmpdir(), `graphify-${randomUUID()}`);
    const repoPath = path.join(repoDir, 'repo');
    const outPath = path.join(repoPath, 'graphify-out', 'graph.json');

    try {
      const progress = onProgress || (() => {});

      progress({ stage: 'graphify', message: 'Cloning repository for graph analysis...' });
      await execAsync(`git clone --depth 1 ${githubUrl} ${repoPath}`, { timeout: 120000 });

      this._pruneNonCodeFiles(repoPath);

      progress({ stage: 'graphify', message: 'Running graphify to build knowledge graph...' });
      const graphifyTimeout = parseInt(process.env.GRAPHFIY_TIMEOUT, 10) || 300000;
      await execAsync(`${this._bin} .`, { cwd: repoPath, timeout: graphifyTimeout });

      if (!fs.existsSync(outPath)) {
        console.warn(`[GraphifyService] graph.json not found — continuing without graph`);
        return { graphService: null, stats: { nodes: 0, edges: 0, communities: 0 } };
      }

      const raw = fs.readFileSync(outPath, 'utf-8');
      const graphData = JSON.parse(raw);
      const GraphService = require('./graph.service');
      const gs = new GraphService();
      gs.loadGraph(graphData);

      const stats = {
        nodes: gs.nodes.size,
        edges: gs.edges.length,
        communities: gs.communityMap.size,
      };
      progress({ stage: 'graphify', message: `Graph loaded: ${stats.nodes} nodes, ${stats.edges} edges, ${stats.communities} communities` });

      return { graphService: gs, repoDir, stats };
    } catch (e) {
      console.warn(`[GraphifyService] Failed (pipeline continues without graph): ${e.message}`);
      return { graphService: null, repoDir, stats: { nodes: 0, edges: 0, communities: 0, error: e.message } };
    } finally {
      try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch {}
    }
  }

  _pruneNonCodeFiles(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this._pruneNonCodeFiles(fullPath);
      } else if (NON_CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        try { fs.unlinkSync(fullPath); } catch {}
      }
    }
  }
}

module.exports = GraphifyService;
