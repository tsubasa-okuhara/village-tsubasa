/**
 * サービス記録転送 B列(利用者名) を見て、
 * 受給者番号シートから受給者番号を引いて L列へセットする
 */
function setJukyushaNo_B_to_L_(ss) {
  const TARGET_SHEET_NAME = 'サービス記録転送';
  const MOVE_MASTER_SHEET_NAME = '受給者番号シート';
  const HOME_MASTER_SHEET_NAME = '居宅受給者番号シート';
  const START_ROW = 5;

  const TARGET_NAME_COL = 2;   // B
  const TARGET_WRITE_COL = 12; // L

  const sh = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!sh) throw new Error('対象シートが見つかりません: ' + TARGET_SHEET_NAME);

  const lastRow = sh.getLastRow();
  if (lastRow < START_ROW) {
    Logger.log('対象データがありません');
    return;
  }

  const numRows = lastRow - START_ROW + 1;
  const nameVals = sh.getRange(START_ROW, TARGET_NAME_COL, numRows, 1).getDisplayValues();
  const bgs = sh.getRange(START_ROW, TARGET_NAME_COL, numRows, 1).getBackgrounds();

  const moveMap = buildNameValueMapABForTransfer_(ss, MOVE_MASTER_SHEET_NAME);
  const homeMap = buildNameValueMapABForTransfer_(ss, HOME_MASTER_SHEET_NAME);

  const out = [];
  let written = 0;
  const notFoundNames = [];

  for (let i = 0; i < numRows; i++) {
    const rawName = nameVals[i][0];
    const key = normalizeNameKeyForTransfer_(rawName);
    const bgColor = String(bgs[i][0] || '').toLowerCase();

    let map = moveMap;
    if (bgColor === '#ff9900') {
      map = homeMap;
    }

    const no = key ? (map.get(key) || '') : '';

    if (no) {
      written++;
    } else if (key) {
      notFoundNames.push('B' + (START_ROW + i) + ': ' + rawName + ' / 色=' + bgColor);
    }

    out.push([no]);
  }

  const targetRange = sh.getRange(START_ROW, TARGET_WRITE_COL, numRows, 1);
  targetRange.setNumberFormat('@');
  targetRange.setHorizontalAlignment('left');
  targetRange.setValues(out);

  Logger.log(
    [
      '受給者番号セット完了',
      '対象シート名: ' + sh.getName(),
      '参照列: B',
      '書込列: L',
      '範囲: L' + START_ROW + ':L' + (START_ROW + numRows - 1),
      'セット件数: ' + written + '/' + numRows,
      '未一致件数: ' + notFoundNames.length
    ].join('\n')
  );

  if (notFoundNames.length > 0) {
    Logger.log('--- 受給者番号 未一致一覧 ---\n' + notFoundNames.join('\n'));
  }
}

/**
 * 2人体制シート A列の利用者名と、
 * サービス記録転送 B列の利用者名が一致する行について、
 * A列のヘルパー名が3名以上なら先頭2名だけ残す
 *
 * ※ 今回は「削除」を
 *    「3名以上入っていたら先頭2名だけ残す」
 *    として実装しています
 */
function trimHelpersByTwoPersonRule_(ss) {
  const TARGET_SHEET_NAME = 'サービス記録転送';
  const TWO_PERSON_SHEET_NAME = '2人体制';
  const START_ROW = 5;

  const sh = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!sh) throw new Error('対象シートが見つかりません: ' + TARGET_SHEET_NAME);

  const lastRow = sh.getLastRow();
  if (lastRow < START_ROW) {
    Logger.log('2人体制チェック対象データがありません');
    return;
  }

  const numRows = lastRow - START_ROW + 1;
  const values = sh.getRange(START_ROW, 1, numRows, 2).getDisplayValues(); // A:B
  const twoPersonSet = getTwoPersonClientSetForTransfer_(ss, TWO_PERSON_SHEET_NAME);

  const out = [];
  const changedRows = [];
  const shortageRows = [];

  for (let i = 0; i < numRows; i++) {
    const helperRaw = values[i][0]; // A
    const clientRaw = values[i][1]; // B

    const clientKey = normalizeNameKeyForTransfer_(clientRaw);
    const helpers = splitNamesBySpaceForTransfer_(helperRaw);

    let nextHelper = helpers.join(' ');

    if (clientKey && twoPersonSet.has(clientKey)) {
      if (helpers.length > 2) {
        nextHelper = helpers.slice(0, 2).join(' ');
        changedRows.push(
          'row ' + (START_ROW + i) + ': [' + helperRaw + '] → [' + nextHelper + ']'
        );
      } else if (helpers.length < 2 && helpers.length > 0) {
        shortageRows.push(
          'row ' + (START_ROW + i) + ': 利用者[' + clientRaw + '] に対してヘルパー不足 [' + helperRaw + ']'
        );
      }
    }

    out.push([nextHelper]);
  }

  sh.getRange(START_ROW, 1, numRows, 1).setValues(out);

  Logger.log(
    [
      '2人体制ルール適用完了',
      '対象シート名: ' + sh.getName(),
      '対象範囲: A' + START_ROW + ':A' + (START_ROW + numRows - 1),
      '2人体制対象者数: ' + twoPersonSet.size,
      '調整件数: ' + changedRows.length,
      '不足件数: ' + shortageRows.length
    ].join('\n')
  );

  if (changedRows.length > 0) {
    Logger.log('--- 2人体制 調整一覧 ---\n' + changedRows.join('\n'));
  }

  if (shortageRows.length > 0) {
    Logger.log('--- 2人体制 ヘルパー不足一覧 ---\n' + shortageRows.join('\n'));
  }
}


