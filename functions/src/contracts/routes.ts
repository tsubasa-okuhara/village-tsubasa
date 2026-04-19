/**
 * /api/contracts/* ルータ
 * 設計書: docs/CONTRACTS_DESIGN.md 2章
 *
 * functions/src/index.ts 側で:
 *   app.use("/contracts", contractsRouter);
 *   app.use("/api/contracts", contractsRouter);
 * と配線する想定。
 */
import { Router } from "express";

import {
  handleListTemplates,
  handleGetTemplate,
  handleCreateTemplate,
  handleNewTemplateVersion,
  handleDeactivateTemplate,
} from "./handlers/templates";

import {
  handleListContracts,
  handleGetContract,
  handleCreateContract,
  handleSendContract,
  handleRevokeContract,
  handleDownloadSigned,
  handleListMyContracts,
  handleGetSignUrl,
  handleGetAuditLog,
} from "./handlers/contracts";

import {
  handleCloudSignWebhook,
  handleGmoSignWebhook,
} from "./handlers/webhook";

export const contractsRouter = Router();

// Webhook は外部からの POST なので認証ヘッダ付きで個別ルート
contractsRouter.post("/webhook/cloudsign", handleCloudSignWebhook);
contractsRouter.post("/webhook/gmosign", handleGmoSignWebhook);

// テンプレート管理（管理者）
contractsRouter.get("/templates", handleListTemplates);
contractsRouter.post("/templates", handleCreateTemplate);
contractsRouter.get("/templates/:id", handleGetTemplate);
contractsRouter.post("/templates/:id/new-version", handleNewTemplateVersion);
contractsRouter.post("/templates/:id/deactivate", handleDeactivateTemplate);

// 自分宛の契約（ヘルパー／署名者本人）
// ※ /:id より先に登録（ルート順で `/mine` が `/:id` にマッチしないように）
contractsRouter.get("/mine", handleListMyContracts);

// 契約本体
contractsRouter.get("/", handleListContracts);
contractsRouter.post("/", handleCreateContract);
contractsRouter.get("/:id", handleGetContract);
contractsRouter.post("/:id/send", handleSendContract);
contractsRouter.post("/:id/revoke", handleRevokeContract);
contractsRouter.get("/:id/download", handleDownloadSigned);
contractsRouter.get("/:id/sign-url", handleGetSignUrl);
contractsRouter.get("/:id/audit", handleGetAuditLog);
