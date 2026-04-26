"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROVIDER = void 0;
exports.getProvider = getProvider;
const cloudsign_1 = require("./cloudsign");
const gmosign_1 = require("./gmosign");
let cloudsign = null;
let gmosign = null;
function getProvider(name) {
    switch (name) {
        case "cloudsign":
            if (!cloudsign)
                cloudsign = new cloudsign_1.CloudSignProvider();
            return cloudsign;
        case "gmosign":
            if (!gmosign)
                gmosign = new gmosign_1.GmoSignProvider();
            return gmosign;
        default: {
            // exhaustive check
            const exhaustive = name;
            throw new Error(`unknown provider: ${String(exhaustive)}`);
        }
    }
}
/** Phase 3 の既定プロバイダ。必要になれば組織設定で切替可能に */
exports.DEFAULT_PROVIDER = "cloudsign";
