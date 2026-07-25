/**
 * 遅延通知 API
 *
 *   POST /api/delay-notify
 *     {
 *       scheduleId: number,
 *       destination: "client" | "office",
 *       reasonCode: string,        // 下記 REASON_MAP のキー
 *       reasonNote?: string,       // 自由入力の補足（任意）
 *       arrivalTime: "HH:MM",      // 到着予定時刻
 *       helperName?: string
 *     }
 *
 *   destination="client"（利用者へ連絡）
 *     1) schedule_entries（sub2）から予定を取得
 *     2) users を氏名で突合して line_group_id を取得
 *     3) 送信可なら利用者の LINE グループへ push（やわらげた文面）
 *     4) 理由が管理者通知対象なら、メイン組 LINE にも控えを通知（admin_notified=true）
 *     5) delay_notices に送信ログを保存
 *
 *   destination="office"（事業所へ電話連絡を依頼）
 *     - 利用者へは送らず、管理者（メイン組 LINE グループ）にのみ通知
 *     - delay_notice_enabled / line_group_id の判定は不要
 *     - 突合できなくても管理者へは通知する
 *
 * 【文面ポリシー】利用者向けの理由文面は表現をやわらげているだけで、
 *   嘘の理由に置き換えていない。reason_code には実際の理由を保存し、
 *   管理者通知にも実際の理由（adminLabel）を載せる。
 *
 * client で送信不可のとき（突合不可 / delay_notice_enabled=false / line_group_id なし）は
 * LINE 送信を行わず needsPhoneCall: true を返し、画面側に「電話連絡が必要」と表示させる。
 *
 * 事前に必要な Secret:
 *   LINE_CHANNEL_ACCESS_TOKEN … Messaging API のチャネルアクセストークン
 *   （sub2 の service_role キーは既存の SUPABASE_SUB2_SERVICE_ROLE_KEY を流用）
 *
 * 管理者グループIDは app_settings（key='admin_line_group_id'）から読む。ハードコード禁止。
 */

import type { Request, Response } from "express";
import { defineSecret } from "firebase-functions/params";
import { getSupabaseSub2Client } from "./lib/supabase";

export const LINE_CHANNEL_ACCESS_TOKEN = defineSecret("LINE_CHANNEL_ACCESS_TOKEN");

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

/** 管理者グループIDが入っている app_settings のキー */
const ADMIN_GROUP_SETTING_KEY = "admin_line_group_id";

type Destination = "client" | "office";

/**
 * 理由コード → 文面マッピング。
 *
 * clientText  : 利用者向けのやわらげた文面（嘘ではなく表現をやわらげただけ）
 * adminLabel  : 管理者通知・保存に載せる「実際の理由」ラベル
 * notifyAdmin : client 送信時に管理者へも控えを通知するか
 *
 * 不明な reasonCode は 400 で弾く（誤送信を防ぐ）。
 */
const REASON_MAP = {
  prev_support: { clientText: "前の支援が長引いており遅れております", adminLabel: "前の支援の長引き", notifyAdmin: false },
  traffic: { clientText: "交通事情により遅れております", adminLabel: "交通渋滞", notifyAdmin: false },
  train: { clientText: "交通事情により遅れております", adminLabel: "電車遅延", notifyAdmin: false },
  vehicle: { clientText: "交通事情により遅れております", adminLabel: "車両トラブル", notifyAdmin: true },
  sick: { clientText: "体調不良のため遅れております", adminLabel: "体調不良", notifyAdmin: true },
  overslept: { clientText: "出発が遅れております", adminLabel: "寝坊", notifyAdmin: true },
  other: { clientText: "出発が遅れております", adminLabel: "その他", notifyAdmin: false },
} as const;

type ReasonCode = keyof typeof REASON_MAP;

function isReasonCode(v: string): v is ReasonCode {
  return Object.prototype.hasOwnProperty.call(REASON_MAP, v);
}

/** "HH:MM"（00:00〜23:59）だけ通す */
const ARRIVAL_TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

interface UserRow {
  id: string;
  name: string;
  line_group_id: string | null;
  /** LINE で遅延連絡を送ってよいか。既定は false（＝送らない） */
  delay_notice_enabled: boolean | null;
}

interface ScheduleRow {
  id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  user_name: string | null;
  helper_name: string | null;
  cancelled_at: string | null;
}

