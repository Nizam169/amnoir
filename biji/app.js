/**
 * AMNOIR 3D — Main Web Application Logic
 */

import { fetchPreset } from "./amfinder.js";

// DOM Selector Helper
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// Form Elements
const form = $("#form");
const urlInput = $("#url");
const submitBtn = $("#submit");
const pasteBtn = $("#btn-paste");
const clearBtn = $("#btn-clear");
const historyContainer = $("#history-container");
const historyChips = $("#history-chips");
const clearHistoryBtn = $("#btn-clear-history");

// Progress & Terminal Elements
const progressCard = $("#progress-card");
const progressTrack = $("#progress-track");
const progressLabel = $("#progress-label");
const logList = $("#log-list");

// Result Sections
const errorCard = $("#error-card");
const errorMsg = $("#error-msg");
const emptyCard = $("#empty-card");
const resultSection = $("#result-section");

// Video Details Elements
const videoMediaContainer = $("#video-media-container");
const authorAvatarWrap = $("#author-avatar-wrap");
const authorNickname = $("#author-nickname");
const authorUid = $("#author-uid");
const authorBioWrap = $("#author-bio-wrap");
const authorBio = $("#author-bio");
const tiktokDirectLink = $("#tiktok-direct-link");
const videoCaptionWrap = $("#video-caption-wrap");
const videoCaption = $("#video-caption");
const statViews = $("#stat-views");
const statLikes = $("#stat-likes");
const statComments = $("#stat-comments");
const statShares = $("#stat-shares");

// Presets & Filters
const totalPresetCount = $("#total-preset-count");
const filterTabs = $("#filter-tabs");
const countAll = $("#count-all");
const count5mb = $("#count-5mb");
const countXml = $("#count-xml");
const presetsGrid = $("#presets-grid");

// QR Modal & WA Modal Elements
const qrModal = $("#qr-modal");
const qrModalClose = $("#qr-modal-close");
const qrPresetTitle = $("#qr-preset-title");
const qrPresetType = $("#qr-preset-type");
const qrCodeTarget = $("#qr-code-target");
const qrUrlInput = $("#qr-url-input");
const qrCopyBtn = $("#qr-copy-btn");
const toastContainer = $("#toast-container");

const waModal = $("#wa-modal");
const waModalClose = $("#wa-modal-close");
const waModalLater = $("#wa-modal-later");
const waModalDontShow = $("#wa-modal-dont-show");
const btnOpenWaModal = $("#btn-open-wa-modal");
const floatingWaBtn = $("#floating-wa-btn");

const WA_DISMISS_KEY = "amnoir:wa_popup_disabled";

// Application State
let allPresets = [];
let activeFilter = "all";
const HISTORY_KEY = "amnoir3d:search_history";

/**
 * Escapes HTML characters for safe rendering
 */
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Formats big numbers (e.g. 1.2M, 45.6K)
 */
function fmtNum(n) {
  if (typeof n !== "number" || !isFinite(n)) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

/**
 * Shows a 3D Neobrutalist Toast Notification
 */
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `neo-toast toast-${type}`;
  toast.innerHTML = `<span>${type === "success" ? "✅" : "⚠️"}</span> <span>${esc(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "all 0.25s ease";
    toast.style.transform = "translateY(20px)";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 250);
  }, 2200);
}

/**
 * Reset all UI views to clean state
 */
function resetUI() {
  errorCard.classList.add("hidden");
  emptyCard.classList.add("hidden");
  resultSection.classList.add("hidden");
  progressCard.classList.add("hidden");
  
  logList.innerHTML = "";
  presetsGrid.innerHTML = "";
  videoMediaContainer.innerHTML = "";
  
  progressTrack.style.width = "0%";
  progressLabel.textContent = "Menghubungkan...";
  
  // Reset step blocks
  for (let i = 1; i <= 5; i++) {
    const el = $(`#step-${i}`);
    if (el) {
      el.classList.remove("is-active", "is-done");
    }
  }
}

/**
 * Highlights a step block and updates the progress track
 */
