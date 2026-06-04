const { Octokit } = require('@octokit/rest');
const ViewerGeneratorService = require('./viewer-generator.service');

class PublisherService {
  static async publishToGitHubPages(documentation, targetRepo, githubToken, repoName) {
    if (!githubToken) {
      throw new Error('GitHub token is required');
    }
    if (!targetRepo || !targetRepo.includes('/')) {
      throw new Error('Target repository must be in format "owner/repo"');
    }

    const [owner, repo] = targetRepo.split('/');
    const octokit = new Octokit({ auth: githubToken, userAgent: 'Auto-Doc-Publisher' });

    const { stats } = documentation;
    const htmlContent = ViewerGeneratorService.generateViewerHtml(
      documentation.content,
      repoName || targetRepo,
      stats
    );

    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(htmlContent);
    const base64Content = Buffer.from(contentBytes).toString('base64');

    try {
      const { data: refData } = await octokit.git.getRef({
        owner, repo, ref: 'heads/gh-pages'
      });

      const blob = await octokit.git.createBlob({
        owner, repo,
        content: base64Content,
        encoding: 'base64'
      });

      const newTree = await octokit.git.createTree({
        owner, repo,
        base_tree: refData.object.sha,
        tree: [{
          path: 'index.html',
          mode: '100644',
          type: 'blob',
          sha: blob.data.sha
        }]
      });

      const { data: newCommit } = await octokit.git.createCommit({
        owner, repo,
        message: `docs: update documentation from Auto-Doc [${new Date().toISOString().slice(0, 10)}]`,
        tree: newTree.data.sha,
        parents: [refData.object.sha]
      });

      await octokit.git.updateRef({
        owner, repo,
        ref: 'heads/gh-pages',
        sha: newCommit.data.sha,
        force: false
      });

    } catch (err) {
      if (err.status === 404) {
        const { data: repoData } = await octokit.repos.get({ owner, repo });
        const defaultBranchSha = repoData.default_branch
          ? (await octokit.git.getRef({ owner, repo, ref: `heads/${repoData.default_branch}` })).data.object.sha
          : (await octokit.git.getRef({ owner, repo, ref: 'heads/main' }).catch(() =>
              octokit.git.getRef({ owner, repo, ref: 'heads/master' })
            )).data.object.sha;

        const blob = await octokit.git.createBlob({
          owner, repo,
          content: base64Content,
          encoding: 'base64'
        });

        const tree = await octokit.git.createTree({
          owner, repo,
          base_tree: defaultBranchSha,
          tree: [{ path: 'index.html', mode: '100644', type: 'blob', sha: blob.data.sha }]
        });

        const commit = await octokit.git.createCommit({
          owner, repo,
          message: `docs: initial documentation from Auto-Doc [${new Date().toISOString().slice(0, 10)}]`,
          tree: tree.data.sha,
          parents: [defaultBranchSha]
        });

        await octokit.git.createRef({
          owner, repo,
          ref: 'refs/heads/gh-pages',
          sha: commit.data.sha
        });
      } else if (err.status === 401 || err.status === 403) {
        throw new Error(
          'GitHub authentication failed. Ensure your token has the "repo" scope and is not expired.'
        );
      } else {
        throw new Error(err.message);
      }
    }

    const pagesUrl = `https://${owner}.github.io/${repo}`;
    return { success: true, url: pagesUrl };
  }
}

module.exports = PublisherService;
