"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGenerateHomeSummary = handleGenerateHomeSummary;
const openai_1 = __importDefault(require("openai"));
// 同じ利用者の過去記録を「書き方の手本」としてのみ渡す。空要素は除外し最大5件に制限。
const MAX_REFERENCE_NOTES = 5;
function getReferenceNotes(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .slice(0, MAX_REFERENCE_NOTES);
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function getStringValue(value) {
    return String(value ?? "").trim();
}
function getItems(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}
function buildTimeRange(startTime, endTime) {
    if (startTime && endTime) {
        return `${startTime}〜${endTime}`;
    }
    return startTime || endTime || "時間未設定";
}
function buildFallbackSummary(body) {
    const userName = getStringValue(body.userName) || "利用者";
    const serviceDate = getStringValue(body.serviceDate) || "本日";
    const startTime = getStringValue(body.startTime);
    const endTime = getStringValue(body.endTime);
    const category = getStringValue(body.category) || "身体介護";
    const otherDetail = getStringValue(body.otherDetail);
    const memo = getStringValue(body.memo);
    const items = getItems(body.items);
    const detailItems = [...items];
    if (otherDetail) {
        detailItems.push(otherDetail);
    }
    const detailText = detailItems.length > 0 ? detailItems.join("、") : "必要な支援";
    const sentences = [
        `${serviceDate} ${buildTimeRange(startTime, endTime)}、${userName}様へ${category}を実施しました。`,
        `実施内容: ${detailText}。`,
    ];
    if (memo) {
        sentences.push(`特記事項: ${memo}。`);
    }
    return sentences.join("");
}
async function handleGenerateHomeSummary(req, res) {
    if (!isObject(req.body)) {
        res.status(400).json({
            ok: false,
            message: "invalid request body",
        });
        return;
    }
    const body = req.body;
    const helperName = getStringValue(body.helperName);
    const userName = getStringValue(body.userName);
    const serviceDate = getStringValue(body.serviceDate);
    const startTime = getStringValue(body.startTime);
    const endTime = getStringValue(body.endTime);
    const category = getStringValue(body.category);
    const otherDetail = getStringValue(body.otherDetail);
    const memo = getStringValue(body.memo);
    const items = getItems(body.items);
    const referenceNotes = getReferenceNotes(body.referenceNotes);
    const itemText = [...items, ...(otherDetail ? [otherDetail] : [])].join("、") ||
        "必要な支援";
    // 参考記録がある場合のみ、手本ブロックを組み立てる。事実の流用は禁止する。
    const referenceBlock = referenceNotes.length > 0
        ? `

【参考記録（書き方の手本としてのみ使う）】
${referenceNotes.map((note, index) => `${index + 1}. ${note}`).join("\n")}

※ 上の参考記録は文体・書き方の手本として使う。参考記録と同程度の詳しさ・観察の粒度で書き、実施内容だけでなく利用者の様子や気づきも参考記録の書きぶりに倣うこと。ただし日付・時刻・外出先・人物など具体的な"事実"は流用せず、当日の【入力】の値だけを使うこと。`
        : "";
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            res.status(200).json({
                ok: true,
                summaryText: buildFallbackSummary(body),
                source: "fallback",
            });
            return;
        }
        const client = new openai_1.default({ apiKey });
        const prompt = `
あなたは介護記録を作成する専門家です。

以下の情報を元に、介護記録文を日本語で作成してください。

【条件】
- 文体は常体（だ・である調）
- 主語は「${userName || "利用者"}様」
- 箇条書き禁止
- 3〜4文で書く。30文字未満の短すぎる要約にしない
- 事実ベースでまとめ、不明な情報を勝手に補わない

【入力】
日付: ${serviceDate || "未設定"}
時間: ${buildTimeRange(startTime, endTime)}
利用者: ${userName || "未設定"}
担当者: ${helperName || "未設定"}
区分: ${category || "未設定"}
実施内容: ${itemText}
補足: ${memo || "なし"}${referenceBlock}

【出力】
介護記録文のみを出力してください。
`.trim();
        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "あなたは介護記録作成の補助を行うアシスタントです。",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.4,
        });
        const summaryText = completion.choices[0]?.message?.content?.trim() ||
            buildFallbackSummary(body);
        res.status(200).json({
            ok: true,
            summaryText,
            source: "ai",
        });
    }
    catch (error) {
        console.error("[service-records-home/summary] error:", error);
        res.status(200).json({
            ok: true,
            summaryText: buildFallbackSummary(body),
            source: "fallback",
        });
    }
}