function updateStep(stepNum, totalSteps = 5) {
  const pct = Math.min(100, Math.round((stepNum / totalSteps) * 100));
  progressTrack.style.width = `${pct}%`;
  progressLabel.textContent = `Langkah ${stepNum}/${totalSteps} (${pct}%)`;

  for (let i = 1; i <= totalSteps; i++) {
    const el = $(`#step-${i}`);
    if (!el) continue;
    if (i < stepNum) {
      el.classList.remove("is-active");
      el.classList.add("is-done");
    } else if (i === stepNum) {
      el.classList.add("is-active");
      el.classList.remove("is-done");
    } else {
      el.classList.remove("is-active", "is-done");
    }
  }
}

/**
 * Appends an incoming log line to the live terminal
 */
function addTerminalLog(msg) {
  progressCard.classList.remove("hidden");
  const li = document.createElement("li");
  
  // Check if log contains step marker e.g. [1/5]
  const match = msg.match(/^\[(\d+)\/(\d+)\]/);
  if (match) {
    li.className = "step-log";
    li.innerHTML = `⚡ <b>${esc(msg)}</b>`;
    const cur = parseInt(match[1], 10);
    const tot = parseInt(match[2], 10);
    updateStep(cur, tot);
  } else {
    li.textContent = `> ${msg}`;
  }

  logList.appendChild(li);
  logList.scrollTop = logList.scrollHeight;
}

/**
 * Search History in LocalStorage
 */
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(url) {
  if (!url) return;
  let list = loadHistory().filter((item) => item !== url);
  list.unshift(url);
  list = list.slice(0, 8); // keep max 8
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {}
  renderHistory();
}

function renderHistory() {
  const history = loadHistory();
  if (!history.length) {
    historyContainer.classList.add("hidden");
    return;
  }

  historyContainer.classList.remove("hidden");
  historyChips.innerHTML = "";

  history.forEach((url) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "neo-chip chip-history";
    chip.title = url;
    chip.textContent = url.replace(/^https?:\/\/(www\.)?/, "");
    chip.addEventListener("click", () => {
      urlInput.value = url;
      updateClearBtn();
      handleSearch(url);
    });
    historyChips.appendChild(chip);
  });
}

function clearAllHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showToast("Riwayat pencarian telah dibersihkan");
}

/**
 * QR Code Generator & Modal
 */
