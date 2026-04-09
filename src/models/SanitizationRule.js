class SanitizationRule {
    constructor(id, name, pattern, flags = 'gi') {
        this.id = id;
        this.name = name;
        this.pattern = pattern;
        this.flags = flags;
        this.regex = new RegExp(pattern, flags);
    }

    testMatch(content) {
        // Reset lastIndex for global regexes before testing
        this.regex.lastIndex = 0;
        return this.regex.test(content);
    }
}

module.exports = SanitizationRule;
