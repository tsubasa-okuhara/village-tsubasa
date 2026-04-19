/**
 * クラウドサイン Web API プロバイダ（Phase 3 では最小スタブ）
 *
 * 参考:
 *  - https://help.cloudsign.jp/ja/articles/2681259 （利用ガイド）
 *  - https://app.swaggerhub.com/api/CloudSign/cloudsign-web_api （OpenAPI 仕様）
 *
 * 認証:
 *  - POST https://api.cloudsign.jp/token with client_id → access_token (Bearer, 1h, client_secret 不要)
 *
 * 主要エンドポイント (予定):
 *  - POST /documents                                      書類作成（タイトル）
 *  - POST /documents/{id}/attachments                     PDF 本文アップロード（最大 20MB）
 *  - POST /documents/{id}/files/{fileId}/widgets          署名位置指定
 *  - POST /documents/{id}/participants                    署名者追加
 *  - POST /documents/{id}                                 送信
 *  - GET  /documents/{id}/files                           完了済み PDF 取得
 *  - DELETE /documents/{id}                               撤回
 *
 * Webhook:
 *  - クラウドサイン管理画面で /api/contracts/webhook/cloudsign を登録
 *  - シークレットトークンで検証（ヘッダ or ペイロード照合）
 */
import { defineSecret } from "firebase-functions/params";
import type {
  CreateAndSendInput,
  CreateAndSendResult,
  ParsedWebhookEvent,
  SignatureProvider,
} from "./types";

export const CLOUDSIGN_CLIENT_ID = defineSecret("CLOUDSIGN_CLIENT_ID");
export const CLOUDSIGN_WEBHOOK_SECRET = defineSecret(
  "CLOUDSIGN_WEBHOOK_SECRET",
);

const CLOUDSIGN_BASE_URL = "https://api.cloudsign.jp";

interface CachedToken {
  token: string;
  /** epoch ms */
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.token;
  }

  const clientId = CLOUDSIGN_CLIENT_ID.value();
  const params = new URLSearchParams({ client_id: clientId });

  const res = await fetch(`${CLOUDSIGN_BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(
      `cloudsign token request failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  cachedToken = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cachedToken.token;
}

export class CloudSignProvider implements SignatureProvider {
  readonly name = "cloudsign" as const;

  async createAndSendDocument(
    input: CreateAndSendInput,
  ): Promise<CreateAndSendResult> {
    // 実装予定（Phase 3.2 以降）
    //  1) POST /documents          書類作成
    //  2) POST /documents/{id}/attachments  PDF アップロード
    //  3) POST /documents/{id}/files/{fileId}/widgets  署名位置
    //  4) POST /documents/{id}/participants 署名者追加（複数）
    //  5) POST /documents/{id}     送信トリガー
    await getAccessToken();
    void input;
    throw new Error(
      "CloudSignProvider.createAndSendDocument not implemented yet",
    );
  }

  async downloadSignedPdf(providerDocumentId: string): Promise<Buffer> {
    void providerDocumentId;
    throw new Error("CloudSignProvider.downloadSignedPdf not implemented yet");
  }

  async revokeDocument(providerDocumentId: string): Promise<void> {
    void providerDocumentId;
    throw new Error("CloudSignProvider.revokeDocument not implemented yet");
  }

  async getSignUrl(
    providerDocumentId: string,
    providerSignerId: string,
  ): Promise<string> {
    void providerDocumentId;
    void providerSignerId;
    throw new Error("CloudSignProvider.getSignUrl not implemented yet");
  }

  parseWebhook(
    body: unknown,
    headers: Record<string, string>,
  ): ParsedWebhookEvent {
    // 実装予定:
    //  - headers["x-cloudsign-signature"] 等をシークレットと比較
    //  - body から documentId / event 種別 / signerId を取り出す
    void headers;
    void body;
    throw new Error("CloudSignProvider.parseWebhook not implemented yet");
  }
}
