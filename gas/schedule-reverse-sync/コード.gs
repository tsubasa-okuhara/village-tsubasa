// ============================================
// GAS Web App: doPost（スタンドアロン版）
// スケジュールアプリ → スプレッドシート逆同期
//
// 【テスト手順】
// 1. 新しいApps Scriptプロジェクトにこのコードを貼り付け
// 2. testAdd を実行 → スプレッドシートに書き込まれるか確認
// 3. testEdit, testDelete も確認
// 4. OK なら「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
//    実行者: 自分 / アクセス: 全員
// 5. デプロイURLを schedule.html の GAS_WEB_APP_URL に設定
// ============================================

const SPREADSHEET_ID_SYNC = '1mwKCznD2T_tM2Jwq2r-_ZXc6knQnYHD3mRjgFKRoiFQ';
const DATA_ROW_START = 5;

const WEEK_BLOCKS_SYNC = [
  { label: '月曜', dateCell: 'D2', startCol: 'D', endCol: 'Y' },
  { label: '火曜', dateCell: 'AA2', startCol: 'AA', endCol: 'AV' },
  { label: '水曜', dateCell: 'AX2', startCol: 'AX', endCol: 'BS' },
  { label: '木曜', dateCell: 'BU2', startCol: 'BU', endCol: 'CP' },
  { label: '金曜', dateCell: 'CR2', startCol: 'CR', endCol: 'DM' },
  { label: '土曜', dateCell: 'DO2', startCol: 'DO', endCol: 'EJ' },
  { label: '日曜', dateCell: 'EL2', startCol: 'EL', endCol: 'FG' }
];

// 各ブロック内のカラムオフセット（0起点）
const COL = {
  HELPER: 0,        // ヘルパー名
  CLIENT: 1,        // 利用者名
  START: 2,         // 開始時間
  END: 3,           // 終了時間
  HAISHA: 4,        // 配車
  TASK: 5,          // 内容（サービス種類）
  SUMMARY: 6,       // 概要
  DATE: 7,          // 日付
  PURPOSE: 8,       // 目的コード
  TWO_PERSON: 9,    // 2人付フラグ
  BILLING: 10,      // 請求
  BENEFICIARY: 11,  // 受給者番号
  HELPER_EMAIL: 12, // ヘルパーメール
  SUPABASE_ID: 19   // Supabase ID（W列相当）
};




// ============================================
// エンドポイント
// ============================================

function doPost(e) {
  try {
    console.log('doPost開始: postData存在=' + (e && e.postData ? 'YES' : 'NO'));

    if (!e || !e.postData || !e.postData.contents) {
      console.log('postDataが空です');
      return jsonResponse_({ success: false, error: 'postDataが空' });
    }

    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    console.log('action=' + action);

    let result;
    switch (action) {
      case 'export_records':
        console.log('export_records処理開始');
        result = exportRecordsSheet(payload);
        console.log('export_records結果: ' + JSON.stringify(result));
        break;
      case 'add':
        result = handleAdd(payload);
        break;
      case 'edit':
        result = handleEdit(payload);
        break;
      case 'delete':
        result = handleDelete(payload);
        break;
      default:
        result = { success: false, error: '不明なアクション: ' + action };
    }

    return jsonResponse_(result);
  } catch (err) {
    console.error('doPostエラー: ' + err.message);
    return jsonResponse_({ success: false, error: err.message });
  }
}

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.payload) {
      const payload = JSON.parse(e.parameter.payload);
      console.log('doGet action=' + payload.action);

      let result;
      switch (payload.action) {
        case 'export_records':
          console.log('export_records処理開始');
          result = exportRecordsSheet(payload);
          console.log('export_records結果: ' + JSON.stringify(result));
          break;
        case 'add': result = handleAdd(payload); break;
        case 'edit': result = handleEdit(payload); break;
        case 'delete': result = handleDelete(payload); break;
        default: result = { success: false, error: '不明なアクション: ' + payload.action };
      }
      return jsonResponse_(result);
    }
    return jsonResponse_({ status: 'ok', message: 'エンドポイント稼働中' });
  } catch (err) {
    console.error('doGetエラー: ' + err.message);
    return jsonResponse_({ success: false, error: err.message });
  }
}