/**
 * サービス記録転送 A列のヘルパー名を見て、
 * ヘルパーマスター A:B からメールアドレスを引いて M列へセットする
 *
 * 複数名いる場合は先頭名だけ使う
 * 例:
 *   "奥原 小川" → 奥原のメールだけセット
 *   "奥原　小川" → 奥原のメールだけセット
 */
function setHelperEmails_A_to_M_(ss) {
  const TARGET_SHEET_NAME = 'サービス記録転送';
  const HELPER_MASTER_SHEET_NAME = 'ヘルパーマスター';
  const START_ROW = 5;

  const HELPER_COL = 1; // A
  const EMAIL_COL = 13; // M

  const sh = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!sh) throw new Error('対象シートが見つかりません: ' + TARGET_SHEET_NAME);

  const lastRow = sh.getLastRow();
  if (lastRow < START_ROW) {
    Logger.log('ヘルパーメールセット対象データがありません');
    return;
  }

  const numRows = lastRow - START_ROW + 1;
  const helperVals = sh.getRange(START_ROW, HELPER_COL, numRows, 1).getDisplayValues();
  const emailMap = buildHelperEmailMapForTransfer_(ss, HELPER_MASTER_SHEET_NAME);

  const out = [];
  let written = 0;
  const notFoundHelpers = [];

  for (let i = 0; i < numRows; i++) {
    const rawHelper = helperVals[i][0];
    const helperNames = splitNamesBySpaceForTransfer_(rawHelper);

    if (helperNames.length === 0) {
      out.push(['']);
      continue;
    }

    const firstHelper = helperNames[0];
    const key = normalizeHelperNameKeyForTransfer_(firstHelper);
    const email = key ? (emailMap.get(key) || '') : '';

    if (email) {
      written++;
      out.push([email]);
    } else {
      notFoundHelpers.push('A' + (START_ROW + i) + ': ' + firstHelper);
      out.push(['']);
    }
  }

  const targetRange = sh.getRange(START_ROW, EMAIL_COL, numRows, 1);
  targetRange.setNumberFormat('@');
  targetRange.setHorizontalAlignment('left');
  targetRange.setValues(out);

  Logger.log(
    [
      'ヘルパーメールセット完了',
      '対象シート名: ' + sh.getName(),
      '参照列: A',
      '書込列: M',
      '範囲: M' + START_ROW + ':M' + (START_ROW + numRows - 1),
      'セット件数: ' + written + '/' + numRows,
      '未一致件数: ' + notFoundHelpers.length
    ].join('\n')
  );

  if (notFoundHelpers.length > 0) {
    Logger.log('--- ヘルパーメール 未一致一覧 ---\n' + notFoundHelpers.join('\n'));
  }
}


/* =========================
   共通ヘルパー
========================= */

/**
 * A列=名前, B列=値 のマスタシートを Map にする
 * 例:
 * - 受給者番号シート A:利用者名 B:受給者番号
 * - ヘルパーマスター A:ヘルパー名 B:メール
 */
function buildNameValueMapABForTransfer_(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('シートが見つかりません: ' + sheetName);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return new Map();

  const rows = sh.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  const map = new Map();

  for (const [name, value] of rows) {
    const key = normalizeNameKeyForTransfer_(name);
    const v = (value || '').toString().trim();
    if (!key || !v) continue;
    if (!map.has(key)) map.set(key, v);
  }

  return map;
}


/**
 * 2人体制シート A2↓ の利用者名を Set で返す
 */
function getTwoPersonClientSetForTransfer_(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('シートが見つかりません: ' + sheetName);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return new Set();

  const values = sh.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  const set = new Set();

  for (const [name] of values) {
    const key = normalizeNameKeyForTransfer_(name);
    if (key) set.add(key);
  }

  return set;
}


/**
 * ヘルパー名セルを空白区切りで分割
 * 例: "田中 佐藤" → ["田中", "佐藤"]
 */
function splitNamesBySpaceForTransfer_(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  return s
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(v => v.trim())
    .filter(Boolean);
}


