// ★ここだけが曜日ブロック定義（月曜始まり配置）
const DAY_BLOCKS = [
  { range: 'D2:Y2',   col: 'D:Y',   row4: 'D4:Y4',   idx: 0 }, // 月
  { range: 'AA2:AV2', col: 'AA:AV', row4: 'AA4:AV4', idx: 1 }, // 火
  { range: 'AX2:BS2', col: 'AX:BS', row4: 'AX4:BS4', idx: 2 }, // 水
  { range: 'BU2:CP2', col: 'BU:CP', row4: 'BU4:CP4', idx: 3 }, // 木
  { range: 'CR2:DM2', col: 'CR:DM', row4: 'CR4:DM4', idx: 4 }, // 金
  { range: 'DO2:EJ2', col: 'DO:EJ', row4: 'DO4:EJ4', idx: 5 }, // 土
  { range: 'EL2:FG2', col: 'EL:FG', row4: 'EL4:FG4', idx: 6 }, // 日
];

function createCalendarsWeek1to6_FromKihonA2_MondayStart(ssParam) {
  const ss = ssParam || SpreadsheetApp.getActiveSpreadsheet();

  const baseSh = ss.getSheetByName('基本');
  if (!baseSh) throw new Error('シート「基本」が見つかりません');

  const baseDate = baseSh.getRange('A2').getValue();
  if (!(baseDate instanceof Date)) {
    throw new Error('基本!A2 に日付を入力してください（文字列ではなく日付型）');
  }

  const y = baseDate.getFullYear();
  const m = baseDate.getMonth(); // 0-based
  const firstDay = new Date(y, m, 1);

  // 1日を含む週の「月曜」を取得
  const firstDayWeekIndex = (firstDay.getDay() + 6) % 7;
  const firstWeekMonday = new Date(y, m, 1 - firstDayWeekIndex);

  for (let week = 1; week <= 6; week++) {
    const tplName = 'カレンダー原本1';
    const tpl = ss.getSheetByName(tplName);
    if (!tpl) throw new Error(`テンプレが見つかりません: ${tplName}`);

    const newName = `カレンダー_${y}${String(m + 1).padStart(2, '0')}_${week}週目`;

    // 既に存在するならスキップ
    if (ss.getSheetByName(newName)) continue;

    const sh = tpl.copyTo(ss).setName(newName);

    // 1行目に識別情報
    sh.getRange('D1').setValue(`${y}年${m + 1}月 第${week}週`);

    // この週（月〜日）の日付
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(firstWeekMonday);
      d.setDate(firstWeekMonday.getDate() + (week - 1) * 7 + i);
      weekDates.push(d);
    }

    // ヘッダー付近にかかる結合セルを安全に解除
    breakMergedRangesAroundHeader_(sh);

    // 2行目：結合＆セット（月外は列全体を灰色、4行目だけ濃紺＋白文字）
    for (const b of DAY_BLOCKS) {
      const headerRange = sh.getRange(b.range);
      const d = weekDates[b.idx];
      const inMonth = (d.getFullYear() === y && d.getMonth() === m);

      headerRange.merge();

      if (inMonth) {
        headerRange.setValue(formatDateWithDow_(d));
        headerRange.setFontColor(getDateFontColor_(d));
      } else {
        headerRange.setValue('');
        headerRange.setFontColor('#000000');
        sh.getRange(b.col).setBackground('#b7b7b7');
        sh.getRange(b.row4).setBackground('#073763');
        sh.getRange(b.row4).setFontColor('#ffffff');
      }

      headerRange.setHorizontalAlignment('center');
      headerRange.setVerticalAlignment('middle');
    }
  }
}

/**
 * 日付文字色を返す
 * 土曜     → #0000ff
 * 日曜祝日 → #ff0000
 * 平日     → #000000
 */
function getDateFontColor_(date) {
  if (isJapaneseHoliday_(date) || date.getDay() === 0) {
    return '#ff0000';
  }
  if (date.getDay() === 6) {
    return '#0000ff';
  }
  return '#000000';
}

/**
 * 日本の祝日判定（Calendar API不要）
 */
function isJapaneseHoliday_(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();

  const holidays = getJapaneseHolidays_(y);

  return holidays.some(h => h.month === m && h.day === d);
}

/**
 * 指定年の日本の祝日一覧を返す
 * 戻り値: [{month: 1, day: 1, name: '元日'}, ...]
 */
