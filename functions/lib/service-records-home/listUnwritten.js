"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleListUnwrittenHome = handleListUnwrittenHome;
const recordCutoff_1 = require("../lib/recordCutoff");
const serviceRecordsSub2_1 = require("../lib/serviceRecordsSub2");
function getHelperEmailFilter(req) {
    const helperEmailValue = Array.isArray(req.query.helper_email)
        ? req.query.helper_email[0]
        : req.query.helper_email;
    if (typeof helperEmailValue !== "string") {
        return null;
    }
    const trimmedHelperEmail = helperEmailValue.trim();
    return trimmedHelperEmail === "" ? null : trimmedHelperEmail;
}
async function handleListUnwrittenHome(req, res) {
    if (req.method !== "GET") {
        res.status(405).json({
            ok: false,
            message: "method not allowed",
        });
        return;
    }
    try {
        const helperEmailFilter = getHelperEmailFilter(req);
        // 7/31 以前の未記入は事業所側で精査するためヘルパーには出さない
        const rows = await (0, serviceRecordsSub2_1.fetchSub2UnwrittenHomeRecords)(helperEmailFilter, recordCutoff_1.RECORD_LIST_CUTOFF_DATE);
        res.status(200).json({
            ok: true,
            items: rows.map(serviceRecordsSub2_1.toUnwrittenHomeItem),
        });
    }
    catch (error) {
        console.error("[service-records-home/unwritten] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
