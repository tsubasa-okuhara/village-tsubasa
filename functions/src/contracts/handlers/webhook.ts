/**
 * 外部署名プロバイダからの Webhook 受信ハンドラ
 * POST /api/contracts/webhook/cloudsign
 * POST /api/contracts/webhook/gmosign  （将来用）
 *
 * Phase 3 スタブ: providers/cloudsign.ts の parseWebhook が未実装のため
 * 実処理はスキップし、監査ログと受信内容だけ記録する。
 */
import { Request, Response } from "express";
import { getProvider } from "../providers";
import { writeAuditLog } from "../services/audit";
import { getIp, getUserAgent } from "./common";
import type { ProviderName } from "../types";

function buildHeaderMap(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") out[k.toLowerCase()] = v;
    else if (Array.isArray(v)) out[k.toLowerCase()] = v[0] ?? "";
  }
  return out;
}

async function handleProviderWebhook(
  providerName: ProviderName,
  req: Request,
  res: Response,
): Promise<void> {
  const provider = getProvider(providerName);
  try {
    const parsed = provider.parseWebhook(req.body, buildHeaderMap(req));
    await writeAuditLog({
      actorRole: "provider_webhook",
      action:
        parsed.event === "declined"
          ? "signature_declined"
          : parsed.event === "signed"
            ? "signature_signed"
            : "contract_sent",
      payload: { parsed, rawBody: req.body },
      ipAddress: getIp(req),
      userAgent: getUserAgent(req),
    });
    // TODO: Phase 3.2 以降
    //  - providerDocumentId から contracts を引く
    //  - contract_signatures.status を signed/declined に更新
    //  - 全員署名完了なら contracts.status = 'signed'
    //  - 署名済PDF を provider.downloadSignedPdf で取得して Storage 保存
    //  - notifications に 'contract_signed' / 'contract_completed' を投げる
    res.status(200).json({ received: true, note: "Phase 3 スタブ: 未処理" });
  } catch (err) {
    // parseWebhook が未実装のためここに来る
    console.warn(`${providerName} webhook parse failed:`, err);
    await writeAuditLog({
      actorRole: "provider_webhook",
      action: "contract_sent",
      payload: {
        note: "webhook parse error (Phase 3 スタブ)",
        error: String(err),
        rawBody: req.body,
      },
      ipAddress: getIp(req),
      userAgent: getUserAgent(req),
    });
    res.status(200).json({ received: true, note: String(err) });
  }
}

export async function handleCloudSignWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  await handleProviderWebhook("cloudsign", req, res);
}

export async function handleGmoSignWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  await handleProviderWebhook("gmosign", req, res);
}