// ============================================
// 追加処理
// ============================================
function handleAdd(payload) {
  const { supabaseId, date, helper, client, startTime, endTime,
          task, summary, beneficiaryNumber, haisha, helperEmail } = payload;

  const sheetInfo = getSheetAndBlock_(date);
  if (!sheetInfo.sheet) {
    return { success: false, error: 'シートが見つかりません: ' + sheetInfo.sheetName };
  }

  const { sheet, blockStartCol } = sheetInfo;
  const emptyRow = findEmptyRow_(sheet, blockStartCol + COL.CLIENT);

  const s = sheet;
  const bc = blockStartCol;
  s.getRange(emptyRow, bc + COL.HELPER).setValue(helper || '担当未設定');
  s.getRange(emptyRow, bc + COL.CLIENT).setValue(client);
  s.getRange(emptyRow, bc + COL.START).setValue(startTime);
  s.getRange(emptyRow, bc + COL.END).setValue(endTime);
  s.getRange(emptyRow, bc + COL.HAISHA).setValue(haisha || '');
  s.getRange(emptyRow, bc + COL.TASK).setValue(task);
  s.getRange(emptyRow, bc + COL.SUMMARY).setValue(summary || task);
  s.getRange(emptyRow, bc + COL.DATE).setValue(date);
  s.getRange(emptyRow, bc + COL.BENEFICIARY).setValue(beneficiaryNumber || '');
  s.getRange(emptyRow, bc + COL.HELPER_EMAIL).setValue(helperEmail || '');
  s.getRange(emptyRow, bc + COL.SUPABASE_ID).setValue(supabaseId || '');

  // 書き込み成功 → Supabase のフラグを更新
  if (supabaseId && typeof sbMarkSynced_ === 'function') {
    try { sbMarkSynced_(supabaseId); } catch(ex) { console.warn('sbMarkSynced エラー: ' + ex.message); }
  }

  return { success: true, action: 'add', row: emptyRow, sheetName: sheetInfo.sheetName };
}

// ============================================
// 変更処理
// ============================================
function handleEdit(payload) {
  const { supabaseId, date, client, oldStartTime, startTime, endTime } = payload;

  const found = findRowByIdOrKey_(date, supabaseId, client, oldStartTime);
  if (!found) {
    return { success: false, error: '該当する行が見つかりません (edit)' };
  }

  const { sheet, row, blockStartCol } = found;

  if (startTime) sheet.getRange(row, blockStartCol + COL.START).setValue(startTime);
  if (endTime) sheet.getRange(row, blockStartCol + COL.END).setValue(endTime);

  if (supabaseId) {
    const currentId = sheet.getRange(row, blockStartCol + COL.SUPABASE_ID).getValue();
    if (!currentId) {
      sheet.getRange(row, blockStartCol + COL.SUPABASE_ID).setValue(supabaseId);
    }
  }

  // 書き込み成功 → Supabase のフラグを更新
  if (supabaseId && typeof sbMarkSynced_ === 'function') {
    try { sbMarkSynced_(supabaseId); } catch(ex) { console.warn('sbMarkSynced エラー: ' + ex.message); }
  }

  return { success: true, action: 'edit', row: row, sheetName: sheet.getName() };
}

// ============================================
// 削除処理
// ============================================
function handleDelete(payload) {
  const { supabaseId, date, client, startTime } = payload;

  const found = findRowByIdOrKey_(date, supabaseId, client, startTime);
  if (!found) {
    return { success: false, error: '該当する行が見つかりません (delete)' };
  }

  const { sheet, row, blockStartCol } = found;
  sheet.getRange(row, blockStartCol, 1, 22).clearContent();

  return { success: true, action: 'delete', row: row, sheetName: sheet.getName() };
}

// ============================================
// ユーティリティ
// ============================================

