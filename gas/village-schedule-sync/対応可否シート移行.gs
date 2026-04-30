// ==========================================================
// 対応可否シート → user_helper_compatibility 初回移行 (one-shot tool)
//
// 目的: ⚪︎×シート (1djiBf7s_JKgkp1Df1K40rCoqyewFBdfBaUnMtGKZLw)
//       の内容を Supabase の user_helper_compatibility テーブルに UPSERT する。
//
// 実行手順 (初回):
//   1. migrateCompatibilityDryRun() を実行 → ログでミスマッチを確認
//   2. ミスマッチがあれば helper_master を整備 (姓だけに統一など)
//   3. migrateCompatibilityApply() を実行 → 本番初回 UPSERT
//
// 実行手順 (週次自動同期 セットアップ):
//   4. installWeeklyCompatibilityTrigger() を 1 回だけ実行
//      → 毎週月曜 03:00 JST に migrateCompatibilityWeekly() が自動実行される
//   5. 停止したい場合: uninstallWeeklyCompatibilityTrigger()
//
// 関数一覧:
//   公開（関数選択ドロップダウンに出る）:
//     migrateCompatibilityDryRun()           — 解析のみ、書き込みなし
//     migrateCompatibilityApply()            — 厳格モード (未登録ヘルパーで abort)
//     installWeeklyCompatibilityTrigger()    — 週次トリガー設定 (1 回実行)
//     uninstallWeeklyCompatibilityTrigger()  — 週次トリガー削除
//   非公開（末尾 _、トリガー or 内部呼出専用）:
//     migrateCompatibilityWeekly_()          — 週次トリガー本体 (lenient 続行)
//     その他の内部関数                        — runCompatibilityMigration_ など
//
// シート構造 (奥原確認済み):
//   行 1: 更新チェック (バックグラウンド系列, 無視)
//   行 2: B 列空, C 列以降にヘルパー短名
//   行 3〜: B 列に利用者名 (例: "藍 涼之介"), C 列以降にマーク
//
// 値の正規化:
//   ⚪︎/○/◯/〇/⚪ → '⚪︎'
//   ×/✕/x/X/✗   → '×'
//   △/▲          → '△'
//   1/１          → '1'
//   2/２          → '2'
//   N/n/NG/ng    → 'N'
//   空欄/不明     → '×' (奥原指定: 未定義は × 扱い)
//
// 利用者名: "藍 涼之介" → "藍涼之介様" (schedule.client 形式に合わせる)
// 「(二人付)」マーカーは正規化時に除去 (二人付け案件は schedule 側で判定)
// ==========================================================

const COMPAT_SHEET_ID = '1djiBf7s_JKgkp1Df1K40rCoqyewFBdfBaUnMtGKZLw';
const COMPAT_HEADER_ROW = 2;       // 1-indexed: ヘルパー名行
const COMPAT_USER_COL = 2;         // 1-indexed: B 列 = 利用者名
const COMPAT_DATA_START_ROW = 3;   // 1-indexed: データ開始行
const COMPAT_DATA_START_COL = 3;   // 1-indexed: C 列以降がデータ

// ===== Public functions (関数選択ドロップダウンに出る) =====

function migrateCompatibilityDryRun() {
  return runCompatibilityMigration_(true);
}

function migrateCompatibilityApply() {
  return runCompatibilityMigration_(false);
}

// 週次トリガー（毎週月曜 3:00 JST）を設定する。1 回だけ実行すれば OK
function installWeeklyCompatibilityTrigger() {
  // 既存トリガーを掃除（重複防止）
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (
      t.getHandlerFunction() === 'migrateCompatibilityWeekly_' ||
      t.getHandlerFunction() === 'migrateCompatibilityWeekly' ||
      t.getHandlerFunction() === 'migrateCompatibilityApply'
    ) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  if (removed > 0) {
    Logger.log('既存の対応可否同期トリガー %s 個を削除しました', removed);
  }

  // 毎週月曜 3:00 JST に migrateCompatibilityWeekly_ を実行
  ScriptApp.newTrigger('migrateCompatibilityWeekly_')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(3)
    .inTimezone('Asia/Tokyo')
    .create();

  Logger.log('✅ 週次トリガー設定完了: 毎週月曜 03:00 JST に migrateCompatibilityWeekly_ を実行');
}

// 必要なら週次トリガーを停止
function uninstallWeeklyCompatibilityTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (
      t.getHandlerFunction() === 'migrateCompatibilityWeekly_' ||
      t.getHandlerFunction() === 'migrateCompatibilityWeekly' ||
      t.getHandlerFunction() === 'migrateCompatibilityApply'
    ) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log('週次トリガー %s 個を削除しました', removed);
}

// ===== Trigger-only / Internal (関数選択ドロップダウンに出さない、末尾 _) =====

// 週次トリガー本体: 未マッチがあっても abort せず、known ヘルパー分だけ sync する
// （新ヘルパー列が追加された日から helper_master 整備完了までも止まらない）
function migrateCompatibilityWeekly_() {
  Logger.log('==== 週次自動同期 開始 ====');
  return runCompatibilityMigration_(false, true /* lenient */);
}

