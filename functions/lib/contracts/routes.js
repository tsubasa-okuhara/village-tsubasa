"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contractsRouter = void 0;
/**
 * /api/contracts/* ルータ
 * 設計書: docs/CONTRACTS_DESIGN.md 2章
 *
 * functions/src/index.ts 側で:
 *   app.use("/contracts", contractsRouter);
 *   app.use("/api/contracts", contractsRouter);
 * と配線する想定。
 */
const express_1 = require("express");
const templates_1 = require("./handlers/templates");
const contracts_1 = require("./handlers/contracts");
const webhook_1 = require("./handlers/webhook");
exports.contractsRouter = (0, express_1.Router)();
// Webhook は外部からの POST なので認証ヘッダ付きで個別ルート
exports.contractsRouter.post("/webhook/cloudsign", webhook_1.handleCloudSignWebhook);
exports.contractsRouter.post("/webhook/gmosign", webhook_1.handleGmoSignWebhook);
// テンプレート管理（管理者）
exports.contractsRouter.get("/templates", templates_1.handleListTemplates);
exports.contractsRouter.post("/templates", templates_1.handleCreateTemplate);
exports.contractsRouter.get("/templates/:id", templates_1.handleGetTemplate);
exports.contractsRouter.post("/templates/:id/new-version", templates_1.handleNewTemplateVersion);
exports.contractsRouter.post("/templates/:id/deactivate", templates_1.handleDeactivateTemplate);
// 自分宛の契約（ヘルパー／署名者本人）
// ※ /:id より先に登録（ルート順で `/mine` が `/:id` にマッチしないように）
exports.contractsRouter.get("/mine", contracts_1.handleListMyContracts);
// 契約本体
exports.contractsRouter.get("/", contracts_1.handleListContracts);
exports.contractsRouter.post("/", contracts_1.handleCreateContract);
exports.contractsRouter.get("/:id", contracts_1.handleGetContract);
exports.contractsRouter.post("/:id/send", contracts_1.handleSendContract);
exports.contractsRouter.post("/:id/revoke", contracts_1.handleRevokeContract);
exports.contractsRouter.get("/:id/download", contracts_1.handleDownloadSigned);
exports.contractsRouter.get("/:id/sign-url", contracts_1.handleGetSignUrl);
exports.contractsRouter.get("/:id/audit", contracts_1.handleGetAuditLog);
