(function () {
  "use strict";

  var API_BASE = window.location.hostname === "localhost"
    ? "http://localhost:5001/village-tsubasa/asia-northeast1/api"
    : "/api";

  var selectedCategory = "improvement";
  var textarea = document.getElementById("feedback-text");
  var charCurrent = document.getElementById("char-current");
  var submitBtn = document.getElementById("submit-btn");
  var resultMessage = document.getElementById("result-message");
  var sendingOverlay = document.getElementById("sending-overlay");

  var CATEGORY_LABELS = {
    improvement: "\u{1F4A1} \u6539\u5584\u306E\u63D0\u6848",
    bug: "\u{1F41B} \u4E0D\u5177\u5408\u306E\u5831\u544A",
    request: "\u{1F64B} \u6A5F\u80FD\u306E\u30EA\u30AF\u30A8\u30B9\u30C8",
    general: "\u{1F4AC} \u305D\u306E\u4ED6",
  };

  // カテゴリ選択
  var categoryBtns = document.querySelectorAll(".category-btn");
  categoryBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      categoryBtns.forEach(function (b) { b.classList.remove("selected"); });
      btn.classList.add("selected");
      selectedCategory = btn.getAttribute("data-cat");
    });
  });

  // 文字数カウント
  textarea.addEventListener("input", function () {
    var len = textarea.value.length;
    charCurrent.textContent = len;
    var countEl = charCurrent.parentElement;
    if (len > 2000) {
      countEl.classList.add("over");
    } else {
      countEl.classList.remove("over");
    }
  });

  // 送信
  submitBtn.addEventListener("click", function () {
    var message = textarea.value.trim();

    if (!message) {
      showResult("error", "メッセージを入力してください。");
      return;
    }
    if (message.length > 2000) {
      showResult("error", "メッセージは2000文字以内にしてください。");
      return;
    }

    submitBtn.disabled = true;
    sendingOverlay.classList.add("active");
    resultMessage.style.display = "none";

    fetch(API_BASE + "/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: selectedCategory,
        message: message,
      }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        sendingOverlay.classList.remove("active");
        if (data.success) {
          showResult("success", "送信しました！ご意見ありがとうございます。匿名で管理者に届きました。");
          textarea.value = "";
          charCurrent.textContent = "0";
          // 送信後に対応済み一覧をリロード
          loadResolvedFeedback();
        } else {
          showResult("error", data.error || "送信に失敗しました。");
          submitBtn.disabled = false;
        }
      })
      .catch(function () {
        sendingOverlay.classList.remove("active");
        showResult("error", "通信エラーが発生しました。しばらくしてからもう一度お試しください。");
        submitBtn.disabled = false;
      });
  });

  function showResult(type, text) {
    resultMessage.className = "result-message " + type;
    resultMessage.textContent = text;
    resultMessage.style.display = "block";
  }

  // === 対応済みフィードバック一覧 ===

  function loadResolvedFeedback() {
    fetch(API_BASE + "/feedback/resolved")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var items = data.feedback || [];
        var section = document.getElementById("resolved-section");
        var list = document.getElementById("resolved-list");

        if (items.length === 0) {
          section.style.display = "none";
          return;
        }

        section.style.display = "block";

        var html = items.map(function (item) {
          var catLabel = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.general;
          var dateStr = formatDate(item.created_at);

          return (
            '<div class="resolved-card">' +
              '<div class="resolved-card__header">' +
                '<span class="resolved-card__cat">' + catLabel + '</span>' +
                '<span class="resolved-card__date">' + dateStr + '</span>' +
              '</div>' +
              '<div class="resolved-card__voice">' + escapeHtml(item.ai_message) + '</div>' +
              '<div class="resolved-card__reply">' +
                '<div class="resolved-card__reply-label">管理者からの対応</div>' +
                '<div class="resolved-card__reply-body">' + escapeHtml(item.admin_reply) + '</div>' +
              '</div>' +
            '</div>'
          );
        }).join("");

        list.innerHTML = html;
      })
      .catch(function () {
        // エラー時は静かに無視
      });
  }

  function formatDate(isoStr) {
    if (!isoStr) return "";
    var d = new Date(isoStr);
    var month = d.getMonth() + 1;
    var day = d.getDate();
    return month + "/" + day;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ページ読み込み時に対応済み一覧を取得
  loadResolvedFeedback();
})();
