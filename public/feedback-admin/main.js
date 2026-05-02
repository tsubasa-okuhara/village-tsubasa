(function () {
  "use strict";

  var API_BASE = window.location.hostname === "localhost"
    ? "http://localhost:5001/village-tsubasa/asia-northeast1/api"
    : "/api";

  var adminEmail = "";
  var currentFilter = "";
  var feedbackData = [];

  var authPanel = document.getElementById("auth-panel");
  var mainContent = document.getElementById("main-content");
  var adminEmailInput = document.getElementById("admin-email");
  var authBtn = document.getElementById("auth-btn");
  var feedbackContainer = document.getElementById("feedback-container");
  var unreadBadge = document.getElementById("unread-badge");

  var CATEGORY_LABELS = {
    improvement: { icon: "\uD83D\uDCA1", label: "改善の提案" },
    bug: { icon: "\uD83D\uDC1B", label: "不具合の報告" },
    request: { icon: "\uD83D\uDE4B", label: "機能のリクエスト" },
    general: { icon: "\uD83D\uDCAC", label: "その他" },
  };

  // localStorageから管理者メール復元
  var savedEmail = localStorage.getItem("feedback_admin_email");
  if (savedEmail) {
    adminEmail = savedEmail;
    showMainContent();
  }

  // 認証
  authBtn.addEventListener("click", function () {
    var email = adminEmailInput.value.trim().toLowerCase();
    if (!email) return;
    adminEmail = email;
    localStorage.setItem("feedback_admin_email", email);
    showMainContent();
  });

  adminEmailInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") authBtn.click();
  });

  // フィルタ
  var filterBtns = document.querySelectorAll(".filter-btn");
  filterBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      filterBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      currentFilter = btn.getAttribute("data-filter");
      renderFeedback();
    });
  });

  function showMainContent() {
    authPanel.style.display = "none";
    mainContent.style.display = "block";
    loadFeedback();
  }

  function loadFeedback() {
    feedbackContainer.innerHTML = '<div class="loading">読み込み中…</div>';

    fetch(API_BASE + "/feedback?email=" + encodeURIComponent(adminEmail))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) {
          if (data.error.includes("管理者")) {
            localStorage.removeItem("feedback_admin_email");
            adminEmail = "";
            authPanel.style.display = "block";
            mainContent.style.display = "none";
            alert("管理者のメールアドレスが正しくありません。");
            return;
          }
          feedbackContainer.innerHTML = '<div class="empty-state">' + escapeHtml(data.error) + '</div>';
          return;
        }

        feedbackData = data.feedback || [];
        updateUnreadBadge();
        renderFeedback();
      })
      .catch(function () {
        feedbackContainer.innerHTML = '<div class="empty-state">読み込みに失敗しました。</div>';
      });
  }

  function updateUnreadBadge() {
    var unreadCount = feedbackData.filter(function (f) { return f.status === "unread"; }).length;
    if (unreadCount > 0) {
      unreadBadge.textContent = unreadCount;
      unreadBadge.style.display = "inline-flex";
    } else {
      unreadBadge.style.display = "none";
    }
  }

  function renderFeedback() {
    var filtered = feedbackData;
    if (currentFilter) {
      filtered = feedbackData.filter(function (f) { return f.status === currentFilter; });
    }

    if (filtered.length === 0) {
      feedbackContainer.innerHTML = '<div class="empty-state">フィードバックはありません。</div>';
      return;
    }

    var html = filtered.map(function (item) {
      var cat = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.general;
      var dateStr = formatDate(item.created_at);
      var isUnread = item.status === "unread";

      var actionsHtml = "";

      if (item.status === "unread") {
        actionsHtml +=
          '<button class="action-btn read-btn" onclick="updateStatus(\'' + item.id + '\', \'read\')">既読にする</button>';
      }

      if (item.status !== "archived") {
        // 対応済みにするボタン → 返信入力欄を開く
        actionsHtml +=
          '<button class="action-btn archive-btn" onclick="openReplyForm(\'' + item.id + '\')">対応済みにする（返信あり）</button>';
      }

      // 返信入力フォーム（非表示、ボタンで開く）
      var replyFormHtml = "";
      if (item.status !== "archived") {
        replyFormHtml =
          '<div class="reply-form" id="reply-form-' + item.id + '" style="display: none;">' +
            '<textarea class="reply-textarea" id="reply-text-' + item.id + '" placeholder="対応内容を書いてください（ヘルパーさん全員に公開されます）"></textarea>' +
            '<div class="reply-actions">' +
              '<button class="action-btn" onclick="submitReply(\'' + item.id + '\')">返信して対応済みにする</button>' +
              '<button class="action-btn" onclick="closeReplyForm(\'' + item.id + '\')">キャンセル</button>' +
            '</div>' +
          '</div>';
      }

      // 既存の返信表示
      var replyDisplayHtml = "";
      if (item.admin_reply) {
        replyDisplayHtml =
          '<div class="admin-reply">' +
            '<div class="admin-reply__label">管理者からの返信</div>' +
            '<div class="admin-reply__body">' + escapeHtml(item.admin_reply) + '</div>' +
          '</div>';
      }

      if (item.status === "archived" && !item.admin_reply) {
        actionsHtml += '<span style="font-size: 0.82rem; color: var(--success);">✓ 対応済み</span>';
      }

      return (
        '<div class="feedback-card' + (isUnread ? " unread" : "") + '" data-id="' + escapeHtml(item.id) + '">' +
          '<div class="feedback-top">' +
            '<div class="feedback-meta">' +
              '<span class="cat-badge">' + cat.icon + " " + cat.label + '</span>' +
              '<span class="time-label">' + dateStr + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="feedback-body">' + escapeHtml(item.ai_message) + '</div>' +
          replyDisplayHtml +
          '<div class="feedback-actions">' + actionsHtml + '</div>' +
          replyFormHtml +
        '</div>'
      );
    }).join("");

    feedbackContainer.innerHTML = html;
  }

  // 返信フォームを開く
  window.openReplyForm = function (id) {
    var form = document.getElementById("reply-form-" + id);
    if (form) form.style.display = "block";
  };

  // 返信フォームを閉じる
  window.closeReplyForm = function (id) {
    var form = document.getElementById("reply-form-" + id);
    if (form) form.style.display = "none";
  };

  // 返信付きで対応済みにする
  window.submitReply = function (id) {
    var replyText = document.getElementById("reply-text-" + id);
    var reply = replyText ? replyText.value.trim() : "";

    if (!reply) {
      alert("返信内容を入力してください。");
      return;
    }

    fetch(API_BASE + "/feedback/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, status: "archived", email: adminEmail, reply: reply }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          feedbackData = feedbackData.map(function (f) {
            if (f.id === id) {
              f.status = "archived";
              f.admin_reply = reply;
            }
            return f;
          });
          updateUnreadBadge();
          renderFeedback();
        }
      })
      .catch(function () {
        alert("更新に失敗しました。");
      });
  };

  // ステータスのみ更新（既読にする）
  window.updateStatus = function (id, status) {
    fetch(API_BASE + "/feedback/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, status: status, email: adminEmail }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          feedbackData = feedbackData.map(function (f) {
            if (f.id === id) f.status = status;
            return f;
          });
          updateUnreadBadge();
          renderFeedback();
        }
      })
      .catch(function () {
        alert("更新に失敗しました。");
      });
  };

  function formatDate(isoStr) {
    if (!isoStr) return "";
    var d = new Date(isoStr);
    var month = d.getMonth() + 1;
    var day = d.getDate();
    var hours = String(d.getHours()).padStart(2, "0");
    var minutes = String(d.getMinutes()).padStart(2, "0");
    return month + "/" + day + " " + hours + ":" + minutes;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
