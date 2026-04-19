/**
 * プロバイダレジストリ。contracts.provider 列の値から実装を解決する。
 * 新しいプロバイダを増やすときは getProvider の switch に1行追加するだけ。
 */
import type { ProviderName } from "../types";
import type { SignatureProvider } from "./types";
import { CloudSignProvider } from "./cloudsign";
import { GmoSignProvider } from "./gmosign";

let cloudsign: CloudSignProvider | null = null;
let gmosign: GmoSignProvider | null = null;

export function getProvider(name: ProviderName): SignatureProvider {
  switch (name) {
    case "cloudsign":
      if (!cloudsign) cloudsign = new CloudSignProvider();
      return cloudsign;
    case "gmosign":
      if (!gmosign) gmosign = new GmoSignProvider();
      return gmosign;
    default: {
      // exhaustive check
      const exhaustive: never = name;
      throw new Error(`unknown provider: ${String(exhaustive)}`);
    }
  }
}

/** Phase 3 の既定プロバイダ。必要になれば組織設定で切替可能に */
export const DEFAULT_PROVIDER: ProviderName = "cloudsign";
