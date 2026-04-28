/*************************************************
 * 固定設定
 *************************************************/
const SPREADSHEET_ID = '1mwKCznD2T_tM2Jwq2r-_ZXc6knQnYHD3mRjgFKRoiFQ';
const TARGET_SHEET_KEYWORD = 'カレンダー';
const TABLE_NAME = 'schedule';

/*************************************************
 * Supabase送信用 設定
 * 各曜日は22列ブロック固定
 *************************************************/
const WEEK_BLOCKS = [
  { label: '月曜', dateCell: 'D2', startCol: 'D', endCol: 'Y' },
  { label: '火曜', dateCell: 'AA2', startCol: 'AA', endCol: 'AV' },
  { label: '水曜', dateCell: 'AX2', startCol: 'AX', endCol: 'BS' },
  { label: '木曜', dateCell: 'BU2', startCol: 'BU', endCol: 'CP' },
  { label: '金曜', dateCell: 'CR2', startCol: 'CR', endCol: 'DM' },
  { label: '土曜', dateCell: 'DO2', startCol: 'DO', endCol: 'EJ' },
  { label: '日曜', dateCell: 'EL2', startCol: 'EL', endCol: 'FG' }
];

// ※ HEADER_ROW と DATA_START_ROW は削除しました（動的検索に変更）

/*************************************************
 * 確認用：取得プレビュー
 *************************************************/
function testCollectScheduleRowsPreviewCalendar202605Week1() {
  const rows = collectScheduleRowsForTargetSheet();

  Logger.log('対象キーワード: ' + TARGET_SHEET_KEYWORD);
  Logger.log('取得件数: ' + rows.length);
  Logger.log(JSON.stringify(rows.slice(0, 20), null, 2));
}

const SKIP_BG_COLORS = {
  '#434343': true,
  '#666666': true,
  '#999999': true,
  '#b7b7b7': true
};

/*************************************************
 * 本番用：全削除→再送信
 *************************************************/
function replaceAllCalendarSheetsToSupabase() {
  const SUPABASE_URL = PropertiesService.getScriptProperties().getProperty('SUPABASE_URL');
  const SUPABASE_API_KEY = PropertiesService.getScriptProperties().getProperty('SUPABASE_API');

  if (!SUPABASE_URL || !SUPABASE_API_KEY) {
    throw new Error('Script Properties に SUPABASE_URL または SUPABASE_API が未設定です');
  }

  const rows = collectScheduleRowsForTargetSheet();

  Logger.log('対象キーワード: ' + TARGET_SHEET_KEYWORD);
  Logger.log('取得件数: ' + rows.length);
  Logger.log(JSON.stringify(rows.slice(0, 20), null, 2));

  if (!rows || rows.length === 0) {
    Logger.log('⚠️ 送信対象データが0件のため、中断します');
    return;
  }

  deleteAllScheduleRows_(SUPABASE_URL, SUPABASE_API_KEY);

  const payload = rows.map(function (r) {
    return {
      date: r.date || null,
      name: safeTrim_(r.name),
      helper_email: safeTrim_(r.helper_email),
      client: safeTrim_(r.client),
      start_time: toTimeHHmm(r.start_time),
      end_time: toTimeHHmm(r.end_time),
      haisha: safeTrim_(r.haisha),
      task: safeTrim_(r.task),
      summary: safeTrim_(r.summary),
      beneficiary_number: safeTrim_(r.beneficiary_number)
    };
  }).filter(function (r) {
    return !isSchedulePayloadEmpty_(r);
  });

  if (payload.length === 0) {
    Logger.log('⚠️ 整形後に送信対象が0件になりました');
    return;
  }

  const endpoint =
    SUPABASE_URL.replace(/\/$/, '') +
    '/rest/v1/' +
    TABLE_NAME;

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: {
      apikey: SUPABASE_API_KEY,
      Authorization: 'Bearer ' + SUPABASE_API_KEY,
      Prefer: 'return=representation'
    },
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(endpoint, options);
  const status = res.getResponseCode();
  const body = res.getContentText();

  Logger.log('POST status: ' + status);
  Logger.log(body);

  if (status === 200 || status === 201) {
    Logger.log('✅ Supabaseへ ' + payload.length + ' 件再登録しました');
  } else {
    Logger.log('❌ 再登録エラー（' + status + '）: ' + body);
    throw new Error('Supabase再登録失敗: ' + status + ' / ' + body);
  }
}

/*************************************************
 * schedule 全削除
 *************************************************/