/**
 * 名前照合用の正規化
 */
function normalizeNameKeyForTransfer_(v) {
  let s = (v || '').toString();
  s = s.normalize('NFKC');
  s = s.replace(/[\s　\r\n\t]+/g, '');
  s = s.replace(/[​-‍﻿]/g, '');
  s = s.replace(/[（(].*?[)）]/g, ''); // 括弧書きを削除
  s = s.replace(/様/g, '');            // 様を全部削除
  return s.trim();
}

function runPrepareServiceRecordTransfer() {
  const SPREADSHEET_ID = '1mwKCznD2T_tM2Jwq2r-_ZXc6knQnYHD3mRjgFKRoiFQ';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  deleteRowsByAColorForTransfer_(ss); // 先に削除
  setJukyushaNo_B_to_L_(ss);
  trimHelpersByTwoPersonRule_(ss);
  setHelperEmails_A_to_M_(ss);
}

/**
 * サービス記録転送シートで、
 * A列の背景色が #fce5cd の行を 5行目以降から削除する
 */
function deleteRowsByAColorForTransfer_(ss) {
  const TARGET_SHEET_NAME = 'サービス記録転送';
  const START_ROW = 5;
  const TARGET_COLOR = '#fce5cd';

  const sh = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!sh) {
    throw new Error('対象シートが見つかりません: ' + TARGET_SHEET_NAME);
  }

  const lastRow = sh.getLastRow();
  if (lastRow < START_ROW) {
    Logger.log('削除対象データがありません');
    return;
  }

  const numRows = lastRow - START_ROW + 1;
  const bgs = sh.getRange(START_ROW, 1, numRows, 1).getBackgrounds();

  // 削除対象のシート行番号を収集
  const deleteRows = [];
  for (let i = 0; i < bgs.length; i++) {
    const color = String(bgs[i][0] || '').toLowerCase();
    if (color === TARGET_COLOR) {
      deleteRows.push(START_ROW + i);
    }
  }

  if (deleteRows.length === 0) {
    Logger.log(`A列背景色 ${TARGET_COLOR} の削除対象行はありませんでした`);
    return;
  }

  // 下から連続行をまとめて削除
  let blockStart = deleteRows[deleteRows.length - 1];
  let blockCount = 1;

  for (let i = deleteRows.length - 2; i >= 0; i--) {
    const row = deleteRows[i];

    if (row === blockStart - 1) {
      blockStart = row;
      blockCount++;
    } else {
      sh.deleteRows(blockStart, blockCount);
      blockStart = row;
      blockCount = 1;
    }
  }

  // 最後のブロック削除
  sh.deleteRows(blockStart, blockCount);

  Logger.log(
    [
      '背景色行削除完了',
      '対象シート名: ' + TARGET_SHEET_NAME,
      '判定列: A',
      '判定色: ' + TARGET_COLOR,
      '削除件数: ' + deleteRows.length,
      '削除行: ' + deleteRows.join(', ')
    ].join('\n')
  );
}

function debugTargetNamesForTransfer_() {
  const ss = SpreadsheetApp.openById('1mwKCznD2T_tM2Jwq2r-_ZXc6knQnYHD3mRjgFKRoiFQ');
  const sh = ss.getSheetByName('受給者番号シート');
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues();

  const targets = ['見延周美様(家事)', '白石涼様'];

  targets.forEach(function(name) {
    const key = normalizeNameKeyForTransfer_(name);
    Logger.log('---');
    Logger.log('元: ' + name);
    Logger.log('正規化後: ' + key);

    const hits = rows.filter(function(r) {
      const masterName = r[0];
      const masterKey = normalizeNameKeyForTransfer_(masterName);
      return masterKey.indexOf(key) >= 0 || key.indexOf(masterKey) >= 0;
    });

    if (hits.length === 0) {
      Logger.log('候補なし');
    } else {
      hits.forEach(function(r) {
        Logger.log('候補: [' + r[0] + '] / 受給者番号: [' + r[1] + ']');
      });
    }
  });
}

function normalizeHelperNameKeyForTransfer_(v) {
  let s = (v || '').toString();
  s = s.normalize('NFKC');
  s = s.replace(/[\s　\r\n\t]+/g, '');
  s = s.replace(/[​-‍﻿]/g, '');
  return s.trim();
}


function buildHelperEmailMapForTransfer_(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('シートが見つかりません: ' + sheetName);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return new Map();

  const rows = sh.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  const map = new Map();

  for (const [name, value] of rows) {
    const key = normalizeHelperNameKeyForTransfer_(name);
    const v = (value || '').toString().trim();
    if (!key || !v) continue;

    if (map.has(key)) {
      Logger.log('ヘルパーマスター重複キー: [' + key + ']');
    }

    map.set(key, v);
  }

  return map;
}
