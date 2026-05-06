/**
 * 居宅介護サービス提供実績記録票 - テンプレートへのデータ流し込み
 *
 * テンプレートスプレッドシートID: 1FmBdGAXqmFFSIWs59WVw7pTUU60jUmj4Llp8xjcMSe0
 *
 * フォルダ構造:
 *   実績記録票/
 *     └── 令和8年5月/
 *           ├── 居宅/
 *           │     └── 0700006547_蛭子正_令和8年5月.xlsx (受給者番号順)
 *           └── 移動/
 *                 ├── 2006/
 *                 │     └── 2006000001_○○_令和8年5月.xlsx
 *                 └── 2016/
 *                       └── 2016000001_○○_令和8年5月.xlsx
 */

// テンプレートのスプレッドシートID
const RECORDS_TEMPLATE_ID = '1FmBdGAXqmFFSIWs59WVw7pTUU60jUmj4Llp8xjcMSe0';

// ルートフォルダ名（Googleドライブ直下に自動作成）
const RECORDS_ROOT_FOLDER_NAME = '実績記録票';

/**
 * フォルダを取得（なければ作成）
 * @param {Folder} parentFolder - 親フォルダ
 * @param {string} folderName - フォルダ名
 * @returns {Folder}
 */
function getOrCreateFolder_(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(folderName);
}

/**
 * 実績記録票の保存先フォルダを取得・作成
 *
 * 居宅の場合: 実績記録票/令和○年○月/居宅/
 * 移動の場合: 実績記録票/令和○年○月/移動/2006/ or 2016/
 *
 * @param {number} reiwa - 令和年
 * @param {number} month - 月
 * @param {string} serviceType - 'kyotaku'(居宅) or 'ido'(移動)
 * @param {string} beneficiaryNumber - 受給者番号（移動の場合にフォルダ分けに使用）
 * @returns {Folder}
 */
function getRecordsFolder_(reiwa, month, serviceType, beneficiaryNumber) {
  const root = DriveApp.getRootFolder();

  // 1. ルートフォルダ: 実績記録票
  const rootFolder = getOrCreateFolder_(root, RECORDS_ROOT_FOLDER_NAME);

  // 2. 月フォルダ: 令和○年○月
  const monthFolderName = '令和' + reiwa + '年' + month + '月';
  const monthFolder = getOrCreateFolder_(rootFolder, monthFolderName);

  if (serviceType === 'ido') {
    // 3. 移動フォルダ
    const idoFolder = getOrCreateFolder_(monthFolder, '移動');

    // 4. 受給者番号の上4桁でサブフォルダ分け
    if (beneficiaryNumber) {
      const prefix = beneficiaryNumber.replace(/\D/g, '').substring(0, 4);
      const subFolder = getOrCreateFolder_(idoFolder, prefix);
      return subFolder;
    }
    return idoFolder;
  } else {
    // 3. 居宅フォルダ
    return getOrCreateFolder_(monthFolder, '居宅');
  }
}

/**
 * 実績記録票を生成する
 * @param {Object} payload - { client, displayName, beneficiaryNumber, year, month, reiwa, serviceType, items: [{date, dow, planStart, planEnd, confirmed}] }
 * @returns {Object} { success, url, spreadsheetId }
 */
