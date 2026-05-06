"use strict";

const STORAGE_KEY = "vt:helperEmail";
const API_CANDIDATES = "/api/self-matching/candidates";
const API_CLAIM = "/api/self-matching/claim";
const API_WITHDRAW = "/api/self-matching/withdraw";

const emailInput = document.getElementById("helper-email");
const loadButton = document.getElementById("load-button");
const refreshButton = document.getElementById("refresh-button");
const listPanel = document.getElementById("list-panel");
const listMeta = document.getElementById("list-meta");
const candidateList = document.getElementById("candidate-list");
const emptyMessage = document.getElementById("empty-message");
const statusPanel = document.getElementById("status-panel");
const statusMessage = document.getElementById("status-message");

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function setStatus(text, kind = "info") {
  if (!text) {
    statusPanel.hidden = true;
    statusMessage.textContent = "";
    statusPanel.classList.remove("is-error", "is-success", "is-info");
    return;
  }
  statusPanel.hidden = false;
  statusMessage.textContent = text;
  statusPanel.classList.remove("is-error", "is-success", "is-info");
  statusPanel.classList.add(`is-${kind}`);
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${m[1]}/${m[2]}/${m[3]} (${WEEKDAYS[d.getDay()]})`;
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  const m = String(timeStr).match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : String(timeStr);
}

function getStoredEmail() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch (_e) {
    return "";
  }
}

function saveEmail(email) {
  try {
    localStorage.setItem(STORAGE_KEY, email);
  } catch (_e) {
    /* ignore */
  }
}

async function fetchCandidates(email) {
  const url = `${API_CANDIDATES}?helper_email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function postClaim(email, scheduleId) {
  const res = await fetch(API_CLAIM, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ helperEmail: email, scheduleId }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function postWithdraw(email, claimId) {
  const res = await fetch(API_WITHDRAW, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ helperEmail: email, claimId }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function renderItems(items) {
  candidateList.innerHTML = "";

  if (!items || items.length === 0) {
    emptyMessage.hidden = false;
    listMeta.textContent = "";
    return;
  }

  emptyMessage.hidden = true;
  listMeta.textContent = `候補 ${items.length} 件`;

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "candidate-card";
    if (item.myClaimStatus === "pending") {
      li.classList.add("is-mine-pending");
    } else if (item.myClaimStatus === "approved") {
      li.classList.add("is-mine-approved");
    }

    const dateRow = document.createElement("div");
    dateRow.className = "candidate-card__date";
    dateRow.textContent = formatDate(item.date);
    li.appendChild(dateRow);

    const timeRow = document.createElement("div");
    timeRow.innerHTML = `<span class="candidate-card__time">${formatTime(
      item.startTime
    )} 〜 ${formatTime(item.endTime)}</span>`;
    li.appendChild(timeRow);

    const clientRow = document.createElement("div");
    clientRow.className = "candidate-card__client";
    clientRow.textContent = item.client;
    li.appendChild(clientRow);

    const metaRow = document.createElement("div");
    metaRow.className = "candidate-card__meta";
    const metaParts = [];
    if (item.task) metaParts.push(`<span>${escapeHtml(item.task)}</span>`);
    if (item.haisha) metaParts.push(`<span>配車: ${escapeHtml(item.haisha)}</span>`);
    if (item.summary) metaParts.push(`<span>${escapeHtml(item.summary)}</span>`);
    metaRow.innerHTML = metaParts.join("") || "&nbsp;";
    li.appendChild(metaRow);

    const actions = document.createElement("div");
    actions.className = "candidate-card__actions";

    if (item.myClaimStatus === "pending") {
      const chip = document.createElement("span");
      chip.className = "status-chip status-chip--pending";
      chip.textContent = "✋ 申請中（管理者の確認待ち）";
      actions.appendChild(chip);

      const withdrawBtn = document.createElement("button");
      withdrawBtn.type = "button";
      withdrawBtn.className = "ghost-button";
      withdrawBtn.textContent = "申請を取り下げる";
      withdrawBtn.addEventListener("click", () =>
        handleWithdraw(item.myClaimId)
      );
      actions.appendChild(withdrawBtn);
    } else if (item.myClaimStatus === "approved") {
      const chip = document.createElement("span");
      chip.className = "status-chip status-chip--approved";
      chip.textContent = "✅ 確定済み";
      actions.appendChild(chip);
    } else {
      const claimBtn = document.createElement("button");
      claimBtn.type = "button";
      claimBtn.className = "primary-button";
      claimBtn.textContent = "入れます";
      claimBtn.addEventListener("click", () => handleClaim(item.scheduleId));
      actions.appendChild(claimBtn);

      if (item.totalClaims > 0) {
        const chip = document.createElement("span");
        chip.className = "status-chip status-chip--others";
        chip.textContent = `他に ${item.totalClaims} 名が申請中`;
        actions.appendChild(chip);
      }
    }

    li.appendChild(actions);
    candidateList.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadList() {
  const email = (emailInput.value || "").trim();
  if (!email) {
    setStatus("メールアドレスを入力してください。", "error");
    return;
  }

  loadButton.disabled = true;
  refreshButton.disabled = true;
  setStatus("読み込み中…", "info");

  try {
    const { ok, status, data } = await fetchCandidates(email);
    if (!ok) {
      if (status === 403) {
        setStatus(
          "このメールアドレスではセルフマッチングが有効になっていません。管理者に確認してください。",
          "error"
        );
      } else if (status === 404) {
        setStatus(
          "ヘルパーマスタにこのメールアドレスが見つかりませんでした。",
          "error"
        );
      } else {
        setStatus(
          `読み込みに失敗しました (${status}): ${data?.message || "不明なエラー"}`,
          "error"
        );
      }
      listPanel.hidden = true;
      return;
    }

    saveEmail(email);
    listPanel.hidden = false;
    renderItems(data.items || []);
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus("通信エラーが発生しました。電波の状況を確認してください。", "error");
  } finally {
    loadButton.disabled = false;
    refreshButton.disabled = false;
  }
}

async function handleClaim(scheduleId) {
  const email = (emailInput.value || "").trim();
  if (!email || !scheduleId) return;

  const ok = window.confirm("この予定に「入れます」と申請しますか？");
  if (!ok) return;

  setStatus("申請を送信中…", "info");
  const { ok: success, status, data } = await postClaim(email, scheduleId);

  if (success) {
    setStatus("申請を送りました。管理者の確認をお待ちください。", "success");
    await loadList();
    return;
  }

  if (status === 409 && data?.code === "duplicate") {
    setStatus("この予定にはすでに申請済みです。", "info");
    await loadList();
    return;
  }
  if (status === 409 && data?.code === "filled") {
    setStatus("ちょうど別のヘルパーが入りました。一覧を更新します。", "info");
    await loadList();
    return;
  }

  setStatus(
    `申請に失敗しました (${status}): ${data?.message || "不明なエラー"}`,
    "error"
  );
}

async function handleWithdraw(claimId) {
  const email = (emailInput.value || "").trim();
  if (!email || !claimId) {
    setStatus("申請情報が取得できませんでした。一覧を更新してください。", "error");
    return;
  }

  const ok = window.confirm("この申請を取り下げますか？");
  if (!ok) return;

  setStatus("取り下げ処理中…", "info");
  const { ok: success, status, data } = await postWithdraw(email, claimId);

  if (success) {
    setStatus("申請を取り下げました。", "success");
    await loadList();
    return;
  }

  if (status === 409) {
    setStatus(
      "すでに管理者による判定が進んでいるため取り下げできません。管理者にご連絡ください。",
      "info"
    );
    await loadList();
    return;
  }

  setStatus(
    `取り下げに失敗しました (${status}): ${data?.message || "不明なエラー"}`,
    "error"
  );
}

loadButton.addEventListener("click", loadList);
refreshButton.addEventListener("click", loadList);
emailInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadList();
});

// 起動時に保存済みメールを復元 → あれば自動読み込み
const stored = getStoredEmail();
if (stored) {
  emailInput.value = stored;
  loadList();
}
