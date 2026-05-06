"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleListTemplates = handleListTemplates;
exports.handleGetTemplate = handleGetTemplate;
exports.handleCreateTemplate = handleCreateTemplate;
exports.handleNewTemplateVersion = handleNewTemplateVersion;
exports.handleDeactivateTemplate = handleDeactivateTemplate;
const supabase_1 = require("../../lib/supabase");
const audit_1 = require("../services/audit");
const common_1 = require("./common");
async function handleListTemplates(req, res) {
    const email = (0, common_1.getEmailFromReq)(req);
    if (!(0, common_1.isAdmin)(email)) {
        res.status(403).json({ error: "管理者のみ閲覧できます" });
        return;
    }
    const includeInactive = req.query.includeInactive === "1";
    const kind = req.query.kind;
    const supabase = (0, supabase_1.getSupabaseClient)();
    let query = supabase
        .from("contract_templates")
        .select("id, kind, title, version, is_active, created_by, created_at, updated_at, fillable_fields, signature_positions")
        .order("created_at", { ascending: false })
        .limit(200);
    if (!includeInactive)
        query = query.eq("is_active", true);
    if (kind)
        query = query.eq("kind", kind);
    const { data, error } = await query;
    if (error) {
        console.error("list contract_templates error:", error);
        res.status(500).json({ error: "取得に失敗しました" });
        return;
    }
    res.json({ templates: data ?? [] });
}
async function handleGetTemplate(req, res) {
    const email = (0, common_1.getEmailFromReq)(req);
    if (!(0, common_1.isAdmin)(email)) {
        res.status(403).json({ error: "管理者のみ閲覧できます" });
        return;
    }
    const id = req.params.id;
    if (!id) {
        res.status(400).json({ error: "id が必要です" });
        return;
    }
    const supabase = (0, supabase_1.getSupabaseClient)();
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
async function handleCreateTemplate(req, res) {
    const { email, kind, title, source_pdf_url, source_pdf_storage_key, fillable_fields, signature_positions, } = req.body ?? {};
    if (!(0, common_1.isAdmin)(email)) {
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
    const supabase = (0, supabase_1.getSupabaseClient)();
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
    await (0, audit_1.writeAuditLog)({
        actorEmail: email,
        actorRole: "admin",
        action: "template_created",
        payload: { templateId: data.id, kind, title, version: 1 },
        ipAddress: (0, common_1.getIp)(req),
        userAgent: (0, common_1.getUserAgent)(req),
    });
    res.json({ success: true, template: data });
}
async function handleNewTemplateVersion(req, res) {
    const email = (0, common_1.getEmailFromReq)(req);
    const { title, source_pdf_url, source_pdf_storage_key, fillable_fields, signature_positions } = req.body ?? {};
    if (!(0, common_1.isAdmin)(email)) {
        res.status(403).json({ error: "管理者のみ操作できます" });
        return;
    }
    const id = req.params.id;
    if (!id) {
        res.status(400).json({ error: "id が必要です" });
        return;
    }
    const supabase = (0, supabase_1.getSupabaseClient)();
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
    await (0, audit_1.writeAuditLog)({
        actorEmail: email,
        actorRole: "admin",
        action: "template_updated",
        payload: {
            previousTemplateId: id,
            newTemplateId: newRow.id,
            newVersion: newRow.version,
        },
        ipAddress: (0, common_1.getIp)(req),
        userAgent: (0, common_1.getUserAgent)(req),
    });
    res.json({ success: true, template: newRow });
}
async function handleDeactivateTemplate(req, res) {
    const email = (0, common_1.getEmailFromReq)(req);
    if (!(0, common_1.isAdmin)(email)) {
        res.status(403).json({ error: "管理者のみ操作できます" });
        return;
    }
    const id = req.params.id;
    if (!id) {
        res.status(400).json({ error: "id が必要です" });
        return;
    }
    const supabase = (0, supabase_1.getSupabaseClient)();
    const { error } = await supabase
        .from("contract_templates")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
    if (error) {
        console.error("deactivate error:", error);
        res.status(500).json({ error: "停止に失敗しました" });
        return;
    }
    await (0, audit_1.writeAuditLog)({
        actorEmail: email,
        actorRole: "admin",
        action: "template_deactivated",
        payload: { templateId: id },
        ipAddress: (0, common_1.getIp)(req),
        userAgent: (0, common_1.getUserAgent)(req),
    });
    res.json({ success: true });
}
