import { Request, Response } from "express";
import { getSupabaseClient } from "./lib/supabase";
import { getOpenAIClient } from "./lib/openai";

/**
 * 匿名フィードバック投稿
 * POST /api/feedback
 * Body: { category: string, message: string }
 *
 * - 投稿者情報は一切保存しない
 * - AIで元のメッセージを丁寧・建設的な表現に変換してから保存
 * - 元のメッセージはDBに保存しない（変換後のみ）
 */
export async function handleSubmitFeedback(req: Request, res: Response) {
  try {
    const { category, message } = req.body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ error: "メッセージを入力してください" });
      return;
    }

    if (message.trim().length > 2000) {
      res.status(400).json({ error: "メッセージは2000文字以内にしてください" });
      return;
    }

    const validCategories = ["improvement", "bug", "request", "general"];
    const safeCategory = validCategories.includes(category) ? category : "general";

    // AIで丁寧な表現に変換
    const aiMessage = await transformWithAI(message.trim());

    // Supabaseに保存（元のメッセージは保存しない）
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("anonymous_feedback")
      .insert({
        category: safeCategory,
        ai_message: aiMessage,
        status: "unread",
      });

    if (error) {
      console.error("Supabase insert error:", error);
      res.status(500).json({ error: "保存に失敗しました" });
      return;
    }

    res.json({ success: true, message: "フィードバックを送信しました。ありがとうございます！" });
  } catch (err) {
    console.error("Feedback submit error:", err);
    res.status(500).json({ error: "送信に失敗しました。しばらくしてからもう一度お試しください。" });
  }
}

/**
 * AIでメッセージを建設的・丁寧な表現に変換
 */
async function transformWithAI(originalMessage: string): Promise<string> {
  const openai = getOpenAIClient();

  const systemPrompt = `あなたは福祉事業所「ビレッジ翼」の業務改善アシスタントです。
ヘルパーさんから届いた匿名のフィードバックを、以下のルールで書き直してください。

【ルール】
1. 元の意見・要望・指摘の内容は正確に保つこと
2. 感情的・攻撃的な表現があれば、建設的で前向きな言い方に変える
3. 誰が書いたか推測できるような表現（個人名、特定の日時、具体的すぎるエピソード）があれば、一般的な表現に置き換える
4. 読んだ管理者が「なるほど、改善しよう」と前向きに受け止められるトーンにする
5. 元のメッセージが既に丁寧であれば、大きく変えずにそのまま整える
6. 出力は変換後のメッセージのみ（説明や注釈は不要）
7. 敬語は使うが、堅すぎない自然な日本語にする`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: originalMessage },
    ],
    temperature: 0.4,
    max_tokens: 1000,
  });

  const transformed = response.choices[0]?.message?.content?.trim();

  if (!transformed) {
    // AI変換に失敗した場合はフォールバック
    return originalMessage;
  }

  return transformed;
}

/**
 * 管理者の返信をAIで丁寧・温かみのある表現に整える
 */
async function transformReplyWithAI(originalReply: string): Promise<string> {
  const openai = getOpenAIClient();

  const systemPrompt = `あなたは福祉事業所「ビレッジ翼」の管理者アシスタントです。
管理者がヘルパーさんへの返信として書いた文章を、以下のルールで整えてください。

【ルール】
1. 元の内容（対応結果・報告）は正確に保つこと
2. ヘルパーさんが読んで「声を出してよかった」と感じられる温かいトーンにする
3. 感謝の気持ちを自然に含める（「ご意見ありがとうございます」など）
4. 対応した内容を分かりやすく伝える
5. 短くても丁寧に、堅すぎない自然な日本語にする
6. 出力は変換後の返信のみ（説明や注釈は不要）`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: originalReply },
    ],
    temperature: 0.4,
    max_tokens: 500,
  });

  const transformed = response.choices[0]?.message?.content?.trim();

  if (!transformed) {
    return originalReply;
  }

  return transformed;
}

/**
 * フィードバック一覧取得（管理者用）
 * GET /api/feedback?status=unread
 */
export async function handleGetFeedback(req: Request, res: Response) {
  try {
    // 管理者チェック（メールアドレスで簡易認証）
    const adminEmail = req.query.email as string;
    if (!adminEmail || adminEmail.toLowerCase() !== "admin@village-support.jp") {
      res.status(403).json({ error: "管理者のみ閲覧できます" });
      return;
    }

    const statusFilter = req.query.status as string;
    const supabase = getSupabaseClient();

    let query = supabase
      .from("anonymous_feedback")
      .select("id, category, ai_message, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (statusFilter && ["unread", "read", "archived"].includes(statusFilter)) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase fetch error:", error);
      res.status(500).json({ error: "取得に失敗しました" });
      return;
    }

    res.json({ feedback: data || [] });
  } catch (err) {
    console.error("Feedback fetch error:", err);
    res.status(500).json({ error: "取得に失敗しました" });
  }
}

/**
 * フィードバックのステータス更新（管理者用）
 * POST /api/feedback/update-status
 * Body: { id: string, status: string, email: string, reply?: string }
 */
export async function handleUpdateFeedbackStatus(req: Request, res: Response) {
  try {
    const { id, status, email, reply } = req.body;

    if (!email || email.toLowerCase() !== "admin@village-support.jp") {
      res.status(403).json({ error: "管理者のみ操作できます" });
      return;
    }

    if (!id || !status) {
      res.status(400).json({ error: "IDとステータスが必要です" });
      return;
    }

    const validStatuses = ["unread", "read", "archived"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "無効なステータスです" });
      return;
    }

    const updateData: Record<string, string> = { status };
    if (typeof reply === "string" && reply.trim().length > 0) {
      // 返信内容もAIで丁寧に整える（ヘルパーさんに公開されるため）
      const polishedReply = await transformReplyWithAI(reply.trim());
      updateData.admin_reply = polishedReply;
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("anonymous_feedback")
      .update(updateData)
      .eq("id", id);

    if (error) {
      console.error("Supabase update error:", error);
      res.status(500).json({ error: "更新に失敗しました" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Feedback update error:", err);
    res.status(500).json({ error: "更新に失敗しました" });
  }
}

/**
 * 対応済みフィードバック一覧（全員閲覧可能）
 * GET /api/feedback/resolved
 * 管理者の返信付きの対応済みフィードバックを公開
 */
export async function handleGetResolvedFeedback(_req: Request, res: Response) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("anonymous_feedback")
      .select("id, category, ai_message, admin_reply, created_at")
      .eq("status", "archived")
      .not("admin_reply", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Supabase fetch error:", error);
      res.status(500).json({ error: "取得に失敗しました" });
      return;
    }

    res.json({ feedback: data || [] });
  } catch (err) {
    console.error("Resolved feedback fetch error:", err);
    res.status(500).json({ error: "取得に失敗しました" });
  }
}