export async function handleDelayNotify(req: Request, res: Response) {
  try {
    const scheduleId = Number(req.body?.scheduleId);
    const destination = String(req.body?.destination ?? "") as Destination;
    const reasonCode = String(req.body?.reasonCode ?? "");
    const reasonNote = String(req.body?.reasonNote ?? "").trim();
    const arrivalTime = String(req.body?.arrivalTime ?? "").trim();
    const helperName = String(req.body?.helperName ?? "").trim();

    // 400 はいずれも呼び出し側の実装バグ。ヘルパーに原因を見せても行動が変わらないので
    // 画面には共通の文言だけ出し、原因は error に残して調査に回す
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({
        message: "送信できませんでした。事業所へご連絡ください。",
        error: "scheduleId が不正です",
      });
    }
    if (destination !== "client" && destination !== "office") {
      return res.status(400).json({
        message: "送信できませんでした。事業所へご連絡ください。",
        error: 'destination は "client" / "office" のみ指定できます',
      });
    }
    if (!isReasonCode(reasonCode)) {
      return res.status(400).json({
        message: "送信できませんでした。事業所へご連絡ください。",
        error: `reasonCode が不正です: ${reasonCode}`,
      });
    }
    if (!ARRIVAL_TIME_RE.test(arrivalTime)) {
      return res.status(400).json({
        message: "送信できませんでした。事業所へご連絡ください。",
        error: "arrivalTime は HH:MM 形式で指定してください",
      });
    }

    const reason = REASON_MAP[reasonCode];
    const supabase = getSupabaseSub2Client();

    // ---- 1) 予定を取得 -----------------------------------------------------
    const { data: schedule, error: schedErr } = await supabase
      .from("schedule_entries")
      .select("id, date, start_time, end_time, user_name, helper_name, cancelled_at")
      .eq("id", scheduleId)
      .maybeSingle<ScheduleRow>();

    if (schedErr) throw new Error(`予定の取得に失敗しました: ${schedErr.message}`);
    if (!schedule) {
      return res.status(404).json({
        message: "予定が見つかりません。画面を更新してください。",
        error: "予定が見つかりません",
      });
    }
    if (schedule.cancelled_at) {
      return res.status(409).json({
        message: "この予定はキャンセルされています。",
        error: "この予定はキャンセル済みです",
      });
    }

    const userName = (schedule.user_name ?? "").trim();
    // client は利用者本人へ送るので利用者名が無いと成立しない。
    // office は事業所への電話依頼なので、突合できなくても通知する（名前は控えめに補完）。
    if (destination === "client" && !userName) {
      return res.status(409).json({
        message: "この予定に利用者名が登録されていません。事業所へご連絡ください。",
        error: "予定に利用者名が入っていません",
      });
    }

    const helper = helperName || (schedule.helper_name ?? "").trim();
    const timeLabel = formatTime(schedule.start_time);

    // ---- 2) 二重送信チェック ----------------------------------------------
    // 同じ予定に対して既に送信済みなら弾く（destination 違いでも同じ予定なら弾く）
    const { data: already, error: alreadyErr } = await supabase
      .from("delay_notices")
      .select("id, destination, sent_at")
      .eq("schedule_id", scheduleId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1);

    // 送信済みか判定できないまま送ると二重送信になる。ここは送らずに止める
    if (alreadyErr) {
      throw new Error(`送信履歴の確認に失敗しました: ${alreadyErr.message}`);
    }

    if (already && already.length > 0) {
      return res.status(409).json({
        message: "この予定はすでに連絡済みです。",
        error: "この予定はすでに連絡済みです",
        previous: already[0],
      });
    }

    // ========================================================================
    //  destination = "office" : 事業所（メイン組 LINE）へ電話連絡を依頼
    // ========================================================================
    if (destination === "office") {
      // 届かないのに成功と返さないため、ここで取得失敗なら 500 で止める（外側 catch へ）
      const adminGroupId = await getAdminLineGroupId(supabase);

      const clientLabel = userName || "利用者";
      const officeText = buildOfficeMessage(
        helper,
        clientLabel,
        timeLabel,
        reason.adminLabel,
        reasonNote,
        arrivalTime,
      );

      try {
        await linePush(adminGroupId, officeText, `delay-office-${scheduleId}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await logNotice(supabase, {
          schedule_id: scheduleId,
          client_name: userName || null,
          helper_name: helper || null,
          destination,
          reason_code: reasonCode,
          reason_note: reasonNote || null,
          arrival_time: arrivalTime,
          minutes: null,
          line_group_id: adminGroupId,
          admin_notified: false,
          status: "failed",
          message: officeText,
          error_message: msg,
        });
        return res.status(502).json({
          ok: false,
          sent: false,
          needsPhoneCall: true,
          message: "送信できませんでした。事業所へお電話ください。",
          error: msg,
        });
      }

      await logNotice(supabase, {
        schedule_id: scheduleId,
        client_name: userName || null,
        helper_name: helper || null,
        destination,
        reason_code: reasonCode,
        reason_note: reasonNote || null,
        arrival_time: arrivalTime,
        minutes: null,
        line_group_id: adminGroupId,
        admin_notified: true,
        status: "sent",
        message: officeText,
        error_message: null,
      });

      return res.json({
        ok: true,
        sent: true,
        needsPhoneCall: false,
        clientName: userName || null,
        message: "事業所へ電話連絡を依頼しました。",
        sentAt: new Date().toISOString(),
      });
    }

    // ========================================================================
    //  destination = "client" : 利用者の LINE グループへ push
    // ========================================================================

    // 利用者の LINE ID を引く
    // schedule_entries は「小川貴也様」、users は「小川貴也」なので「様」を落として突合
    const normalized = normalizeName(userName);

    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id, name, line_group_id, delay_notice_enabled")
      .eq("name", normalized)
      .maybeSingle<UserRow>();

    if (userErr) throw new Error(`利用者の取得に失敗しました: ${userErr.message}`);

    const clientText = buildClientMessage(userName, timeLabel, reason.clientText, arrivalTime);

    // 送らない理由を先に確定させる。判定順は
    //   1) 突合できない → 2) LINE連絡が無効 → 3) LINE ID が未登録
    // delay_notice_enabled は line_group_id より先に見る。
    // グループIDが残っていても「送らない」と決めた利用者には送らないため。
    const block = resolveBlockReason(user, userName);

    if (block) {
      await logNotice(supabase, {
        schedule_id: scheduleId,
        client_name: userName,
        helper_name: helper || null,
        destination,
        reason_code: reasonCode,
        reason_note: reasonNote || null,
        arrival_time: arrivalTime,
        minutes: null,
        line_group_id: null,
        admin_notified: false,
        status: "needs_phone_call",
        message: clientText,
        error_message: block.errorMessage,
      });

      return res.json({
        ok: true,
        sent: false,
        needsPhoneCall: true,
        clientName: userName,
        message: block.message,
        reason: block.reason,
      });
    }

    // block が null なら送信先は確定しているが、型の上でも明示しておく。
    // ここが落ちるのは resolveBlockReason との整合が崩れたときだけ（本来到達しない）
    const lineGroupId = user?.line_group_id;
    if (!lineGroupId) {
      throw new Error("送信先の判定に失敗しました");
    }

    try {
      await linePush(lineGroupId, clientText, `delay-client-${scheduleId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logNotice(supabase, {
        schedule_id: scheduleId,
        client_name: userName,
        helper_name: helper || null,
        destination,
        reason_code: reasonCode,
        reason_note: reasonNote || null,
        arrival_time: arrivalTime,
        minutes: null,
        line_group_id: lineGroupId,
        admin_notified: false,
        status: "failed",
        message: clientText,
        error_message: msg,
      });
      // 送信できなかったことをヘルパーに必ず伝える（黙って失敗させない）
      return res.status(502).json({
        ok: false,
        sent: false,
        needsPhoneCall: true,
        message: "送信できませんでした。事業所へお電話ください。",
        error: msg,
      });
    }

    // ---- 利用者送信は成功。理由によっては管理者へも控えを通知 ----------------
    // LINE は取り消せないので、管理者通知の失敗で利用者送信を巻き戻さない。
    // ただし失敗は必ず console.error に残し、admin_notified=false で記録する。
    let adminNotified = false;
    if (reason.notifyAdmin) {
      try {
        const adminGroupId = await getAdminLineGroupId(supabase);
        const adminText = buildAdminEscalationMessage(
          helper,
          userName,
          timeLabel,
          reason.adminLabel,
          reasonNote,
          arrivalTime,
        );
        await linePush(adminGroupId, adminText, `delay-escalate-${scheduleId}`);
        adminNotified = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(
          `[delay-notify] 管理者通知に失敗（利用者送信は成功済み） schedule_id=${scheduleId}: ${msg}`,
        );
      }
    }

    await logNotice(supabase, {
      schedule_id: scheduleId,
      client_name: userName,
      helper_name: helper || null,
      destination,
      reason_code: reasonCode,
      reason_note: reasonNote || null,
      arrival_time: arrivalTime,
      minutes: null,
      line_group_id: lineGroupId,
      admin_notified: adminNotified,
      status: "sent",
      message: clientText,
      error_message: null,
    });

    return res.json({
      ok: true,
      sent: true,
      needsPhoneCall: false,
      clientName: userName,
      message: `${userName}へ連絡しました。`,
      adminNotified,
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[delay-notify]", msg);
    // 原因が何であれ「送れなかった＝電話連絡」に倒す。
    // message は画面へそのまま出す用、error は技術的な詳細（ログ・調査用）
    return res.status(500).json({
      ok: false,
      sent: false,
      needsPhoneCall: true,
      message: "送信できませんでした。事業所へお電話ください。",
      error: msg,
    });
  }
}

// ========== ヘルパー ==========

interface BlockReason {
  /** delay_notices.error_message に残す内部向けの理由 */
  errorMessage: string;
  /** 画面にそのまま出す日本語 */
  message: string;
  /** 既存クライアント互換のため残している短い理由 */
  reason: string;
}

/**
 * LINE を送らない理由を判定する。送ってよい場合は null。
 *
 * 判定順は 突合できない → LINE連絡が無効 → LINE ID が未登録。
 * delay_notice_enabled を line_group_id より先に見るのは、
 * グループIDが残ったままでも「送らない」設定を優先するため。
 */
function resolveBlockReason(user: UserRow | null, userName: string): BlockReason | null {
  if (!user) {
    return {
      errorMessage: "users に該当する利用者がいません",
      message: `${userName} の利用者情報が見つかりません。事業所へご連絡ください。`,
      reason: "利用者情報が見つかりません",
    };
  }

  // null（未設定）も false と同じく「送らない」に倒す
  if (user.delay_notice_enabled !== true) {
    return {
      errorMessage: "LINE連絡が無効",
      message: `${userName}へのLINE連絡は設定されていません。お電話でご連絡ください。`,
      reason: "この利用者様はLINE連絡が無効です",
    };
  }

  if (!user.line_group_id) {
    return {
      errorMessage: "LINE ID が未登録",
      message: `${userName} はLINE未登録です。お電話でご連絡ください。`,
      reason: "この利用者様はLINE未登録です",
    };
  }

  return null;
}

/**
 * 管理者（メイン組 LINE）のグループIDを app_settings から読む。ハードコード禁止。
 * 取得できないときは例外を投げる。呼び出し側で「届かないのに成功と返さない」ために使う。
 */
async function getAdminLineGroupId(
  supabase: ReturnType<typeof getSupabaseSub2Client>,
): Promise<string> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", ADMIN_GROUP_SETTING_KEY)
    .maybeSingle<{ value: string | null }>();

  if (error) throw new Error(`管理者グループIDの取得に失敗しました: ${error.message}`);
  const id = (data?.value ?? "").trim();
  if (!id) throw new Error(`app_settings に ${ADMIN_GROUP_SETTING_KEY} がありません`);
  return id;
}

/** 「小川貴也様」→「小川貴也」。全角/半角スペースも除去する */
function normalizeName(raw: string): string {
  return raw.replace(/[\s　]+/g, "").replace(/様$/, "");
}

/** "14:00:00" → "14:00"。取得できない場合は空文字 */
function formatTime(raw: string | null): string {
  if (!raw) return "";
  const m = String(raw).match(/^(\d{1,2}):(\d{2})/);
  return m ? `${Number(m[1])}:${m[2]}` : "";
}

/** 現在時刻を JST の "HH:MM" で返す（管理者通知の見出し用） */
function nowLabelJst(): string {
  return new Date().toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 利用者向け文面（やわらげた理由）。
 * 「【ビレッジつばさ】{利用者名} 本日{開始時刻}〜のご訪問 /
 *   {理由文面}。{到着時刻}頃の到着予定です。/ ご迷惑をおかけし申し訳ありません。」
 */
function buildClientMessage(
  userName: string,
  timeLabel: string,
  reasonText: string,
  arrivalTime: string,
): string {
  const when = timeLabel ? `本日${timeLabel}〜のご訪問` : "本日のご訪問";
  return [
    `【ビレッジつばさ】${userName} ${when}`,
    `${reasonText}。${arrivalTime}頃の到着予定です。`,
    "ご迷惑をおかけし申し訳ありません。",
  ].join("\n");
}

/**
 * 管理者向け「電話連絡の依頼」文面（destination=office）。実際の理由を載せる。
 */
function buildOfficeMessage(
  helper: string,
  clientLabel: string,
  timeLabel: string,
  adminLabel: string,
  reasonNote: string,
  arrivalTime: string,
): string {
  const who = helper || "ヘルパー";
  const start = timeLabel || "時間未定";
  const reasonLine = reasonNote ? `理由:${adminLabel}（${reasonNote}）` : `理由:${adminLabel}`;
  return [
    `【電話連絡の依頼】${nowLabelJst()}`,
    `${who} → ${clientLabel}（${start}〜）`,
    "訪問先への電話連絡をお願いします。",
    reasonLine,
    `到着予定:${arrivalTime}`,
  ].join("\n");
}

/**
 * 管理者向け「控え」文面（destination=client かつ管理者通知対象の理由）。実際の理由を載せる。
 */
function buildAdminEscalationMessage(
  helper: string,
  userName: string,
  timeLabel: string,
  adminLabel: string,
  reasonNote: string,
  arrivalTime: string,
): string {
  const who = helper || "ヘルパー";
  const start = timeLabel || "時間未定";
  const reasonLine = reasonNote ? `理由:${adminLabel}（${reasonNote}）` : `理由:${adminLabel}`;
  return [
    `【遅延連絡（管理者控え）】${nowLabelJst()}`,
    `${who} → ${userName}（${start}〜）`,
    "利用者へ LINE で遅延をご連絡しました。",
    reasonLine,
    `到着予定:${arrivalTime}`,
  ].join("\n");
}

/**
 * LINE Messaging API へ push する。
 * X-Line-Retry-Key を付けることで、リトライ時の重複配信を防ぐ。
 */
async function linePush(to: string, text: string, retryKeySeed: string): Promise<void> {
  const token = LINE_CHANNEL_ACCESS_TOKEN.value();
  if (!token) {
    throw new Error("Secret LINE_CHANNEL_ACCESS_TOKEN が設定されていません");
  }

  const resp = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Line-Retry-Key": toUuid(retryKeySeed),
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
  });

  if (resp.status !== 200) {
    const body = await resp.text();
    throw new Error(`HTTP ${resp.status} ${body}`);
  }
}

/** シード文字列から決まった UUID を作る（同じ操作なら同じキーになる） */
function toUuid(seed: string): string {
  const hex = Array.from(seed)
    .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 7)
    .toString(16)
    .padStart(8, "0");
  const pad = (n: number) => hex.repeat(4).slice(0, n);
  return `${pad(8)}-${pad(4)}-4${pad(3)}-a${pad(3)}-${pad(12)}`;
}

interface NoticeLog {
  schedule_id: number;
  client_name: string | null;
  helper_name: string | null;
  destination: Destination;
  reason_code: ReasonCode;
  reason_note: string | null;
  arrival_time: string;
  /** 旧仕様の列。新規は null で残す */
  minutes: number | null;
  line_group_id: string | null;
  admin_notified: boolean;
  status: "sent" | "failed" | "needs_phone_call";
  message: string;
  error_message: string | null;
}

/** ログ保存の失敗で送信処理自体を落とさない。ただし黙って失敗させない */
async function logNotice(supabase: ReturnType<typeof getSupabaseSub2Client>, log: NoticeLog) {
  try {
    // supabase-js は失敗を例外ではなく error に入れて返すので、明示的に見る
    const { error } = await supabase
      .from("delay_notices")
      .insert({ ...log, sent_at: new Date().toISOString() });

    if (error) {
      console.error(
        `[delay-notify] ログ保存に失敗 schedule_id=${log.schedule_id} status=${log.status}: ${error.message}`,
      );
    }
  } catch (e) {
    console.error(
      `[delay-notify] ログ保存で例外 schedule_id=${log.schedule_id} status=${log.status}`,
      e,
    );
  }
}
