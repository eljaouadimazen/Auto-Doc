class Documentation {
    constructor(content = '', stats = null) {
        this.content = content;
        this.stats = stats || {};
        this.generatedAt = new Date();
    }
}

module.exports = Documentation;
