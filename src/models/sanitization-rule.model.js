class SanitizationRule {
  #id;
  #name;
  #pattern;
  #flags;
  #regex;

  constructor(id, name, pattern, flags = 'gi') {
    this.#id = id;
    this.#name = name;
    this.#pattern = pattern;
    this.#flags = flags;
    this.#regex = new RegExp(pattern, flags);
  }

  get id() { return this.#id; }
  get name() { return this.#name; }
  get pattern() { return this.#pattern; }
  get flags() { return this.#flags; }

  TestMatch(content) {
    if (!content || typeof content !== 'string') return false;
    this.#regex.lastIndex = 0;
    const match = this.#regex.test(content);
    this.#regex.lastIndex = 0;
    return match;
  }

  Apply(content) {
    if (!content || typeof content !== 'string') return content;
    this.#regex.lastIndex = 0;
    const sanitized = content.replace(this.#regex, '[REDACTED_SECRET]');
    this.#regex.lastIndex = 0;
    return sanitized;
  }
}
module.exports = SanitizationRule;
