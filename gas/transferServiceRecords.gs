/**
 * ビレッジつばさ — サービス記録転送 GAS
 *
 * 「サービス記録転送」シートから予定データを読み取り、
 * Supabase の home_schedule_tasks / schedule_tasks_move に振り分けて INSERT する。
 *
 * 振り分けロジック:
 *   居宅（home）→ 行の背景色が #ff9900 または F列に「居宅」「身体」「家事」「通院」を含む
 *   移動支援（move）→ それ以外
 *
 * スクリプトプロパティ:
 *   SUPABASE_URL          — Supabase プロジェクト URL
 *   SUPABASE_SERVICE_KEY  — Supabase service_role キー（RLS bypass 用）
 *
 *   ⚠️ 旧 SUPABASE_API（anon キー）は 2026-04-25 の RLS ON 以降、
 *      home_schedule_tasks / schedule_tasks_move への INSERT が拒否される
 *      ため使えなくなった。service_role キーで上書き必須。
 */

// ─── 設定 ───────────────────────────────────────────────
var TARGET_SPREADSHEET_ID = "1mwKCznD2T_tM2Jwq2r-_ZXc6knQnYHD3mRjgFKRoiFQ";
var SHEET_NAME = "サービス記録転送";
var HEADER_ROW = 4; // ヘッダー行
var DATA_START_ROW = 5; // データ開始行

// 居宅判定キーワード（F列の内容）
var HOME_KEYWORDS = ["居宅", "身体", "家事", "通院"];
var HOME_BG_COLOR = "#ff9900";

// ─── メニュー追加 ───────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("サービス記録")
    .addItem("Supabaseに転送", "transferServiceRecords")
    .addToUi();
}

// ─── ボタンから実行 ─────────────────────────────────────

function runCheckFromButton() {
  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  try {
    ss.toast("チェック開始", "確認", 3);

    var result = transferServiceRecords();

    ss.toast("チェック完了", "確認", 5);
    Logger.log("チェック完了");
    return result;
  } catch (e) {
    Logger.log("エラー: " + (e && e.message ? e.message : String(e)));
    throw e;
  }
}

// ─── チェックボックストリガー ───────────────────────────

function onEditScheduleTransferCheckbox(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  var row = e.range.getRow();
  var col = e.range.getColumn();

  if (sheet.getName() !== "サービス記録転送") return;
  if (col !== 2) return;
  if (row < 2) return;
  if (e.range.getValue() !== true) return;

  var nameCell   = sheet.getRange(row, 1); // A列
  var resultCell = sheet.getRange(row, 3); // C列
  var timeCell   = sheet.getRange(row, 4); // D列
  var detailCell = sheet.getRange(row, 5); // E列
  var checkCell  = sheet.getRange(row, 2); // B列

  var runnerName = String(nameCell.getDisplayValue() || "").trim();
  var lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    resultCell.setValue("他ユーザー実行中");
    checkCell.setValue(false);
    return;
  }

  try {
    resultCell.setValue("");
    timeCell.setValue("");
    detailCell.setValue("");

    if (!runnerName) {
      throw new Error("A列の実行者名が空です");
    }

    resultCell.setValue("実行中...");
    SpreadsheetApp.flush();

    var result = transferServiceRecords();

    resultCell.setValue("転送完了");
    timeCell.setValue(new Date());

    detailCell.setValue(
      result === undefined || result === null || result === ""
        ? ""
        : (typeof result === "string" ? result : JSON.stringify(result))
    );

  } catch (err) {
    resultCell.setValue("エラー");
    timeCell.setValue(new Date());
    detailCell.setValue(err && err.message ? err.message : String(err));
  } finally {
    checkCell.setValue(false);
    lock.releaseLock();
  }
}

// ─── トリガー作成 ───────────────────────────────────────

function createEditTrigger() {
  var spreadsheetId = TARGET_SPREADSHEET_ID;

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onEditScheduleTransferCheckbox") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("onEditScheduleTransferCheckbox")
    .forSpreadsheet(spreadsheetId)
    .onEdit()
    .create();

  Logger.log("編集トリガーを作成しました: " + spreadsheetId);
}

// ─── メイン関数 ─────────────────────────────────────────

/**
 * 手動実行 / メニュー / チェックボックスから呼び出す関数
 * 戻り値: "居宅: X件, 移動: Y件" の結果文字列
 */