function getJapaneseHolidays_(year) {
  const holidays = [];

  // 固定祝日
  holidays.push({ month: 1,  day: 1,  name: '元日' });
  holidays.push({ month: 2,  day: 11, name: '建国記念の日' });
  if (year >= 2020) holidays.push({ month: 2, day: 23, name: '天皇誕生日' });
  holidays.push({ month: 4,  day: 29, name: '昭和の日' });
  holidays.push({ month: 5,  day: 3,  name: '憲法記念日' });
  holidays.push({ month: 5,  day: 4,  name: 'みどりの日' });
  holidays.push({ month: 5,  day: 5,  name: 'こどもの日' });
  holidays.push({ month: 8,  day: 11, name: '山の日' });
  holidays.push({ month: 11, day: 3,  name: '文化の日' });
  holidays.push({ month: 11, day: 23, name: '勤労感謝の日' });

  // ハッピーマンデー
  holidays.push({ month: 1,  day: nthWeekdayOfMonth_(year, 1, 1, 2), name: '成人の日' });       // 1月第2月曜
  holidays.push({ month: 7,  day: nthWeekdayOfMonth_(year, 7, 1, 3), name: '海の日' });         // 7月第3月曜
  holidays.push({ month: 9,  day: nthWeekdayOfMonth_(year, 9, 1, 3), name: '敬老の日' });       // 9月第3月曜
  holidays.push({ month: 10, day: nthWeekdayOfMonth_(year,10, 1, 2), name: 'スポーツの日' });   // 10月第2月曜

  // 春分の日 / 秋分の日
  holidays.push({ month: 3, day: calcSpringEquinoxDay_(year), name: '春分の日' });
  holidays.push({ month: 9, day: calcAutumnEquinoxDay_(year), name: '秋分の日' });

  // 並び順をソート
  holidays.sort((a, b) => {
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  });

  // 振替休日を追加
  const substituteHolidays = [];
  holidays.forEach(h => {
    const dt = new Date(year, h.month - 1, h.day);
    if (dt.getDay() === 0) { // 日曜
      let sub = new Date(dt);
      sub.setDate(sub.getDate() + 1);

      while (containsHoliday_(holidays, sub) || containsHoliday_(substituteHolidays, sub)) {
        sub.setDate(sub.getDate() + 1);
      }

      substituteHolidays.push({
        month: sub.getMonth() + 1,
        day: sub.getDate(),
        name: '振替休日'
      });
    }
  });

  holidays.push(...substituteHolidays);

  // 国民の休日を追加
  holidays.sort((a, b) => {
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  });

  const citizenHolidays = [];
  for (let i = 0; i < holidays.length - 1; i++) {
    const a = holidays[i];
    const b = holidays[i + 1];
    const da = new Date(year, a.month - 1, a.day);
    const db = new Date(year, b.month - 1, b.day);

    const diffDays = Math.round((db - da) / (1000 * 60 * 60 * 24));
    if (diffDays === 2) {
      const mid = new Date(da);
      mid.setDate(mid.getDate() + 1);

      // 日曜は国民の休日にしない
      if (mid.getDay() !== 0 &&
          !containsHoliday_(holidays, mid) &&
          !containsHoliday_(citizenHolidays, mid)) {
        citizenHolidays.push({
          month: mid.getMonth() + 1,
          day: mid.getDate(),
          name: '国民の休日'
        });
      }
    }
  }

  holidays.push(...citizenHolidays);

  holidays.sort((a, b) => {
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  });

  return holidays;
}

/**
 * 指定月の第n weekday を返す
 * weekday: 日=0, 月=1, ... 土=6
 * 例: nthWeekdayOfMonth_(2026, 1, 1, 2) -> 1月第2月曜
 */
function nthWeekdayOfMonth_(year, month, weekday, nth) {
  const first = new Date(year, month - 1, 1);
  const firstDay = first.getDay();
  const offset = (weekday - firstDay + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
}

/**
 * 春分の日
 */
function calcSpringEquinoxDay_(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/**
 * 秋分の日
 */
function calcAutumnEquinoxDay_(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/**
 * 祝日配列の中に対象日があるか
 */
function containsHoliday_(holidayArray, dateObj) {
  const m = dateObj.getMonth() + 1;
  const d = dateObj.getDate();
  return holidayArray.some(h => h.month === m && h.day === d);
}

/**
 * ヘッダー付近に重なっている結合セルを、結合範囲単位で解除する
 * D2:FG2 に少しでも重なっている merged range を全部 breakApart()
 */
function breakMergedRangesAroundHeader_(sh) {
  const targetRowStart = 2;
  const targetRowEnd   = 2;
  const targetColStart = columnLetterToNumber_('D');
  const targetColEnd   = columnLetterToNumber_('FG');

  const mergedRanges = sh.getDataRange().getMergedRanges();

  mergedRanges.forEach(r => {
    const rowStart = r.getRow();
    const rowEnd   = rowStart + r.getNumRows() - 1;
    const colStart = r.getColumn();
    const colEnd   = colStart + r.getNumColumns() - 1;

    const rowOverlap = !(rowEnd < targetRowStart || rowStart > targetRowEnd);
    const colOverlap = !(colEnd < targetColStart || colStart > targetColEnd);

    if (rowOverlap && colOverlap) {
      r.breakApart();
    }
  });
}

/** 列記号 → 列番号 */
function columnLetterToNumber_(col) {
  let num = 0;
  for (let i = 0; i < col.length; i++) {
    num = num * 26 + (col.charCodeAt(i) - 64);
  }
  return num;
}

/** 表示用フォーマット：M/D（曜） */
function formatDateWithDow_(d) {
  const w = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}（${w[d.getDay()]}）`;
}
