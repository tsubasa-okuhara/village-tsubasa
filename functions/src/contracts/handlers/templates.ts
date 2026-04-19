/**
 * 契約テンプレート管理ハンドラ（管理者専用）
 * GET    /api/contracts/templates
 * GET    /api/contracts/templates/:id
 * POST   /api/contracts/templates
 * POST   /api/contracts/templates/:id/new-version
 * POST   /api/contracts/templates/:id/deactivate
 */
import { Request, Response } from "express";
import { getSupabaseClient } from "../../lib/supabase";
import { writeAuditLog } from "../services/audit";
import {
  getEmailFromReq,
  getIp,
  getUserAgent,
  isAdmin,
} from "./common";

export async function handleListTemplates(
  req: Request,
  res: Response,
): Promise<void> {
  const email = getEmailFromReq(req);
  if (!isAdmin(email)) {
    res.status(403).json({ error: "管理者のみ閲覧できます" });
    return;
  }
  const includeInactive =
    (req.query.includeInactive as string | undefined) === "1";
  const kind = req.query.kind as string | undefined;

  const supabase = getSupabaseClient();
  let query = supabase
    .from("contract_templates")
    .select(
      "id, kind, title, version, is_active, created_by, created_at, updated_at, fillable_fields, signature_positions",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (!includeInactive) query = query.eq("is_active", true);
  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query;
  if (error) {
    console.error("list contract_templates error:", error);
    res.status(500).json({ error: "取得に失敗しました" });
    return;
  }
  res.json({ templates: data ?? [] });
}

export async function handleGetTemplate(
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
    .from("contract_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("get contract_template error:", error);
    res.status(500).json({ error: "取得に失敗しました" });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "該当テンプレートが見つかりません" });
    return;
  }
  res.json({ template: data });
}

export async function handleCreateTemplate(
  req: Request,
  res: Response,
): Promise<void> {
  const {
    email,
    kind,
    title,
    source_pdf_url,
    source_pdf_storage_key,
    fillable_fields,
    signature_positions,
  } = req.body ?? {};

  if (!isAdmin(email)) {
    res.status(403).json({ error: "管理者のみ操作できます" });
    return;
  }
  if (!kind || typeof kind !== "string") {
    res.status(400).json({ error: "kind が必要です" });
    return;
  }
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title が必要です" });
    return;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("contract_templates")
    .insert({
      kind,
      title: title.trim(),
      version: 1,
      source_pdf_url: source_pdf_url ?? null,
      source_pdf_storage_key: source_pdf_storage_key ?? null,
      fillable_fields: Array.isArray(fillable_fields) ? fillable_fields : [],
      signature_positions: Array.isArray(signature_positions)
        ? signature_positions
        : [],
      is_active: true,
      created_by: email,
    })
    .select("*")
    .single();

  if (error) {
    console.error("create contract_template error:", error);
    res.status(500).json({ error: "登録に失敗しました" });
    return;
  }

  await writeAuditLog({
    actorEmail: email,
    actorRole: "admin",
    action: "template_created",
    payload: { templateId: data.id, kind, title, version: 1 },
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  res.json({ success: true, template: data });
}

export async function handleNewTemplateVersion(
  req: Request,
  res: Response,
): Promise<void> {
  const email = getEmailFromReq(req);
  const { title, source_pdf_url, source_pdf_storage_key, fillable_fields, signature_positions } = req.body ?? {};
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
  const { data: orig, error: getErr } = await supabase
    .from("contract_templates")
    .select("id, kind, title, version")
    .eq("id", id)
    .maybeSingle();
  if (getErr || !orig) {
    res.status(404).json({ error: "テンプレートが見つかりません" });
    return;
  }

  const { data: newRow, error } = await supabase
    .from("contract_templates")
    .insert({
      kind: orig.kind,
      title: (title && typeof title === "string" ? title.trim() : orig.title),
      version: (orig.version ?? 1) + 1,
      source_pdf_url: source_pdf_url ?? null,
      source_pdf_storage_key: source_pdf_storage_key ?? null,
      fillable_fields: Array.isArray(fillable_fields) ? fillable_fields : [],
      signature_positions: Array.isArray(signature_positions)
        ? signature_positions
        : [],
      is_active: true,
      created_by: email,
    })
    .select("*")
    .single();

  if (error) {
    console.error("new-version insert error:", error);
    res.status(500).json({ error: "バージョン作成に失敗しました" });
    return;
  }

  // 旧バージョンは非アクティブ化
  await supabase
    .from("contract_templates")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  await writeAuditLog({
    actorEmail: email,
    actorRole: "admin",
    action: "template_updated",
    payload: {
      previousTemplateId: id,
      newTemplateId: newRow.id,
      newVersion: newRow.version,
    },
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  res.json({ success: true, template: newRow });
}

export async function handleDeactivateTemplate(
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

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("contract_templates")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("deactivate error:", error);
    res.status(500).json({ error: "停止に失敗しました" });
    return;
  }

  await writeAuditLog({
    actorEmail: email,
    actorRole: "admin",
    action: "template_deactivated",
    payload: { templateId: id },
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  res.json({ success: true });
}
