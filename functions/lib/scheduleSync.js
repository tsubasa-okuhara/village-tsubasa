"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMoveScheduleSync = runMoveScheduleSync;
exports.runHomeScheduleSync = runHomeScheduleSync;
exports.runAllScheduleSync = runAllScheduleSync;
exports.handleScheduleSync = handleScheduleSync;
const supabase_1 = require("./lib/supabase");
function isScheduleSyncMode(value) {
    return value === "move" || value === "home" || value === "all";
}
function hasValidRequestBody(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function runMoveScheduleSync() {
    console.log("[schedule-sync] move fetch start");
    console.log("[schedule-sync] run move");
    const supabase = (0, supabase_1.getSupabaseClient)();
    const { count, error } = await supabase
        .from("schedule")
        .select("*", { count: "exact", head: true });
    if (error) {
        throw error;
    }
    const fetchedCount = count ?? 0;
    console.log("[schedule-sync] move fetched count:", fetchedCount);
    return {
        ok: true,
        mode: "move",
        message: "move sync handler reached",
        count: fetchedCount,
    };
}
async function runHomeScheduleSync() {
    console.log("[schedule-sync] run home");
    return {
        ok: true,
        mode: "home",
        message: "home sync handler reached",
    };
}
async function runAllScheduleSync() {
    console.log("[schedule-sync] run all");
    await runMoveScheduleSync();
    await runHomeScheduleSync();
    return {
        ok: true,
        mode: "all",
        message: "all sync handler reached",
    };
}
async function handleScheduleSync(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({
            ok: false,
            message: "method not allowed",
        });
        return;
    }
    if (!hasValidRequestBody(req.body)) {
        res.status(400).json({
            ok: false,
            message: "invalid request body",
        });
        return;
    }
    const { mode } = req.body;
    console.log("[schedule-sync] mode:", mode);
    if (!isScheduleSyncMode(mode)) {
        res.status(400).json({
            ok: false,
            message: "invalid mode",
        });
        return;
    }
    try {
        let result;
        switch (mode) {
            case "move":
                result = await runMoveScheduleSync();
                break;
            case "home":
                result = await runHomeScheduleSync();
                break;
            case "all":
                result = await runAllScheduleSync();
                break;
            default:
                res.status(400).json({
                    ok: false,
                    message: "invalid mode",
                });
                return;
        }
        res.status(200).json(result);
    }
    catch (error) {
        console.error("[schedule-sync] error:", error);
        res.status(500).json({
            ok: false,
            message: "internal error",
        });
    }
}
