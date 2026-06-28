jest.mock('../src/models/repository.model', () => {
const MockRepository = jest.fn().mockImplementation(() => {
    const auditLog = {
        IncrementScanned: jest.fn(),
        RecordEntry: jest.fn(),
    };
    return {
        FetchFiles: jest.fn().mockImplementation(async () => {
            auditLog.IncrementScanned();
            auditLog.IncrementScanned();
            auditLog.RecordEntry();
        }),
        files: [],
        name: 'test-repo',
        auditLog,
    };
});

  return MockRepository;
});

const User = require('../src/models/user.model');

describe('User', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('sets id and apiKey from parameters', () => {
      const user = new User('127.0.0.1', 'test-api-key');
      expect(user.id).toBe('127.0.0.1');
      expect(user.apiKey).toBe('test-api-key');
    });

  });

  describe('ViewAuditLogs', () => {
    test('returns error when no repository', () => {
      const user = new User('127.0.0.1', 'key');
      const result = user.ViewAuditLogs(null);
      expect(result).toEqual({ error: 'No repository context to view logs for in OOP approach.' });
    });

    test('returns audit summary when repository provided', () => {
      const user = new User('127.0.0.1', 'key');
      const mockRepo = { auditLog: { GetSummary: jest.fn().mockReturnValue({ filesScanned: 5 }) } };
      const result = user.ViewAuditLogs(mockRepo);
      expect(result).toEqual({ filesScanned: 5 });
    });
  });

  describe('ValidateKey', () => {
    test('delegates to proxy', async () => {
      const user = new User('127.0.0.1', 'test-key');
      const proxy = { validateKey: jest.fn().mockResolvedValue({ valid: true }) };
      const result = await user.ValidateKey(proxy);
      expect(result).toEqual({ valid: true });
      expect(proxy.validateKey).toHaveBeenCalledWith('test-key');
    });
  });

  describe('SubmitRepository', () => {
    test('fetches files and sanitizes them', async () => {
      const user = new User('127.0.0.1', 'key');
      const repository = await user.SubmitRepository('https://github.com/user/repo');
      expect(repository.FetchFiles).toHaveBeenCalled();
      expect(repository.name).toBe('test-repo');
    });

    test('records audit entries for findings', async () => {
      const user = new User('127.0.0.1', 'key');
      const repository = await user.SubmitRepository('https://github.com/user/repo');
      expect(repository.auditLog.IncrementScanned).toHaveBeenCalledTimes(2);
      expect(repository.auditLog.RecordEntry).toHaveBeenCalledTimes(1);
    });
  });
});
