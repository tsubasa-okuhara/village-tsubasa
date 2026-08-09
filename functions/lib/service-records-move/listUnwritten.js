"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleServiceRecordsMoveListUnwritten = handleServiceRecordsMoveListUnwritten;
const recordCutoff_1 = require("../lib/recordCutoff");
const serviceRecordsSub2_1 = require("../lib/serviceRecordsSub2");
function getQueryValue(value) {
    if (Array.isArray(value)) {
        return String(value[0] ?? "").trim();
    }
    return String(value ?? "").trim();
}
async function handleServiceRecordsMoveListUnwritten(req, res) {
    const helperEmail = getQueryValue(req.query.helper_email);
    console.log("[service-records-move/unwritten] request:", {
        helperEmail,
    });
    try {
        // 7/31 以前の未記入は事業所側で精査するためヘルパーには出さない
        const rows = await (0, serviceRecordsSub2_1.fetchSub2UnwrittenMoveRecords)(helperEmail || null, recordCutoff_1.RECORD_LIST_CUTOFF_DATE);
        const items = rows.map(serviceRecordsSub2_1.toUnwrittenMoveItem);
        console.log("[service-records-move/unwritten] success:", {
            helperEmail,
            count: items.length,
        });
        res.status(200).json({
            ok: true,
            helperEmail,
            items,
        });
    }
    catch (error) {
        console.error("[service-records-move/unwritten] runtime error:", error);
        res.status(500).json({
            ok: false,
            message: "failed to fetch unwritten move tasks",
        });
    }
}
