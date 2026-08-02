"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSaveHomeRecord = handleSaveHomeRecord;
const scheduleSource_1 = require("../lib/scheduleSource");
const serviceRecordsSub2_1 = require("../lib/serviceRecordsSub2");
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeText(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmedValue = value.trim();
    return trimmedValue === "" ? null : trimmedValue;
}
function parseSaveHomeRecordBody(body) {
    if (!isObject(body)) {
        return null;
    }
    // フロントは record_uuid を scheduleTaskId という名前で送ってくる。
    // 名前を変えるとフロントの改修が要るので、受け口の名前は据え置く。
    const recordUuid = normalizeText(body.scheduleTaskId);
    const serviceDate = normalizeText(body.serviceDate);
    const finalNote = normalizeText(body.finalNote);
    if (!recordUuid || !serviceDate || !finalNote) {
        return null;
    }
    return {
        recordUuid,
        serviceDate,
        finalNote,
        task: normalizeText(body.task),
        memo: normalizeText(body.memo),
    };
}
async function handleSaveHomeRecord(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({
            ok: false,
            message: "method not allowed",
        });
        return;
    }
    const parsedBody = parseSaveHomeRecordBody(req.body);
    if (!parsedBody) {
        res.status(400).json({
            ok: false,
            message: "保存に必要な情報が足りません。予定を選び直してください。",
        });
        return;
    }
    if (!(0, scheduleSource_1.isSub2Date)(parsedBody.serviceDate)) {
        res.status(400).json({
            ok: false,
            message: "2026年7月以前の記録はこの画面から保存できません。事業所にご連絡ください。",
        });
        return;
    }
    try {
        const outcome = await (0, serviceRecordsSub2_1.saveSub2HomeRecord)(parsedBody.recordUuid, {
            final_note: parsedBody.finalNote,
            memo: parsedBody.memo,
            task: parsedBody.task,
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
            recordId: parsedBody.recordUuid,
            scheduleTaskId: parsedBody.recordUuid,
            status: "written",
        });
    }
    catch (error) {
        console.error("[service-records-home/save] error:", error);
        res.status(500).json({
            ok: false,
            message: "保存に失敗しました。時間をおいて再試行してください。",
        });
    }
}
