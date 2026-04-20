(function () {
  "use strict";

  var API_BASE =
    location.hostname === "127.0.0.1" || location.hostname === "localhost"
      ? "http://127.0.0.1:5001/village-tsubasa/asia-northeast1/api"
      : "/api";

  var EMAIL_STORAGE_KEY = "helper_email";

  // ---- DOM ----
  var emailInput = document.getElementById("helper-email");
  var lookupBtn = document.getElementById("lookup-btn");
  var helperStatus = document.getElementById("helper-status");

  var materialCard = document.getElementById("material-card");
  var materialList = document.getElementById("material-list");

  var reportCard = document.getElementById("report-card");
  var selectedInfo = document.getElementById("selected-info");
  var checklist = document.getElementById("checklist");
  var extra1 = document.getElementById("extra-1");
  var extra2 = document.getElementById("extra-2");
  var extra3 = document.getElementById("extra-3");
  var submitBtn = document.getElementById("submit-btn");
  var resultMessage = document.getElementById("result-message");
  var sendingOverlay = document.getElementById("sending-overlay");
  var fallbackArea = document.getElementById("fallback-feedback-area");

  var materialViewer = document.getElementById("material-viewer");
  var materialViewerToggle = document.getElementById("material-viewer-toggle");
  var materialViewerBody = document.getElementById("material-viewer-body");

  // 開閉トグル
  materialViewerToggle.addEventListener("click", function () {
    materialViewer.classList.toggle("open");
  });

  // ---- 状態 ----
  var verifiedHelper = null;        // { name, email }
  var loadedMaterials = [];         // 一覧
  var selectedMaterial = null;      // 選択中の研修資料
  var checkedAnswers = {};          // { id: boolean }
  var isSubmitting = false;         // 送信処理中フラグ（二重送信防止）
  var reportedMaterialIds = {};     // { material_id: true } 当セッションで報告完了した資料

  // ---- 初期化: localStorageからメール復元 ----
  var savedEmail = "";
  try {
    savedEmail = (localStorage.getItem(EMAIL_STORAGE_KEY) || "").trim();
  } catch (e) {}
  if (savedEmail) {
    emailInput.value = savedEmail;
    lookupHelper(savedEmail);
  }

  // ---- メール確認 ----
  lookupBtn.addEventListener("click", function () {
    var email = (emailInput.value || "").trim();
    if (!email) { setHelperStatus("ng", "メールアドレスを入力してください"); return; }
    lookupHelper(email);
  });

  emailInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); lookupBtn.click(); }
  });

  emailInput.addEventListener("input", function () {
    if (verifiedHelper && emailInput.value.trim().toLowerCase() !== verifiedHelper.email) {
      verifiedHelper = null;
      setHelperStatus("", "");
      materialCard.style.display = "none";
      reportCard.style.display = "none";
    }
  });

  function lookupHelper(email) {
    var normalized = email.trim().toLowerCase();
    setHelperStatus("loading", "確認中…");
    lookupBtn.disabled = true;

    fetch(API_BASE + "/helpers/lookup?email=" + encodeURIComponent(normalized))
      .then(function (res) { return res.json().then(function (d) { return { status: res.status, data: d }; }); })
      .then(function (r) {
        lookupBtn.disabled = false;
        if (r.status === 200 && r.data && r.data.name) {
          verifiedHelper = { name: r.data.name, email: normalized };
          setHelperStatus("ok", "✓ " + r.data.name + " さん、こんにちは");
          try { localStorage.setItem(EMAIL_STORAGE_KEY, normalized); } catch (e) {}
          materialCard.style.display = "block";
          loadMaterials();
        } else {
          verifiedHelper = null;
          if (r.status === 404) {
            setHelperStatus("ng", "このメールアドレスは登録されていません。管理者にご確認ください。");
          } else {
            setHelperStatus("ng", (r.data && r.data.error) || "確認に失敗しました");
          }
        }
      })
      .catch(function () {
        lookupBtn.disabled = false;
        verifiedHelper = null;
        setHelperStatus("ng", "通信エラーが発生しました");
      });
  }

  function setHelperStatus(type, text) {
    helperStatus.className = "helper-status" + (type ? " " + type : "");
    helperStatus.textContent = text || "";
  }

  // ---- 研修資料一覧の取得 ----
  function loadMaterials() {
    materialList.innerHTML = '<div class="material-empty">読み込み中…</div>';
    fetch(API_BASE + "/training-materials")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        loadedMaterials = (data && data.materials) || [];
        if (loadedMaterials.length === 0) {
          materialList.innerHTML =
            '<div class="material-empty">' +
              '現在、登録されている研修資料はありません。<br>' +
              '管理者が資料を登録すると、ここに表示されます。' +
            '</div>';
          return;
        }
        renderMaterialList();
      })
      .catch(function () {
        materialList.innerHTML = '<div class="material-empty">読み込みに失敗しました</div>';
      });
  }

  function renderMaterialList() {
    materialList.innerHTML = loadedMaterials.map(function (m) {
      var meta = [];
      if (m.training_date) meta.push(m.training_date);
      if (m.training_hours) meta.push(m.training_hours + "時間");
      if (m.training_format) meta.push(m.training_format);
      var metaStr = meta.join(" / ");

      var sel = (selectedMaterial && selectedMaterial.id === m.id) ? "selected" : "";
      var reported = reportedMaterialIds[m.id] ? "reported" : "";
      var badge = reportedMaterialIds[m.id]
        ? '<div class="material-item__badge">✅ 報告済み</div>'
        : "";
      var summaryStr = m.material_summary ? escapeHtml(m.material_summary) : "";
      return (
        '<div class="material-item ' + sel + ' ' + reported + '" data-id="' + m.id + '">' +
          badge +
          '<div class="material-item__name">' + escapeHtml(m.training_name) + '</div>' +
          (metaStr ? '<div class="material-item__meta">' + escapeHtml(metaStr) + '</div>' : '') +
          (summaryStr ? '<div class="material-item__summary">' + summaryStr + '</div>' : '') +
        '</div>'
      );
    }).join("");

    materialList.querySelectorAll(".material-item").forEach(function (el) {
      el.addEventListener("click", function () {
        var id = el.getAttribute("data-id");
        selectMaterial(id);
      });
    });
  }

  function selectMaterial(id) {
    var m = loadedMaterials.find(function (x) { return x.id === id; });
    if (!m) return;
    selectedMaterial = m;
    checkedAnswers = {};
    renderMaterialList();
    renderReportSection();
    reportCard.style.display = "block";
    // 資料本文を取得（資料ビューに反映）
    loadMaterialDetail(id);
    // スクロール
    setTimeout(function () {
      reportCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  // 資料本文を非同期取得して開閉式で表示
  function loadMaterialDetail(id) {
    materialViewer.style.display = "none";
    materialViewer.classList.remove("open");
    materialViewerBody.innerHTML = '<div class="material-viewer__empty">読み込み中…</div>';

    fetch(API_BASE + "/training-materials/" + encodeURIComponent(id))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var mat = data && data.material;
        var content = mat && mat.material_content;
        if (!content || !content.trim()) {
          // 本文が無い場合はビューアを隠す
          materialViewer.style.display = "none";
          return;
        }
        materialViewer.style.display = "block";
        materialViewerBody.innerHTML = renderContentWithLinks(content);
      })
      .catch(function () {
        materialViewer.style.display = "none";
      });
  }

  // 本文内のURLをクリック可能なリンクにする
  function renderContentWithLinks(text) {
    var escaped = escapeHtml(text);
    // http(s) URL を自動リンク化
    return escaped.replace(
      /(https?:\/\/[\w\-\.\/?&=%#+~:;,@!$'()*]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  }

  function renderReportSection() {
    if (!selectedMaterial) return;

    var meta = [];
    if (selectedMaterial.training_date) meta.push(selectedMaterial.training_date);
    if (selectedMaterial.training_hours) meta.push(selectedMaterial.training_hours + "時間");
    if (selectedMaterial.training_format) meta.push(selectedMaterial.training_format);

    selectedInfo.innerHTML =
      '<strong>選択中:</strong> ' + escapeHtml(selectedMaterial.training_name) +
      (meta.length > 0 ? '<br><span style="color:var(--muted);">' + escapeHtml(meta.join(" / ")) + '</span>' : '');

    var items = selectedMaterial.checklist_items || [];
    checklist.innerHTML = items.map(function (it) {
      return (
        '<label class="check-item" data-id="' + it.id + '">' +
          '<input type="checkbox" data-id="' + it.id + '" />' +
          '<span class="check-text">' + escapeHtml(it.text) + '</span>' +
        '</label>'
      );
    }).join("");

    checklist.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = parseInt(cb.getAttribute("data-id"), 10);
        checkedAnswers[id] = cb.checked;
        var parent = cb.closest(".check-item");
        if (parent) {
          if (cb.checked) parent.classList.add("checked");
          else parent.classList.remove("checked");
        }
        updateSubmitState();
      });
    });

    extra1.value = "";
    extra2.value = "";
    extra3.value = "";
    [extra1, extra2, extra3].forEach(function (el) {
      el.addEventListener("input", updateSubmitState);
    });

    updateSubmitState();
  }

  function updateSubmitState() {
    if (!verifiedHelper || !selectedMaterial) {
      submitBtn.disabled = true;
      return;
    }
    // 1個以上チェックされていればOK（感想は任意でも、チェックゼロは違和感あるので必須）
    var anyChecked = Object.keys(checkedAnswers).some(function (k) { return checkedAnswers[k]; });
    submitBtn.disabled = !anyChecked;
  }

  // ---- 送信 ----
  submitBtn.addEventListener("click", function () {
    // 多重ガード:
    //  ① isSubmitting フラグで関数再入を阻止
    //  ② submitBtn.disabled で UI からのクリックも阻止
    if (isSubmitting) return;
    if (!verifiedHelper || !selectedMaterial) return;

    var answers = (selectedMaterial.checklist_items || []).map(function (it) {
      return { id: it.id, checked: !!checkedAnswers[it.id] };
    });

    var extras = [extra1.value.trim(), extra2.value.trim(), extra3.value.trim()]
      .filter(function (s) { return s.length > 0; });

    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "送信中…";
    sendingOverlay.classList.add("active");
    resultMessage.style.display = "none";
    if (fallbackArea) fallbackArea.classList.remove("show");

    fetch(API_BASE + "/training-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        helperEmail: verifiedHelper.email,
        helperName: verifiedHelper.name,
        trainingMaterialId: selectedMaterial.id,
        checklistAnswers: answers,
        extraComments: extras,
      }),
    })
      .then(function (res) { return res.json().then(function (d) { return { status: res.status, data: d }; }); })
      .then(function (r) {
        sendingOverlay.classList.remove("active");
        submitBtn.textContent = "研修報告を送信";
        if (r.status === 200 && r.data && r.data.success) {
          showResult(
            "success",
            (r.data.message || "研修報告を送信しました。ありがとうございます！") +
              "\nお疲れさまでした。"
          );
          // 「報告済み」マーク登録（clearReportForm で selectedMaterial が null になる前にキャプチャ）
          if (selectedMaterial && selectedMaterial.id) {
            reportedMaterialIds[selectedMaterial.id] = true;
          }
          clearReportForm();
          renderMaterialList();
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          showResult("error", (r.data && r.data.error) || "送信に失敗しました");
          isSubmitting = false;
          updateSubmitState();
        }
      })
      .catch(function () {
        sendingOverlay.classList.remove("active");
        submitBtn.textContent = "研修報告を送信";
        showResult("error", "通信エラーが発生しました。しばらくしてからもう一度お試しください。");
        isSubmitting = false;
        updateSubmitState();
      });
  });

  // 送信成功後にフォームを完全にクリア
  function clearReportForm() {
    checkedAnswers = {};
    selectedMaterial = null;
    // チェックボックスとテキスト欄を明示的にクリア（再選択時の残留を防ぐ）
    if (checklist) checklist.innerHTML = "";
    if (extra1) extra1.value = "";
    if (extra2) extra2.value = "";
    if (extra3) extra3.value = "";
    reportCard.style.display = "none";
    // 送信完了後は再送信できない状態に
    isSubmitting = false;
    submitBtn.disabled = true;
  }

  function showResult(type, text) {
    resultMessage.className = "result-message " + type;
    resultMessage.textContent = text;
    resultMessage.style.display = "block";
    // 送信失敗時のみ「声のポストに切替」案内を表示。成功時は隠す。
    if (fallbackArea) {
      if (type === "error") {
        fallbackArea.classList.add("show");
      } else {
        fallbackArea.classList.remove("show");
      }
    }
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