function getSheetAndBlock_(dateStr) {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const day = parseInt(parts[2]);
  const dateObj = new Date(year, month - 1, day);
  const dow = dateObj.getDay();

  const dayIndex = dow === 0 ? 6 : dow - 1;

  const firstOfMonth = new Date(year, month - 1, 1);
  const firstDow = firstOfMonth.getDay();
  const daysFromMon = firstDow === 0 ? 6 : firstDow - 1;
  const firstMonday = 1 - daysFromMon;
  const weekNum = Math.ceil((day - firstMonday + 1) / 7);

  const yyyymm = String(year) + String(month).padStart(2, '0');
  const sheetName = 'カレンダー_' + yyyymm + '_' + weekNum + '週目';

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID_SYNC);
  const sheet = ss.getSheetByName(sheetName);

  const block = WEEK_BLOCKS_SYNC[dayIndex];
  const blockStartCol = colToNum_(block.startCol);

  return { sheet, sheetName, blockStartCol, dayIndex };
}

function findRowByIdOrKey_(dateStr, supabaseId, client, startTime) {
  const sheetInfo = getSheetAndBlock_(dateStr);
  if (!sheetInfo.sheet) return null;

  const { sheet, blockStartCol } = sheetInfo;
  const lastRow = Math.max(sheet.getLastRow(), DATA_ROW_START);

  if (supabaseId) {
    const idCol = blockStartCol + COL.SUPABASE_ID;
    for (let r = DATA_ROW_START; r <= lastRow; r++) {
      const val = sheet.getRange(r, idCol).getValue();
      if (val && val.toString() === supabaseId) {
        return { sheet, row: r, blockStartCol };
      }
    }
  }

  if (client && startTime) {
    const clientCol = blockStartCol + COL.CLIENT;
    const startCol = blockStartCol + COL.START;
    for (let r = DATA_ROW_START; r <= lastRow; r++) {
      const rowClient = sheet.getRange(r, clientCol).getValue().toString().trim();
      const rowStart = normalizeTimeSync_(sheet.getRange(r, startCol).getValue());
      if (rowClient === client && rowStart === normalizeTimeSync_(startTime)) {
        return { sheet, row: r, blockStartCol };
      }
    }
  }

  return null;
}

function findEmptyRow_(sheet, col) {
  const lastRow = Math.max(sheet.getLastRow(), DATA_ROW_START);
  for (let r = DATA_ROW_START; r <= lastRow + 1; r++) {
    const val = sheet.getRange(r, col).getValue();
    if (!val || val.toString().trim() === '') {
      return r;
    }
  }
  return lastRow + 2;
}

function colToNum_(col) {
  let num = 0;
  for (let i = 0; i < col.length; i++) {
    num = num * 26 + (col.charCodeAt(i) - 64);
  }
  return num;
}

function normalizeTimeSync_(t) {
  if (!t) return '';
  if (t instanceof Date) {
    return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
  }
  const s = t.toString().trim();
  const match = s.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return String(parseInt(match[1])).padStart(2, '0') + ':' + match[2];
  }
  return s;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// テスト用関数（手動実行で動作確認）
// ============================================
function testAdd() {
  const result = handleAdd({
    supabaseId: 'test-uuid-123',
    date: '2026-05-11',
    helper: '担当未設定',
    client: 'テスト利用者',
    startTime: '09:00',
    endTime: '11:00',
    task: '居宅',
    summary: '居宅',
    beneficiaryNumber: '1234567890'
  });
  Logger.log(JSON.stringify(result));
}

function testEdit() {
  const result = handleEdit({
    supabaseId: 'test-uuid-123',
    date: '2026-05-11',
    client: 'テスト利用者',
    oldStartTime: '09:00',
    startTime: '10:00',
    endTime: '12:00'
  });
  Logger.log(JSON.stringify(result));
}

function testDelete() {
  const result = handleDelete({
    supabaseId: 'test-uuid-123',
    date: '2026-05-11',
    client: 'テスト利用者',
    startTime: '10:00'
  });
  Logger.log(JSON.stringify(result));
}
