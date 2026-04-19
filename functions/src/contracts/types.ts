/**
 * 電子契約モジュール共通の型定義
 * 設計書: docs/CONTRACTS_DESIGN.md
 */

export type ContractKind =
  | "employment"
  | "nda"
  | "service_agreement"
  | "important_matter"
  | "usage_contract";

export type ContractStatus =
  | "draft"
  | "pending_signature"
  | "signed"
  | "revoked"
  | "expired";

export type PartyRole =
  | "principal"
  | "agent"
  | "guardian"
  | "witness"
  | "co_signer";

export type SignatureStatus = "pending" | "signed" | "declined";

export type ProviderName = "cloudsign" | "gmosign";

export interface FillableFieldDef {
  key: string;
  label: string;
  required?: boolean;
  source?: string; // 例: helper_master.name
  type?: "text" | "date" | "integer" | "decimal";
}

export interface SignaturePositionDef {
  party_role: PartyRole;
  signing_order: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContractPartyInput {
  role: PartyRole;
  name: string;
  email?: string;
  phone?: string;
  relation_to_subject?: string;
  signing_order?: number;
  is_signer?: boolean;
}
