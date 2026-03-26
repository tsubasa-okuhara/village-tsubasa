const SHEET_ENDPOINT = "/api/service-records-move/sheets";

const state = {
  items: [],
  userFilter: "",
  beneficiaryFilter: "",
};

function compareBeneficiaryNumber(a, b) {
  return String(a.beneficiaryNumber || "").localeCompare(
    String(b.beneficiaryNumber || ""),
    "ja",
    { numeric: true },
  );
}

function getSortedItems(items) {
  return [...items].sort(compareBeneficiaryNumber);
}

function getUniqueValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))];
}

function setFieldValue(scope, fieldName, value) {
  const element = scope.querySelector(`[data-field="${fieldName}"]`);

  if (!element) {
    return;
  }

  element.textContent = value || "";
}

function setChoiceValue(scope, choiceName, isActive) {
  const element = scope.querySelector(`[data-choice="${choiceName}"]`);

  if (!element) {
    return;
  }

  element.classList.toggle("is-active", Boolean(isActive));
}

function setStatus(message) {
  const statusElement = document.getElementById("sheet-status");

  if (!statusElement) {
    return;
  }

  statusElement.textContent = message || "";
}

function setError(message) {
  const errorElement = document.getElementById("sheet-error");

  if (!errorElement) {
    return;
  }

  errorElement.textContent = message || "";
}

function createSheetElement(data) {
  const template = document.getElementById("sheet-template");

  if (!(template instanceof HTMLTemplateElement)) {
    throw new Error("sheet template not found");
  }

  const fragment = template.content.cloneNode(true);
  const sheetElement = fragment.querySelector(".sheet-frame");

  if (!sheetElement) {
    throw new Error("sheet frame not found");
  }

  setFieldValue(sheetElement, "beneficiaryNumber", data.beneficiaryNumber);
  setFieldValue(sheetElement, "officeName", data.officeName);
  setFieldValue(sheetElement, "createdDate", data.createdDate);
  setFieldValue(sheetElement, "userName", data.userName);
  setFieldValue(sheetElement, "helperName", data.helperName);
  setFieldValue(sheetElement, "verification", data.verification);
  setFieldValue(sheetElement, "serviceDate", data.serviceDate);
  setFieldValue(sheetElement, "serviceTime", data.serviceTime);
  setFieldValue(sheetElement, "destination", data.destination);
  setFieldValue(sheetElement, "supportSummary", data.supportSummary);
  setFieldValue(sheetElement, "memo", data.memo);
  setFieldValue(sheetElement, "route", data.route);
  setFieldValue(sheetElement, "depositAmount", data.depositAmount);
  setFieldValue(sheetElement, "usedAmount", data.usedAmount);
  setFieldValue(sheetElement, "expenseBreakdown", data.expenseBreakdown);

  setChoiceValue(sheetElement, "walk", data.transport && data.transport.walk);
  setChoiceValue(sheetElement, "bus", data.transport && data.transport.bus);
  setChoiceValue(sheetElement, "train", data.transport && data.transport.train);

  return fragment;
}

function chunkItems(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function renderSheets(items) {
  const listElement = document.getElementById("sheet-list");

  if (!listElement) {
    throw new Error("sheet list not found");
  }

  listElement.innerHTML = "";
  chunkItems(items, 2).forEach((pageItems) => {
    const pageElement = document.createElement("section");
    pageElement.className = "sheet-page-group";

    pageItems.forEach((item) => {
      pageElement.appendChild(createSheetElement(item));
    });

    listElement.appendChild(pageElement);
  });
}

function getFilteredItems() {
  return getSortedItems(state.items).filter((item) => {
    const matchesUser = !state.userFilter || item.userName === state.userFilter;
    const matchesBeneficiary =
      !state.beneficiaryFilter || item.beneficiaryNumber === state.beneficiaryFilter;

    return matchesUser && matchesBeneficiary;
  });
}

function fillSelectOptions(selectElement, values, placeholder) {
  if (!selectElement) {
    return;
  }

  selectElement.innerHTML = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = placeholder;
  selectElement.appendChild(emptyOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectElement.appendChild(option);
  });
}

function syncControls() {
  const sortedItems = getSortedItems(state.items);
  const userFilterElement = document.getElementById("user-filter");
  const beneficiaryFilterElement = document.getElementById("beneficiary-filter");

  fillSelectOptions(userFilterElement, getUniqueValues(sortedItems, "userName"), "すべて");
  fillSelectOptions(
    beneficiaryFilterElement,
    getUniqueValues(sortedItems, "beneficiaryNumber"),
    "すべて",
  );

  if (userFilterElement) {
    userFilterElement.value = state.userFilter;
  }

  if (beneficiaryFilterElement) {
    beneficiaryFilterElement.value = state.beneficiaryFilter;
  }
}

function updateView() {
  const items = getFilteredItems();
  renderSheets(items);
  setStatus(`${items.length} 件を表示中`);
}

function bindEvents() {
  const userFilterElement = document.getElementById("user-filter");
  const beneficiaryFilterElement = document.getElementById("beneficiary-filter");
  const resetButton = document.getElementById("reset-filters");
  const printButton = document.getElementById("print-sheets");

  if (userFilterElement) {
    userFilterElement.addEventListener("change", (event) => {
      state.userFilter = event.target.value;
      updateView();
    });
  }

  if (beneficiaryFilterElement) {
    beneficiaryFilterElement.addEventListener("change", (event) => {
      state.beneficiaryFilter = event.target.value;
      updateView();
    });
  }

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      state.userFilter = "";
      state.beneficiaryFilter = "";
      syncControls();
      updateView();
    });
  }

  if (printButton) {
    printButton.addEventListener("click", () => {
      window.print();
    });
  }
}

async function fetchSheetItems() {
  setStatus("帳票データを取得中...");
  setError("");

  const response = await fetch(SHEET_ENDPOINT, { method: "GET" });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.message || "帳票データの取得に失敗しました");
  }

  state.items = Array.isArray(result.items) ? result.items : [];
}

async function initialize() {
  bindEvents();

  try {
    await fetchSheetItems();
    syncControls();
    updateView();
  } catch (error) {
    state.items = [];
    syncControls();
    renderSheets([]);
    setStatus("");
    setError(error instanceof Error ? error.message : "帳票データの取得に失敗しました");
  }
}

initialize();
