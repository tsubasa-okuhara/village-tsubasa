"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleServiceRecordsMoveGenerateSummary = handleServiceRecordsMoveGenerateSummary;
const openai_1 = require("../lib/openai");
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
function hasValidBody(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function getStringValue(value) {
    return String(value ?? "").trim();
}
function buildFallbackSummary(body) {
    const helperName = getStringValue(body.helperName) || "担当者未設定";
    const userName = getStringValue(body.userName) || "利用者未設定";
    const serviceDate = getStringValue(body.serviceDate) || "日付未設定";
    const startTime = getStringValue(body.startTime);
    const endTime = getStringValue(body.endTime);
    const task = getStringValue(body.task) || "移動支援";
    const notes = getStringValue(body.notes) || "記録内容未入力";
    const timeRange = startTime && endTime
        ? `${startTime}〜${endTime}`
        : startTime || endTime || "時間未設定";
    return `${serviceDate} ${timeRange}、${helperName}が${userName}様へ${task}を実施。記録: ${notes}`;
}
async function handleServiceRecordsMoveGenerateSummary(req, res) {
    if (!hasValidBody(req.body)) {
        res.status(400).json({
            ok: false,
            message: "invalid request body",
            summaryText: buildFallbackSummary({}),
            source: "fallback",
        });
        return;
    }
    try {
        const body = req.body;
        const helperName = getStringValue(body.helperName) || "担当者未設定";
        const userName = getStringValue(body.userName) || "利用者未設定";
        const serviceDate = getStringValue(body.serviceDate) || "日付未設定";
        const startTime = getStringValue(body.startTime);
        const endTime = getStringValue(body.endTime);
        const task = getStringValue(body.task) || "移動支援";
        const notes = getStringValue(body.notes) || "記録内容未入力";
        const referenceNotes = getReferenceNotes(body.referenceNotes);
        const timeRange = startTime && endTime
            ? `${startTime}〜${endTime}`
            : startTime || endTime || "時間未設定";
        // 参考記録がある場合のみ、手本ブロックを組み立てる。事実の流用は禁止する。
        const referenceBlock = referenceNotes.length > 0
            ? `

【参考記録（書き方の手本としてのみ使う）】
${referenceNotes.map((note, index) => `${index + 1}. ${note}`).join("\n")}

※ 上の参考記録は文体・書き方の手本として使う。参考記録と同程度の詳しさ・観察の粒度で書き、実施内容だけでなく利用者の様子や気づきも参考記録の書きぶりに倣うこと。ただし日付・時刻・外出先・人物など具体的な"事実"は流用せず、当日の【情報】の値だけを使うこと。`
            : "";
        const prompt = `以下の情報をもとに、介護記録として適切な要約文を生成してください。

【条件】
- 文体は常体（だ・である調）
- 3〜4文で書く。30文字未満の短すぎる要約にしない
- 専門用語は使わず、読みやすい文体にする
- ヘルパー名・利用者名・日時・実施内容・記録メモをすべて含める

【情報】
- 日付: ${serviceDate}
- 時間帯: ${timeRange}
- ヘルパー名: ${helperName}
- 利用者名: ${userName}
- サービス種別: ${task}
- 記録メモ: ${notes}${referenceBlock}`;
        const client = (0, openai_1.getOpenAIClient)();
        const response = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 300,
            temperature: 0.3,
        });
        const summaryText = response.choices[0]?.message?.content?.trim() ?? buildFallbackSummary(body);
        res.status(200).json({
            ok: true,
            summaryText,
            source: "template",
        });
    }
    catch (error) {
        console.error("[service-records-move/summary] error:", error);
        res.status(200).json({
            ok: true,
            summaryText: buildFallbackSummary(req.body),
            source: "fallback",
        });
    }
}
