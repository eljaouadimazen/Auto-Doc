class User {
    constructor(apiKey = null, id = null) {
        this.id = id || Date.now();
        this.apiKey = apiKey;
    }

    validateKey() {
        return !!this.apiKey;
    }
}

module.exports = User;
