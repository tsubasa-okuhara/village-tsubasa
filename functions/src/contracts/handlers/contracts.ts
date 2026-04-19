/**
 * 契約本体ハンドラ
 * GET    /api/contracts
 * GET    /api/contracts/:id
 * POST   /api/contracts
 * POST   /api/contracts/:id/send
 * POST   /api/contracts/:id/revoke
 * GET    /api/contracts/:id/download
 * GET    /api/contracts/mine
 * GET    /api/contracts/:id/sign-url
 * GET    /api/contracts/:id/audit
 *
 * Phase 3 スタブ: 外部API呼び出し（/send・/download・/sign-url）は
 * providers/cloudsign.ts が未実装のためエラーを返す。
 * 一覧・作成・撤回・監査ログは動く。
 */
import { Request, Response } from "express";
import { getSupabaseClient } from "../../lib/supabase";
import { writeAuditLog } from "../services/audit";
import { DEFAULT_PROVIDER, getProvider } from "../providers";
import {
  getEmailFromReq,
  getIp,
  getUserAgent,
  isAdmin,
} from "./common";
import type { ContractPartyInput } from "../types";

export async function handleListContracts(
  req: Request,
  res: Response,
): Promise<void> {
  const email = getEmailFromReq(req);
  if (!isAdmin(email)) {
    res.status(403).json({ error: "管理者のみ閲覧できます" });
    return;
  }

  const kind = req.query.kind as string | undefined;
  const status = req.query.status as string | undefined;
  const helperId = req.query.helper_id as string | undefined;
  const subjectUserId = req.query.subject_user_id as string | undefined;

  const supabase = getSupabaseClient();
  let query = supabase
    .from("contracts")
    .select(
      "id, template_id, template_version, kind, title, status, helper_id, subject_user_id, provider, created_by_email, created_at, sent_at, completed_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (kind) query = query.eq("kind", kind);
  if (status) query = query.eq("status", status);
  if (helperId) query = query.eq("helper_id", helperId);
  if (subjectUserId) query = query.eq("subject_user_id", subjectUserId);

  const { data, error } = await query;
  if (error) {
    console.error("list contracts error:", error);
    res.status(500).json({ error: "取得に失敗しました" });
    return;
  }
  res.json({ contracts: data ?? [] });
}

export async function handleGetContract(
  req: Request,
  res: Response,
): Promise<void> {
  const email = getEmailFromReq(req);
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "id が必要です" });
    return;
  }

  const supabase = getSupabaseClient();
  const { data: contract, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("get contract error:", error);
    res.status(500).json({ error: "取得に失敗しました" });
    return;
  }
  if (!contract) {
    res.status(404).json({ error: "契約が見つかりません" });
    return;
  }

  // 認可: 管理者 or 署名者本人のメール一致のみ
  const { data: parties } = await supabase
    .from("contract_parties")
    .select("id, role, name, email, phone, relation_to_subject, signing_order, is_signer")
    .eq("contract_id", id)
    .order("signing_order", { ascending: true });

  const isSigner = (parties ?? []).some(
    (p) =>
      typeof p.email === "string" &&
      email &&
      p.email.trim().toLowerCase() === email.toLowerCase(),
  );
  if (!isAdmin(email) && !isSigner) {
    res.status(403).json({ error: "閲覧権限がありません" });
    return;
  }

  const { data: signatures } = await supabase
    .from("contract_signatures")
    .select(
      "id, contract_id, party_id, provider_signer_id, status, signed_at, timestamp_token_url",
    )
    .eq("contract_id", id);

  res.json({ contract, parties: parties ?? [], signatures: signatures ?? [] });
}