function openQrModal(preset) {
  qrPresetTitle.textContent = preset.title || "Alight Motion Preset";
  qrPresetType.textContent = (preset.type || "PRESET").toUpperCase();
  qrPresetType.className = `badge-type-pill badge-${preset.type || "5mb"}`;
  qrUrlInput.value = preset.url;
  qrCodeTarget.innerHTML = "";

  try {
    // Generate QR Code with qrcode-generator
    if (typeof window.qrcode === "function") {
      const qr = window.qrcode(0, "M");
      qr.addData(preset.url);
      qr.make();
      qrCodeTarget.innerHTML = qr.createSvgTag({
        scalable: true,
        cellSize: 6,
        margin: 2,
      });
    } else {
      // Fallback to QR API image
      const img = document.createElement("img");
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(preset.url)}`;
      img.alt = "QR Code";
      qrCodeTarget.appendChild(img);
    }
  } catch (err) {
    qrCodeTarget.innerHTML = `<p class="muted">Gagal membuat QR: ${esc(err.message)}</p>`;
  }

  qrModal.classList.remove("hidden");
}

function closeQrModal() {
  qrModal.classList.add("hidden");
}

/**
 * WhatsApp Channel Modal Functions
 */
function openWaModal(force = false) {
  if (!force && localStorage.getItem(WA_DISMISS_KEY) === "true") {
    return;
  }
  if (waModal) {
    if (waModalDontShow) {
      waModalDontShow.checked = localStorage.getItem(WA_DISMISS_KEY) === "true";
    }
    waModal.classList.remove("hidden");
  }
}

function closeWaModal() {
  if (waModalDontShow && waModalDontShow.checked) {
    localStorage.setItem(WA_DISMISS_KEY, "true");
  } else {
    localStorage.removeItem(WA_DISMISS_KEY);
  }
  if (waModal) {
    waModal.classList.add("hidden");
  }
}

/**
 * Video Details Renderer
 */
function renderVideoDetails(result) {
  const v = result.video || {};
  const a = result.authorDetail || {};
  const directUrl = result.videoUrl || v.url || `https://www.tiktok.com/@${result.author || ""}`;

  // Video or Cover preview
  const playUrl = v.playUrlNoWm || v.playUrl;
  if (playUrl) {
    videoMediaContainer.innerHTML = `
      <video
        src="${esc(playUrl)}"
        poster="${esc(v.cover || "")}"
        controls
        loop
        playsinline
        preload="metadata"
        title="Preview Video TikTok"
      ></video>
    `;
  } else if (v.cover) {
    videoMediaContainer.innerHTML = `
      <img src="${esc(v.cover)}" alt="Video Cover" loading="lazy" />
    `;
  } else {
    videoMediaContainer.innerHTML = `
      <div class="preset-thumb-fallback">🎬 <span>NO PREVIEW</span></div>
    `;
  }

  // Author details
  if (a.avatar) {
    authorAvatarWrap.innerHTML = `<img src="${esc(a.avatar)}" alt="Avatar" class="avatar-img" loading="lazy" />`;
  } else {
    const initial = (a.nickname || result.author || "A").charAt(0).toUpperCase();
    authorAvatarWrap.innerHTML = `<div class="avatar-initial">${esc(initial)}</div>`;
  }

  authorNickname.textContent = a.nickname || result.author || "TikTok Creator";
  authorUid.textContent = a.uniqueId ? `@${a.uniqueId}` : (result.author || "@creator");
  tiktokDirectLink.href = directUrl;

  // Author Bio
  if (a.bio && a.bio.trim()) {
    authorBio.textContent = a.bio.trim();
    if (authorBioWrap) authorBioWrap.classList.remove("hidden");
  } else {
    if (authorBioWrap) authorBioWrap.classList.add("hidden");
  }

  // Video Caption
  if (v.description && v.description.trim()) {
    videoCaption.textContent = v.description.trim();
    videoCaptionWrap.classList.remove("hidden");
  } else {
    videoCaptionWrap.classList.add("hidden");
  }

  // Stats Counters
  const stats = v.stats || {};
  statViews.textContent = fmtNum(stats.views);
  statLikes.textContent = fmtNum(stats.likes);
  statComments.textContent = fmtNum(stats.comments);
  statShares.textContent = fmtNum(stats.shares);
}

/**
 * Preset Cards Grid Renderer
 */
function renderPresetCards(links) {
  presetsGrid.innerHTML = "";

  if (!links.length) {
    presetsGrid.innerHTML = `
      <div class="neo-card empty-card" style="grid-column: 1 / -1; padding: 24px;">
        <p><b>Tidak ada preset untuk kategori ini.</b></p>
      </div>
    `;
    return;
  }

  links.forEach((p, idx) => {
    const type = (p.type || "5mb").toLowerCase();
    const is5mb = type === "5mb";
    const typeLabel = is5mb ? "⚡ 5MB" : "📄 XML";
    const badgeClass = is5mb ? "badge-5mb" : "badge-xml";
    const thumb = p.thumb || (Array.isArray(p.thumbs) && p.thumbs[0]) || "";

    const card = document.createElement("article");
    card.className = "preset-card-3d";
    card.innerHTML = `
      <div class="preset-thumb-holder">
        ${thumb ? `<img src="${esc(thumb)}" alt="${esc(p.title || "Preset")}" class="preset-thumb-img" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'preset-thumb-fallback\\'>⚡ <span>PRESET</span></div>'" />` : `<div class="preset-thumb-fallback">⚡ <span>${esc(type.toUpperCase())}</span></div>`}
        <div class="preset-badges-top">
          <span class="badge-type-pill ${badgeClass}">${typeLabel}</span>
          ${p.pinned ? `<span class="badge-type-pill badge-pinned">📌 PINNED</span>` : ""}
          ${p.verified ? `<span class="badge-type-pill badge-creator-tag">✓ VERIFIED</span>` : ""}
        </div>
      </div>

      <div class="preset-card-body">
        <h3 class="preset-card-title" title="${esc(p.title || "Alight Motion Preset")}">${esc(p.title || (is5mb ? "5MB Alight Motion Preset" : "XML Project File"))}</h3>
        
        <div class="preset-source-info">
          <div class="preset-source-row">
            <span>📍 Sumber:</span>
            <b>${esc(p.source === "comment" ? "Komentar Video" : p.source === "bioLink" ? "Bio Link Akun" : p.source === "description" ? "Deskripsi" : p.source || "TikTok")}</b>
          </div>
          ${p.detail ? `<div class="preset-source-row"><span>👤 Info:</span> <b>${esc(p.detail)}</b></div>` : ""}
        </div>

        <div class="preset-card-actions">
          <a class="neo-btn btn-open-preset" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
            🚀 BUKA PRESET
          </a>
          <div class="preset-sub-actions">
            <button type="button" class="neo-btn btn-copy-preset" data-copy="${esc(p.url)}">
              📋 Salin Link
            </button>
            <button type="button" class="neo-btn btn-qr-preset" data-qr-idx="${idx}">
              📱 QR Code
            </button>
          </div>
        </div>
      </div>
    `;

    presetsGrid.appendChild(card);
  });
}

/**
 * Filter Presets
 */
function applyFilter(filter) {
  activeFilter = filter;
  $$(".filter-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.filter === filter);
  });

  if (filter === "all") {
    renderPresetCards(allPresets);
  } else {
    renderPresetCards(allPresets.filter((p) => (p.type || "").toLowerCase() === filter));
  }
}

/**
 * Render Complete Search Result
 */
function renderResult(res) {
  if (!res.ok) {
    showError(res.error || "Gagal mengambil data dari server");
    return;
  }

  allPresets = Array.isArray(res.presetLinks) ? res.presetLinks : [];

  // Update step status to completed
  for (let i = 1; i <= 5; i++) {
    const el = $(`#step-${i}`);
    if (el) el.classList.add("is-done");
  }
  progressTrack.style.width = "100%";
  progressLabel.textContent = "Selesai (100%)";

  // Check if no presets were found
  if (!allPresets.length) {
    emptyCard.classList.remove("hidden");
    emptyCard.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  // Count items by type
  let count5 = 0;
  let countX = 0;
  allPresets.forEach((p) => {
    const t = (p.type || "").toLowerCase();
    if (t === "5mb") count5++;
    else if (t === "xml") countX++;
  });

  countAll.textContent = allPresets.length;
  count5mb.textContent = count5;
  countXml.textContent = countX;
  totalPresetCount.textContent = `${allPresets.length} PRESET DITEMUKAN`;

  renderVideoDetails(res);
  applyFilter("all");

  resultSection.classList.remove("hidden");
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast(`Berhasil menemukan ${allPresets.length} preset!`);

  // Auto trigger WhatsApp channel popup after 1.8s if not dismissed in session
  if (!sessionStorage.getItem("amnoir:wa_popup_shown")) {
    setTimeout(() => {
      openWaModal();
      sessionStorage.setItem("amnoir:wa_popup_shown", "true");
    }, 1800);
  }
}

/**
 * Show error card
 */
function showError(msg) {
  resetUI();
  errorMsg.textContent = msg;
  errorCard.classList.remove("hidden");
  errorCard.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast("Pencarian gagal", "error");
}

/**
 * Handle Search Execution
 */
async function handleSearch(targetUrl) {
  const url = (targetUrl || urlInput.value || "").trim();
  if (!url) {
    urlInput.focus();
    return;
  }

  // Basic TikTok validation
  if (!(/tiktok\.com/i.test(url) || /^\d{15,}$/.test(url))) {
    showError("Link harus merupakan URL video TikTok yang valid (contoh: https://vt.tiktok.com/xxx atau https://www.tiktok.com/@user/video/...)");
    return;
  }

  resetUI();
  progressCard.classList.remove("hidden");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>⏳</span> <span>MEMINDAI PRESET...</span>`;
  urlInput.disabled = true;

  try {
    saveHistory(url);
    const result = await fetchPreset(url, (log) => {
      addTerminalLog(log);
    });
    renderResult(result);
  } catch (err) {
    showError(err.message || "Terjadi kesalahan saat memproses permintaan.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span class="btn-icon">⚡</span> <span class="btn-label">CARI PRESET SEKARANG</span>`;
    urlInput.disabled = false;
  }
}

/**
 * Update Clear Button Visibility
 */
function updateClearBtn() {
  if (urlInput.value.trim().length > 0) {
    clearBtn.classList.remove("hidden");
  } else {
    clearBtn.classList.add("hidden");
  }
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================

// Form Submission
form.addEventListener("submit", (e) => {
  e.preventDefault();
  handleSearch();
});

// Input clear & typing
urlInput.addEventListener("input", updateClearBtn);

clearBtn.addEventListener("click", () => {
  urlInput.value = "";
  updateClearBtn();
  urlInput.focus();
});

// Clipboard Paste Button
pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInput.value = text.trim();
      updateClearBtn();
      showToast("Tautan ditempel dari clipboard!");
    }
  } catch {
    urlInput.focus();
    showToast("Gunakan Ctrl+V / Tempel manual", "error");
  }
});

