/**
 * base.agent.js
 *
 * Base class that every agent extends.
 * Handles: LangSmith tracing, retry logic, structured output parsing,
 * token counting, error wrapping, and protocol compliance.
 */

require('dotenv').config();
const { ChatGroq }          = require('@langchain/groq');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { Client }            = require('langsmith');
const protocol              = require('./protocol');

class BaseAgent {
  /**
   * @param {string} name         - Agent name (used in traces and logs)
   * @param {string} systemPrompt - The agent's role and instructions
   * @param {Object} options
   * @param {number} options.maxRetries   - Max retry attempts (default: 2)
   * @param {number} options.temperature  - LLM temperature (default: 0.1)
   * @param {number} options.maxTokens    - Max output tokens (default: 2048)
   */
  constructor(name, systemPrompt, options = {}) {
    this.name         = name;
    this.systemPrompt = systemPrompt;
    this.maxRetries   = options.maxRetries  ?? 2;
    this.temperature  = options.temperature ?? 0.1;
    this.maxTokens    = options.maxTokens   ?? 2048;

    // Initialize Groq LLM via LangChain
    this.llm = new ChatGroq({
      apiKey:      process.env.GROQ_API_KEY,
      model:       process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: this.temperature,
      maxTokens:   this.maxTokens,
    });

    // Initialize LangSmith client for tracing
    this.langsmith = process.env.LANGCHAIN_API_KEY
      ? new Client({ apiKey: process.env.LANGCHAIN_API_KEY })
      : null;

    if (this.langsmith) {
      console.info(`[${this.name}] LangSmith tracing enabled`);
    }
  }

  /**
   * Main entry point — subclasses call this
   * Wraps the agent's logic with retry, tracing, and protocol compliance
   *
   * @param {Object} agentInput - Standard AgentInput from protocol.js
   * @returns {Object} Standard AgentOutput from protocol.js
   */
  async run(agentInput) {
    const startTime = Date.now();
    let   attempts  = 0;

    console.info(`[${this.name}] Starting — task: ${agentInput.task}`);

    for (let i = 0; i <= this.maxRetries; i++) {
      attempts++;
      try {
        const result = await this.execute(agentInput);
        const output = protocol.buildSuccess(this.name, result, {
          durationMs: Date.now() - startTime,
          attempts
        });
        protocol.validateOutput(output);
        console.info(`[${this.name}] Done in ${output.meta.durationMs}ms`);
        return output;

      } catch (err) {
        console.warn(`[${this.name}] Attempt ${attempts} failed: ${err.message}`);
        if (i === this.maxRetries) {
          const output = protocol.buildFailure(this.name, err, {
            durationMs: Date.now() - startTime,
            attempts
          });
          console.error(`[${this.name}] All ${attempts} attempts failed`);
          return output;
        }
        // Wait before retrying (exponential backoff)
        await this.sleep(1000 * attempts);
      }
    }
  }

  /**
   * Override this in subclasses — the actual agent logic
   * @param {Object} agentInput - Standard AgentInput
   * @returns {*} Result data (agent-specific)
   */
  async execute(agentInput) {
    throw new Error(`${this.name} must implement execute()`);
  }

  /**
   * Call the LLM with a user prompt
   * Returns the raw text response
   *
   * @param {string} userPrompt - The user message
   * @returns {string} LLM response text
   */
  async callLLM(userPrompt) {
    const messages = [
      new SystemMessage(this.systemPrompt),
      new HumanMessage(userPrompt)
    ];

    const response = await this.llm.invoke(messages);
    return response.content;
  }

  /**
   * Call the LLM and parse the response as JSON
   * Automatically strips markdown code fences if present
   *
   * @param {string} userPrompt  - The user message
   * @param {string} fallback    - Return this if JSON parsing fails (optional)
   * @returns {Object} Parsed JSON result
   */
  async callLLMJSON(userPrompt, fallback = null) {
    const raw = await this.callLLM(userPrompt);

    try {
      // Strip markdown code fences if present
      const clean = raw
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      return JSON.parse(clean);
    } catch (err) {
      console.warn(`[${this.name}] JSON parse failed — raw response: ${raw.slice(0, 200)}`);
      if (fallback !== null) return fallback;
      throw new Error(`LLM returned invalid JSON: ${err.message}`);
    }
  }

  /**
   * Truncate text to fit within token budget
   * Rough estimate: 1 token ≈ 4 characters
   *
   * @param {string} text      - Text to truncate
   * @param {number} maxTokens - Max tokens allowed
   * @returns {string} Truncated text
   */
  truncate(text, maxTokens = 3000) {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '\n\n[... truncated to fit context window]';
  }

  /**
   * Sleep for ms milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BaseAgent;