function exportRecordsSheet(payload) {
  console.log('exportRecordsSheet受信: ' + JSON.stringify(payload));
  try {
    const { client, displayName, beneficiaryNumber, year, month, reiwa, items } = payload;
    const serviceType = payload.serviceType || 'kyotaku'; // デフォルトは居宅

    // 1. 保存先フォルダを取得・作成
    const folder = getRecordsFolder_(reiwa, month, serviceType, beneficiaryNumber);

    // 2. テンプレートをコピー
    const templateFile = DriveApp.getFileById(RECORDS_TEMPLATE_ID);

    // ファイル名: 受給者番号_氏名_令和○年○月（受給者番号順にソートされる）
    const numOnly = beneficiaryNumber ? beneficiaryNumber.replace(/\D/g, '') : '0000000000';
    const serviceLabel = serviceType === 'ido' ? '移動支援' : '居宅介護';
    const fileName = numOnly + '_' + serviceLabel + '実績記録票_' + displayName + '_令和' + reiwa + '年' + month + '月';

    // 同名ファイルがあれば削除（上書き更新）
    const existing = folder.getFilesByName(fileName);
    while (existing.hasNext()) {
      const old = existing.next();
      old.setTrashed(true);
    }

    const newFile = templateFile.makeCopy(fileName, folder);

    const ss = SpreadsheetApp.openById(newFile.getId());
    const ws = ss.getSheetByName('居宅');

    if (!ws) {
      return { success: false, error: '「居宅」シートが見つかりません' };
    }

    // 3. ヘッダー情報を入力
    ws.getRange('B2').setValue('令和' + reiwa + '年');
    ws.getRange('K2').setValue(month + '月');

    // 受給者証番号（H3〜Q3に1桁ずつ）
    if (beneficiaryNumber) {
      const digits = beneficiaryNumber.replace(/\D/g, '').split('');
      for (let i = 0; i < digits.length && i < 10; i++) {
        ws.getRange(3, 8 + i).setValue(Number(digits[i]));
      }
    }

    // 氏名（AE3 = col31）
    ws.getRange(3, 31).setValue(displayName);

    // 4. データ行に書き込み（行12〜36、最大25行）
    const dataStartRow = 12;
    const maxRows = 25;

    const sortedItems = items.sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 0; i < sortedItems.length && i < maxRows; i++) {
      const item = sortedItems[i];
      const row = dataStartRow + i;

      const dayNum = parseInt(item.date.split('-')[2]);
      ws.getRange(row, 2).setValue(dayNum);
      ws.getRange(row, 4).setValue(item.dow);

      if (item.planStart) ws.getRange(row, 11).setValue(item.planStart);
      if (item.planEnd) ws.getRange(row, 15).setValue(item.planEnd);

      // S (col19): 計画時間数（15分刻み切り上げ）
      if (item.planStart && item.planEnd) {
        const [sh, sm] = item.planStart.split(':').map(Number);
        const [eh, em] = item.planEnd.split(':').map(Number);
        const totalMin = (eh * 60 + em) - (sh * 60 + sm);
        const rounded = Math.ceil(totalMin / 15) * 0.25;
        ws.getRange(row, 19).setValue(rounded);
      }

      // AG (col33): 算定時間数
      if (item.planStart && item.planEnd) {
        const [sh, sm] = item.planStart.split(':').map(Number);
        const [eh, em] = item.planEnd.split(':').map(Number);
        const totalMin = (eh * 60 + em) - (sh * 60 + sm);
        const rounded = Math.ceil(totalMin / 15) * 0.25;
        ws.getRange(row, 33).setValue(rounded);
      }

      // AW (col49): 利用者確認欄
      if (item.confirmed) {
        ws.getRange(row, 49).setValue('✓');
      }
    }

    // 5. 右側のヘルパー列（BN=66列目以降）をクリア
    const lastCol = ws.getMaxColumns();
    if (lastCol > 65) {
      ws.getRange(1, 66, ws.getMaxRows(), lastCol - 65).clear();
    }

    SpreadsheetApp.flush();

    const url = ss.getUrl();
    console.log('実績記録票を生成: ' + url);
    console.log('保存先: ' + folder.getName());

    return {
      success: true,
      url: url,
      spreadsheetId: newFile.getId(),
      fileName: fileName,
      folderName: folder.getName()
    };

  } catch (e) {
    console.log('実績記録票生成エラー: ' + e.message);
    return { success: false, error: e.message };
  }
}


/**
 * テスト用関数（居宅）
 */
function testExportRecords() {
  const testPayload = {
    client: '蛭子 正',
    displayName: '蛭子 正',
    beneficiaryNumber: '0700006547',
    year: 2026,
    month: 5,
    reiwa: 8,
    serviceType: 'kyotaku',
    items: [
      { date: '2026-05-01', dow: '金', planStart: '09:00', planEnd: '11:00', confirmed: true },
      { date: '2026-05-05', dow: '火', planStart: '10:00', planEnd: '12:00', confirmed: false },
      { date: '2026-05-10', dow: '日', planStart: '14:00', planEnd: '16:00', confirmed: true }
    ]
  };

  const result = exportRecordsSheet(testPayload);
  console.log(JSON.stringify(result));
}

/**
 * テスト用関数（移動支援）
 */
function testExportRecordsIdo() {
  const testPayload = {
    client: 'テスト太郎',
    displayName: 'テスト太郎',
    beneficiaryNumber: '2006000123',
    year: 2026,
    month: 5,
    reiwa: 8,
    serviceType: 'ido',
    items: [
      { date: '2026-05-03', dow: '水', planStart: '10:00', planEnd: '12:00', confirmed: true },
      { date: '2026-05-15', dow: '月', planStart: '14:00', planEnd: '16:00', confirmed: false }
    ]
  };

  const result = exportRecordsSheet(testPayload);
  console.log(JSON.stringify(result));
}
