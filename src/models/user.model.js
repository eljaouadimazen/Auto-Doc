const Repository = require('./repository.model');

class User {
  #id;
  #apiKey;

  constructor(id, apiKey) {
    this.#id = id;
    this.#apiKey = apiKey;
  }

  get id() { return this.#id; }
  get apiKey() { return this.#apiKey; }

  async SubmitRepository(url) {
    const repository = new Repository(url);

    await repository.FetchFiles();

    return repository;
  }

  async ValidateKey(llmServiceProxy) {
    return await llmServiceProxy.validateKey(this.#apiKey);
  }

  ViewAuditLogs(repository) {
    if (!repository) return { error: "No repository context to view logs for in OOP approach." };
    return repository.auditLog.GetSummary();
  }
}
module.exports = User;
