const sanitizerService = require('../services/sanitizer.service');
const astParser = require('../services/ast-parser.service');

class ProjectFile {
    constructor(path, rawContent) {
        this.path = path;
        this.rawContent = rawContent;
        this.isSanitized = false;
        this.astTree = null;
    }

    sanitize() {
        if (!this.isSanitized) {
            this.rawContent = sanitizerService.clean(this.rawContent);
            this.isSanitized = true;
        }
        return this.rawContent;
    }

    extractAST() {
        if (!this.astTree) {
            this.astTree = astParser.parse(this.path, this.rawContent);
        }
        return this.astTree;
    }
}

module.exports = ProjectFile;
