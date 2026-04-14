/* =========================================================
   落ち着き確認 main.js
   ========================================================= */

var API_BASE = location.hostname === "localhost"
  ? "http://127.0.0.1:5001/village-tsubasa/asia-northeast1/api"
  : "";

var loadingEl  = document.getElementById("loading");
var emptyEl    = document.getElementById("empty");
var container  = document.getElementById("checks-container");

/* ---- ヘルパー Email ---- */
var helperEmail = "";
try {
  helperEmail = (localStorage.getItem("helper_email") || "").trim();
} catch (_) {}

if (!helperEmail) {
  loadingEl.style.display = "none";
  emptyEl.querySelector(".empty-state__text").textContent =
    "メールアドレスが設定されていません。スケジュール確認画面で登録してください。";
  emptyEl.style.display = "block";
} else {
  loadPendingChecks();
}

/* ---- 未回答の確認を読み込む ---- */
function loadPendingChecks() {
  fetch(API_BASE + "/api/calm-checks/pending?helper_email=" + encodeURIComponent(helperEmail))
    .then(function (r) { return r.json(); })
    .then(function (json) {
      loadingEl.style.display = "none";
      if (!json.ok || !json.items || json.items.length === 0) {
        emptyEl.style.display = "block";
        return;
      }
      json.items.forEach(function (item) {
        container.appendChild(createCheckCard(item));
      });
    })
    .catch(function (err) {
      console.error("load error:", err);
      loadingEl.style.display = "none";
      emptyEl.querySelector(".empty-state__text").textContent = "読み込みに失敗しました";
      emptyEl.style.display = "block";
    });
}

/* ---- カードを生成 ---- */
function createCheckCard(item) {
  var card = document.createElement("div");
  card.className = "check-card";
  card.dataset.id = item.id;

  // 時刻表示
  var timeStr = "";
  if (item.start_time) {
    timeStr = item.start_time;
    if (item.end_time) timeStr += " 〜 " + item.end_time;
  }

  card.innerHTML =
    '<div class="check-card__header">' +
      '<div class="check-card__icon">&#128100;</div>' +
      '<h3 class="check-card__name">' + escapeHtml(item.client_name) + '</h3>' +
    '</div>' +
    '<div class="check-card__meta">' +
      '<span>' + escapeHtml(item.service_date) + '</span>' +
      (timeStr ? '<span>' + escapeHtml(timeStr) + '</span>' : '') +
      (item.task_name ? '<span>' + escapeHtml(item.task_name) + '</span>' : '') +
    '</div>' +
    /* Step 1: 落ち着いていた？ */
    '<div class="step step-1 active">' +
      '<p class="step__question">今日の様子は？</p>' +
      '<div class="choice-buttons">' +
        '<button type="button" class="choice-btn choice-btn--calm" data-calm="true">&#128522; 落ち着いていた</button>' +
        '<button type="button" class="choice-btn choice-btn--not-calm" data-calm="false">&#128543; 落ち着いていなかった</button>' +
      '</div>' +
    '</div>' +
    /* Step 2: 全体的？部分的？ */
    '<div class="step step-2">' +
      '<p class="step__question">どの程度でしたか？</p>' +
      '<div class="choice-buttons">' +
        '<button type="button" class="choice-btn choice-btn--overall" data-severity="overall">全体的に</button>' +
        '<button type="button" class="choice-btn choice-btn--partial" data-severity="partial">部分的に</button>' +
      '</div>' +
    '</div>' +
    /* Step 3: メモ */
    '<div class="step step-3">' +
      '<p class="step__question">状況を簡単にメモしてください</p>' +
      '<textarea class="memo-area" placeholder="例: 午前中は落ち着いていたが、昼食後から大きな声を出していた"></textarea>' +
      '<button type="button" class="submit-btn">送信する</button>' +
    '</div>' +
    /* Done */
    '<div class="step step-done">' +
      '<div class="done-message">' +
        '<div class="done-message__icon">&#10003;</div>' +
        '<p class="done-message__text">回答を送信しました</p>' +
      '</div>' +
    '</div>';

  // State
  var state = { isCalm: null, severity: null, memo: "", isSending: false };

  // Step 1 buttons
  var step1btns = card.querySelectorAll(".step-1 .choice-btn");
  step1btns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var calm = btn.dataset.calm === "true";
      state.isCalm = calm;

      // highlight
      step1btns.forEach(function (b) { b.classList.remove("selected"); });
      btn.classList.add("selected");

      if (calm) {
        // 落ち着いていた → 即送信
        submitAnswer(card, state);
      } else {
        // Step 2 へ
        showStep(card, "step-2");
      }
    });
  });

  // Step 2 buttons
  var step2btns = card.querySelectorAll(".step-2 .choice-btn");
  step2btns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.severity = btn.dataset.severity;
      step2btns.forEach(function (b) { b.classList.remove("selected"); });
      btn.classList.add("selected");
      // Step 3 へ
      showStep(card, "step-3");
    });
  });

  // Step 3 submit
  var submitBtn = card.querySelector(".submit-btn");
  var memoArea = card.querySelector(".memo-area");
  submitBtn.addEventListener("click", function () {
    state.memo = memoArea.value.trim();
    submitAnswer(card, state);
  });

  return card;
}

/* ---- ステップ切り替え ---- */
function showStep(card, stepClass) {
  var steps = card.querySelectorAll(".step");
  steps.forEach(function (s) { s.classList.remove("active"); });
  var target = card.querySelector("." + stepClass);
  if (target) target.classList.add("active");
}

/* ---- 送信 ---- */
function submitAnswer(card, state) {
  if (state.isSending) return;
  state.isSending = true;

  var submitBtn = card.querySelector(".submit-btn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "送信中…";
  }

  var body = {
    id: card.dataset.id,
    helper_email: helperEmail,
    is_calm: state.isCalm,
    severity: state.severity,
    memo: state.memo || null,
  };

  fetch(API_BASE + "/api/calm-checks/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then(function (r) { return r.json(); })
    .then(function (json) {
      if (json.ok) {
        showStep(card, "step-done");
      } else {
        alert("送信に失敗しました: " + (json.message || "不明なエラー"));
        state.isSending = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "送信する";
        }
      }
    })
    .catch(function (err) {
      console.error("submit error:", err);
      alert("通信エラーが発生しました");
      state.isSending = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "送信する";
      }
    });
}

/* ---- ユーティリティ ---- */
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
