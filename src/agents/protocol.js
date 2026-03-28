/**
 * protocol.js
 *
 * Defines the communication contract between all agents.
 * Every agent receives AgentInput and returns AgentOutput.
 * This ensures agents are interchangeable and composable.
 */

/**
 * Standard input every agent receives
 * @typedef {Object} AgentInput
 * @property {string}  task              - What the agent must do
 * @property {Object}  context           - Shared context across all agents
 * @property {string}  context.repository - Repository name
 * @property {string}  context.runId     - Unique ID for this pipeline run
 * @property {Object}  context.previous  - Results from previous agents
 * @property {*}       input             - Agent-specific input data
 */

/**
 * Standard output every agent returns
 * @typedef {Object} AgentOutput
 * @property {string}  agentName    - Name of the agent that produced this
 * @property {string}  status       - 'success' | 'failed' | 'skipped'
 * @property {*}       result       - Agent-specific result data
 * @property {Object}  meta         - Metadata about this run
 * @property {number}  meta.tokensUsed  - Tokens consumed
 * @property {number}  meta.durationMs  - Time taken in ms
 * @property {number}  meta.attempts    - How many retries were needed
 * @property {string|null} error    - Error message if status is 'failed'
 */

/**
 * Build a standard AgentInput object
 */
function buildInput(task, context, input) {
  return {
    task,
    context: {
      repository: context.repository || 'unknown',
      runId:      context.runId      || generateRunId(),
      previous:   context.previous   || {}
    },
    input
  };
}

/**
 * Build a standard AgentOutput object for success
 */
function buildSuccess(agentName, result, meta = {}) {
  return {
    agentName,
    status: 'success',
    result,
    meta: {
      tokensUsed:  meta.tokensUsed  || 0,
      durationMs:  meta.durationMs  || 0,
      attempts:    meta.attempts    || 1,
    },
    error: null
  };
}

/**
 * Build a standard AgentOutput object for failure
 */
function buildFailure(agentName, error, meta = {}) {
  return {
    agentName,
    status: 'failed',
    result: null,
    meta: {
      tokensUsed:  meta.tokensUsed  || 0,
      durationMs:  meta.durationMs  || 0,
      attempts:    meta.attempts    || 1,
    },
    error: error instanceof Error ? error.message : String(error)
  };
}

/**
 * Build a standard AgentOutput object for skipped (e.g. cached result)
 */
function buildSkipped(agentName, reason, cachedResult = null) {
  return {
    agentName,
    status:  'skipped',
    result:  cachedResult,
    meta:    { tokensUsed: 0, durationMs: 0, attempts: 0 },
    error:   null,
    reason
  };
}

/**
 * Generate a unique run ID for tracing
 */
function generateRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validate that an agent output conforms to the protocol
 */
function validateOutput(output) {
  const required = ['agentName', 'status', 'result', 'meta', 'error'];
  const missing  = required.filter(k => !(k in output));
  if (missing.length > 0) {
    throw new Error(`Invalid agent output — missing fields: ${missing.join(', ')}`);
  }
  if (!['success', 'failed', 'skipped'].includes(output.status)) {
    throw new Error(`Invalid agent status: ${output.status}`);
  }
  return true;
}

module.exports = {
  buildInput,
  buildSuccess,
  buildFailure,
  buildSkipped,
  validateOutput,
  generateRunId
};