// ===== Core =====

function runCompatibilityMigration_(dryRun, lenient) {
  const ctx = setupSupabaseContext_();
  const sheet = openCompatibilitySheet_();
  const matrix = readCompatibilityMatrix_(sheet);
  const helperMap = fetchHelperEmailMap_(ctx);
  const result = analyzeCompatibilityMatrix_(matrix, helperMap);

  logCompatibilityReport_(result, dryRun);

  if (dryRun) {
    Logger.log('=== Dry-Run のみ。実適用は migrateCompatibilityApply() を実行 ===');
    return result;
  }

  if (result.unknownHelpers.length > 0) {
    if (lenient) {
      Logger.log('⚠️ %s 名のヘルパー列が helper_master 未登録ですが、lenient モードのため known ヘルパー分だけ続行します。',
        result.unknownHelpers.length);
      Logger.log('未登録ヘルパー（要対処）: %s', JSON.stringify(result.unknownHelpers));
    } else {
      Logger.log('❌ ABORT: %s 名のヘルパー列が helper_master に未登録のため、apply を中断しました。', result.unknownHelpers.length);
      Logger.log('未登録ヘルパー: %s', JSON.stringify(result.unknownHelpers));
      Logger.log('対処: helper_master に登録するか、シートのヘルパー列を helper_master と一致する名前に揃えてから再実行してください。');
      throw new Error('Aborting due to unknown helpers in spreadsheet');
    }
  }

  if (result.unknownStatusCells.length > 0) {
    Logger.log('⚠️ %s セルに不明な値があります。これらは「×」として記録されます。', result.unknownStatusCells.length);
  }

  Logger.log('==== Apply 開始: %s 行を UPSERT します ====', result.payload.length);
  upsertCompatibilityToSupabase_(ctx, result.payload);
  Logger.log('✅ Apply 完了: %s 行を user_helper_compatibility に UPSERT しました', result.payload.length);
  return result;
}

// ===== Setup / Spreadsheet =====

function setupSupabaseContext_() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SUPABASE_URL');
  const key =
    props.getProperty('SUPABASE_SERVICE_KEY') ||
    props.getProperty('SUPABASE_API');
  if (!url || !key) {
    throw new Error('Script Properties に SUPABASE_URL または SUPABASE_API/SUPABASE_SERVICE_KEY が未設定です');
  }
  return { url: url.replace(/\/$/, ''), key: key };
}

function openCompatibilitySheet_() {
  const ss = SpreadsheetApp.openById(COMPAT_SHEET_ID);
  const sheets = ss.getSheets();
  if (sheets.length === 0) {
    throw new Error('Compatibility sheet has no tabs');
  }
  // 単一シート前提 (奥原確認済み)
  return sheets[0];
}

function readCompatibilityMatrix_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < COMPAT_DATA_START_ROW || lastCol < COMPAT_DATA_START_COL) {
    throw new Error('シートが空、または期待された構造になっていません');
  }
  const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();

  // ヘルパー短名 (header row, C 列以降)
  const helperHeaders = [];
  for (let c = COMPAT_DATA_START_COL - 1; c < lastCol; c++) {
    const name = String(values[COMPAT_HEADER_ROW - 1][c] || '').trim();
    helperHeaders.push({ col: c, shortName: name });
  }

  // 利用者行
  const userRows = [];
  for (let r = COMPAT_DATA_START_ROW - 1; r < lastRow; r++) {
    const userName = String(values[r][COMPAT_USER_COL - 1] || '').trim();
    if (!userName) continue;
    const cells = {};
    for (const h of helperHeaders) {
      if (!h.shortName) continue;
      cells[h.shortName] = String(values[r][h.col] || '').trim();
    }
    userRows.push({ row: r + 1, rawName: userName, cells: cells });
  }

  return { helperHeaders: helperHeaders, userRows: userRows };
}

// ===== Supabase REST =====

function fetchHelperEmailMap_(ctx) {
  const endpoint = ctx.url + '/rest/v1/helper_master?select=helper_name,helper_email';
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'get',
    headers: {
      apikey: ctx.key,
      Authorization: 'Bearer ' + ctx.key,
    },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code >= 300) {
    throw new Error('helper_master fetch failed: HTTP ' + code + ' ' + res.getContentText());
  }
  const rows = JSON.parse(res.getContentText());
  const map = {};
  for (const r of rows) {
    if (r && r.helper_name && r.helper_email) {
      map[String(r.helper_name).trim()] = String(r.helper_email).trim();
    }
  }
  return map;
}

