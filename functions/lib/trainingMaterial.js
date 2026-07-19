"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCreateTrainingMaterial = handleCreateTrainingMaterial;
exports.handleListTrainingMaterials = handleListTrainingMaterials;
exports.handleGetTrainingMaterial = handleGetTrainingMaterial;
exports.handleDeleteTrainingMaterial = handleDeleteTrainingMaterial;
exports.handleUpdateTrainingMaterial = handleUpdateTrainingMaterial;
const supabase_1 = require("./lib/supabase");
const openai_1 = require("./lib/openai");
const ADMIN_EMAIL = "admin@village-support.jp";
function isAdmin(email) {
    return (typeof email === "string" &&
        email.trim().toLowerCase() === ADMIN_EMAIL);
}
/**
 * 研修資料の本文テキストから学習チェック5項目を生成
 */
async function generateChecklistItems(trainingName, materialContent) {
    const openai = (0, openai_1.getOpenAIClient)();
    // 長すぎる資料は冒頭 8000 文字程度に切り詰め（gpt-4o-mini のトークン節約）
    const trimmed = materialContent.slice(0, 8000);
    const systemPrompt = `あなたは福祉事業所「ビレッジ翼」の研修担当アシスタントです。
与えられた研修資料から、ヘルパーさんが「学んだこと」を自己チェックできる項目を **ちょうど5個** 作ってください。

【ルール】
1. 各項目は「〜を理解した」「〜を学んだ」「〜ができるようになった」のような、学習者が自分にチェックする形の短い文にする
2. 1項目は30〜55文字程度。簡潔で具体的に
3. 資料の重要ポイントを網羅する5項目にする（冒頭だけ/末尾だけに偏らない）
4. 同じような内容を繰り返さない
5. 専門用語があれば自然に残す
6. 出力は必ず次の JSON 形式のみ（説明文・前後のコードブロックは一切不要）:
{"summary":"この資料で学べる内容の一言要約(40〜80文字)","items":[{"id":1,"text":"..."},{"id":2,"text":"..."},{"id":3,"text":"..."},{"id":4,"text":"..."},{"id":5,"text":"..."}]}`;
    const userPrompt = `研修名: ${trainingName}

【研修資料本文】
${trimmed}`;
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 1000,
        response_format: { type: "json_object" },
    });
    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (e) {
        throw new Error("AI応答のJSONパースに失敗しました");
    }
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    // 5個に正規化（多すぎれば切り捨て、少なければ空で埋める）
    const normalized = [];
    for (let i = 0; i < 5; i += 1) {
        const src = items[i];
        const text = src && typeof src.text === "string" ? src.text.trim() : "";
        normalized.push({
            id: i + 1,
            text: text || `学習項目${i + 1}`,
        });
    }
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    return { items: normalized, summary };
}
/**
 * 研修資料を登録
 * POST /api/training-materials
 * Body: { email, trainingName, trainingDate?, trainingHours?, trainingFormat?, materialContent, materialFilename? }
 *  - AIが自動的に学習チェック5項目を生成して一緒に保存
 */
async function handleCreateTrainingMaterial(req, res) {
    try {
        const { email, trainingName, trainingDate, trainingHours, trainingFormat, materialContent, materialFilename, 
        // 管理者が手動で調整した場合は checklistItems を直接指定することも可能
        checklistItems: manualItems, } = req.body;
        if (!isAdmin(email)) {
            res.status(403).json({ error: "管理者のみ操作できます" });
            return;
        }
        if (!trainingName ||
            typeof trainingName !== "string" ||
            trainingName.trim().length === 0) {
            res.status(400).json({ error: "研修名を入力してください" });
            return;
        }
        if (!materialContent ||
            typeof materialContent !== "string" ||
            materialContent.trim().length === 0) {
            res
                .status(400)
                .json({ error: "研修資料の本文を入力または貼り付けてください" });
            return;
        }
        if (materialContent.length > 60000) {
            res
                .status(400)
                .json({ error: "資料が長すぎます（60000文字以内にしてください）" });
            return;
        }
        // AIで5項目を生成（手動指定があればスキップ）
        let checklistItems;
        let summary = "";
        if (Array.isArray(manualItems) && manualItems.length === 5) {
            checklistItems = manualItems.map((it, i) => ({
                id: i + 1,
                text: (it?.text ?? "").toString().trim() || `学習項目${i + 1}`,
            }));
        }
        else {
            try {
                const gen = await generateChecklistItems(trainingName.trim(), materialContent.trim());
                checklistItems = gen.items;
                summary = gen.summary;
            }
            catch (err) {
                console.error("checklist generation failed:", err);
                res
                    .status(500)
                    .json({ error: "学習項目の生成に失敗しました。少し待って再度お試しください。" });
                return;
            }
        }
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { data, error } = await supabase
            .from("training_materials")
            .insert({
            training_name: trainingName.trim(),
            training_date: trainingDate || null,
            training_hours: trainingHours || null,
            training_format: trainingFormat || null,
            material_content: materialContent.trim(),
            material_filename: materialFilename || null,
            material_summary: summary || null,
            checklist_items: checklistItems,
            is_active: true,
            created_by: email,
        })
            .select("*")
            .single();
        if (error) {
            console.error("training_materials insert error:", error);
            res.status(500).json({ error: "保存に失敗しました" });
            return;
        }
        res.json({ success: true, material: data });
    }
    catch (err) {
        console.error("Create training material error:", err);
        res.status(500).json({ error: "登録に失敗しました" });
    }
}
/**
 * 研修資料の一覧取得
 * GET /api/training-materials?email=xxx&includeInactive=1
 *  - email 無しでも取得できる（ヘルパー画面でアクティブな資料を出すため）
 *  - includeInactive=1 は管理者のみ
 */
