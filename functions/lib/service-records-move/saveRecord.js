"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleServiceRecordsMoveSave = handleServiceRecordsMoveSave;
const scheduleSource_1 = require("../lib/scheduleSource");
const serviceRecordsSub2_1 = require("../lib/serviceRecordsSub2");
function hasValidBody(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function getStringValue(value) {
    return String(value ?? "").trim();
}
async function handleServiceRecordsMoveSave(req, res) {
    if (!hasValidBody(req.body)) {
        res.status(400).json({
            ok: false,
            message: "保存に必要な情報が足りません。予定を選び直してください。",
        });
        return;
    }
    const recordUuid = getStringValue(req.body.taskId);
    const serviceDate = getStringValue(req.body.serviceDate);
    const summaryText = getStringValue(req.body.summaryText);
    // notes（メモ）は任意。空メモでも記録本文があれば保存を許可する
    const notes = getStringValue(req.body.notes);
    if (!recordUuid || !summaryText) {
        res.status(400).json({
            ok: false,
            message: "記録本文が未入力です。内容を入力してから保存してください。",
        });
        return;
    }
    if (!(0, scheduleSource_1.isSub2Date)(serviceDate)) {
        res.status(400).json({
            ok: false,
            message: "2026年7月以前の記録はこの画面から保存できません。事業所にご連絡ください。",
        });
        return;
    }
    try {
        const outcome = await (0, serviceRecordsSub2_1.saveSub2MoveRecord)(recordUuid, {
            summary_text: summaryText,
            notes: notes === "" ? null : notes,
        });
        if (outcome.status === "not_found") {
            res.status(404).json({
                ok: false,
                message: "この予定の記録が見つかりませんでした。予定が変更された可能性があります。一覧を読み込み直してください。",
            });
            return;
        }
        if (outcome.status === "already_written") {
            res.status(409).json({
                ok: false,
                message: "この予定はすでに記録が保存されています。修正が必要な場合は事業所にご連絡ください。",
            });
            return;
        }
        res.status(200).json({
            ok: true,
            recordId: recordUuid,
            taskId: recordUuid,
            message: "move service record saved",
        });
    }
    catch (error) {
        console.error("[service-records-move/save] error:", error);
        res.status(500).json({
            ok: false,
            message: "保存に失敗しました。時間をおいて再試行してください。",
        });
    }
}
