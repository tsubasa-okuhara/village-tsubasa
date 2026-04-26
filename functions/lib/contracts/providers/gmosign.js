"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GmoSignProvider = void 0;
class GmoSignProvider {
    constructor() {
        this.name = "gmosign";
    }
    async createAndSendDocument(input) {
        void input;
        throw new Error("GmoSignProvider not implemented (see docs/CONTRACTS_DESIGN.md 5.3)");
    }
    async downloadSignedPdf(providerDocumentId) {
        void providerDocumentId;
        throw new Error("GmoSignProvider not implemented");
    }
    async revokeDocument(providerDocumentId) {
        void providerDocumentId;
        throw new Error("GmoSignProvider not implemented");
    }
    async getSignUrl(providerDocumentId, providerSignerId) {
        void providerDocumentId;
        void providerSignerId;
        throw new Error("GmoSignProvider not implemented");
    }
    parseWebhook(body, headers) {
        void body;
        void headers;
        throw new Error("GmoSignProvider not implemented");
    }
}
exports.GmoSignProvider = GmoSignProvider;
