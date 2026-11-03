/**
 * AMNOIR NEON — Main Web Application Logic
 * Supports dual modes: Direct Link Resolver & Song / DJ Keyword Finder
 */

import { fetchPreset } from "./amfinder.js";

// DOM Selector Helper
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// Mode Tabs Elements
const tabModeUrl = $("#tab-mode-url");
const tabModeSearch = $("#tab-mode-search");
const panelUrl = $("#panel-url");
const panelSearch = $("#panel-search");

// Form Elements (URL Mode)
const form = $("#form");
const urlInput = $("#url");
const submitBtn = $("#submit");
const pasteBtn = $("#btn-paste");
const clearBtn = $("#btn-clear");
const historyContainer = $("#history-container");
const historyChips = $("#history-chips");
const clearHistoryBtn = $("#btn-clear-history");

// Form Elements (Song / DJ Search Mode)
const searchQueryForm = $("#search-query-form");
const searchQueryInput = $("#search-query-input");
const btnClearQuery = $("#btn-clear-query");
const suggestionsBox = $("#suggestions-box");
const btnSubmitSearch = $("#btn-submit-search");
const btnSearchLabel = $("#btn-search-label");
const searchResultsSection = $("#search-results-section");
const searchResultsCount = $("#search-results-count");
const searchResultsList = $("#search-results-list");
const searchNavBar = $("#search-nav-bar");
const btnBackToSearch = $("#btn-back-to-search");
const platToggleBtns = $$(".plat-toggle-btn");

// Progress & Terminal Elements
const progressCard = $("#progress-card");
const progressTrack = $("#progress-track");
const progressLabel = $("#progress-label");
const stepsTrackLine = $("#steps-track-line");
const logList = $("#log-list");

// Result Sections
const errorCard = $("#error-card");
const errorMsg = $("#error-msg");
const emptyCard = $("#empty-card");
const resultSection = $("#result-section");
const landingShowcase = $("#landing-showcase");

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
const musicBoxContainer = $("#music-box-container");
const statViews = $("#stat-views");
const statLikes = $("#stat-likes");
const statComments = $("#stat-comments");
const statShares = $("#stat-shares");

// Presets & Filters
const totalPresetCount = $("#total-preset-count");
const filterHeaderRow = $("#filter-header-row");
const filterTabs = $("#filter-tabs");
const countAll = $("#count-all");
const count5mb = $("#count-5mb");
const countXml = $("#count-xml");
const presetsGrid = $("#presets-grid");

// Toast & WA Modal Elements
const toastContainer = $("#toast-container");

const waModal = $("#wa-modal");
const waModalClose = $("#wa-modal-close");
const waModalLater = $("#wa-modal-later");
const waModalDontShow = $("#wa-modal-dont-show");
const btnOpenWaModal = $("#btn-open-wa-modal");
const floatingWaBtn = $("#floating-wa-btn");

const WA_DISMISS_KEY = "amnoir:wa_popup_disabled";
const HISTORY_KEY = "amnoir3d:search_history";

// Application State
let activeMode = "url"; // "url" | "search"
let selectedPlatform = "tiktok"; // "tiktok" | "youtube"
let allPresets = [];
let activeFilter = "all";
let searchItems = [];
let suggestAbortCtrl = null;
let suggestTimeout = null;

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
 * Formats big numbers (e.g. 1.2M, 45.6K or Indonesian 1.2 jt / 45.6 rb)
 */
function fmtNum(n) {
  if (typeof n !== "number" || !isFinite(n)) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

/**
 * Shows a Cyber Neon Toast Notification
 */
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `neo-toast toast-${type}`;
  const iconSvg = type === "error"
    ? `<svg class="toast-svg-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg class="toast-svg-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  toast.innerHTML = `${iconSvg}<span>${esc(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)";
    toast.style.transform = "translateY(16px)";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 250);
  }, 2400);
}

/**
 * Mode Switcher
 */