function deleteAllScheduleRows_(SUPABASE_URL, SUPABASE_API_KEY) {
  const endpoint =
    SUPABASE_URL.replace(/\/$/, '') +
    '/rest/v1/' +
    TABLE_NAME +
    '?id=not.is.null';

  const options = {
    method: 'delete',
    headers: {
      apikey: SUPABASE_API_KEY,
      Authorization: 'Bearer ' + SUPABASE_API_KEY,
      Prefer: 'return=representation'
    },
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(endpoint, options);
  const status = res.getResponseCode();
  const body = res.getContentText();

  Logger.log('DELETE status: ' + status);
  Logger.log(body);

  if (status === 200 || status === 204) {
    Logger.log('✅ schedule テーブルの既存データを削除しました');
  } else {
    Logger.log('❌ 削除エラー（' + status + '）: ' + body);
    throw new Error('schedule削除失敗: ' + status + ' / ' + body);
  }
}

/*************************************************
 * 「カレンダー」を含むシートを全部対象に配列を作成
 *************************************************/
function collectScheduleRowsForTargetSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();

  const targetSheets = sheets.filter(function (sh) {
    return /^カレンダー_\d{6}_\d+週目$/.test(sh.getName());
  });

  if (targetSheets.length === 0) {
    throw new Error('対象シートが見つかりません');
  }

  const allRows = [];

  Logger.log('対象シート数: ' + targetSheets.length);

  targetSheets.forEach(function (sh) {
    try {
      const d1 = safeTrim_(sh.getRange('D1').getDisplayValue());
      const ym = parseYearMonthFromD1_(d1);

      if (!ym) {
        Logger.log('⚠️ スキップ（D1から年月取得不可）: ' + sh.getName() + ' / D1=' + d1);
        return;
      }

      const rows = collectScheduleRowsFromOneSheet_(sh, ym);

      Logger.log('対象シート: ' + sh.getName() + ' / 取得件数: ' + rows.length);

      allRows.push.apply(allRows, rows);
    } catch (e) {
      Logger.log('⚠️ スキップ（処理エラー）: ' + sh.getName() + ' / ' + e.message);
    }
  });

  Logger.log('schedule合計取得件数: ' + allRows.length);
  Logger.log(JSON.stringify(allRows.slice(0, 5), null, 2));

  return allRows;
}

/*************************************************
 * 1シート分の配列を作成
 *************************************************/
function collectScheduleRowsFromOneSheet_(sh, ym) {
  const ANCHOR_TEXT = 'ヘルパーシフト';
  const results = [];

  for (const block of WEEK_BLOCKS) {
    const dateText = safeTrim_(sh.getRange(block.dateCell).getDisplayValue());
    if (!dateText) continue;

    const day = extractDayFromHeaderText_(dateText, ym.month);
    if (!day) continue;

    const isoDate = toIsoDate_(ym.year, ym.month, day);

    const startColNum = columnA1ToNumber_(block.startCol);
    const endColNum = columnA1ToNumber_(block.endCol);
    const width = endColNum - startColNum + 1;

    const headerResult = getHeaderMapForBlock_(sh, block);
    if (!headerResult) {
      Logger.log('⚠️ ' + block.label + ': ヘッダー行（「ヘルパー」を含む行）が見つかりません。スキップします');
      continue;
    }

    const headerMap = headerResult.headerMap;
    const headerRow = headerResult.headerRow;
    const dataStartRow = headerRow + 1;

    requireHeaders_(headerMap, ['ヘルパー', '利用者', '開始', '終了'], block.label);

    const anchorRow = findAnchorRowInColumn_(sh, startColNum, ANCHOR_TEXT);
    if (!anchorRow) continue;

    const endRow = anchorRow - 1;
    if (endRow < dataStartRow) continue;

    const numRows = endRow - dataStartRow + 1;

    const range = sh.getRange(dataStartRow, startColNum, numRows, width);
    const values = range.getDisplayValues();
    const backgrounds = range.getBackgrounds();

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const rowBackgrounds = backgrounds[i];

      // 指定色の背景が含まれる行は転送しない
      if (hasSkipBgColor_(rowBackgrounds)) {
        Logger.log('背景色除外: ' + sh.getName() + ' / ' + block.label + ' / 行=' + (dataStartRow + i));
        continue;
      }

      const helper = getValueByHeader_(row, startColNum, headerMap, 'ヘルパー');
      const client = getValueByHeader_(row, startColNum, headerMap, '利用者');
      const start = normalizeTimeText_(getValueByHeader_(row, startColNum, headerMap, '開始'));
      const end = normalizeTimeText_(getValueByHeader_(row, startColNum, headerMap, '終了'));
      const haisha = getValueByHeader_(row, startColNum, headerMap, '配車');
      const task = getValueByHeader_(row, startColNum, headerMap, '内容');
      const summary = getValueByHeader_(row, startColNum, headerMap, '概要');
      const beneficiaryNumber = getValueByHeader_(row, startColNum, headerMap, '受給者番号');
      const helperEmail = getValueByHeader_(row, startColNum, headerMap, 'ヘルパーメール');

      if (
        !helper &&
        !client &&
        !start &&
        !end &&
        !haisha &&
        !task &&
        !summary &&
        !beneficiaryNumber &&
        !helperEmail
      ) {
        continue;
      }

      results.push({
        date: isoDate,
        name: helper,
        helper_email: helperEmail,
        client: client,
        start_time: start,
        end_time: end,
        haisha: haisha,
        task: task,
        summary: summary,
        beneficiary_number: beneficiaryNumber
      });
    }
  }

  return results;
}

