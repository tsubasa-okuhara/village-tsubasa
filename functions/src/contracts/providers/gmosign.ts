/**
 * GMOサイン プロバイダ（スタブ）。
 * 本実装は料金見積もり取得後 + NDA 締結後 + 仕様書受領後に着手する（Phase 5 以降）。
 *
 * インタフェース互換性を保つためだけの空実装。
 * 実際に使うとすべてのメソッドが throw する。
 */
import type {
  CreateAndSendInput,
  CreateAndSendResult,
  ParsedWebhookEvent,
  SignatureProvider,
} from "./types";

export class GmoSignProvider implements SignatureProvider {
  readonly name = "gmosign" as const;

  async createAndSendDocument(
    input: CreateAndSendInput,
  ): Promise<CreateAndSendResult> {
    void input;
    throw new Error("GmoSignProvider not implemented (see docs/CONTRACTS_DESIGN.md 5.3)");
  }

  async downloadSignedPdf(providerDocumentId: string): Promise<Buffer> {
    void providerDocumentId;
    throw new Error("GmoSignProvider not implemented");
  }

  async revokeDocument(providerDocumentId: string): Promise<void> {
    void providerDocumentId;
    throw new Error("GmoSignProvider not implemented");
  }

  async getSignUrl(
    providerDocumentId: string,
    providerSignerId: string,
  ): Promise<string> {
    void providerDocumentId;
    void providerSignerId;
    throw new Error("GmoSignProvider not implemented");
  }

  parseWebhook(
    body: unknown,
    headers: Record<string, string>,
  ): ParsedWebhookEvent {
    void body;
    void headers;
    throw new Error("GmoSignProvider not implemented");
  }
}