// Clear History Button
clearHistoryBtn.addEventListener("click", clearAllHistory);

// Filter Tab Click Events
filterTabs.addEventListener("click", (e) => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  applyFilter(chip.dataset.filter);
});

// Preset Grid Delegated Actions (Copy Link & QR Code)
presetsGrid.addEventListener("click", async (e) => {
  // Copy Link button
  const copyBtn = e.target.closest("[data-copy]");
  if (copyBtn) {
    const link = copyBtn.dataset.copy;
    try {
      await navigator.clipboard.writeText(link);
      const original = copyBtn.innerHTML;
      copyBtn.innerHTML = `✅ Tersalin!`;
      showToast("Link preset berhasil disalin!");
      setTimeout(() => {
        copyBtn.innerHTML = original;
      }, 1500);
    } catch {
      showToast("Gagal menyalin link", "error");
    }
    return;
  }

  // QR Code button
  const qrBtn = e.target.closest("[data-qr-idx]");
  if (qrBtn) {
    const idx = parseInt(qrBtn.dataset.qrIdx, 10);
    const preset = activeFilter === "all"
      ? allPresets[idx]
      : allPresets.filter((p) => (p.type || "").toLowerCase() === activeFilter)[idx];
    if (preset) {
      openQrModal(preset);
    }
  }
});

