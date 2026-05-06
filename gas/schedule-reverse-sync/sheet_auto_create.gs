// ============================================
// 月次自動化 + Supabase 未反映分の流し込み（シート状態ベース版）
// ============================================
//
// 【初回セットアップ】
// 1. GASエディタ → ⚙（プロジェクトの設定）→ スクリプトプロパティ に以下を登録
//    SUPABASE_URL         = https://pbqqqwwgswniuomjlhsh.supabase.co
//    SUPABASE_SERVICE_KEY = （Supabase の Service Role Key）
// 2. installMonthlyTrigger_() を 1 回だけ手動実行
//    → 毎月 15 日 00:05 に monthlySheetAutoCreate_() が走るトリガーが登録される
//
// 【動作】
// - 毎月 15 日 00:05 に翌月分の週シート6枚を生成
// - 生成直後、Supabase にある対象月の全予定をシートに書き込む。
//   ただしシートの supabaseId 列を見て、既に書き込まれているものはスキップ（＝重複しない）
//
// 【手動で今すぐ試したい場合】
// - runMonthlySheetAutoCreateNow() を手動実行

const SHEET_KIHON_NAME = '基本';

// -------------------- エントリーポイント --------------------

function monthlySheetAutoCreate_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID_SYNC);
  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth() + 1;

  console.log('月次シート作成開始: target=' + targetYear + '-' + String(targetMonth).padStart(2, '0'));

  const baseSh = ss.getSheetByName(SHEET_KIHON_NAME);
  if (!baseSh) {
    console.error('シート「' + SHEET_KIHON_NAME + '」が見つかりません');
    return;
  }
  baseSh.getRange('A2').setValue(targetDate);
  SpreadsheetApp.flush();

  try {
    createCalendarsWeek1to6_FromKihonA2_MondayStart(ss);
    console.log('シート生成完了');
  } catch (ex) {
    console.error('シート生成エラー: ' + ex.message);
    return;
  }

  try {
    const result = flushScheduleToSheet_(targetYear, targetMonth);
    console.log('流し込み完了: 書き込み=' + result.added + ' / 既存スキップ=' + result.skipped + ' / 失敗=' + result.failed);
  } catch (ex) {
    console.error('流し込みエラー: ' + ex.message);
  }
}

function runMonthlySheetAutoCreateNow() {
  monthlySheetAutoCreate_();
}

function installMonthlyTrigger_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'monthlySheetAutoCreate_') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('monthlySheetAutoCreate_')
    .timeBased()
    .onMonthDay(15)
    .atHour(0)
    .nearMinute(5)
    .create();

  console.log('トリガー登録完了: 毎月15日 00:05 に monthlySheetAutoCreate_ が走ります');
}

// -------------------- 流し込み本体 --------------------

function flushScheduleToSheet_(year, month) {
  const ym1 = year + '-' + String(month).padStart(2, '0') + '-01';
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const ym2 = nextYear + '-' + String(nextMonth).padStart(2, '0') + '-01';

  const query = 'date=gte.' + ym1 + '&date=lt.' + ym2 + '&order=date.asc,start_time.asc';
  const rows = sbSelect_('schedule', query);

  console.log('対象月の予定取得: ' + rows.length + ' 件 (範囲 ' + ym1 + ' 〜 ' + ym2 + ')');

  let added = 0, skipped = 0, failed = 0;

  for (const r of rows) {
    const startTime = formatTime_(r.start_time);

    const existing = findRowByIdOrKey_(r.date, r.id, r.client, startTime);
    if (existing) {
      skipped++;
      continue;
    }

    const payload = {
      supabaseId: r.id,
      date: r.date,
      helper: r.name || '担当未設定',
      client: r.client,
      startTime: startTime,
      endTime: formatTime_(r.end_time),
      task: r.task,
      summary: r.summary || r.task,
      beneficiaryNumber: r.beneficiary_number || '',
      helperEmail: r.helper_email || ''
    };

    try {
      const res = handleAdd(payload);
      if (res.success) {
        added++;
      } else {
        console.warn('handleAdd 失敗: id=' + r.id + ' → ' + res.error);
        failed++;
      }
    } catch (ex) {
      console.error('handleAdd 例外: id=' + r.id + ' → ' + ex.message);
      failed++;
    }
  }

  return { added: added, skipped: skipped, failed: failed };
}

// -------------------- Supabase REST ヘルパー --------------------

function sbConfig_() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SUPABASE_URL');
  const key = props.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) {
    throw new Error('スクリプトプロパティに SUPABASE_URL / SUPABASE_SERVICE_KEY が未設定です');
  }
  return { url: url, key: key };
}

function sbSelect_(table, query) {
  const cfg = sbConfig_();
  const endpoint = cfg.url + '/rest/v1/' + table + '?' + query;
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'get',
    headers: {
      'apikey': cfg.key,
      'Authorization': 'Bearer ' + cfg.key,
      'Accept': 'application/json'
    },
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code !== 200) {
    throw new Error('sbSelect ' + code + ': ' + body);
  }
  return JSON.parse(body);
}

function formatTime_(t) {
  if (!t) return '';
  const s = String(t);
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return String(parseInt(m[1])).padStart(2, '0') + ':' + m[2];
  return s;
}

// -------------------- テスト用 --------------------

function testSupabaseConnection() {
  try {
    const rows = sbSelect_('schedule', 'limit=1');
    console.log('接続OK: ' + JSON.stringify(rows));
  } catch (ex) {
    console.error('接続NG: ' + ex.message);
  }
}

function testFullFlowForMonth(year, month) {
  if (!year || !month || typeof year !== 'number' || typeof month !== 'number') {
    throw new Error('引数が必要です。testFullFlowFor2026_06 のような wrapper 関数を作って実行してください。');
  }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID_SYNC);
  const baseSh = ss.getSheetByName(SHEET_KIHON_NAME);
  baseSh.getRange('A2').setValue(new Date(year, month - 1, 1));
  SpreadsheetApp.flush();
  createCalendarsWeek1to6_FromKihonA2_MondayStart(ss);
  const result = flushScheduleToSheet_(year, month);
  console.log('テスト結果: 書き込み=' + result.added + ' / 既存スキップ=' + result.skipped + ' / 失敗=' + result.failed);
  return result;
}

function testFullFlowFor2026_06() {
  testFullFlowForMonth(2026, 6);
}

function testFullFlowFor2026_07() {
  testFullFlowForMonth(2026, 7);
}


function testCountAndKey() {
  const cfg = sbConfig_();
  const res = UrlFetchApp.fetch(cfg.url + '/rest/v1/schedule?select=id&limit=1', {
    method: 'get',
    headers: {
      'apikey': cfg.key,
      'Authorization': 'Bearer ' + cfg.key,
      'Prefer': 'count=exact'
    },
    muteHttpExceptions: true
  });
  const headers = res.getHeaders();
  console.log('Content-Range: ' + (headers['Content-Range'] || headers['content-range']));

  const parts = cfg.key.split('.');
  if (parts.length === 3) {
    const decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString();
    console.log('JWT: ' + decoded);
  }
  console.log('URL: ' + cfg.url);
}
