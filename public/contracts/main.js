(function () {
  "use strict";

  const API_BASE =
    "https://asia-northeast1-village-tsubasa.cloudfunctions.net/api";
  const LS_EMAIL_KEY = "village-tsubasa-helper-email";

  const emailInput = document.getElementById("emailInput");
  const listEl = document.getElementById("list");

  const savedEmail = localStorage.getItem(LS_EMAIL_KEY) || "";
  emailInput.value = savedEmail;
  if (savedEmail) loadContracts(savedEmail);

  emailInput.addEventListener("change", function () {
    const email = emailInput.value.trim();
    localStorage.setItem(LS_EMAIL_KEY, email);
    if (email) loadContracts(email);
  });

  function statusLabel(status) {
    switch (status) {
      case "pending_signature":
        return "署名待ち";
      case "signed":
        return "締結済";
      case "revoked":
        return "撤回";
      case "expired":
        return "期限切れ";
      default:
        return status;
    }
  }

  async function loadContracts(email) {
    listEl.innerHTML = '<div class="loading">読み込み中…</div>';
    try {
      const res = await fetch(
        API_BASE +
          "/contracts/mine?email=" +
          encodeURIComponent(email),
      );
      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }
      const json = await res.json();
      render(json.contracts || []);
    } catch (err) {
      console.error(err);
      listEl.innerHTML =
        '<div class="error">契約一覧の取得に失敗しました</div>';
    }
  }

  function render(contracts) {
    if (!contracts.length) {
      listEl.innerHTML =
        '<div class="empty">現在、自分宛の契約はありません。</div>';
      return;
    }
    listEl.innerHTML = "";
    contracts.forEach(function (c) {
      const card = document.createElement("div");
      card.className = "contract-card";

      const statusChip =
        '<span class="status-chip status-' +
        c.status +
        '">' +
        statusLabel(c.status) +
        "</span>";

      const sentAt = c.sent_at
        ? new Date(c.sent_at).toLocaleDateString("ja-JP")
        : "—";
      const completedAt = c.completed_at
        ? new Date(c.completed_at).toLocaleDateString("ja-JP")
        : "—";

      const kindLabel =
        c.kind === "employment"
          ? "雇用契約"
          : c.kind === "nda"
            ? "秘密保持"
            : c.kind === "service_agreement"
              ? "業務委託"
              : c.kind === "important_matter"
                ? "重要事項説明書"
                : c.kind;

      card.innerHTML =
        "<h2>" +
        escapeHtml(c.title || "(無題)") +
        statusChip +
        "</h2>" +
        '<div class="contract-meta">' +
        kindLabel +
        "・送信: " +
        sentAt +
        "・締結: " +
        completedAt +
        "</div>";

      const actions = document.createElement("div");
      actions.className = "actions";
      if (c.status === "pending_signature") {
        const btn = document.createElement("a");
        btn.className = "btn btn-primary";
        btn.href = "sign.html?id=" + encodeURIComponent(c.id);
        btn.textContent = "署名する";
        actions.appendChild(btn);
      } else if (c.status === "signed") {
        const btn = document.createElement("a");
        btn.className = "btn";
        btn.href = "viewer.html?id=" + encodeURIComponent(c.id);
        btn.textContent = "契約書を見る";
        actions.appendChild(btn);
      }
      if (actions.children.length > 0) {
        card.appendChild(actions);
      }

      listEl.appendChild(card);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