async function handleListTrainingMaterials(req, res) {
    try {
        const email = req.query.email ?? "";
        const includeInactive = req.query.includeInactive === "1";
        const adminAccess = isAdmin(email);
        if (includeInactive && !adminAccess) {
            res.status(403).json({ error: "管理者のみ閲覧できます" });
            return;
        }
        const supabase = (0, supabase_1.getSupabaseClient)();
        let query = supabase
            .from("training_materials")
            .select(adminAccess
            ? "id, training_name, training_date, training_hours, training_format, material_content, material_filename, material_summary, checklist_items, is_active, created_by, created_at, updated_at"
            : // ヘルパー画面にはmaterial_contentを返さない（重いしネタバレになる）
                "id, training_name, training_date, training_hours, training_format, material_filename, material_summary, checklist_items, is_active, created_at")
            .order("created_at", { ascending: false })
            .limit(100);
        if (!includeInactive) {
            query = query.eq("is_active", true);
        }
        const { data, error } = await query;
        if (error) {
            console.error("list training_materials error:", error);
            res.status(500).json({ error: "取得に失敗しました" });
            return;
        }
        res.json({ materials: data || [] });
    }
    catch (err) {
        console.error("List training materials error:", err);
        res.status(500).json({ error: "取得に失敗しました" });
    }
}
/**
 * 研修資料1件の取得
 * GET /api/training-materials/:id?email=xxx
 *  - 管理者のみ material_content も返す
 */
async function handleGetTrainingMaterial(req, res) {
    try {
        const id = req.params.id;
        if (!id) {
            res.status(400).json({ error: "idが必要です" });
            return;
        }
        const email = req.query.email ?? "";
        const adminAccess = isAdmin(email);
        const supabase = (0, supabase_1.getSupabaseClient)();
        // 単体取得はヘルパーにも本文を返す（資料を読みながらチェックを入れるため）
        const { data, error } = await supabase
            .from("training_materials")
            .select("id, training_name, training_date, training_hours, training_format, material_content, material_filename, material_summary, checklist_items, is_active, created_by, created_at, updated_at")
            .eq("id", id)
            .maybeSingle();
        if (error) {
            console.error("get training_material error:", error);
            res.status(500).json({ error: "取得に失敗しました" });
            return;
        }
        if (!data) {
            res.status(404).json({ error: "該当する研修資料がありません" });
            return;
        }
        // ヘルパーアクセスには管理者専用フィールドを除外
        if (!adminAccess) {
            const publicData = { ...data };
            delete publicData.created_by;
            delete publicData.updated_at;
            res.json({ material: publicData });
            return;
        }
        res.json({ material: data });
    }
    catch (err) {
        console.error("Get training material error:", err);
        res.status(500).json({ error: "取得に失敗しました" });
    }
}
/**
 * 研修資料の完全削除
 * POST /api/training-materials/delete
 * Body: { email, id }
 *  - 紐付いた training_reports.training_material_id は ON DELETE SET NULL
 */
async function handleDeleteTrainingMaterial(req, res) {
    try {
        const { email, id } = req.body;
        if (!isAdmin(email)) {
            res.status(403).json({ error: "管理者のみ操作できます" });
            return;
        }
        if (!id) {
            res.status(400).json({ error: "idが必要です" });
            return;
        }
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { error } = await supabase
            .from("training_materials")
            .delete()
            .eq("id", id);
        if (error) {
            console.error("training_material delete error:", error);
            res.status(500).json({ error: "削除に失敗しました" });
            return;
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error("Delete training material error:", err);
        res.status(500).json({ error: "削除に失敗しました" });
    }
}
/**
 * 研修資料の更新（項目差し替え / 無効化など）
 * POST /api/training-materials/update
 * Body: { email, id, checklistItems?, isActive?, trainingName?, trainingDate?, trainingHours?, trainingFormat? }
 */
async function handleUpdateTrainingMaterial(req, res) {
    try {
        const { email, id, checklistItems, isActive, trainingName, trainingDate, trainingHours, trainingFormat, } = req.body;
        if (!isAdmin(email)) {
            res.status(403).json({ error: "管理者のみ操作できます" });
            return;
        }
        if (!id) {
            res.status(400).json({ error: "idが必要です" });
            return;
        }
        const patch = {
            updated_at: new Date().toISOString(),
        };
        if (Array.isArray(checklistItems)) {
            const normalized = [];
            for (let i = 0; i < 5; i += 1) {
                const src = checklistItems[i];
                const text = src && typeof src.text === "string" ? src.text.trim() : "";
                normalized.push({ id: i + 1, text: text || `学習項目${i + 1}` });
            }
            patch.checklist_items = normalized;
        }
        if (typeof isActive === "boolean")
            patch.is_active = isActive;
        if (typeof trainingName === "string" && trainingName.trim())
            patch.training_name = trainingName.trim();
        if (trainingDate)
            patch.training_date = trainingDate;
        if (trainingHours !== undefined)
            patch.training_hours = trainingHours || null;
        if (trainingFormat !== undefined)
            patch.training_format = trainingFormat || null;
        const supabase = (0, supabase_1.getSupabaseClient)();
        const { error } = await supabase
            .from("training_materials")
            .update(patch)
            .eq("id", id);
        if (error) {
            console.error("update training_material error:", error);
            res.status(500).json({ error: "更新に失敗しました" });
            return;
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error("Update training material error:", err);
        res.status(500).json({ error: "更新に失敗しました" });
    }
}
