"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleHelperLookup = handleHelperLookup;
exports.handleSubmitTrainingReport = handleSubmitTrainingReport;
exports.handleSubmitTrainingNotice = handleSubmitTrainingNotice;
exports.handleGetTrainingReports = handleGetTrainingReports;
exports.handleDeleteTrainingReport = handleDeleteTrainingReport;
exports.handleUpdateTrainingReportStatus = handleUpdateTrainingReportStatus;
const supabase_1 = require("./lib/supabase");
const openai_1 = require("./lib/openai");
/**
 * helper_master から email を使ってヘルパー名を検索
 * 見つからなければ null を返す（例外は投げない）
 */
async function lookupHelperNameByEmail(email) {
    if (!email || typeof email !== "string")
        return null;
    const normalized = email.trim().toLowerCase();
    if (!normalized)
        return null;
    try {
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data, error } = await supabase
            .from("helper_master")
            .select("helper_name, helper_email")
            .ilike("helper_email", normalized)
            .limit(1)
            .maybeSingle();
        if (error) {
            console.warn("helper_master lookup error:", error);
            return null;
        }
        return data?.helper_name ?? null;
    }
    catch (err) {
        console.warn("helper_master lookup exception:", err);
        return null;
    }
}
/**
 * ヘルパーのメールアドレスから名前を引く軽量API
 * GET /api/helpers/lookup?email=xxx
 */
async function handleHelperLookup(req, res) {
    try {
        const email = req.query.email ?? "";
        const normalized = email.trim().toLowerCase();
        if (!normalized) {
            res.status(400).json({ error: "emailを指定してください" });
            return;
        }
        const name = await lookupHelperNameByEmail(normalized);
        if (!name) {
            res.status(404).json({ error: "該当するヘルパーが見つかりません" });
            return;
        }
        res.json({ name, email: normalized });
    }
    catch (err) {
        console.error("Helper lookup error:", err);
        res.status(500).json({ error: "検索に失敗しました" });
    }
}
/**
 * ヘルパー研修報告の投稿
 * POST /api/training-reports
 * Body: {
 *   helperEmail, helperName,
 *   // --- 資料ベースの報告（推奨ルート） ---
 *   trainingMaterialId?, checklistAnswers?, extraComments?,
 *   // --- 自由記述（後方互換。資料IDが無いときだけ利用） ---
 *   trainingName?, trainingDate?, trainingHours?, trainingFormat?, comment?
 * }
 */
