const Repository = require('./repository.model');
const SanitizationRule = require('./sanitization-rule.model');
const sanitizerService = require('../services/sanitizer.service'); 

class User {
  #id;
  #apiKey;
  #rules;

  constructor(id, apiKey) {
    this.#id = id;
    this.#apiKey = apiKey;
    this.#rules = this._loadGlobalRules();
  }
  
  _loadGlobalRules() {
    // Map standard legacy predefined rules into OOP SanitizationRule objects automatically
    const rules = [];
    sanitizerService.builtinPatterns.forEach((p, idx) => {
      rules.push(new SanitizationRule(`builtin_${idx}`, p.name, p.regex.source, p.regex.flags));
    });
    sanitizerService.customRules.forEach(p => {
      rules.push(new SanitizationRule(p.id, p.name, p.pattern, p.flags));
    });
    return rules;
  }

  get id() { return this.#id; }
  get apiKey() { return this.#apiKey; }
  get rules() { return this.#rules; }

  async SubmitRepository(url) {
    const repository = new Repository(url);
    
    await repository.FetchFiles();
    
    // File-by-file logic is completely encapsulated within ProjectFile class instances!
    for (const file of repository.files) {
      repository.auditLog.IncrementScanned();
      const findings = file.Sanitize(this.#rules);
      if (findings.length > 0) {
        repository.auditLog.RecordEntry(file, findings);
      }
    }
    
    return repository;
  }

  async ValidateKey(llmServiceProxy) {
    return await llmServiceProxy.validateKey(this.#apiKey);
  }

  ViewAuditLogs(repository) {
    if (!repository) return { error: "No repository context to view logs for in OOP approach." };
    return repository.auditLog.GetSummary();
  }

  ManageRules(action, data) {
    if (action === 'add') {
      const rule = new SanitizationRule(Date.now().toString(36), data.name, data.pattern, data.flags || 'gi');
      this.#rules.push(rule);
      // Synchronize with legacy service if still used by external endpoints
      sanitizerService.addCustomRule(data.name, data.pattern, data.flags);
      return { id: rule.id, name: rule.name, pattern: rule.pattern };
    } else if (action === 'remove') {
      this.#rules = this.#rules.filter(r => r.id !== data.id);
      try { sanitizerService.removeCustomRule(data.id); } catch(e) {}
      return true;
    }
  }
}
module.exports = User;
