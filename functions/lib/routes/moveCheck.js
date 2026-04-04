"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveCheckRouter = void 0;
const express_1 = require("express");
const moveCheckService_1 = require("../services/moveCheckService");
exports.moveCheckRouter = (0, express_1.Router)();
function getStringValue(value) {
    if (Array.isArray(value)) {
        return String(value[0] ?? "").trim();
    }
    return String(value ?? "").trim();
}
function getNumberValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return null;
}
function hasValidBody(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
exports.moveCheckRouter.get("/unwritten", async (req, res) => {
    const helperEmail = getStringValue(req.query.helper_email);
    if (!helperEmail) {
        res.status(400).json({
            ok: false,
            message: "helper_email is required",
        });
        return;
    }
    try {
        const items = await (0, moveCheckService_1.fetchMoveCheckUnwrittenTasks)(helperEmail);
        res.status(200).json({
            ok: true,
            helperEmail,
            items,
        });
    }
    catch (error) {
        console.error("[move-check/unwritten] error:", error);
        res.status(500).json({
            ok: false,
            message: "failed to fetch unwritten move check tasks",
        });
    }
});
exports.moveCheckRouter.get("/:taskId/logs", async (req, res) => {
    const taskId = getStringValue(req.params.taskId);
    if (!taskId) {
        res.status(400).json({
            ok: false,
            message: "taskId is required",
        });
        return;
    }
    try {
        const items = await (0, moveCheckService_1.fetchMoveCheckLogs)(taskId);
        res.status(200).json({
            ok: true,
            taskId,
            items,
        });
    }
    catch (error) {
        console.error("[move-check/logs] error:", error);
        res.status(500).json({
            ok: false,
            message: "failed to fetch move check logs",
        });
    }
});
exports.moveCheckRouter.post("/log", async (req, res) => {
    if (!hasValidBody(req.body)) {
        res.status(400).json({
            ok: false,
            message: "invalid request body",
        });
        return;
    }
    const scheduleTaskId = getStringValue(req.body.schedule_task_id);
    const checkpointType = getStringValue(req.body.checkpoint_type);
    const checkpointLabel = getStringValue(req.body.checkpoint_label);
    const checkedAt = getStringValue(req.body.checked_at);
    const helperEmail = getStringValue(req.body.helper_email);
    const latitude = getNumberValue(req.body.latitude);
    const longitude = getNumberValue(req.body.longitude);
    const accuracy = getNumberValue(req.body.accuracy);
    if (!scheduleTaskId ||
        !checkpointType ||
        !checkpointLabel ||
        !checkedAt ||
        !helperEmail) {
        res.status(400).json({
            ok: false,
            message: "schedule_task_id, checkpoint_type, checkpoint_label, checked_at and helper_email are required",
        });
        return;
    }
    try {
        const item = await (0, moveCheckService_1.createMoveCheckLog)({
            scheduleTaskId,
            checkpointType,
            checkpointLabel,
            checkedAt,
            latitude,
            longitude,
            accuracy,
            helperEmail,
        });
        res.status(200).json({
            ok: true,
            item,
        });
    }
    catch (error) {
        console.error("[move-check/log] error:", error);
        res.status(500).json({
            ok: false,
            message: "failed to save move check log",
        });
    }
});
