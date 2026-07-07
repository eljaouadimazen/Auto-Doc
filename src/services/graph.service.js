class GraphService {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
    this.communityMap = new Map();
    this.degrees = new Map();
  }

  loadGraph(graphData) {
    this.nodes.clear();
    this.edges = [];
    this.communityMap.clear();
    this.degrees.clear();

    const nodes = graphData.nodes || [];
    const edges = graphData.edges || graphData.links || [];

    if (!nodes.length) throw new Error('graph.json missing "nodes" array');
    if (!edges.length) throw new Error('graph.json missing "edges" or "links" array');

    this._detectLinkSchema(edges);

    for (const node of nodes) {
      const id = node.id !== undefined ? String(node.id) : node.name || node.key || '';
      if (!id) continue;
      const community = node.community !== undefined ? node.community : null;
      this.nodes.set(id, { ...node, id, community });
      if (community !== null) {
        if (!this.communityMap.has(community)) this.communityMap.set(community, []);
        this.communityMap.get(community).push(id);
      }
    }

    for (const edge of edges) {
      const source = this._normalizeNodeRef(edge, 'source');
      const target = this._normalizeNodeRef(edge, 'target');
      if (!source || !target) continue;
      const normalized = {
        source: String(source),
        target: String(target),
        type: edge.type || edge.relation || edge.label || 'connected_to',
        confidence: (edge.confidence || 'HIGH').toUpperCase(),
        weight: edge.weight !== undefined ? edge.weight : 1,
        metadata: edge.metadata || {},
      };
      this.edges.push(normalized);
      this.degrees.set(normalized.source, (this.degrees.get(normalized.source) || 0) + 1);
      this.degrees.set(normalized.target, (this.degrees.get(normalized.target) || 0) + 1);
    }
  }

  _detectLinkSchema(edges) {
    if (edges.length === 0) return;
    const sample = edges[0];
    if (sample.source !== undefined && sample.target !== undefined) {
      this._srcKey = 'source';
      this._tgtKey = 'target';
    } else if (sample.from !== undefined && sample.to !== undefined) {
      this._srcKey = 'from';
      this._tgtKey = 'to';
    } else if (sample.u !== undefined && sample.v !== undefined) {
      this._srcKey = 'u';
      this._tgtKey = 'v';
    } else {
      this._srcKey = 'source';
      this._tgtKey = 'target';
    }
  }

  _normalizeNodeRef(edge, role) {
    const key = role === 'source' ? this._srcKey : this._tgtKey;
    let ref = edge[key];
    if (ref === undefined || ref === null) return null;
    return String(ref);
  }

  getRelatedFiles(filePath, { filterAmbiguous = true, relationTypes = null } = {}) {
    const results = [];
    for (const edge of this.edges) {
      let relatedPath = null;
      let direction = null;
      if (edge.source === filePath) {
        relatedPath = edge.target;
        direction = 'outgoing';
      } else if (edge.target === filePath) {
        relatedPath = edge.source;
        direction = 'incoming';
      }
      if (!relatedPath) continue;
      if (filterAmbiguous && edge.confidence === 'AMBIGUOUS') continue;
      if (relationTypes && !relationTypes.includes(edge.type)) continue;
      results.push({
        path: relatedPath,
        relationType: edge.type,
        direction,
        confidence: edge.confidence,
        weight: edge.weight,
      });
    }
    return results;
  }

  getCommunity(filePath) {
    for (const [, members] of this.communityMap) {
      if (members.includes(filePath)) {
        return members.filter(m => m !== filePath);
      }
    }
    return [];
  }

  getGodNodes(topN = 5) {
    const sorted = [...this.degrees.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);
    return sorted.map(([path, degree]) => {
      const node = this.nodes.get(path) || {};
      const connections = this.edges
        .filter(e => e.source === path || e.target === path)
        .map(e => ({
          path: e.source === path ? e.target : e.source,
          relationType: e.type,
          direction: e.source === path ? 'outgoing' : 'incoming',
        }));
      return {
        path,
        degree,
        community: node.community,
        connections,
      };
    });
  }

  getCommunitySummary() {
    if (this.communityMap.size === 0) return null;
    const communities = [];
    for (const [communityId, members] of this.communityMap) {
      communities.push({
        communityId,
        fileCount: members.length,
        sampleFiles: members.slice(0, 5),
      });
    }
    communities.sort((a, b) => b.fileCount - a.fileCount);
    return {
      totalCommunities: communities.length,
      communities: communities.slice(0, 10),
    };
  }
}

module.exports = GraphService;