async function handleSubmitTrainingReport(req, res) {
    try {
        const { helperEmail, helperName, trainingName: bodyTrainingName, trainingDate: bodyTrainingDate, trainingHours: bodyTrainingHours, trainingFormat: bodyTrainingFormat, comment, trainingMaterialId, checklistAnswers, extraComments, } = req.body;
        const supabase = (0, supabase_1.getSupabaseClient)();
        // 資料ベース報告の場合、資料から情報を引いて研修名・日付を埋める
        let materialRecord = null;
        if (trainingMaterialId) {
            const { data: mData, error: mErr } = await supabase
                .from("training_materials")
                .select("id, training_name, training_date, training_hours, training_format, checklist_items, is_active")
                .eq("id", trainingMaterialId)
                .maybeSingle();
            if (mErr) {
                console.error("material fetch error:", mErr);
            }
            if (!mData) {
                res.status(400).json({ error: "指定された研修資料が見つかりません" });
                return;
            }
            if (mData.is_active === false) {
                res
                    .status(400)
                    .json({ error: "この研修資料は現在使用できません" });
                return;
            }
            materialRecord = {
                id: mData.id,
                training_name: mData.training_name,
                training_date: mData.training_date,
                training_hours: mData.training_hours,
                training_format: mData.training_format,
                checklist_items: mData.checklist_items,
            };
        }
        // 研修名・日付の決定（資料があれば資料を優先、なければ body の値）
        const finalTrainingName = materialRecord?.training_name ??
            (typeof bodyTrainingName === "string" ? bodyTrainingName.trim() : "");
        const finalTrainingDate = materialRecord?.training_date ?? bodyTrainingDate ?? null;
        const finalTrainingHours = materialRecord?.training_hours ?? bodyTrainingHours ?? null;
        const finalTrainingFormat = materialRecord?.training_format ?? bodyTrainingFormat ?? null;
        if (!finalTrainingName) {
            res.status(400).json({ error: "研修名を入力してください" });
            return;
        }
        if (!finalTrainingDate) {
            res.status(400).json({ error: "実施日を入力してください" });
            return;
        }
        // 資料ベースの場合はコメント省略可。自由記述の場合はコメント必須
        const commentText = typeof comment === "string" ? comment.trim() : "";
        if (!materialRecord && !commentText) {
            res
                .status(400)
                .json({ error: "学んだ内容・所感を入力してください" });
            return;
        }
        if (commentText.length > 3000) {
            res
                .status(400)
                .json({ error: "所感は3000文字以内にしてください" });
            return;
        }
        // チェック回答の正規化
        let normalizedChecklist = null;
        if (materialRecord && Array.isArray(materialRecord.checklist_items)) {
            const answersMap = {};
            if (Array.isArray(checklistAnswers)) {
                for (const a of checklistAnswers) {
                    if (a && typeof a === "object") {
                        const id = Number(a.id);
                        const checked = Boolean(a.checked);
                        if (Number.isFinite(id))
                            answersMap[id] = checked;
                    }
                }
            }
            normalizedChecklist = materialRecord.checklist_items.map((item) => ({
                id: item.id,
                text: item.text,
                checked: Boolean(answersMap[item.id]),
            }));
        }
        // 感想コメント（最大3つ）の正規化
        let normalizedExtra = null;
        if (Array.isArray(extraComments)) {
            normalizedExtra = extraComments
                .slice(0, 3)
                .map((c) => (typeof c === "string" ? c.trim() : ""))
                .filter((c) => c.length > 0);
            // 各コメントの長さ制限
            for (const c of normalizedExtra) {
                if (c.length > 500) {
                    res.status(400).json({ error: "感想は各500文字以内にしてください" });
                    return;
                }
            }
            if (normalizedExtra.length === 0)
                normalizedExtra = null;
        }
        // helper_master からメールに該当する名前を取得（あれば優先）
        const normalizedEmail = typeof helperEmail === "string" && helperEmail.trim()
            ? helperEmail.trim().toLowerCase()
            : null;
        const resolvedHelperName = (await lookupHelperNameByEmail(normalizedEmail)) ||
            (typeof helperName === "string" && helperName.trim()
                ? helperName.trim()
                : null);
        // 重複送信の検知（直近15秒以内に同じヘルパー+同じ資料で送信があれば
        // 「既に受け付けています」で soft success を返す。ネットワーク再送やダブルクリック対策）
        if (normalizedEmail && materialRecord?.id) {
            const fifteenSecondsAgo = new Date(Date.now() - 15 * 1000).toISOString();
            const { data: recentDup } = await supabase
                .from("training_reports")
                .select("id, created_at")
                .eq("report_type", "helper_report")
                .eq("helper_email", normalizedEmail)
                .eq("training_material_id", materialRecord.id)
                .gte("created_at", fifteenSecondsAgo)
                .limit(1)
                .maybeSingle();
            if (recentDup && recentDup.id) {
                res.json({
                    success: true,
                    message: "研修報告は既に受け付けています。ありがとうございます！",
                    helperName: resolvedHelperName,
                    duplicate: true,
                });
                return;
            }
        }
        // AI整形用のテキストを組み立て
        const aiSourceParts = [];
        if (normalizedChecklist) {
            const checkedItems = normalizedChecklist
                .filter((i) => i.checked)
                .map((i) => "・" + i.text);
            if (checkedItems.length > 0) {
                aiSourceParts.push("【学習チェックで達成できた項目】\n" + checkedItems.join("\n"));
            }
            const uncheckedItems = normalizedChecklist
                .filter((i) => !i.checked)
                .map((i) => "・" + i.text);
            if (uncheckedItems.length > 0) {
                aiSourceParts.push("【まだ理解しきれていない項目】\n" + uncheckedItems.join("\n"));
            }
        }
        if (normalizedExtra && normalizedExtra.length > 0) {
            aiSourceParts.push("【ヘルパーの感想】\n" +
                normalizedExtra.map((c) => "・" + c).join("\n"));
        }
        if (commentText) {
            aiSourceParts.push("【所感】\n" + commentText);
        }
        const aiSource = aiSourceParts.join("\n\n");
        // AIで整形（失敗時は元のテキストをそのまま使う）
        let aiComment = aiSource;
        if (aiSource) {
            try {
                aiComment = await transformCommentWithAI(aiSource);
            }
            catch (aiErr) {
                console.warn("AI transform failed, using raw:", aiErr);
                aiComment = aiSource;
            }
        }
        const { error } = await supabase.from("training_reports").insert({
            report_type: "helper_report",
            training_name: finalTrainingName,
            training_date: finalTrainingDate,
            training_hours: finalTrainingHours,
            training_format: finalTrainingFormat,
            helper_email: normalizedEmail,
            helper_name: resolvedHelperName,
            original_comment: commentText || null,
            ai_comment: aiComment || null,
            training_material_id: materialRecord?.id ?? null,
            checklist_answers: normalizedChecklist,
            extra_comments: normalizedExtra,
            status: "unread",
        });
        if (error) {
            console.error("Training report insert error:", error);
            res.status(500).json({ error: "保存に失敗しました" });
            return;
        }
        res.json({
            success: true,
            message: "研修報告を送信しました。ありがとうございます！",
            helperName: resolvedHelperName,
        });
    }
    catch (err) {
        console.error("Training report submit error:", err);
        res
            .status(500)
            .json({ error: "送信に失敗しました。しばらくしてからもう一度お試しください。" });
    }
}
/**
 * AIで研修所感を読みやすく整形
 */
