import type { Request, Response } from "express";
import { getOpenAIClient } from "../lib/openai";

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
    const body = req.body;
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

    const prompt = `以下の情報をもとに、介護記録として適切な要約文を生成してください。

【条件】
- です/ます調の業務記録文にしてください
- 2〜4文程度にまとめてください
- 専門用語は使わず、読みやすい文体にしてください
- ヘルパー名・利用者名・日時・実施内容・記録メモをすべて含めてください

【情報】
- 日付: ${serviceDate}
- 時間帯: ${timeRange}
- ヘルパー名: ${helperName}
- 利用者名: ${userName}
- サービス種別: ${task}
- 記録メモ: ${notes}`;

    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.3,
    });

    const summaryText =
      response.choices[0]?.message?.content?.trim() ?? buildFallbackSummary(body);

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
