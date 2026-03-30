import type { Request, Response } from "express";
import OpenAI from "openai";

type HomeSummaryRequestBody = {
  helperName?: unknown;
  userName?: unknown;
  serviceDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  category?: unknown;
  items?: unknown;
  otherDetail?: unknown;
  memo?: unknown;
};

type HomeSummarySuccessResponse = {
  ok: true;
  summaryText: string;
  source: "ai" | "fallback";
};

type HomeSummaryErrorResponse = {
  ok: false;
  message: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function getItems(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function buildTimeRange(startTime: string, endTime: string): string {
  if (startTime && endTime) {
    return `${startTime}〜${endTime}`;
  }

  return startTime || endTime || "時間未設定";
}

function buildFallbackSummary(body: HomeSummaryRequestBody): string {
  const userName = getStringValue(body.userName) || "利用者";
  const serviceDate = getStringValue(body.serviceDate) || "本日";
  const startTime = getStringValue(body.startTime);
  const endTime = getStringValue(body.endTime);
  const category = getStringValue(body.category) || "身体介護";
  const otherDetail = getStringValue(body.otherDetail);
  const memo = getStringValue(body.memo);
  const items = getItems(body.items);

  const detailItems = [...items];
  if (otherDetail) {
    detailItems.push(otherDetail);
  }

  const detailText =
    detailItems.length > 0 ? detailItems.join("、") : "必要な支援";

  const sentences = [
    `${serviceDate} ${buildTimeRange(startTime, endTime)}、${userName}様へ${category}を実施しました。`,
    `実施内容: ${detailText}。`,
  ];

  if (memo) {
    sentences.push(`特記事項: ${memo}。`);
  }

  return sentences.join("");
}

export async function handleGenerateHomeSummary(
  req: Request,
  res: Response<HomeSummarySuccessResponse | HomeSummaryErrorResponse>,
): Promise<void> {
  if (!isObject(req.body)) {
    res.status(400).json({
      ok: false,
      message: "invalid request body",
    });
    return;
  }

  const body: HomeSummaryRequestBody = req.body;

  const helperName = getStringValue(body.helperName);
  const userName = getStringValue(body.userName);
  const serviceDate = getStringValue(body.serviceDate);
  const startTime = getStringValue(body.startTime);
  const endTime = getStringValue(body.endTime);
  const category = getStringValue(body.category);
  const otherDetail = getStringValue(body.otherDetail);
  const memo = getStringValue(body.memo);
  const items = getItems(body.items);

  const itemText =
    [...items, ...(otherDetail ? [otherDetail] : [])].join("、") ||
    "必要な支援";

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      res.status(200).json({
        ok: true,
        summaryText: buildFallbackSummary(body),
        source: "fallback",
      });
      return;
    }

    const client = new OpenAI({ apiKey });

    const prompt = `
あなたは介護記録を作成する専門家です。

以下の情報を元に、自然で読みやすい介護記録文を日本語で作成してください。

【条件】
- 丁寧な日本語
- 主語は「${userName || "利用者"}様」
- 箇条書き禁止
- 1〜3文
- 事実ベースで簡潔にまとめる
- 不明な情報を勝手に補わない

【入力】
日付: ${serviceDate || "未設定"}
時間: ${buildTimeRange(startTime, endTime)}
利用者: ${userName || "未設定"}
担当者: ${helperName || "未設定"}
区分: ${category || "未設定"}
実施内容: ${itemText}
補足: ${memo || "なし"}

【出力】
介護記録文のみを出力してください。
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "あなたは介護記録作成の補助を行うアシスタントです。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.4,
    });

    const summaryText =
      completion.choices[0]?.message?.content?.trim() ||
      buildFallbackSummary(body);

    res.status(200).json({
      ok: true,
      summaryText,
      source: "ai",
    });
  } catch (error) {
    console.error("[service-records-home/summary] error:", error);

    res.status(200).json({
      ok: true,
      summaryText: buildFallbackSummary(body),
      source: "fallback",
    });
  }
}
