const { randomBytes } = require('node:crypto');

const TTL_MS = 60 * 60 * 1000;

class JobQueue {
  constructor() {
    this._jobs = new Map();
    this._cleanupInterval = setInterval(() => this._expireStale(), TTL_MS);
  }

  create(runFn) {
    const jobId = randomBytes(12).toString('hex');
    const job = {
      jobId,
      status: 'pending',
      result: null,
      error: null,
      progress: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this._jobs.set(jobId, job);

    job.status = 'running';
    job.updatedAt = Date.now();

    const progressRef = { current: null };
    job.progress = progressRef;

    runFn(progressRef)
      .then(result => {
        job.status = 'done';
        job.result = result;
        job.updatedAt = Date.now();
      })
      .catch(err => {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
        job.updatedAt = Date.now();
      });

    return jobId;
  }

  updateProgress(jobId, progress) {
    const job = this._jobs.get(jobId);
    if (job && job.progress) {
      job.progress.current = progress;
    }
  }

  getStatus(jobId) {
    const job = this._jobs.get(jobId);
    if (!job) return null;
    return {
      jobId: job.jobId,
      status: job.status,
      result: job.result,
      error: job.error,
      progress: job.progress ? job.progress.current : null,
      createdAt: job.createdAt,
    };
  }

  _expireStale() {
    const now = Date.now();
    for (const [id, job] of this._jobs) {
      if (now - job.createdAt > TTL_MS) {
        this._jobs.delete(id);
      }
    }
  }

  destroy() {
    clearInterval(this._cleanupInterval);
    this._jobs.clear();
  }
}

module.exports = new JobQueue();
