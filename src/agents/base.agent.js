/**
 * base.agent.js
 *
 * Base class that every agent extends.
 * Handles: LangSmith tracing, retry logic, structured output parsing,
 * token counting, error wrapping, and protocol compliance.
 *
 * Supports multiple LLM providers: groq, ollama, gemini, openrouter
 */

require('dotenv').config();
const { ChatGroq }                    = require('@langchain/groq');
const { ChatGoogleGenerativeAI }      = require('@langchain/google-genai');
const { ChatOpenAI }                  = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { Client }                      = require('langsmith');
const protocol                        = require('./protocol');
const { sanitizeLog }                 = require('../services/log-sanitizer');

const PROVIDER_MODELS = {
  groq:       process.env.GROQ_MODEL       || 'llama-3.3-70b-versatile',
  gemini:     process.env.GEMINI_MODEL     || 'gemini-2.0-flash',
  openrouter: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
  ollama:     process.env.OLLAMA_MODEL     || 'tinyllama',
};

class BaseAgent {
  /**
   * @param {string} name         - Agent name (used in traces and logs)
   * @param {string} systemPrompt - The agent's role and instructions
   * @param {Object} options
   * @param {number} options.maxRetries   - Max retry attempts (default: 2)
   * @param {number} options.temperature  - LLM temperature (default:0.1)
   * @param {number} options.maxTokens    - Max output tokens (default: 2048)
   * @param {string} options.provider     - LLM provider (default: 'groq')
   */
  constructor(name, systemPrompt, options = {}) {
    this.name         = name;
    this.systemPrompt = systemPrompt;
    this.maxRetries   = options.maxRetries  ?? 2;
    this.temperature  = options.temperature ?? 0.1;
    this.maxTokens    = options.maxTokens   ?? 2048;
    this.provider     = options.provider    || 'groq';

    // Default LLM instance (uses .env keys)
    this.llm = BaseAgent._createLlm(this.provider, null, this.temperature, this.maxTokens);

    // Per-request state (set by run() from context)
    this._currentApiKey  = null;
    this._currentProvider = null;

    // Initialize LangSmith client for tracing
    this.langsmith = process.env.LANGCHAIN_API_KEY
      ? new Client({ apiKey: process.env.LANGCHAIN_API_KEY })
      : null;

    if (this.langsmith) {
      console.info(`[${this.name}] LangSmith tracing enabled`);
    }
  }

  /**
   * Factory to create a LangChain chat instance for any provider
   * @param {string} provider    - 'groq' | 'gemini' | 'openrouter' | 'ollama'
   * @param {string} apiKey      - Per-request key (null for .env default)
   * @param {number} temperature - LLM temperature
   * @param {number} maxTokens   - Max output tokens
   * @returns {LangChain chat instance}
   */
  static _createLlm(provider, apiKey, temperature, maxTokens) {
    const model = PROVIDER_MODELS[provider] || PROVIDER_MODELS.groq;

    switch (provider) {
      case 'groq':
        return new ChatGroq({
          apiKey:      apiKey || process.env.GROQ_API_KEY,
          model,
          temperature,
          maxTokens,
        });

      case 'gemini':
        return new ChatGoogleGenerativeAI({
          apiKey:      apiKey || process.env.GEMINI_API_KEY,
          model,
          temperature,
          maxOutputTokens: maxTokens,
        });

      case 'openrouter':
        return new ChatOpenAI({
          apiKey:      apiKey || process.env.OPENROUTER_API_KEY,
          model,
          temperature,
          maxTokens,
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
          },
        });

      case 'ollama':
        return new ChatOpenAI({
          apiKey:      'ollama',
          model,
          temperature,
          maxTokens,
          configuration: {
            baseURL: 'http://localhost:11434/v1',
          },
        });

      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
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

    // Extract apiKey and provider from context
    this._currentApiKey   = agentInput.context?.apiKey || null;
    this._currentProvider = agentInput.context?.provider || this.provider;

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
        console.warn(`[${this.name}] Attempt ${attempts} failed: ${sanitizeLog(err.message)}`);
        if (i === this.maxRetries) {
          const output = protocol.buildFailure(this.name, err, {
            durationMs: Date.now() - startTime,
            attempts
          });
          console.error(`[${this.name}] All ${attempts} attempts failed: ${sanitizeLog(err.message)}`);
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

    // Use per-request provider/key if set by run()
    if (this._currentApiKey || this._currentProvider) {
      const provider = this._currentProvider || this.provider;
      const dynamicLlm = BaseAgent._createLlm(
        provider,
        this._currentApiKey,
        this.temperature,
        this.maxTokens
      );
      const response = await dynamicLlm.invoke(messages);
      return response.content;
    }

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
    const strictPrompt = userPrompt + '\n\nIMPORTANT: Return ONLY valid JSON. Do not include any conversational text, explanations, or formatting.';
    const raw = await this.callLLM(strictPrompt);

    try {
      const firstCurly = raw.indexOf('{');
      const lastCurly = raw.lastIndexOf('}');
      const firstSquare = raw.indexOf('[');
      const lastSquare = raw.lastIndexOf(']');

      let startIndex = -1;
      let endIndex = -1;

      if (firstCurly !== -1 && (firstSquare === -1 || firstCurly < firstSquare)) {
        startIndex = firstCurly;
        endIndex = lastCurly;
      } else if (firstSquare !== -1) {
        startIndex = firstSquare;
        endIndex = lastSquare;
      }

      if (startIndex === -1 || endIndex === -1) {
         throw new Error('No JSON object or array found in response');
      }
      
      const clean = raw.substring(startIndex, endIndex + 1);
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
