"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPENAI_API_KEY = void 0;
exports.getOpenAIClient = getOpenAIClient;
const openai_1 = __importDefault(require("openai"));
const params_1 = require("firebase-functions/params");
exports.OPENAI_API_KEY = (0, params_1.defineSecret)("OPENAI_API_KEY");
let openaiClient = null;
function getOpenAIClient() {
    if (openaiClient) {
        return openaiClient;
    }
    openaiClient = new openai_1.default({
        apiKey: exports.OPENAI_API_KEY.value(),
    });
    return openaiClient;
}