function transferServiceRecords() {
  var props = PropertiesService.getScriptProperties();
  var supabaseUrl = props.getProperty("SUPABASE_URL");
  // 2026-04-25 以降、RLS が ON のため service_role キー必須。
  // 後方互換のため SUPABASE_API（旧名）も読むが、SUPABASE_SERVICE_KEY を優先。
  var supabaseKey =
    props.getProperty("SUPABASE_SERVICE_KEY") || props.getProperty("SUPABASE_API");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "スクリプトプロパティに SUPABASE_URL と SUPABASE_SERVICE_KEY を設定してください"
    );
  }

  var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error("シート「" + SHEET_NAME + "」が見つかりません");
  }

  // A2セルから日付を取得（例: "4/7(火)" → "2026-04-07"）
  var rawDateCell = sheet.getRange("A2").getValue();
  var serviceDate = formatDate(rawDateCell);
  if (!serviceDate) {
    throw new Error("A2セルに日付が設定されていません");
  }
  Logger.log("日付: " + serviceDate);

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) {
    Logger.log("転送対象のデータがありません");
    return "0件（データなし）";
  }

  var dataRange = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, 13);
  var values = dataRange.getValues();
  var backgrounds = dataRange.getBackgrounds();

  var homeRecords = [];
  var moveRecords = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var bgColor = backgrounds[i][0]; // A列の背景色

    var helperName = trim(row[0]);   // A: ヘルパー
    var userName = trim(row[1]);     // B: 利用者
    var startTime = formatTime(row[2]); // C: 開始
    var endTime = formatTime(row[3]);   // D: 終了
    var haisha = trim(row[4]);       // E: 配車
    var task = trim(row[5]);         // F: 内容
    var summary = trim(row[6]);      // G: 概要
    // H列は使わない（日付はA2セルから取得済み）
    var purposeCode = trim(row[8]);  // I: 目的コード
    var twoPerson = trim(row[9]);    // J: 2人付フラグ
    var billing = trim(row[10]);     // K: 請求
    var beneficiaryNumber = trim(row[11]); // L: 受給者番号
    var helperEmail = trim(row[12]); // M: ヘルパーメール

    // 空行スキップ
    if (!helperName && !userName && !serviceDate) continue;

    var isHome = isHomeService(task, bgColor);

    // 日付がない行はスキップ（Supabaseのdate型に空文字は入れられない）
    if (!serviceDate) continue;

    if (isHome) {
      homeRecords.push({
        helper_name: helperName,
        helper_email: helperEmail || null,
        user_name: userName,
        start_time: startTime || null,
        end_time: endTime || null,
        task: task || null,
        summary: summary || null,
        service_date: serviceDate,
        beneficiary_number: beneficiaryNumber || null,
        status: "unwritten"
      });
    } else {
      moveRecords.push({
        helper_name: helperName,
        helper_email: helperEmail || null,
        user_name: userName,
        start_time: startTime || null,
        end_time: endTime || null,
        task: task || null,
        summary: summary || null,
        service_date: serviceDate || null,
        beneficiary_number: beneficiaryNumber || null,
        status: "unwritten"
      });
    }
  }

  Logger.log("居宅: " + homeRecords.length + "件, 移動: " + moveRecords.length + "件");

  // Supabase に upsert（重複防止）
  var homeResult = upsertToSupabase(supabaseUrl, supabaseKey, "home_schedule_tasks", homeRecords);
  var moveResult = upsertToSupabase(supabaseUrl, supabaseKey, "schedule_tasks_move", moveRecords);

  var resultText = "居宅: " + homeResult + ", 移動: " + moveResult;
  Logger.log(resultText);
  return resultText;
}

// ─── 居宅判定 ───────────────────────────────────────────

function isHomeService(task, bgColor) {
  // F列に居宅キーワード（居宅・身体・家事・通院）が含まれていたら居宅
  // それ以外は全て移動支援
  if (task) {
    var taskStr = task.toString();
    for (var i = 0; i < HOME_KEYWORDS.length; i++) {
      if (taskStr.indexOf(HOME_KEYWORDS[i]) >= 0) {
        return true;
      }
    }
  }

  return false;
}

// ─── Supabase 転送 ──────────────────────────────────────

function upsertToSupabase(url, key, table, records) {
  if (!records || records.length === 0) {
    return "0件（スキップ）";
  }

  // 50件ずつバッチ送信
  var batchSize = 50;
  var totalInserted = 0;

  for (var i = 0; i < records.length; i += batchSize) {
    var batch = records.slice(i, i + batchSize);

    var endpoint = url + "/rest/v1/" + table;
    var options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Prefer": "resolution=ignore-duplicates,return=minimal"
      },
      payload: JSON.stringify(batch),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(endpoint, options);
    var code = response.getResponseCode();

    if (code >= 200 && code < 300) {
      totalInserted += batch.length;
    } else {
      Logger.log("エラー (" + table + "): " + code + " - " + response.getContentText());
    }
  }

  return totalInserted + "件 転送完了";
}

// ─── ユーティリティ ─────────────────────────────────────

function trim(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    var y = value.getFullYear();
    var m = ("0" + (value.getMonth() + 1)).slice(-2);
    var d = ("0" + value.getDate()).slice(-2);
    return y + "-" + m + "-" + d;
  }
  var str = String(value).trim();
  // "2026-04-07" 形式ならそのまま
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // "4/7(火)" や "4/7（土）" → 曜日部分を除去してパース（全角・半角両対応）
  var cleaned = str.replace(/[（(].*?[）)]/g, "").trim();
  // "4/7" 形式 → 今年の日付として処理
  var slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    var year = new Date().getFullYear();
    var mon = ("0" + slashMatch[1]).slice(-2);
    var day = ("0" + slashMatch[2]).slice(-2);
    return year + "-" + mon + "-" + day;
  }
  // その他の形式
  var parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    var y = parsed.getFullYear();
    var m = ("0" + (parsed.getMonth() + 1)).slice(-2);
    var d = ("0" + (parsed.getDate())).slice(-2);
    return y + "-" + m + "-" + d;
  }
  // 変換できない場合は throw（旧コードは return str だったが、Supabase に
  // 不正な値が渡って 22007 エラーになるのを防ぐため、ここで止める）
  throw new Error("日付変換できません: " + str);
}

function formatTime(value) {
  if (!value) return "";
  if (value instanceof Date) {
    var h = ("0" + value.getHours()).slice(-2);
    var m = ("0" + value.getMinutes()).slice(-2);
    return h + ":" + m;
  }
  var str = String(value).trim();
  // "14:00" or "14:00:00" 形式
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
    return str.slice(0, 5);
  }
  return str;
}
