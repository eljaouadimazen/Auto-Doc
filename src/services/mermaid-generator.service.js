class MermaidGenerator {
  generate(facts, diagramType) {
    switch (diagramType) {
      case 'CLASS':       return this._generateClass(facts);
      case 'COMPONENT':   return this._generateComponent(facts);
      case 'PIPELINE':    return this._generatePipeline(facts);
      case 'C4_CONTAINER': return this._generateC4Container(facts);
      case 'C4_CONTEXT':  return this._generateC4Context(facts);
      default:            return this._generateClass(facts);
    }
  }

  _sanitizeId(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '').replace(/^(\d)/, '_$1');
  }

  _safeName(name) {
    if (/^\w+$/.test(name) && !/^\d/.test(name)) return name;
    return `\`${name}\``;
  }

  _safeQuote(name) {
    return `"${name.replace(/"/g, '\\"')}"`;
  }

  _prioritizeNodes(facts, limit = 25) {
    const names = [...facts.allNames];
    if (names.length === 0) return [];
    const degree = {};
    const tiers = facts.stereotypeTiers || {};
    for (const name of names) degree[name] = 0;
    for (const edge of facts.highConfidenceEdges) {
      if (degree[edge.from] !== undefined) degree[edge.from]++;
      if (degree[edge.to] !== undefined) degree[edge.to]++;
    }
    return names.sort((a, b) => {
      const ta = tiers[a] || 5;
      const tb = tiers[b] || 5;
      if (ta !== tb) return ta - tb;
      return (degree[b] || 0) - (degree[a] || 0);
    }).slice(0, limit);
  }

  _topologicalSort(names, edges) {
    const inDegree = {};
    const adj = {};
    for (const name of names) {
      inDegree[name] = 0;
      adj[name] = new Set();
    }
    for (const e of edges) {
      if (adj[e.from] && inDegree[e.to] !== undefined && !adj[e.from].has(e.to)) {
        adj[e.from].add(e.to);
        inDegree[e.to]++;
      }
    }
    const queue = names.filter(n => inDegree[n] === 0);
    const sorted = [];
    while (queue.length) {
      const n = queue.shift();
      sorted.push(n);
      for (const neighbor of adj[n]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) queue.push(neighbor);
      }
    }
    for (const n of names) {
      if (!sorted.includes(n)) sorted.push(n);
    }
    // Dependencies (base classes) first — for readable declaration order
    return sorted.reverse();
  }

  _arrowForType(type) {
    switch (type) {
      case 'extends':     return '--|>';
      case 'implements':  return '..|>';
      default:            return '-->';
    }
  }

  _generateClass(facts) {
    const names = this._prioritizeNodes(facts);
    if (names.length === 0) {
      return 'classDiagram\n    class Unknown';
    }
    const nameSet = new Set(names);
    const allEdges = [...(facts.highConfidenceEdges || []), ...(facts.possibleEdges || [])];
    const seen = new Set();
    const edges = allEdges.filter(e => {
      if (!nameSet.has(e.from) || !nameSet.has(e.to)) return false;
      const key = e.from + '|' + e.to + '|' + e.type;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const sorted = this._topologicalSort(names, edges);
    const lines = ['classDiagram'];
    for (const name of sorted) {
      const safe = this._safeName(name);
      const classMembers = facts.members?.get(name);
      if (classMembers && classMembers.length > 0) {
        lines.push(`    class ${safe} {`);
        for (const field of classMembers.slice(0, 8)) {
          const safeType = field.type.replace(/</g, '[').replace(/>/g, ']');
          lines.push(`        +${safeType} ${field.name}`);
        }
        lines.push('    }');
      } else {
        lines.push(`    class ${safe}`);
      }
    }
    if (edges.length > 0) {
      lines.push('');
      for (const edge of edges) {
        lines.push(`    ${this._safeName(edge.from)} ${this._arrowForType(edge.type)} ${this._safeName(edge.to)}`);
      }
    }
    return lines.join('\n');
  }

  _generateComponent(facts) {
    const names = this._prioritizeNodes(facts, 20);
    if (names.length === 0) {
      return 'graph TD\n    Unknown["(no components detected)"]';
    }
    const nameSet = new Set(names);
    const edges = facts.highConfidenceEdges.filter(e => nameSet.has(e.from) && nameSet.has(e.to));
    const lines = ['graph TD'];
    for (const name of names) {
      lines.push(`    ${this._sanitizeId(name)}["${name.replace(/"/g, '\\"')}"]`);
    }
    if (edges.length > 0) {
      lines.push('');
      for (const edge of edges) {
        lines.push(`    ${this._sanitizeId(edge.from)} --> ${this._sanitizeId(edge.to)}`);
      }
    }
    return lines.join('\n');
  }

  _generatePipeline(facts) {
    const names = [...facts.allNames];
    if (names.length === 0) {
      return 'flowchart LR\n    Unknown["(no pipeline stages detected)"]';
    }
    const nameSet = new Set(names);
    const edges = facts.highConfidenceEdges.filter(e => nameSet.has(e.from) && nameSet.has(e.to));
    const lines = ['flowchart LR'];
    for (const name of names) {
      lines.push(`    ${this._sanitizeId(name)}["${name.replace(/"/g, '\\"')}"]`);
    }
    if (edges.length > 0) {
      lines.push('');
      for (const edge of edges) {
        lines.push(`    ${this._sanitizeId(edge.from)} --> ${this._sanitizeId(edge.to)}`);
      }
    }
    return lines.join('\n');
  }

  _generateC4Container(facts) {
    const names = [...facts.allNames];
    const lines = ['C4Container'];
    lines.push('');
    lines.push('    Person(user, "User", "End user of the system")');
    const hasFrontend = names.some(n => /web|frontend|app/i.test(n));
    const hasBackend = names.some(n => /api|server|backend|service/i.test(n));
    const hasDb = names.some(n => /database|db/i.test(n));
    if (hasFrontend || hasBackend) {
      lines.push('');
      lines.push('    System_Boundary(app, "Application") {');
      if (hasFrontend) {
        const feName = names.find(n => /web/i.test(n)) || 'Web App';
        lines.push(`        Container(fe, "${feName}", "Frontend", "User interface")`);
      }
      if (hasBackend) {
        const beName = names.find(n => /api|server/i.test(n)) || 'API Server';
        lines.push(`        Container(be, "${beName}", "Backend", "Business logic and API")`);
      }
      if (hasDb) {
        const dbName = names.find(n => /database/i.test(n)) || 'Database';
        lines.push(`        ContainerDb(db, "${dbName}", "Database", "Data persistence")`);
      }
      lines.push('    }');
    } else {
      for (const name of names) {
        const id = this._sanitizeId(name);
        if (/database|db/i.test(name)) {
          lines.push(`    ContainerDb(${id}, "${name}", "Database", "Data persistence")`);
        } else {
          lines.push(`    Container(${id}, "${name}", "Component", "")`);
        }
      }
    }
    lines.push('');
    const nameSet = new Set(names);
    const edges = facts.highConfidenceEdges.filter(e => nameSet.has(e.from) && nameSet.has(e.to));
    if (edges.length > 0) {
      for (const edge of edges) {
        const srcId = this._resolveC4Id(edge.from, hasFrontend, hasBackend);
        const tgtId = this._resolveC4Id(edge.to, hasFrontend, hasBackend);
        if (srcId && tgtId) {
          lines.push(`    Rel(${srcId}, ${tgtId}, "${edge.type}")`);
        }
      }
    }
    return lines.join('\n');
  }

  _resolveC4Id(name, hasFrontend, hasBackend) {
    if (/web|frontend|app/i.test(name) && hasFrontend) return 'fe';
    if (/api|server|backend|service/i.test(name) && hasBackend) return 'be';
    if (/database|db/i.test(name)) return 'db';
    const id = this._sanitizeId(name);
    return id || null;
  }

  _generateC4Context(facts) {
    const names = [...facts.allNames];
    const lines = ['C4Context'];
    lines.push('');
    lines.push('    Person(user, "User", "End user")');
    const sysCandidates = names.filter(n => !/user/i.test(n));
    if (sysCandidates.length > 0) {
      const sysName = sysCandidates.find(n => !/api/i.test(n)) || sysCandidates[0];
      const apiName = sysCandidates.find(n => /api/i.test(n));
      lines.push(`    System(sys, "${sysName}", "Software system")`);
      if (apiName) {
        lines.push(`    System_Ext(ext, "${apiName}", "External service")`);
      }
    } else {
      lines.push('    System(sys, "System", "Software system")');
    }
    lines.push('');
    const nameSet = new Set(names);
    const edges = facts.highConfidenceEdges.filter(e => nameSet.has(e.from) && nameSet.has(e.to));
    const hasUserSysEdge = edges.some(e =>
      (/user/i.test(e.from) || /user/i.test(e.to)) &&
      !/user/i.test(e.from) !== !/user/i.test(e.to)
    );
    if (!hasUserSysEdge) {
      lines.push('    Rel(user, sys, "Uses")');
    }
    for (const edge of edges) {
      const srcId = /user/i.test(edge.from) ? 'user' : 'sys';
      const tgtId = /user/i.test(edge.to) ? 'user' : 'sys';
      if (srcId !== tgtId) {
        lines.push(`    Rel(${srcId}, ${tgtId}, "${edge.type}")`);
      }
    }
    return lines.join('\n');
  }
}

module.exports = new MermaidGenerator();
