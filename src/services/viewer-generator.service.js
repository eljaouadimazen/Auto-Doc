class ViewerGeneratorService {
  static generateViewerHtml(markdown, repoName, stats = {}) {
    const escaped = this._escapeForJs(markdown);
    const timestamp = stats.generatedAt || new Date().toISOString();

    return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${this._escapeHtml(repoName)} — Documentation</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.min.js"></script>
<script>mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });</script>
<style>
  :root {
    --bg-page: #ffffff;
    --bg-sidebar: #f8fafc;
    --bg-content: #ffffff;
    --bg-code: #f1f5f9;
    --bg-hover: #f1f5f9;
    --bg-search: #f1f5f9;
    --bg-mark: #fef3c7;
    --text-primary: #1e293b;
    --text-secondary: #64748b;
    --text-tertiary: #94a3b8;
    --text-inverse: #ffffff;
    --border: #e2e8f0;
    --border-light: #f1f5f9;
    --accent: #ff4f00;
    --accent-hover: #e64500;
    --accent-light: #fff3ed;
    --shadow: 0 1px 3px rgba(0,0,0,0.08);
    --sidebar-width: 280px;
    --topbar-height: 56px;
    --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    --font-mono: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;
  }
  [data-theme="dark"] {
    --bg-page: #0f172a;
    --bg-sidebar: #1e293b;
    --bg-content: #0f172a;
    --bg-code: #1e293b;
    --bg-hover: #334155;
    --bg-search: #1e293b;
    --bg-mark: #854d0e;
    --text-primary: #e2e8f0;
    --text-secondary: #94a3b8;
    --text-tertiary: #64748b;
    --text-inverse: #0f172a;
    --border: #334155;
    --border-light: #1e293b;
    --accent: #ff4f00;
    --accent-hover: #ff6b2a;
    --accent-light: #1c1917;
    --shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: var(--font-body);
    font-size: 16px;
    line-height: 1.7;
    color: var(--text-primary);
    background: var(--bg-page);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { color: var(--accent-hover); text-decoration: underline; }

  /* Top Bar */
  .topbar {
    position: fixed; top: 0; left: 0; right: 0;
    height: var(--topbar-height);
    background: var(--bg-content);
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center;
    padding: 0 20px; z-index: 100;
    gap: 12px;
  }
  .topbar-logo {
    font-weight: 700; font-size: 15px;
    color: var(--text-primary);
    white-space: nowrap;
  }
  .topbar-divider {
    width: 1px; height: 20px;
    background: var(--border);
  }
  .topbar-repo {
    font-size: 14px; color: var(--text-secondary);
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .topbar-actions { display: flex; align-items: center; gap: 8px; }
  .theme-toggle {
    background: none; border: 1px solid var(--border);
    border-radius: 6px; padding: 6px 10px; cursor: pointer;
    font-size: 14px; color: var(--text-secondary);
    transition: all 0.15s;
  }
  .theme-toggle:hover {
    background: var(--bg-hover); color: var(--text-primary);
  }

  /* Layout */
  .layout { display: flex; padding-top: var(--topbar-height); min-height: 100vh; }

  /* Sidebar */
  .sidebar {
    position: fixed; top: var(--topbar-height); left: 0;
    width: var(--sidebar-width); height: calc(100vh - var(--topbar-height));
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    overflow-y: auto; z-index: 50;
    display: flex; flex-direction: column;
  }
  .sidebar-search {
    padding: 12px; border-bottom: 1px solid var(--border);
  }
  .sidebar-search input {
    width: 100%; padding: 8px 12px;
    border: 1px solid var(--border); border-radius: 6px;
    font-size: 13px; font-family: var(--font-body);
    background: var(--bg-search);
    color: var(--text-primary);
    outline: none; transition: border-color 0.15s;
  }
  .sidebar-search input:focus {
    border-color: var(--accent);
  }
  .sidebar-search input::placeholder { color: var(--text-tertiary); }
  .search-count {
    font-size: 11px; color: var(--text-tertiary);
    margin-top: 4px; padding-left: 4px;
  }

  .sidebar-toc { flex: 1; overflow-y: auto; padding: 8px 0; }
  .toc-list { list-style: none; padding: 0; margin: 0; }
  .toc-item { margin: 0; }
  .toc-link {
    display: block; padding: 6px 16px;
    font-size: 13px; color: var(--text-secondary);
    text-decoration: none; transition: all 0.1s;
    border-left: 2px solid transparent;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .toc-link:hover {
    color: var(--text-primary); background: var(--bg-hover);
    text-decoration: none;
  }
  .toc-link.active {
    color: var(--accent); border-left-color: var(--accent);
    background: var(--accent-light); font-weight: 600;
  }
  .toc-level-2 { padding-left: 28px; font-size: 12.5px; }
  .toc-level-3 { padding-left: 40px; font-size: 12px; }

  /* Main Content */
  .main {
    margin-left: var(--sidebar-width);
    flex: 1; padding: 40px 48px;
    max-width: 960px;
    background: var(--bg-content);
  }
  .doc-section {
    margin-bottom: 32px;
    scroll-margin-top: calc(var(--topbar-height) + 16px);
  }
  .doc-section.hidden { display: none; }
  .doc-section.dimmed { opacity: 0.3; }
  .doc-section.highlighted { opacity: 1; }
  .doc-section mark {
    background: var(--bg-mark);
    color: inherit; padding: 1px 2px; border-radius: 2px;
  }

  /* Content Typography */
  .main h1 {
    font-size: 2rem; font-weight: 700;
    margin: 0 0 8px; padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
  }
  .main h2 {
    font-size: 1.5rem; font-weight: 600;
    margin: 32px 0 12px;
    color: var(--text-primary);
  }
  .main h3 {
    font-size: 1.2rem; font-weight: 600;
    margin: 24px 0 8px;
    color: var(--text-primary);
  }
  .main p { margin: 0 0 16px; color: var(--text-primary); }
  .main ul, .main ol { margin: 0 0 16px; padding-left: 24px; }
  .main li { margin-bottom: 4px; }
  .main blockquote {
    margin: 0 0 16px; padding: 12px 16px;
    border-left: 3px solid var(--accent);
    background: var(--accent-light);
    border-radius: 0 6px 6px 0;
    color: var(--text-secondary);
  }
  .main blockquote p:last-child { margin-bottom: 0; }
  .main code {
    font-family: var(--font-mono);
    font-size: 14px;
    background: var(--bg-code);
    padding: 2px 6px;
    border-radius: 4px;
    color: var(--text-primary);
  }
  .main pre {
    margin: 0 0 16px;
    background: var(--bg-code);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow-x: auto;
  }
  .main pre code {
    display: block; padding: 16px;
    background: none; border: none;
    font-size: 13px; line-height: 1.6;
  }
  .main table {
    width: 100%; border-collapse: collapse;
    margin: 0 0 16px; font-size: 14px;
  }
  .main th, .main td {
    padding: 8px 12px; border: 1px solid var(--border);
    text-align: left;
  }
  .main th {
    background: var(--bg-sidebar);
    font-weight: 600;
  }
  .main td { color: var(--text-primary); }
  .main img { max-width: 100%; border-radius: 8px; margin: 16px 0; }
  .main hr {
    margin: 32px 0; border: none;
    border-top: 1px solid var(--border);
  }

  /* Mermaid */
  .mermaid-container {
    background: #1e293b;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px; margin: 16px 0;
    text-align: center; overflow-x: auto;
  }
  [data-theme="dark"] .mermaid-container {
    background: #1e293b;
  }
  .mermaid-container svg { max-width: 100%; height: auto; }
  .mermaid-error { padding: 16px; color: #ef4444; font-size: 13px; font-family: var(--font-mono); text-align: center; }

  /* Footer */
  .doc-footer {
    margin-top: 48px; padding-top: 16px;
    border-top: 1px solid var(--border);
    font-size: 12px; color: var(--text-tertiary);
  }
  .doc-footer p { margin: 2px 0; color: var(--text-tertiary); }

  /* Mobile sidebar toggle */
  .sidebar-toggle {
    display: none; background: none; border: 1px solid var(--border);
    border-radius: 6px; padding: 6px 10px; cursor: pointer;
    font-size: 16px; color: var(--text-secondary);
  }
  .sidebar-overlay { display: none; }

  @media (max-width: 768px) {
    .sidebar-toggle { display: block; }
    .sidebar {
      transform: translateX(-100%);
      transition: transform 0.2s ease;
    }
    .sidebar.open {
      transform: translateX(0);
    }
    .sidebar-overlay {
      display: none; position: fixed;
      inset: 0; background: rgba(0,0,0,0.4);
      z-index: 45;
    }
    .sidebar-overlay.open { display: block; }
    .main {
      margin-left: 0; padding: 24px 20px;
    }
    .main h1 { font-size: 1.6rem; }
    .main h2 { font-size: 1.3rem; }
  }
  @media (max-width: 480px) {
    .main { padding: 16px; }
    .topbar-repo { display: none; }
  }
  @media print {
    .sidebar, .topbar, .sidebar-toggle, .sidebar-overlay { display: none !important; }
    .main { margin-left: 0; padding: 0; }
    pre { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="topbar">
  <button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar">☰</button>
  <span class="topbar-logo">📄 Docs</span>
  <span class="topbar-divider"></span>
  <span class="topbar-repo" title="${this._escapeHtml(repoName)}">${this._escapeHtml(repoName)}</span>
  <div class="topbar-actions">
    <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">🌙 Dark</button>
  </div>
</div>

<div class="sidebar-overlay" id="sidebarOverlay"></div>

<div class="layout">
  <nav class="sidebar" id="sidebar">
    <div class="sidebar-search">
      <input type="text" id="searchInput" placeholder="Search documentation..." autocomplete="off">
      <div class="search-count" id="searchCount"></div>
    </div>
    <div class="sidebar-toc">
      <ul class="toc-list" id="tocList"></ul>
    </div>
  </nav>

  <main class="main" id="mainContent"></main>
</div>

<script>
  const DOCS_CONTENT = ${escaped};
  const REPO_NAME = ${JSON.stringify(repoName)};
  const GENERATED_AT = ${JSON.stringify(timestamp)};

  let sectionsData = [];

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function slugify(text) {
    return text.toLowerCase()
      .replace(/[^\\w\\s-]/g, '')
      .replace(/\\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function renderDocs() {
    if (typeof marked === 'undefined') {
      document.getElementById('mainContent').innerHTML = '<pre>' + escapeHtml(DOCS_CONTENT) + '</pre>';
      return;
    }
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
    const html = marked.parse(DOCS_CONTENT);
    const container = document.getElementById('mainContent');

    const temp = document.createElement('div');
    temp.innerHTML = html;

    const headings = temp.querySelectorAll('h1, h2, h3');
    sectionsData = [];
    let currentSection = null;

    headings.forEach(function(h) {
      const level = parseInt(h.tagName[1]);
      const text = h.textContent.trim();
      const id = slugify(text);

      if (level === 1) {
        currentSection = { id: id, text: text, level: level, html: '', children: [] };
        sectionsData.push(currentSection);
      } else if (level === 2 && currentSection) {
        const child = { id: id, text: text, level: level, html: '', children: [] };
        currentSection.children.push(child);
        sectionsData.push(child);
      } else if (level === 3 && sectionsData.length > 0) {
        const parent = sectionsData[sectionsData.length - 1];
        const child = { id: id, text: text, level: level, html: '' };
        if (parent && parent.level < 3) {
          if (!parent.children) parent.children = [];
          parent.children.push(child);
        }
        sectionsData.push(child);
      } else {
        sectionsData.push({ id: id, text: text, level: level, html: '' });
      }

      h.id = id;
      h.setAttribute('data-section', id);
    });

    const children = Array.from(temp.childNodes);
    let currentSecId = null;
    const sectionHtml = {};
    var orphanId = null;

    children.forEach(function(node) {
      if (node.nodeType === 1 && /^H[123]$/.test(node.tagName)) {
        currentSecId = node.id;
        if (!sectionHtml[currentSecId]) sectionHtml[currentSecId] = '';
        sectionHtml[currentSecId] += node.outerHTML;
      } else {
        if (!currentSecId) {
          if (!orphanId) {
            orphanId = 'section-intro';
            sectionsData.unshift({ id: orphanId, text: 'Introduction', level: 1, html: '' });
          }
          currentSecId = orphanId;
        }
        if (currentSecId) {
          if (!sectionHtml[currentSecId]) sectionHtml[currentSecId] = '';
          if (node.nodeType === 1) {
            sectionHtml[currentSecId] += node.outerHTML;
          } else if (node.nodeType === 3) {
            sectionHtml[currentSecId] += node.textContent;
          }
        }
      }
    });

    container.innerHTML = '';
    sectionsData.forEach(function(sec) {
      const div = document.createElement('div');
      div.className = 'doc-section';
      div.id = 'sec-' + sec.id;
      div.setAttribute('data-section-id', sec.id);
      div.innerHTML = sectionHtml[sec.id] || '<p><!-- empty section --></p>';
      container.appendChild(div);
    });

    buildTOC();
    renderMermaid();
    setupIntersectionObserver();
  }

  function buildTOC() {
    const list = document.getElementById('tocList');
    list.innerHTML = '';
    sectionsData.forEach(function(sec) {
      const li = document.createElement('li');
      li.className = 'toc-item';
      const a = document.createElement('a');
      a.href = '#sec-' + sec.id;
      a.className = 'toc-link toc-level-' + Math.min(sec.level, 3);
      a.textContent = sec.text;
      a.setAttribute('data-target', sec.id);
      li.appendChild(a);
      list.appendChild(li);
    });

    document.querySelectorAll('.toc-link').forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.getElementById('sec-' + this.getAttribute('data-target'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (window.innerWidth <= 768) closeSidebar();
      });
    });
  }

  function setupIntersectionObserver() {
    const sections = document.querySelectorAll('.doc-section');
    const links = document.querySelectorAll('.toc-link');
    if (!sections.length || !links.length) return;
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('data-section-id');
          links.forEach(function(l) {
            l.classList.toggle('active', l.getAttribute('data-target') === id);
          });
        }
      });
    }, { rootMargin: '-80px 0px -60% 0px' });
    sections.forEach(function(s) { observer.observe(s); });
  }

  function renderMermaid() {
    if (typeof mermaid === 'undefined') return;
    var codeBlocks = Array.from(document.querySelectorAll('.main pre code.language-mermaid, .main code.language-mermaid'));
    codeBlocks.forEach(function(codeEl) {
      var pre = codeEl.closest('pre') || codeEl;
      var diagram = (codeEl.textContent || codeEl.innerText).trim();
      if (!diagram) return;
      var div = document.createElement('div');
      div.className = 'mermaid-container';
      var mermaidDiv = document.createElement('div');
      mermaidDiv.className = 'mermaid';
      mermaidDiv.textContent = diagram;
      div.appendChild(mermaidDiv);
      pre.replaceWith(div);
    });
    (async function() {
      var mermaidDivs = Array.from(document.querySelectorAll('.mermaid:not([data-processed])'));
      for (var i = 0; i < mermaidDivs.length; i++) {
        try {
          await mermaid.run({ nodes: [mermaidDivs[i]] });
        } catch (err) {
          console.warn('Mermaid render error for diagram:', err);
          var container = mermaidDivs[i].parentNode;
          if (container) {
            container.innerHTML = '<div class="mermaid-error">⚠ ' + (err.message || 'Diagram syntax error') + '</div>';
          }
        }
      }
    })();
  }

  function doSearch(query) {
    var sections = document.querySelectorAll('.doc-section');
    var count = document.getElementById('searchCount');
    if (!query.trim()) {
      sections.forEach(function(s) { s.classList.remove('hidden', 'dimmed', 'highlighted'); });
      count.textContent = '';
      return;
    }
    var lower = query.toLowerCase();
    var matchCount = 0;
    sections.forEach(function(s) {
      var text = (s.textContent || '').toLowerCase();
      var matches = text.includes(lower);
      if (matches) {
        s.classList.remove('hidden');
        s.classList.add('highlighted');
        s.classList.remove('dimmed');
        matchCount++;
      } else {
        s.classList.add('hidden');
        s.classList.remove('highlighted', 'dimmed');
      }
      highlightText(s, query);
    });
    count.textContent = matchCount + ' section' + (matchCount !== 1 ? 's' : '') + ' match';
  }

  function highlightText(container, query) {
    if (!query.trim()) return;
    function mermaidFilter(node) {
      var el = node.parentElement;
      while (el) {
        if (el.classList && el.classList.contains('mermaid')) return NodeFilter.FILTER_REJECT;
        el = el.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
    var treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, { acceptNode: mermaidFilter }, false);
    var nodesToReplace = [];
    nodesToReplace.forEach(function(node) {
      var lower = node.textContent.toLowerCase();
      var idx = lower.indexOf(query.toLowerCase());
      if (idx === -1) return;
      var parent = node.parentNode;
      var frag = document.createDocumentFragment();
      var before = node.textContent.slice(0, idx);
      if (before) frag.appendChild(document.createTextNode(before));
      var mark = document.createElement('mark');
      mark.textContent = node.textContent.slice(idx, idx + query.length);
      frag.appendChild(mark);
      var after = node.textContent.slice(idx + query.length);
      if (after) frag.appendChild(document.createTextNode(after));
      parent.replaceChild(frag, node);
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    renderDocs();

    document.getElementById('searchInput').addEventListener('input', function() {
      doSearch(this.value);
    });

    var theme = localStorage.getItem('ghp-docs-theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    var themeBtn = document.getElementById('themeToggle');
    themeBtn.textContent = theme === 'light' ? '🌙 Dark' : '☀️ Light';
    themeBtn.addEventListener('click', function() {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ghp-docs-theme', next);
      this.textContent = next === 'light' ? '🌙 Dark' : '☀️ Light';
    });

    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    document.getElementById('sidebarToggle').addEventListener('click', function() {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    });
    overlay.addEventListener('click', closeSidebar);
  });

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  }
</script>
</body>
</html>`;
  }

  static _escapeForJs(str) {
    const escaped = JSON.stringify(str);
    return escaped;
  }

  static _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

module.exports = ViewerGeneratorService;
