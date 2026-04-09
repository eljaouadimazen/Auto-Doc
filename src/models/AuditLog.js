class AuditLog {
    constructor() {
        this.timestamp = new Date();
        this.filesScanned = 0;
        this.totalRedacted = 0;
        this.entries = [];
    }

    recordEntry(filePath, redactedCount) {
        this.entries.push({ filePath, redactedCount });
        this.filesScanned++;
        this.totalRedacted += redactedCount;
    }

    getSummary() {
        return {
            timestamp: this.timestamp,
            filesScanned: this.filesScanned,
            totalRedacted: this.totalRedacted
        };
    }
}

module.exports = AuditLog;
