import { Router, type Request, type Response } from "express";

import {
  createMoveCheckLog,
  fetchMoveCheckLogs,
  fetchMoveCheckUnwrittenTasks,
} from "../services/moveCheckService";
import type {
  MoveCheckErrorResponse,
  MoveCheckLogCreateSuccessResponse,
  MoveCheckLogRequestBody,
  MoveCheckLogsSuccessResponse,
  MoveCheckUnwrittenSuccessResponse,
} from "../types/moveCheck";

export const moveCheckRouter = Router();

function getStringValue(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] ?? "").trim();
  }

  return String(value ?? "").trim();
}

function getNumberValue(value: unknown): number | null {
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

function hasValidBody(value: unknown): value is MoveCheckLogRequestBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

moveCheckRouter.get(
  "/unwritten",
  async (
    req: Request,
    res: Response<MoveCheckUnwrittenSuccessResponse | MoveCheckErrorResponse>,
  ): Promise<void> => {
    const helperEmail = getStringValue(req.query.helper_email);

    if (!helperEmail) {
      res.status(400).json({
        ok: false,
        message: "helper_email is required",
      });
      return;
    }

    try {
      const items = await fetchMoveCheckUnwrittenTasks(helperEmail);

      res.status(200).json({
        ok: true,
        helperEmail,
        items,
      });
    } catch (error) {
      console.error("[move-check/unwritten] error:", error);
      res.status(500).json({
        ok: false,
        message: "failed to fetch unwritten move check tasks",
      });
    }
  },
);

moveCheckRouter.get(
  "/:taskId/logs",
  async (
    req: Request,
    res: Response<MoveCheckLogsSuccessResponse | MoveCheckErrorResponse>,
  ): Promise<void> => {
    const taskId = getStringValue(req.params.taskId);

    if (!taskId) {
      res.status(400).json({
        ok: false,
        message: "taskId is required",
      });
      return;
    }

    try {
      const items = await fetchMoveCheckLogs(taskId);

      res.status(200).json({
        ok: true,
        taskId,
        items,
      });
    } catch (error) {
      console.error("[move-check/logs] error:", error);
      res.status(500).json({
        ok: false,
        message: "failed to fetch move check logs",
      });
    }
  },
);

moveCheckRouter.post(
  "/log",
  async (
    req: Request,
    res: Response<MoveCheckLogCreateSuccessResponse | MoveCheckErrorResponse>,
  ): Promise<void> => {
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

    if (
      !scheduleTaskId ||
      !checkpointType ||
      !checkpointLabel ||
      !checkedAt ||
      !helperEmail
    ) {
      res.status(400).json({
        ok: false,
        message:
          "schedule_task_id, checkpoint_type, checkpoint_label, checked_at and helper_email are required",
      });
      return;
    }

    try {
      const item = await createMoveCheckLog({
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
    } catch (error) {
      console.error("[move-check/log] error:", error);
      res.status(500).json({
        ok: false,
        message: "failed to save move check log",
      });
    }
  },
);
