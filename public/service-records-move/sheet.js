const demoRecord = {
  officeName: "ビレッジつばさ 移動支援事業所",
  userName: "山田 花子 様",
  helperName: "佐藤 美咲",
  confirmationName: "山田 花子",
  serviceDate: "2026年3月23日（月）",
  serviceTime: "09:30 〜 12:10",
  destination: "自宅 → つばさ駅 → 市民病院\n帰路は薬局経由で自宅へ",
  supportDetails: [
    "自宅から駅までの付き添いと歩行見守り",
    "電車乗降時の誘導、切符確認、座席確保",
    "病院受付の補助、待合時の体調確認",
    "薬局での会計補助と帰宅動線の安全確認",
  ],
  remarks: [
    "診察待ちが長くなったため、水分補給を促した",
    "帰路は混雑が少なく、体調変化なし",
    "次回は診察券の携行確認を事前に行う",
  ],
  route: [
    "自宅",
    "徒歩 8分",
    "つばさ駅",
    "電車 14分",
    "中央駅",
    "徒歩 6分",
    "市民病院",
  ],
  walk: "往復 14分",
  bus: "なし",
  train: "往復 28分",
  deposit: "3,000円",
  usedAmount: "1,420円",
  expenseBreakdown: [
    "電車代 620円",
    "昼食代 600円",
    "飲料代 200円",
  ],
};

function setText(fieldName, value) {
  const node = document.querySelector(`[data-field="${fieldName}"]`);

  if (!node) {
    return;
  }

  node.textContent = value ?? "";
}

function renderLines(fieldName, lines, compact = false) {
  const node = document.querySelector(`[data-field="${fieldName}"]`);

  if (!node) {
    return;
  }

  node.classList.toggle("sheet-lines--compact", compact);
  node.replaceChildren();

  lines.forEach((line) => {
    const row = document.createElement("p");
    row.className = "sheet-lines__row";
    row.textContent = line;
    node.appendChild(row);
  });

  const minimumRows = compact ? 3 : 4;

  for (let index = lines.length; index < minimumRows; index += 1) {
    const row = document.createElement("p");
    row.className = "sheet-lines__row";
    row.innerHTML = "&nbsp;";
    node.appendChild(row);
  }
}

function renderSheet(record) {
  setText("officeName", record.officeName);
  setText("userName", record.userName);
  setText("helperName", record.helperName);
  setText("confirmationName", record.confirmationName);
  setText("serviceDate", record.serviceDate);
  setText("serviceTime", record.serviceTime);
  setText("destination", record.destination);
  setText("walk", record.walk);
  setText("bus", record.bus);
  setText("train", record.train);
  setText("deposit", record.deposit);
  setText("usedAmount", record.usedAmount);

  renderLines("supportDetails", record.supportDetails);
  renderLines("remarks", record.remarks);
  renderLines("route", record.route);
  renderLines("expenseBreakdown", record.expenseBreakdown, true);
}

function setupPrintButton() {
  const button = document.getElementById("sheet-print-button");

  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
    window.print();
  });
}

renderSheet(demoRecord);
setupPrintButton();