function upsertCompatibilityToSupabase_(ctx, payload) {
  const CHUNK = 500;
  const endpoint =
    ctx.url +
    '/rest/v1/user_helper_compatibility?on_conflict=user_name,helper_email';

  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    const res = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        apikey: ctx.key,
        Authorization: 'Bearer ' + ctx.key,
        Prefer: 'resolution=merge-duplicates',
      },
      payload: JSON.stringify(chunk),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code >= 300) {
      Logger.log('  ❌ Chunk %s HTTP %s: %s', i, code, res.getContentText());
      throw new Error('Supabase upsert failed at chunk start ' + i + ': HTTP ' + code);
    }
    Logger.log(
      '  Chunk %s/%s OK (%s rows)',
      Math.floor(i / CHUNK) + 1,
      Math.ceil(payload.length / CHUNK),
      chunk.length
    );
  }
}

// ===== Normalization =====

function normalizeUserName_(raw) {
  let name = String(raw || '').trim();
  // 全角・半角スペースを削除
  name = name.replace(/[\s　]+/g, '');
  // (二人付) のような括弧書きを削除
  name = name.replace(/[\(（].*?[\)）]/g, '');
  if (!name) return '';
  // 末尾の「様」が無ければ付ける
  if (!/様$/.test(name)) name += '様';
  return name;
}

function normalizeStatus_(raw) {
  const text = String(raw || '').trim();
  if (text === '') return { status: '×', isKnown: true, isEmpty: true };
  // ⚪︎ 系
  if (
    text === '⚪︎' ||
    text === '⚪' ||
    text === '○' ||
    text === '◯' ||
    text === '〇'
  ) {
    return { status: '⚪︎', isKnown: true };
  }
  // × 系
  if (
    text === '×' ||
    text === '✕' ||
    text === 'x' ||
    text === 'X' ||
    text === '✗'
  ) {
    return { status: '×', isKnown: true };
  }
  // △ 系
  if (text === '△' || text === '▲') return { status: '△', isKnown: true };
  // 1
  if (text === '1' || text === '１') return { status: '1', isKnown: true };
  // 2
  if (text === '2' || text === '２') return { status: '2', isKnown: true };
  // N 系
  if (
    text === 'N' ||
    text === 'n' ||
    text.toUpperCase() === 'NG'
  ) {
    return { status: 'N', isKnown: true };
  }
  // 不明 → ×
  return { status: '×', isKnown: false, original: text };
}

// ===== Analysis =====

function analyzeCompatibilityMatrix_(matrix, helperMap) {
  const knownHelpers = [];
  const unknownHelpers = [];

  for (const h of matrix.helperHeaders) {
    if (!h.shortName) continue;
    if (helperMap[h.shortName]) {
      knownHelpers.push({ shortName: h.shortName, email: helperMap[h.shortName] });
    } else {
      unknownHelpers.push(h.shortName);
    }
  }

  const payload = [];
  const unknownStatusCells = [];
  const statusCounts = {};

  for (const userRow of matrix.userRows) {
    const userName = normalizeUserName_(userRow.rawName);
    if (!userName) continue;

    for (const helper of knownHelpers) {
      const cellValue = userRow.cells[helper.shortName] || '';
      const norm = normalizeStatus_(cellValue);

      if (!norm.isKnown) {
        unknownStatusCells.push({
          user: userRow.rawName,
          helper: helper.shortName,
          raw: norm.original,
          row: userRow.row,
        });
      }

      statusCounts[norm.status] = (statusCounts[norm.status] || 0) + 1;

      payload.push({
        user_name: userName,
        helper_email: helper.email,
        status: norm.status,
        status_set_by: 'admin',
        updated_by: 'gas-migration',
      });
    }
  }

  return {
    knownHelpers: knownHelpers,
    unknownHelpers: unknownHelpers,
    helperHeadersTotal: matrix.helperHeaders.filter(function (h) {
      return !!h.shortName;
    }).length,
    userRowsTotal: matrix.userRows.length,
    unknownStatusCells: unknownStatusCells,
    statusCounts: statusCounts,
    payload: payload,
  };
}

// ===== Logging =====

function logCompatibilityReport_(result, dryRun) {
  Logger.log('===== Compatibility Migration %s Report =====', dryRun ? 'Dry-Run' : 'Apply');
  Logger.log('シート上のヘルパー列: %s 名', result.helperHeadersTotal);
  Logger.log('  helper_master と一致: %s 名', result.knownHelpers.length);
  Logger.log('  ⚠️ 未マッチ: %s 名', result.unknownHelpers.length);
  if (result.unknownHelpers.length > 0) {
    Logger.log('  → 未マッチ一覧: %s', JSON.stringify(result.unknownHelpers));
    Logger.log('  → 対処方法: helper_master の helper_name を揃えるか、シート列を改名してください');
  }
  Logger.log('シート上の利用者: %s 名', result.userRowsTotal);
  Logger.log('UPSERT 予定セル数: %s', result.payload.length);
  Logger.log('ステータス分布: %s', JSON.stringify(result.statusCounts));
  Logger.log('⚠️ 不明な値のセル: %s 個', result.unknownStatusCells.length);
  if (result.unknownStatusCells.length > 0) {
    Logger.log('  → 先頭 10 件: %s', JSON.stringify(result.unknownStatusCells.slice(0, 10)));
  }
}
