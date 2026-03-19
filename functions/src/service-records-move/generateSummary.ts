import type { Request, Response } from "express";

type MoveSummaryRequestBody = {
  helperName?: unknown;
  userName?: unknown;
  serviceDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  task?: unknown;
  notes?: unknown;
};

type MoveSummarySuccessResponse = {
  ok: true;
  summaryText: string;
  source: "template" | "fallback";
};

type MoveSummaryErrorResponse = {
  ok: false;
  message: string;
  summaryText?: string;
  source?: "fallback";
};

function hasValidBody(value: unknown): value is MoveSummaryRequestBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function buildFallbackSummary(body: MoveSummaryRequestBody): string {
  const helperName = getStringValue(body.helperName) || "担当者未設定";
  const userName = getStringValue(body.userName) || "利用者未設定";
  const serviceDate = getStringValue(body.serviceDate) || "日付未設定";
  const startTime = getStringValue(body.startTime);
  const endTime = getStringValue(body.endTime);
  const task = getStringValue(body.task) || "移動支援";
  const notes = getStringValue(body.notes) || "記録内容未入力";
  const timeRange =
    startTime && endTime
      ? `${startTime}〜${endTime}`
      : startTime || endTime || "時間未設定";

  return `${serviceDate} ${timeRange}、${helperName}が${userName}様へ${task}を実施。記録: ${notes}`;
}

export async function handleServiceRecordsMoveGenerateSummary(
  req: Request,
  res: Response<MoveSummarySuccessResponse | MoveSummaryErrorResponse>,
): Promise<void> {
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
    // TODO: OpenAI API 連携を入れる場合はここで実装する。
    // 現段階では必ずテンプレート生成を返す最小実装にしている。
    const summaryText = buildFallbackSummary(req.body);

    res.status(200).json({
      ok: true,
      summaryText,
      source: "template",
    });
  } catch (error) {
    console.error("[service-records-move/summary] error:", error);

    res.status(200).json({
      ok: true,
      summaryText: buildFallbackSummary(req.body),
      source: "fallback",
    });
  }
}
