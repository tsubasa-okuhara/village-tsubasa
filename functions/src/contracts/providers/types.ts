/**
 * 外部電子署名サービスの共通インタフェース。
 * cloudsign.ts / gmosign.ts がこれを実装する。
 * 設計書: docs/CONTRACTS_DESIGN.md 5.1
 */
import type { ProviderName } from "../types";

export interface ProviderPartyInput {
  /** contract_parties.id */
  id: string;
  name: string;
  email: string;
  signingOrder: number;
}

export interface CreateAndSendInput {
  contractId: string;
  title: string;
  pdfBuffer: Buffer;
  parties: ProviderPartyInput[];
}

export interface CreateAndSendResult {
  providerDocumentId: string;
  /** party.id → 外部API 側の signerId */
  providerSignerIds: Record<string, string>;
}

export type ParsedWebhookEvent =
  | {
      providerDocumentId: string;
      providerSignerId?: string;
      event: "signed" | "declined";
      signedAt?: Date;
      timestampTokenUrl?: string;
    }
  | {
      providerDocumentId: string;
      event: "completed" | "expired";
      signedAt?: Date;
    };

export interface SignatureProvider {
  readonly name: ProviderName;

  /** ドキュメント作成＋署名者追加＋送信 */
  createAndSendDocument(input: CreateAndSendInput): Promise<CreateAndSendResult>;

  /** 署名済PDFのダウンロード */
  downloadSignedPdf(providerDocumentId: string): Promise<Buffer>;

  /** 撤回 */
  revokeDocument(providerDocumentId: string): Promise<void>;

  /** 署名画面URLの取得（iframe 埋め込み or リダイレクトに使う） */
  getSignUrl(
    providerDocumentId: string,
    providerSignerId: string,
  ): Promise<string>;

  /** Webhook 受信ペイロードのパース（署名検証も兼ねる） */
  parseWebhook(
    body: unknown,
    headers: Record<string, string>,
  ): ParsedWebhookEvent;
}
