"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleListContracts = handleListContracts;
exports.handleGetContract = handleGetContract;
exports.handleCreateContract = handleCreateContract;
exports.handleSendContract = handleSendContract;
exports.handleRevokeContract = handleRevokeContract;
exports.handleDownloadSigned = handleDownloadSigned;
exports.handleListMyContracts = handleListMyContracts;
exports.handleGetSignUrl = handleGetSignUrl;
exports.handleGetAuditLog = handleGetAuditLog;
const supabase_1 = require("../../lib/supabase");
const audit_1 = require("../services/audit");
const providers_1 = require("../providers");
const common_1 = require("./common");
async function handleListContracts(req, res) {
    const email = (0, common_1.getEmailFromReq)(req);
    if (!(0, common_1.isAdmin)(email)) {
        res.status(403).json({ error: "管理者のみ閲覧できます" });
        return;
    }
    const kind = req.query.kind;
    const status = req.query.status;
    const helperId = req.query.helper_id;
    const subjectUserId = req.query.subject_user_id;
    const supabase = (0, supabase_1.getSupabaseClient)();
    let query = supabase
        .from("contracts")
        .select("id, template_id, template_version, kind, title, status, helper_id, subject_user_id, provider, created_by_email, created_at, sent_at, completed_at")
        .order("created_at", { ascending: false })
        .limit(200);
    if (kind)
        query = query.eq("kind", kind);
    if (status)
        query = query.eq("status", status);
    if (helperId)
        query = query.eq("helper_id", helperId);
    if (subjectUserId)
        query = query.eq("subject_user_id", subjectUserId);
    const { data, error } = await query;
    if (error) {
        console.error("list contracts error:", error);
        res.status(500).json({ error: "取得に失敗しました" });
        return;
    }
    res.json({ contracts: data ?? [] });
}
async function handleGetContract(req, res) {
    const email = (0, common_1.getEmailFromReq)(req);
    const id = req.params.id;
    if (!id) {
        res.status(400).json({ error: "id が必要です" });
        return;
    }
    const supabase = (0, supabase_1.getSupabaseClient)();
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
    const isSigner = (parties ?? []).some((p) => typeof p.email === "string" &&
        email &&
        p.email.trim().toLowerCase() === email.toLowerCase());
    if (!(0, common_1.isAdmin)(email) && !isSigner) {
        res.status(403).json({ error: "閲覧権限がありません" });
        return;
    }
    const { data: signatures } = await supabase
        .from("contract_signatures")
        .select("id, contract_id, party_id, provider_signer_id, status, signed_at, timestamp_token_url")
        .eq("contract_id", id);
    res.json({ contract, parties: parties ?? [], signatures: signatures ?? [] });
}
async function handleCreateContract(req, res) {
    const { email, template_id, title, field_values, helper_id, subject_user_id, parties, provider, } = req.body ?? {};
    if (!(0, common_1.isAdmin)(email)) {
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
    const supabase = (0, supabase_1.getSupabaseClient)();
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
        provider: provider ?? providers_1.DEFAULT_PROVIDER,
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
    const partyRows = parties.map((p, idx) => ({
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
    await (0, audit_1.writeAuditLog)({
        contractId: contract.id,
        actorEmail: email,
        actorRole: "admin",
        action: "contract_created",
        payload: { templateId: template_id, title, partiesCount: partyRows.length },
        ipAddress: (0, common_1.getIp)(req),
        userAgent: (0, common_1.getUserAgent)(req),
    });
    res.json({ success: true, contract });
}
async function handleSendContract(req, res) {
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
    // Phase 3 スタブ: 外部APIの実装が入るまではエラーを返す
    // 正式実装では:
    //  1) contracts + parties を取得
    //  2) テンプレート PDF を Storage から取得して field_values を差し込み
    //  3) provider.createAndSendDocument で送信
    //  4) contracts.status = 'pending_signature' + provider_document_id を保存
    //  5) contract_signatures を全署名者ぶん 'pending' で INSERT
    //  6) notifications に 'contract_sign_request' を送信
    //  7) writeAuditLog('contract_sent')
    const provider = (0, providers_1.getProvider)(providers_1.DEFAULT_PROVIDER);
    void provider;
    await (0, audit_1.writeAuditLog)({
        contractId: id,
        actorEmail: email,
        actorRole: "admin",
        action: "contract_sent",
        payload: { note: "Phase 3 スタブ: 外部API未実装" },
        ipAddress: (0, common_1.getIp)(req),
        userAgent: (0, common_1.getUserAgent)(req),
    });
    res
        .status(501)
        .json({ error: "Phase 3 スタブ: 外部API送信は未実装です（providers/cloudsign.ts を実装する必要があります）" });
}
async function handleRevokeContract(req, res) {
    const { email, reason } = req.body ?? {};
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
    await (0, audit_1.writeAuditLog)({
        contractId: id,
        actorEmail: email,
        actorRole: "admin",
        action: "contract_revoked",
        payload: { reason: reason ?? null },
        ipAddress: (0, common_1.getIp)(req),
        userAgent: (0, common_1.getUserAgent)(req),
    });
    res.json({ success: true });
}
async function handleDownloadSigned(req, res) {
    const email = (0, common_1.getEmailFromReq)(req);
    const id = req.params.id;
    if (!id) {
        res.status(400).json({ error: "id が必要です" });
        return;
    }
    // Phase 3 スタブ: Storage からの Signed URL 発行は未実装
    await (0, audit_1.writeAuditLog)({
        contractId: id,
        actorEmail: email,
        actorRole: (0, common_1.isAdmin)(email) ? "admin" : "helper",
        action: "document_downloaded",
        payload: { note: "Phase 3 スタブ" },
        ipAddress: (0, common_1.getIp)(req),
        userAgent: (0, common_1.getUserAgent)(req),
    });
    res
        .status(501)
        .json({ error: "Phase 3 スタブ: 署名済PDFの配布は未実装です" });
}
async function handleListMyContracts(req, res) {
    const email = (0, common_1.getEmailFromReq)(req);
    if (!email) {
        res.status(400).json({ error: "email が必要です" });
        return;
    }
    const supabase = (0, supabase_1.getSupabaseClient)();
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
    const ids = Array.from(new Set((parties ?? []).map((p) => p.contract_id)));
    if (ids.length === 0) {
        res.json({ contracts: [] });
        return;
    }
    const { data, error } = await supabase
        .from("contracts")
        .select("id, kind, title, status, created_at, sent_at, completed_at")
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
async function handleGetSignUrl(req, res) {
    const email = (0, common_1.getEmailFromReq)(req);
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
async function handleGetAuditLog(req, res) {
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
