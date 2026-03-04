class SanitizerService {
    constructor() {
        this.patterns = [
            /api[_-]?key\s*=\s*["'][^"']+["']/gi,
            /token\s*=\s*["'][^"']+["']/gi,
            /password\s*=\s*["'][^"']+["']/gi,
            /ghp_[A-Za-z0-9]{20,}/g,
            /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g
        ];
    }

    clean(text) {
        let sanitized = text;

        this.patterns.forEach(pattern => {
            sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
        });

        return sanitized;
    }
}

module.exports = new SanitizerService();