async function transformCommentWithAI(originalComment) {
    const openai = (0, openai_1.getOpenAIClient)();
    const systemPrompt = `あなたは福祉事業所「ビレッジ翼」の研修記録アシスタントです。
ヘルパーさんが書いた研修の所感・学びを、以下のルールで整えてください。

【ルール】
1. 元の学び・気づき・感想の内容は正確に保つこと
2. 読みやすく、分かりやすい文章に整える
3. 箇条書きが適切な場合は箇条書きにしてもよい
4. 専門用語があれば自然に残す
5. 管理者が読んで「しっかり学んでいるな」と感じるトーンにする
6. 出力は整形後のテキストのみ（説明や注釈は不要）
7. 敬語は使うが、堅すぎない自然な日本語にする
8. 元の文章が既に丁寧であれば、大きく変えずにそのまま整える`;
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: originalComment },
        ],
        temperature: 0.4,
        max_tokens: 1500,
    });
    const transformed = response.choices[0]?.message?.content?.trim();
    if (!transformed) {
        return originalComment;
    }
    return transformed;
}
/**
 * 管理者からの研修お知らせ投稿
 * POST /api/training-reports/notice
 * Body: { email, trainingName, trainingDate, trainingHours, trainingFormat, noticeBody }
 */
async function handleSubmitTrainingNotice(req, res) {
    try {
        const { email, trainingName, trainingDate, trainingHours, trainingFormat, noticeBody, } = req.body;
        if (!email || email.toLowerCase() !== "admin@village-support.jp") {
            res.status(403).json({ error: "管理者のみ投稿できます" });
            return;
        }
        if (!trainingName ||
            typeof trainingName !== "string" ||
            trainingName.trim().length === 0) {
            res.status(400).json({ error: "研修名を入力してください" });
            return;
        }
        if (!trainingDate) {
            res.status(400).json({ error: "実施日を入力してください" });
            return;
        }
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { error } = await supabase.from("training_reports").insert({
            report_type: "admin_notice",
            training_name: trainingName.trim(),
            training_date: trainingDate,
            training_hours: trainingHours || null,
            training_format: trainingFormat || null,
            admin_email: email,
            notice_body: noticeBody ? noticeBody.trim() : null,
            status: "unread",
        });
        if (error) {
            console.error("Training notice insert error:", error);
            res.status(500).json({ error: "保存に失敗しました" });
            return;
        }
        res.json({ success: true, message: "研修お知らせを投稿しました" });
    }
    catch (err) {
        console.error("Training notice submit error:", err);
        res.status(500).json({ error: "投稿に失敗しました" });
    }
}
/**
 * 研修報告一覧取得（管理者用）
 * GET /api/training-reports?status=unread&type=helper_report
 */
