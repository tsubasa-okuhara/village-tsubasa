function runCheckFromButton() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    ss.toast('チェック開始', '確認', 3);

    mainCheck(); // ← 今の本体関数名

    SpreadsheetApp.getUi().alert('チェック完了');
  } catch (e) {
    SpreadsheetApp.getUi().alert('エラー: ' + e.message);
    throw e;
  }
}

function onEditScheduleTransferCheckbox(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const col = e.range.getColumn();

  if (sheet.getName() !== 'スケジュール転送') return;
  if (col !== 2) return;           // B列だけ監視
  if (row < 2) return;             // 2行目以降だけ
  if (e.range.getValue() !== true) return;

  const nameCell = sheet.getRange(row, 1); // A列
  const resultCell = sheet.getRange(row, 3); // C列
  const timeCell = sheet.getRange(row, 4); // D列
  const checkCell = sheet.getRange(row, 2); // B列

  const runnerName = String(nameCell.getDisplayValue() || '').trim();
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    resultCell.setValue('他ユーザー実行中');
    checkCell.setValue(false);
    return;
  }

  try {
    resultCell.setValue('');
    timeCell.setValue('');

    if (!runnerName) {
      throw new Error('A列の実行者名が空です');
    }

    resultCell.setValue('実行中...');
    SpreadsheetApp.flush();

    const result = testCollectScheduleRowsPreviewCalendar202605Week1();

    resultCell.setValue('転送完了');
    timeCell.setValue(new Date());

    if (result !== undefined && result !== null && result !== '') {
      sheet.getRange(row, 5).setValue(
        typeof result === 'string' ? result : JSON.stringify(result)
      ); // E列に詳細
    } else {
      sheet.getRange(row, 5).setValue('');
    }

  } catch (err) {
    resultCell.setValue('エラー');
    timeCell.setValue(new Date());
    sheet.getRange(row, 5).setValue(
      err && err.message ? err.message : String(err)
    );
    throw err;

  } finally {
    checkCell.setValue(false);
    lock.releaseLock();
  }
}