/*************************************************
 * ★ 新関数：ブロック内で「ヘルパー」を含む行番号を検索
 *************************************************/
function findHeaderRowInBlock_(sheet, block) {
  const startColNum = columnA1ToNumber_(block.startCol);
  const endColNum = columnA1ToNumber_(block.endCol);
  const width = endColNum - startColNum + 1;
  const lastRow = sheet.getLastRow();

  if (lastRow < 1) return null;

  const allValues = sheet.getRange(1, startColNum, lastRow, width).getDisplayValues();

  for (let i = 0; i < allValues.length; i++) {
    for (let j = 0; j < allValues[i].length; j++) {
      if (safeTrim_(allValues[i][j]).indexOf('ヘルパー') !== -1) {
        return i + 1; // 1始まりの行番号
      }
    }
  }

  return null; // 見つからない場合
}

/*************************************************
 * 見出しマップ（★ 動的ヘッダー行に対応・headerRow も返す）
 *************************************************/
function getHeaderMapForBlock_(sheet, block) {
  const startColNum = columnA1ToNumber_(block.startCol);
  const endColNum = columnA1ToNumber_(block.endCol);
  const width = endColNum - startColNum + 1;

  // ★ 固定行番号ではなく動的に検索
  const headerRow = findHeaderRowInBlock_(sheet, block);
  if (!headerRow) return null;

  const headers = sheet.getRange(headerRow, startColNum, 1, width).getDisplayValues()[0];
  const map = {};

  for (let i = 0; i < headers.length; i++) {
    const key = safeTrim_(headers[i]);
    if (key) {
      map[key] = startColNum + i;
    }
  }

  return { headerMap: map, headerRow: headerRow }; // ★ headerRow も返す
}

function requireHeaders_(headerMap, requiredHeaders, blockLabel) {
  const missing = requiredHeaders.filter(function (key) {
    return !headerMap[key];
  });

  if (missing.length > 0) {
    throw new Error(blockLabel + ' の見出し不足: ' + missing.join(', '));
  }
}

function getValueByHeader_(rowValues, startColNum, headerMap, headerName) {
  const colNum = headerMap[headerName];
  if (!colNum) return '';
  return safeTrim_(rowValues[colNum - startColNum]);
}

/*************************************************
 * 共通関数
 *************************************************/

function hasSkipBgColor_(rowBackgrounds) {
  if (!rowBackgrounds || rowBackgrounds.length === 0) return false;

  for (let i = 0; i < rowBackgrounds.length; i++) {
    const color = String(rowBackgrounds[i] || '').toLowerCase();
    if (SKIP_BG_COLORS[color]) {
      return true;
    }
  }

  return false;
}


function parseYearMonthFromD1_(text) {
  const m = safeTrim_(text).match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  if (!m) return null;

  return {
    year: Number(m[1]),
    month: Number(m[2])
  };
}

function extractDayFromHeaderText_(text, targetMonth) {
  const m = safeTrim_(text).match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!m) return null;

  const month = Number(m[1]);
  const day = Number(m[2]);

  if (month !== Number(targetMonth)) return null;
  return day;
}

function toIsoDate_(year, month, day) {
  const y = String(year);
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function findAnchorRowInColumn_(sh, col, text) {
  const lastRow = sh.getLastRow();
  if (lastRow < 1) return null;

  const vals = sh.getRange(1, col, lastRow, 1).getDisplayValues();

  for (let i = 0; i < vals.length; i++) {
    const cellValue = safeTrim_(vals[i][0]);
    if (cellValue.indexOf(text) !== -1) {
      return i + 1;
    }
  }

  return null;
}

function columnA1ToNumber_(colA1) {
  let n = 0;
  const s = String(colA1 || '').replace(/[^A-Z]/gi, '').toUpperCase();

  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }

  return n;
}

function normalizeTimeText_(value) {
  const s = safeTrim_(value);
  if (!s) return '';

  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s;

  const hh = String(Number(m[1])).padStart(2, '0');
  const mm = m[2];
  return hh + ':' + mm;
}

function toTimeHHmm(v) {
  if (v instanceof Date && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  }

  if (typeof v === 'string') {
    const s = v.trim();
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const hh = ('0' + m[1]).slice(-2);
      const mi = m[2];
      return hh + ':' + mi;
    }
  }

  return v ? String(v).trim() : null;
}

function safeTrim_(value) {
  return String(value == null ? '' : value).trim();
}

function isSchedulePayloadEmpty_(r) {
  return (
    !r.date &&
    !r.name &&
    !r.helper_email &&
    !r.client &&
    !r.start_time &&
    !r.end_time &&
    !r.haisha &&
    !r.task &&
    !r.summary &&
    !r.beneficiary_number
  );
}