async function handleGetTrainingReports(req, res) {
    try {
        const adminEmail = req.query.email;
        if (!adminEmail || adminEmail.toLowerCase() !== "admin@village-support.jp") {
            res.status(403).json({ error: "管理者のみ閲覧できます" });
            return;
        }
        const statusFilter = req.query.status;
        const typeFilter = req.query.type;
        const supabase = (0, supabase_1.getSupabaseClient)();
        let query = supabase
            .from("training_reports")
            .select("id, report_type, training_name, training_date, training_hours, training_format, helper_email, helper_name, original_comment, ai_comment, admin_email, notice_body, training_material_id, checklist_answers, extra_comments, status, created_at")
            .order("created_at", { ascending: false })
            .limit(100);
        if (statusFilter && ["unread", "read", "archived"].includes(statusFilter)) {
            query = query.eq("status", statusFilter);
        }
        if (typeFilter &&
            ["helper_report", "admin_notice"].includes(typeFilter)) {
            query = query.eq("report_type", typeFilter);
        }
        const { data, error } = await query;
        if (error) {
            console.error("Training reports fetch error:", error);
            res.status(500).json({ error: "取得に失敗しました" });
            return;
        }
        res.json({ reports: data || [] });
    }
    catch (err) {
        console.error("Training reports fetch error:", err);
        res.status(500).json({ error: "取得に失敗しました" });
    }
}
/**
 * 研修報告・お知らせの完全削除（管理者用）
 * POST /api/training-reports/delete
 * Body: { id, email }
 */
async function handleDeleteTrainingReport(req, res) {
    try {
        const { id, email } = req.body;
        if (!email || email.toLowerCase() !== "admin@village-support.jp") {
            res.status(403).json({ error: "管理者のみ操作できます" });
            return;
        }
        if (!id) {
            res.status(400).json({ error: "IDが必要です" });
            return;
        }
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { error } = await supabase
            .from("training_reports")
            .delete()
            .eq("id", id);
        if (error) {
            console.error("Training report delete error:", error);
            res.status(500).json({ error: "削除に失敗しました" });
            return;
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error("Training report delete error:", err);
        res.status(500).json({ error: "削除に失敗しました" });
    }
}
/**
 * 研修報告のステータス更新（管理者用）
 * POST /api/training-reports/update-status
 * Body: { id, status, email }
 */
async function handleUpdateTrainingReportStatus(req, res) {
    try {
        const { id, status, email } = req.body;
        if (!email || email.toLowerCase() !== "admin@village-support.jp") {
            res.status(403).json({ error: "管理者のみ操作できます" });
            return;
        }
        if (!id || !status) {
            res.status(400).json({ error: "IDとステータスが必要です" });
            return;
        }
        const validStatuses = ["unread", "read", "archived"];
        if (!validStatuses.includes(status)) {
            res.status(400).json({ error: "無効なステータスです" });
            return;
        }
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { error } = await supabase
            .from("training_reports")
            .update({ status })
            .eq("id", id);
        if (error) {
            console.error("Training report status update error:", error);
            res.status(500).json({ error: "更新に失敗しました" });
            return;
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error("Training report status update error:", err);
        res.status(500).json({ error: "更新に失敗しました" });
    }
}