function switchMode(mode) {
  activeMode = mode;
  if (mode === "url") {
    tabModeUrl.classList.add("active");
    tabModeUrl.setAttribute("aria-selected", "true");
    tabModeSearch.classList.remove("active");
    tabModeSearch.setAttribute("aria-selected", "false");
    panelUrl.classList.remove("hidden");
    panelSearch.classList.add("hidden");
    urlInput.focus();
  } else {
    tabModeSearch.classList.add("active");
    tabModeSearch.setAttribute("aria-selected", "true");
    tabModeUrl.classList.remove("active");
    tabModeUrl.setAttribute("aria-selected", "false");
    panelSearch.classList.remove("hidden");
    panelUrl.classList.add("hidden");
    searchQueryInput.focus();
  }
}

/**
 * Reset all UI views to clean state
 */
function resetUI() {
  errorCard.classList.add("hidden");
  emptyCard.classList.add("hidden");
  resultSection.classList.add("hidden");
  progressCard.classList.add("hidden");
  if (landingShowcase) landingShowcase.classList.remove("hidden");

  logList.innerHTML = "";
  presetsGrid.innerHTML = "";
  videoMediaContainer.innerHTML = "";
  if (musicBoxContainer) musicBoxContainer.innerHTML = "";

  progressTrack.style.width = "0%";
  progressLabel.textContent = "Menghubungkan...";

  if (stepsTrackLine) stepsTrackLine.style.setProperty("--track-pct", "0%");

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

  if (stepsTrackLine) {
    const linePct = Math.max(0, Math.min(100, Math.round(((stepNum - 1) / (totalSteps - 1)) * 100)));
    stepsTrackLine.style.setProperty("--track-pct", `${linePct}%`);
  }

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
    li.innerHTML = `<b>${esc(msg)}</b>`;
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
 * Autocomplete Suggestions Logic
 */
function hideSuggestions() {
  if (suggestAbortCtrl) suggestAbortCtrl.abort();
  clearTimeout(suggestTimeout);
  suggestionsBox.classList.add("hidden");
  suggestionsBox.innerHTML = "";
}

async function fetchSuggestions(query) {
  if (!query.trim()) return hideSuggestions();
  if (suggestAbortCtrl) suggestAbortCtrl.abort();
  suggestAbortCtrl = new AbortController();

  try {
    const res = await fetch(`/api/suggest?q=${encodeURIComponent(query.trim())}&p=${selectedPlatform}`, {
      signal: suggestAbortCtrl.signal,
    });
    const data = await res.json().catch(() => ({ list: [] }));
    if (searchQueryInput.value.trim() !== query.trim()) return;

    const list = Array.isArray(data.list) ? data.list : [];
    if (!list.length) return hideSuggestions();

    suggestionsBox.innerHTML = list
      .map(
        (item) => `
        <button type="button" class="suggestion-item" data-val="${esc(item)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
          <span>${esc(item)}</span>
        </button>
      `
      )
      .join("");
    suggestionsBox.classList.remove("hidden");
  } catch {}
}

/**
 * Song / DJ Search Execution
 */
async function executeSongSearch(query) {
  const q = (query || searchQueryInput.value || "").trim();
  if (!q) {
    searchQueryInput.focus();
    return;
  }

  hideSuggestions();
  btnSubmitSearch.disabled = true;
  btnSearchLabel.textContent = "Memindai...";

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&p=${selectedPlatform}`);
    const data = await res.json().catch(() => ({}));
    if (!data.ok || !Array.isArray(data.items)) {
      throw new Error(data.error || "Gagal memuat hasil pencarian video.");
    }

    searchItems = data.items;
    renderSearchResults(searchItems, q);
    showToast(`${searchItems.length} video ditemukan untuk "${q}"!`);
  } catch (err) {
    showToast(err.message || "Gagal mencari video.", "error");
  } finally {
    btnSubmitSearch.disabled = false;
    btnSearchLabel.textContent = "Cari Preset";
  }
}

/**
 * Render Video Search Results (DJ list style)
 */
function renderSearchResults(items, query) {
  if (!items.length) {
    searchResultsSection.classList.remove("hidden");
    searchResultsCount.textContent = "0 Video Ditemukan";
    searchResultsList.innerHTML = `
      <div class="empty-search-state">
        <p>Tidak ada video preset yang ditemukan untuk kata kunci <b>"${esc(query)}"</b>.</p>
        <span class="dim-hint">Coba cari judul lagu atau nama DJ lainnya (misal: DJ Thai, DJ Haris Nugraha, Jedag Jedug).</span>
      </div>
    `;
    searchResultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  searchResultsCount.textContent = `${items.length} Video Ditemukan`;
  searchResultsList.innerHTML = items
    .map((item, idx) => {
      const thumb = item.thumb || "";
      const dur = item.duration || "";
      const title = item.title || item.music?.title || "Preset Alight Motion";
      const author = item.author ? `@${item.author}` : "TikTok Creator";
      const views = typeof item.views === "number" ? fmtNum(item.views) + " views" : item.views || "";

      return `
      <article class="search-video-item" data-idx="${idx}" tabindex="0" role="button" aria-label="Pilih video ${esc(title)}">
        <div class="search-video-thumb">
          ${thumb ? `<img src="${esc(thumb)}" alt="${esc(title)}" loading="lazy" />` : `<div class="thumb-ph"><span>AM</span></div>`}
          ${dur ? `<span class="duration-badge">${esc(dur)}</span>` : ""}
        </div>
        <div class="search-video-info">
          <h4 class="search-video-title" title="${esc(title)}">${esc(title)}</h4>
          <span class="search-video-author">${esc(author)}</span>
          <div class="search-video-meta">
            ${views ? `<span class="meta-views">${esc(views)}</span>` : ""}
            <span class="meta-dot">·</span>
            <span class="meta-platform">${esc(item.platform || selectedPlatform)}</span>
          </div>
        </div>
        <span class="search-video-action" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </span>
      </article>
    `;
    })
    .join("");

  searchResultsSection.classList.remove("hidden");
  searchResultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * WhatsApp Channel Modal Functions
 */
function openWaModal(force = false) {
  if (!force && localStorage.getItem(WA_DISMISS_KEY) === "true") return;
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
  if (waModal) waModal.classList.add("hidden");
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
      <div class="preset-thumb-fallback"><span>NO PREVIEW</span></div>
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
  authorUid.textContent = a.uniqueId ? `@${a.uniqueId}` : result.author || "@creator";
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

  // DJ Music Soundtrack Bar
  const m = v.music || null;
  if (m && m.title && musicBoxContainer) {
    musicBoxContainer.innerHTML = `
      <div class="dj-sound-bar neo-box">
        <div class="dj-sound-cover"${m.cover ? ` style="background-image:url('${esc(m.cover)}')"` : ""}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        <div class="dj-sound-info">
          <span class="dj-sound-tag">DJ SOUNDTRACK // AUDIO</span>
          <b class="dj-sound-title" title="${esc(m.title)}">${esc(m.title)}</b>
          <span class="dj-sound-author">${esc(m.author || "")}</span>
        </div>
        ${
          m.url
            ? `<a class="neo-btn btn-sound-open" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer" title="Buka tautan audio"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Putar Audio</span></a>`
            : ""
        }
      </div>
    `;
    musicBoxContainer.classList.remove("hidden");
  } else if (musicBoxContainer) {
    musicBoxContainer.classList.add("hidden");
  }

  // Stats Counters
  const stats = v.stats || {};
  statViews.textContent = fmtNum(stats.views);
  statLikes.textContent = fmtNum(stats.likes);
  statComments.textContent = fmtNum(stats.comments);
  statShares.textContent = fmtNum(stats.shares);
}

/**
 * Preset Cards Grid Renderer (DJ-inspired clean horizontal cards)
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
    const typeLabel = is5mb ? "5MB" : "XML";
    const badgeClass = is5mb ? "badge-5mb" : "badge-xml";
    const thumb = p.thumb || (Array.isArray(p.thumbs) && p.thumbs[0]) || "";

    const card = document.createElement("article");
    card.className = "preset-card-3d cyber-pre";
    card.innerHTML = `
      <div class="preset-thumb-holder">
        ${
          thumb
            ? `<img src="${esc(thumb)}" alt="${esc(p.title || "Preset")}" class="preset-thumb-img" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'preset-thumb-fallback\\'><span>${esc(type.toUpperCase())}</span></div>'" />`
            : `<div class="preset-thumb-fallback"><span>${esc(type.toUpperCase())}</span></div>`
        }
      </div>

      <div class="preset-card-body">
        <div class="preset-top-meta">
          <h3 class="preset-card-title" title="${esc(p.title || "Preset Alight Motion")}">${esc(p.title || (is5mb ? "5MB Alight Motion Preset" : "XML Project File"))}</h3>
          
          <div class="preset-badges-row">
            <span class="badge-type-pill ${badgeClass}">${typeLabel}</span>
            ${p.size ? `<span class="badge-type-pill badge-size">${esc(p.size)}</span>` : ""}
            ${p.verified ? `<span class="badge-type-pill badge-author"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Dari Pemilik Video</span>` : ""}
            ${p.pinned ? `<span class="badge-type-pill badge-pinned"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z"/></svg>Dipin</span>` : ""}
          </div>
        </div>

        <div class="preset-source-info">
          <span class="source-info-text">${p.detail ? esc(p.detail) + " · " : ""}${esc(p.source === "comment" ? "Dari komentar video" : p.source === "bioLink" ? "Dari link di bio" : p.source === "description" ? "Dari deskripsi" : "Dari " + (p.source || "TikTok"))}</span>
          <span class="preset-url-mono">${esc(p.url)}</span>
        </div>

        <div class="preset-card-actions">
          <a class="neo-btn btn-open-preset" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
            <span>${is5mb ? "BUKA PRESET" : "AMBIL FILE XML"}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          <div class="preset-sub-actions">
            <button type="button" class="neo-btn btn-copy-preset btn-action-icon" data-copy="${esc(p.url)}" title="Salin link preset" aria-label="Salin link preset">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
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
  if (stepsTrackLine) stepsTrackLine.style.setProperty("--track-pct", "100%");

  // Check if search originated from video search items
  if (searchItems.length && searchNavBar) {
    searchNavBar.classList.remove("hidden");
  } else if (searchNavBar) {
    searchNavBar.classList.add("hidden");
  }

  // Check if no presets were found
  if (!allPresets.length) {
    totalPresetCount.textContent = "0 PRESET DITEMUKAN";
    countAll.textContent = 0;
    count5mb.textContent = 0;
    countXml.textContent = 0;

    renderVideoDetails(res);
    filterHeaderRow.classList.add("hidden");
    presetsGrid.innerHTML = "";
    emptyCard.classList.remove("hidden");

    resultSection.classList.remove("hidden");
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Video ditemukan, tapi tidak ada preset di video ini");
    return;
  }

  // Presets found
  filterHeaderRow.classList.remove("hidden");
  emptyCard.classList.add("hidden");

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

  if (landingShowcase) landingShowcase.classList.add("hidden");
  resultSection.classList.remove("hidden");
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast(`Berhasil menemukan ${allPresets.length} preset!`);

  // Auto trigger WhatsApp channel popup after 2s if not dismissed in session
  if (!sessionStorage.getItem("amnoir:wa_popup_shown")) {
    setTimeout(() => {
      openWaModal();
      sessionStorage.setItem("amnoir:wa_popup_shown", "true");
    }, 2000);
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
 * Handle Search Execution by Video URL
 */
async function handleSearch(targetUrl) {
  const url = (targetUrl || urlInput.value || "").trim();
  if (!url) {
    urlInput.focus();
    return;
  }

  // Basic TikTok / video validation
  if (!(/tiktok\.com|youtube\.com|youtu\.be|instagram\.com/i.test(url) || /^\d{15,}$/.test(url))) {
    showError(
      "Link harus merupakan URL video TikTok / YouTube yang valid (contoh: https://vt.tiktok.com/xxx atau https://www.tiktok.com/@user/video/...)"
    );
    return;
  }

  resetUI();
  progressCard.classList.remove("hidden");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <svg class="spin-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
    <span class="btn-label">Memindai...</span>
  `;
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
    submitBtn.innerHTML = `
      <svg class="btn-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
      <span class="btn-label">Cari Preset</span>
    `;
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

function updateQueryClearBtn() {
  if (searchQueryInput.value.trim().length > 0) {
    btnClearQuery.classList.remove("hidden");
  } else {
    btnClearQuery.classList.add("hidden");
  }
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================

// Mode Tabs Switcher
tabModeUrl.addEventListener("click", () => switchMode("url"));
tabModeSearch.addEventListener("click", () => switchMode("search"));

// Platform selector buttons
platToggleBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    platToggleBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedPlatform = btn.dataset.platform;
    const q = searchQueryInput.value.trim();
    if (q) fetchSuggestions(q);
  });
});

// URL Form Submission
form.addEventListener("submit", (e) => {
  e.preventDefault();
  handleSearch();
});

urlInput.addEventListener("input", updateClearBtn);

clearBtn.addEventListener("click", () => {
  urlInput.value = "";
  updateClearBtn();
  urlInput.focus();
});

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

clearHistoryBtn.addEventListener("click", clearAllHistory);

// Song Search Form Submission
searchQueryForm.addEventListener("submit", (e) => {
  e.preventDefault();
  executeSongSearch();
});

searchQueryInput.addEventListener("input", () => {
  updateQueryClearBtn();
  clearTimeout(suggestTimeout);
  const q = searchQueryInput.value.trim();
  if (!q) return hideSuggestions();
  suggestTimeout = setTimeout(() => fetchSuggestions(q), 180);
});

searchQueryInput.addEventListener("focus", () => {
  const q = searchQueryInput.value.trim();
  if (q && suggestionsBox.classList.contains("hidden")) {
    fetchSuggestions(q);
  }
});

btnClearQuery.addEventListener("click", () => {
  searchQueryInput.value = "";
  updateQueryClearBtn();
  hideSuggestions();
  searchQueryInput.focus();
});

// Suggestion item click
suggestionsBox.addEventListener("click", (e) => {
  const item = e.target.closest(".suggestion-item");
  if (!item) return;
  const val = item.dataset.val;
  searchQueryInput.value = val;
  updateQueryClearBtn();
  hideSuggestions();
  executeSongSearch(val);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".relative-wrap") && !e.target.closest("#suggestions-box")) {
    hideSuggestions();
  }
});

// Click on search video result item
searchResultsList.addEventListener("click", (e) => {
  const item = e.target.closest(".search-video-item");
  if (!item) return;
  const idx = parseInt(item.dataset.idx, 10);
  const video = searchItems[idx];
  if (video && video.url) {
    handleSearch(video.url);
  }
});

// Back to search results button
if (btnBackToSearch) {
  btnBackToSearch.addEventListener("click", () => {
    resetUI();
    searchResultsSection.classList.remove("hidden");
    searchResultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// Filter Tab Click Events
filterTabs.addEventListener("click", (e) => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  applyFilter(chip.dataset.filter);
});

// Preset Grid Delegated Actions (Copy Link & QR Code)
presetsGrid.addEventListener("click", async (e) => {
  const copyBtn = e.target.closest("[data-copy]");
  if (copyBtn) {
    const link = copyBtn.dataset.copy;
    try {
      await navigator.clipboard.writeText(link);
      const original = copyBtn.innerHTML;
      copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      copyBtn.classList.add("btn-copied");
      showToast("Link preset berhasil disalin!");
      setTimeout(() => {
        copyBtn.innerHTML = original;
        copyBtn.classList.remove("btn-copied");
      }, 1500);
    } catch {
      showToast("Gagal menyalin link", "error");
    }
    return;
  }
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
    hideSuggestions();
    if (waModal && !waModal.classList.contains("hidden")) closeWaModal();
  }
});

// Initialize on Load
document.addEventListener("DOMContentLoaded", () => {
  renderHistory();
  updateClearBtn();
  updateQueryClearBtn();

  // Show WA Channel popup on first page visit after 3.5s
  if (!localStorage.getItem("amnoir:wa_visit_seen")) {
    setTimeout(() => {
      openWaModal();
      localStorage.setItem("amnoir:wa_visit_seen", "true");
    }, 3500);
  }
});