export async function handleCreateContract(
  req: Request,
  res: Response,
): Promise<void> {
  const {
    email,
    template_id,
    title,
    field_values,
    helper_id,
    subject_user_id,
    parties,
    provider,
  } = req.body ?? {};

  if (!isAdmin(email)) {
    res.status(403).json({ error: "管理者のみ操作できます" });
    return;
  }
  if (!template_id) {
    res.status(400).json({ error: "template_id が必要です" });
    return;
  }
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title が必要です" });
    return;
  }
  if (!Array.isArray(parties) || parties.length === 0) {
    res.status(400).json({ error: "parties（署名者）が必要です" });
    return;
  }

  const supabase = getSupabaseClient();

  // テンプレートから kind / version を引く
  const { data: tmpl, error: tErr } = await supabase
    .from("contract_templates")
    .select("id, kind, version, is_active")
    .eq("id", template_id)
    .maybeSingle();
  if (tErr || !tmpl) {
    res.status(404).json({ error: "テンプレートが見つかりません" });
    return;
  }
  if (!tmpl.is_active) {
    res.status(400).json({ error: "停止中のテンプレートは使用できません" });
    return;
  }

  // 契約本体を作成
  const { data: contract, error } = await supabase
    .from("contracts")
    .insert({
      template_id,
      template_version: tmpl.version,
      kind: tmpl.kind,
      title: title.trim(),
      status: "draft",
      field_values: field_values ?? {},
      helper_id: helper_id ?? null,
      subject_user_id: subject_user_id ?? null,
      provider: provider ?? DEFAULT_PROVIDER,
      created_by_email: email,
    })
    .select("*")
    .single();
  if (error || !contract) {
    console.error("create contract error:", error);
    res.status(500).json({ error: "契約の作成に失敗しました" });
    return;
  }

  // 署名者を一括挿入
  const partyRows = (parties as ContractPartyInput[]).map((p, idx) => ({
    contract_id: contract.id,
    role: p.role,
    name: p.name,
    email: p.email ?? null,
    phone: p.phone ?? null,
    relation_to_subject: p.relation_to_subject ?? null,
    signing_order: typeof p.signing_order === "number" ? p.signing_order : idx,
    is_signer: p.is_signer ?? true,
  }));
  const { error: pErr } = await supabase
    .from("contract_parties")
    .insert(partyRows);
  if (pErr) {
    console.error("insert contract_parties error:", pErr);
    // 本体は作成済み。ロールバックは Phase 3 では行わず draft のまま残す
  }

  await writeAuditLog({
    contractId: contract.id,
    actorEmail: email,
    actorRole: "admin",
    action: "contract_created",
    payload: { templateId: template_id, title, partiesCount: partyRows.length },
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  res.json({ success: true, contract });
}

export async function handleSendContract(
  req: Request,
  res: Response,
): Promise<void> {
  const email = getEmailFromReq(req);
  if (!isAdmin(email)) {
    res.status(403).json({ error: "管理者のみ操作できます" });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "id が必要です" });
    return;
  }

  // Phase 3 スタブ: 外部APIの実装が入るまではエラーを返す
  // 正式実装では:
  //  1) contracts + parties を取得
  //  2) テンプレート PDF を Storage から取得して field_values を差し込み
  //  3) provider.createAndSendDocument で送信
  //  4) contracts.status = 'pending_signature' + provider_document_id を保存
  //  5) contract_signatures を全署名者ぶん 'pending' で INSERT
  //  6) notifications に 'contract_sign_request' を送信
  //  7) writeAuditLog('contract_sent')
  const provider = getProvider(DEFAULT_PROVIDER);
  void provider;

  await writeAuditLog({
    contractId: id,
    actorEmail: email,
    actorRole: "admin",
    action: "contract_sent",
    payload: { note: "Phase 3 スタブ: 外部API未実装" },
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  res
    .status(501)
    .json({ error: "Phase 3 スタブ: 外部API送信は未実装です（providers/cloudsign.ts を実装する必要があります）" });
}

export async function handleRevokeContract(
  req: Request,
  res: Response,
): Promise<void> {
  const { email, reason } = req.body ?? {};
  if (!isAdmin(email)) {
    res.status(403).json({ error: "管理者のみ操作できます" });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "id が必要です" });
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("contracts")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_reason: reason ?? null,
    })
    .eq("id", id);
  if (error) {
    console.error("revoke contract error:", error);
    res.status(500).json({ error: "撤回に失敗しました" });
    return;
  }

  // 外部API 側の取り消しは未実装（Phase 3 スタブ）

  await writeAuditLog({
    contractId: id,
    actorEmail: email,
    actorRole: "admin",
    action: "contract_revoked",
    payload: { reason: reason ?? null },
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  res.json({ success: true });
}

export async function handleDownloadSigned(
  req: Request,
  res: Response,
): Promise<void> {
  const email = getEmailFromReq(req);
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "id が必要です" });
    return;
  }
  // Phase 3 スタブ: Storage からの Signed URL 発行は未実装
  await writeAuditLog({
    contractId: id,
    actorEmail: email,
    actorRole: isAdmin(email) ? "admin" : "helper",
    action: "document_downloaded",
    payload: { note: "Phase 3 スタブ" },
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });
  res
    .status(501)
    .json({ error: "Phase 3 スタブ: 署名済PDFの配布は未実装です" });
}

export async function handleListMyContracts(
  req: Request,
  res: Response,
): Promise<void> {
  const email = getEmailFromReq(req);
  if (!email) {
    res.status(400).json({ error: "email が必要です" });
    return;
  }

  const supabase = getSupabaseClient();
  // 自分宛契約 = 自分の email が contract_parties.email にあるもの
  const { data: parties, error: pErr } = await supabase
    .from("contract_parties")
    .select("contract_id")
    .ilike("email", email);
  if (pErr) {
    console.error("list my parties error:", pErr);
    res.status(500).json({ error: "取得に失敗しました" });
    return;
  }
  const ids = Array.from(
    new Set((parties ?? []).map((p) => p.contract_id as string)),
  );
  if (ids.length === 0) {
    res.json({ contracts: [] });
    return;
  }

  const { data, error } = await supabase
    .from("contracts")
    .select(
      "id, kind, title, status, created_at, sent_at, completed_at",
    )
    .in("id", ids)
    .neq("status", "draft")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("list my contracts error:", error);
    res.status(500).json({ error: "取得に失敗しました" });
    return;
  }
  res.json({ contracts: data ?? [] });
}

export async function handleGetSignUrl(
  req: Request,
  res: Response,
): Promise<void> {
  const email = getEmailFromReq(req);
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "id が必要です" });
    return;
  }
  void email;
  // Phase 3 スタブ: provider.getSignUrl の呼び出しは未実装
  res
    .status(501)
    .json({ error: "Phase 3 スタブ: 署名URLの発行は未実装です" });
}

export async function handleGetAuditLog(
  req: Request,
  res: Response,
): Promise<void> {
  const email = getEmailFromReq(req);
  if (!isAdmin(email)) {
    res.status(403).json({ error: "管理者のみ閲覧できます" });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "id が必要です" });
    return;
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("contract_audit_log")
    .select("id, actor_email, actor_role, action, payload, created_at")
    .eq("contract_id", id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("audit log error:", error);
    res.status(500).json({ error: "取得に失敗しました" });
    return;
  }
  res.json({ entries: data ?? [] });
}