// QR Modal Copy button
qrCopyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(qrUrlInput.value);
    qrCopyBtn.textContent = "✅ Tersalin!";
    showToast("Link preset berhasil disalin!");
    setTimeout(() => {
      qrCopyBtn.textContent = "📋 Salin";
    }, 1400);
  } catch {
    showToast("Gagal menyalin", "error");
  }
});

// QR Modal Close Actions
qrModalClose.addEventListener("click", closeQrModal);
qrModal.addEventListener("click", (e) => {
  if (e.target === qrModal) closeQrModal();
});

// WhatsApp Modal Actions
if (btnOpenWaModal) {
  btnOpenWaModal.addEventListener("click", () => openWaModal(true));
}
if (waModalClose) {
  waModalClose.addEventListener("click", closeWaModal);
}
if (waModalLater) {
  waModalLater.addEventListener("click", closeWaModal);
}
if (waModal) {
  waModal.addEventListener("click", (e) => {
    if (e.target === waModal) closeWaModal();
  });
}
if (waModalDontShow) {
  waModalDontShow.addEventListener("change", (e) => {
    if (e.target.checked) {
      localStorage.setItem(WA_DISMISS_KEY, "true");
      showToast("Popup otomatis dinonaktifkan");
    } else {
      localStorage.removeItem(WA_DISMISS_KEY);
      showToast("Popup otomatis diaktifkan kembali");
    }
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (qrModal && !qrModal.classList.contains("hidden")) closeQrModal();
    if (waModal && !waModal.classList.contains("hidden")) closeWaModal();
  }
});

// Initialize on Load
document.addEventListener("DOMContentLoaded", () => {
  renderHistory();
  updateClearBtn();

  // Show WA Channel popup on first page visit after 3.5s
  if (!localStorage.getItem("amnoir:wa_visit_seen")) {
    setTimeout(() => {
      openWaModal();
      localStorage.setItem("amnoir:wa_visit_seen", "true");
    }, 3500);
  }
});
