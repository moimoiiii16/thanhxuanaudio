// ============================================================
// STATE
// ============================================================
let allPlaylists = [];
let currentPlaylist = null;
let currentPart = null; // part object currently loaded in the player
let isPlaying = false;
let searchQuery = ""; // NEW: chuỗi đang tìm kiếm trong ô search

// ============================================================
// AUTH STATE
// ============================================================
function getAuthToken() { return localStorage.getItem("authToken"); }
function getAuthUsername() { return localStorage.getItem("authUsername"); }
function getAuthDisplayName() { return localStorage.getItem("authDisplayName"); }

function saveAuthSession(token, username, displayName, role) {
  localStorage.setItem("authToken", token);
  localStorage.setItem("authUsername", username);
  localStorage.setItem("authDisplayName", displayName);
  localStorage.setItem("authRole", role);
}

function clearAuthSession() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("authUsername");
  localStorage.removeItem("authDisplayName");
  localStorage.removeItem("authRole");
}

function renderAuthBox() {
  const box = document.getElementById("auth-box");
  const token = getAuthToken();
  const displayName = getAuthDisplayName();

  if (token && displayName) {
    box.innerHTML = `
      <div class="auth-user-info">
        <span class="auth-user-name">👤 ${displayName}</span>
        <button class="auth-logout-btn" onclick="logout()">Đăng xuất</button>
      </div>
    `;
  } else {
    box.innerHTML = `
      <button class="auth-guest-btn" onclick="openAuthModal()">Đăng nhập / Đăng ký</button>
    `;
  }
}

function openAuthModal() {
  document.getElementById("auth-modal").style.display = "flex";
}
function closeAuthModal() {
  document.getElementById("auth-modal").style.display = "none";
}
function closeAuthModalOnOverlay(event) {
  if (event.target.id === "auth-modal") closeAuthModal();
}

function switchAuthTab(tab) {
  const isLogin = tab === "login";
  document.getElementById("tab-login").classList.toggle("active", isLogin);
  document.getElementById("tab-register").classList.toggle("active", !isLogin);
  document.getElementById("login-form").style.display = isLogin ? "flex" : "none";
  document.getElementById("register-form").style.display = isLogin ? "none" : "flex";
}

async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || "Đăng nhập thất bại";
      return;
    }
    saveAuthSession(data.token, data.username, data.displayName, data.role);
    closeAuthModal();
    renderAuthBox();
  } catch (err) {
    errorEl.textContent = "Lỗi kết nối máy chủ";
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const username = document.getElementById("register-username").value.trim();
  const displayName = document.getElementById("register-displayname").value.trim();
  const password = document.getElementById("register-password").value;
  const passwordConfirm = document.getElementById("register-password-confirm").value;
  const errorEl = document.getElementById("register-error");
  errorEl.textContent = "";

  if (password !== passwordConfirm) {
    errorEl.textContent = "Mật khẩu nhập lại không khớp";
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, displayName, password })
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || "Đăng ký thất bại";
      return;
    }
    saveAuthSession(data.token, data.username, data.displayName, data.role);
    closeAuthModal();
    renderAuthBox();
  } catch (err) {
    errorEl.textContent = "Lỗi kết nối máy chủ";
  }
}

function logout() {
  clearAuthSession();
  renderAuthBox();
}

window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.closeAuthModalOnOverlay = closeAuthModalOnOverlay;
window.switchAuthTab = switchAuthTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.logout = logout;

const qs = new URLSearchParams(location.search);
const tokenFromUrl = qs.get("token");
const videoFromUrl = qs.get("video");

// Nếu vừa quay về từ luồng vượt link (có token) -> lưu lại theo videoId
if (tokenFromUrl && videoFromUrl) {
  localStorage.setItem(`unlockToken:${videoFromUrl}`, tokenFromUrl);
  history.replaceState({}, "", `${location.pathname}`);
}

function getStoredToken(videoId) {
  return localStorage.getItem(`unlockToken:${videoId}`);
}

// ============================================================
// INIT
// ============================================================
async function init() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/playlists`);
    allPlaylists = await res.json();
    renderSidebar();
    renderAuthBox();
    
    if (allPlaylists.length === 0) return;

    // Nếu vừa quay lại từ unlock flow, videoFromUrl cho biết part nào cần mở
    let targetPlaylistId = qs.get("playlist") || allPlaylists[0].id;
    if (videoFromUrl) {
      // Tìm playlist chứa part này để chọn đúng playlist trong sidebar
      for (const p of allPlaylists) {
        const detail = await fetchPlaylistDetail(p.id);
        if (detail.parts.some(part => part.id === videoFromUrl)) {
          targetPlaylistId = p.id;
          break;
        }
      }
    }

    await selectPlaylist(targetPlaylistId, videoFromUrl || null);
  } catch (err) {
    document.getElementById("story-list").innerHTML =
      `<p class="error-text">Không thể kết nối máy chủ.<br>Kiểm tra backend đã chạy chưa.</p>`;
    document.getElementById("player-hero").innerHTML =
      `<p class="error-text">Không có dữ liệu.</p>`;
    console.error(err);
  }
}

// ============================================================
// SEARCH
// ============================================================
function handleSearchInput() {
  const input = document.getElementById("search-input");
  searchQuery = input.value.trim().toLowerCase();
  renderSidebar();
}

function getFilteredPlaylists() {
  if (!searchQuery) return allPlaylists;
  return allPlaylists.filter(p =>
    p.title.toLowerCase().includes(searchQuery)
  );
}

// ============================================================
// SIDEBAR
// ============================================================
function renderSidebar() {
  const list = document.getElementById("story-list");
  const filtered = getFilteredPlaylists();

  if (filtered.length === 0) {
    list.innerHTML = `<p class="no-results-text">Không tìm thấy truyện nào khớp với "${searchQuery}"</p>`;
    return;
  }

  list.innerHTML = filtered.map(p => `
    <div class="story-item" data-id="${p.id}" onclick="selectPlaylist('${p.id}')">
      <img src="${p.cover}" alt="${p.title}">
      <div class="meta">
        <div class="title">${p.title}</div>
        <div class="sub">${p.totalParts} tập · ${p.category}</div>
      </div>
    </div>
  `).join("");

  // Giữ nguyên trạng thái "đang chọn" nếu playlist đó vẫn còn hiển thị sau khi lọc
  if (currentPlaylist) {
    highlightActiveSidebar(currentPlaylist.id);
  }
}

function highlightActiveSidebar(playlistId) {
  document.querySelectorAll(".story-item").forEach(el => {
    el.classList.toggle("active", el.dataset.id === playlistId);
  });
}

// ============================================================
// PLAYLIST FETCH + SELECT
// ============================================================
const playlistCache = new Map();

async function fetchPlaylistDetail(playlistId) {
  if (playlistCache.has(playlistId)) return playlistCache.get(playlistId);
  const res = await fetch(`${API_BASE_URL}/api/playlists/${playlistId}`);
  const data = await res.json();
  playlistCache.set(playlistId, data);
  return data;
}

async function selectPlaylist(playlistId, focusPartId = null) {
  highlightActiveSidebar(playlistId);
  currentPlaylist = await fetchPlaylistDetail(playlistId);

  const targetPart = focusPartId
    ? currentPlaylist.parts.find(p => p.id === focusPartId)
    : currentPlaylist.parts[0];

  renderEpisodeList();
  await loadPart(targetPart || currentPlaylist.parts[0]);
}

// ============================================================
// EPISODE LIST
// ============================================================
function renderEpisodeList() {
  const listEl = document.getElementById("episode-list");
  const headingEl = document.getElementById("episodes-heading");
  const ctaSlot = document.getElementById("unlock-cta-slot");
  headingEl.style.display = "block";
  ctaSlot.innerHTML = "";

  let firstLockedRendered = false;

  listEl.innerHTML = currentPlaylist.parts.map(part => {
    const isActive = currentPart && part.id === currentPart.id;
    const isLocked = part.locked && !getStoredToken(part.id);

    const rowHtml = `
      <div class="episode-row ${isLocked ? "locked" : ""} ${isActive ? "active" : ""}"
           onclick="handleEpisodeClick('${part.id}', ${isLocked})">
        <div class="ep-content">
          <div class="ep-icon">${isActive ? "▶" : (part.partNumber)}</div>
          <div>
            <div class="ep-title">Phần ${part.partNumber}: ${part.title.replace(/^Phần \d+:\s*/, "")}</div>
            <div class="ep-sub">${part.duration}</div>
          </div>
        </div>
        ${isLocked ? `<div class="lock-badge">🔒</div>` : ""}
      </div>
    `;

    // Chèn CTA vượt link ngay sau tập bị khóa đầu tiên
    if (isLocked && !firstLockedRendered) {
      firstLockedRendered = true;
      ctaSlot.innerHTML = `
        <div class="unlock-cta-wrap">
          <button class="unlock-cta" id="unlock-btn" onclick="startUnlockFlow('${part.id}')">
            Vượt link để xem tiếp Phần ${part.partNumber}
          </button>
          <div class="unlock-hint">Hoàn thành 2 liên kết để mở khóa phần này</div>
        </div>
      `;
    }

    return rowHtml;
  }).join("");
}

function handleEpisodeClick(partId, isLocked) {
  if (isLocked) {
    startUnlockFlow(partId);
    return;
  }
  const part = currentPlaylist.parts.find(p => p.id === partId);
  loadPart(part);
}

// ============================================================
// PLAYER HERO
// ============================================================
async function loadPart(part) {
  currentPart = part;
  currentSpeedIndex = 0; // ← thêm dòng này: mỗi tập mới về lại tốc độ 1x
  renderEpisodeList(); // re-render to update active state

  const hero = document.getElementById("player-hero");
  hero.style.setProperty("--hero-bg", `url('${currentPlaylist.cover}')`);

  const token = getStoredToken(part.id);
  const url = token
    ? `${API_BASE_URL}/api/video/${part.id}?token=${encodeURIComponent(token)}`
    : `${API_BASE_URL}/api/video/${part.id}`;

  let videoUrl = null;
  let locked = part.locked;
  try {
    const headers = {};
    const authToken = getAuthToken();
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const res = await fetch(url, { headers });
    const data = await res.json();
    if (res.ok && data.videoUrl) {
      videoUrl = data.videoUrl;
      locked = false;
    } else {
      localStorage.removeItem(`unlockToken:${part.id}`);
    }
  } catch (err) {
    console.error(err);
  }

  const waveBars = Array.from({ length: 40 }, () =>
    `<div class="bar" style="height:${8 + Math.random() * 26}px"></div>`
  ).join("");

  hero.innerHTML = `
    <img class="player-cover" src="${currentPlaylist.cover}" alt="${currentPlaylist.title}">
    <div class="player-info">
      <div class="player-eyebrow">${currentPlaylist.title}</div>
      <div class="player-title">Phần ${part.partNumber}: ${part.title.replace(/^Phần \d+:\s*/, "")}</div>
      <div class="waveform" id="waveform">${waveBars}</div>

      <div class="seek-row">
        <span class="time-current" id="time-current">0:00</span>
        <input type="range" id="seek-bar" class="seek-bar" min="0" max="100" value="0" step="0.01" ${locked ? "disabled" : ""}>
        <span class="time-total" id="time-total">${part.duration}</span>
      </div>

      <div class="transport">
        <button class="transport-btn" onclick="skip(-1)" title="Tập trước">⏮</button>
        <button class="control-btn" id="rewind-btn" onclick="seekRelative(-10)" ${locked ? "disabled" : ""} title="Lùi 10 giây">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7"/>
            <polyline points="3 4 3 9 8 9"/>
          </svg>
          <span>10s</span>
        </button>
        <button class="play-btn-main" id="play-btn" onclick="togglePlay()" ${locked ? "disabled" : ""}>▶</button>
        <button class="control-btn" id="forward-btn" onclick="seekRelative(10)" ${locked ? "disabled" : ""} title="Tiến 10 giây">
          <span>10s</span>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7"/>
            <polyline points="21 4 21 9 16 9"/>
          </svg>
        </button>
        <button class="transport-btn" onclick="skip(1)" title="Tập sau">⏭</button>
        <button class="speed-btn" id="speed-btn" onclick="cycleSpeed()" ${locked ? "disabled" : ""} title="Tốc độ phát">1x</button>
      </div>
    </div>
    <audio class="hidden-media" id="media-el" ${videoUrl ? `src="${videoUrl}"` : ""}></audio>
  `;

  if (videoUrl) {
    const mediaEl = document.getElementById("media-el");
    const seekBar = document.getElementById("seek-bar");

    mediaEl.addEventListener("play", () => setPlayingState(true));
    mediaEl.addEventListener("pause", () => setPlayingState(false));
    mediaEl.addEventListener("ended", () => setPlayingState(false));

    // Khi có metadata (biết được tổng thời lượng) -> set max cho seek bar
    mediaEl.addEventListener("loadedmetadata", () => {
      seekBar.max = mediaEl.duration || 0;
      document.getElementById("time-total").textContent = formatTime(mediaEl.duration);
    });

    // Cập nhật vị trí seek bar + nhãn thời gian khi đang phát
    mediaEl.addEventListener("timeupdate", () => {
      if (!isSeeking) {
        seekBar.value = mediaEl.currentTime;
        updateSeekFill(seekBar);
      }
      document.getElementById("time-current").textContent = formatTime(mediaEl.currentTime);
    });

    // Kéo thanh tua -> nhảy tới vị trí tương ứng
    seekBar.addEventListener("input", () => {
      isSeeking = true;
      updateSeekFill(seekBar);
      document.getElementById("time-current").textContent = formatTime(Number(seekBar.value));
    });
    seekBar.addEventListener("change", () => {
      mediaEl.currentTime = Number(seekBar.value);
      isSeeking = false;
    });
  }
}

function setPlayingState(playing) {
  isPlaying = playing;
  const wf = document.getElementById("waveform");
  const btn = document.getElementById("play-btn");
  if (wf) wf.classList.toggle("playing", playing);
  if (btn) btn.textContent = playing ? "⏸" : "▶";
}

function togglePlay() {
  const mediaEl = document.getElementById("media-el");
  if (!mediaEl || !mediaEl.src) return;
  if (mediaEl.paused) mediaEl.play(); else mediaEl.pause();
}

function skip(direction) {
  if (!currentPlaylist || !currentPart) return;
  const idx = currentPlaylist.parts.findIndex(p => p.id === currentPart.id);
  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= currentPlaylist.parts.length) return;
  const nextPart = currentPlaylist.parts[nextIdx];
  if (nextPart.locked && !getStoredToken(nextPart.id)) {
    startUnlockFlow(nextPart.id);
    return;
  }
  loadPart(nextPart);
}

function formatTime(sec) {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ============================================================
// UNLOCK FLOW (vượt 3 link)
// ============================================================
async function startUnlockFlow(videoId) {
  const btn = document.getElementById("unlock-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang khởi tạo...";
  }

  try {
    const headers = { "Content-Type": "application/json" };
    const authToken = getAuthToken();
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const res = await fetch(`${API_BASE_URL}/api/unlock/start`, {
      method: "POST",
      headers,
      body: JSON.stringify({ videoId })
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Không thể bắt đầu vượt link");
      if (btn) { btn.disabled = false; btn.textContent = "Vượt link để xem tiếp"; }
      return;
    }

    window.location.href = data.redirectUrl;
  } catch (err) {
    alert("Lỗi kết nối máy chủ, thử lại sau.");
    if (btn) { btn.disabled = false; btn.textContent = "Vượt link để xem tiếp"; }
  }
}

// expose for inline onclick handlers
window.selectPlaylist = selectPlaylist;
window.handleEpisodeClick = handleEpisodeClick;
window.startUnlockFlow = startUnlockFlow;
window.togglePlay = togglePlay;
window.skip = skip;
window.handleSearchInput = handleSearchInput;

// ============================================================
// SEEK BAR / TỐC ĐỘ / TUA 10 GIÂY
// ============================================================
let isSeeking = false;
const SPEED_STEPS = [1, 1.25, 1.5, 2.0, 2.5];
let currentSpeedIndex = 0;

function updateSeekFill(seekBar) {
  const percent = seekBar.max > 0 ? (seekBar.value / seekBar.max) * 100 : 0;
  seekBar.style.background =
    `linear-gradient(to right, var(--teal) ${percent}%, var(--bg-elevated) ${percent}%)`;
}

function seekRelative(deltaSeconds) {
  const mediaEl = document.getElementById("media-el");
  if (!mediaEl || !mediaEl.src) return;
  const newTime = mediaEl.currentTime + deltaSeconds;
  mediaEl.currentTime = Math.min(Math.max(newTime, 0), mediaEl.duration || newTime);
}

function cycleSpeed() {
  const mediaEl = document.getElementById("media-el");
  const btn = document.getElementById("speed-btn");
  if (!mediaEl || !mediaEl.src) return;

  currentSpeedIndex = (currentSpeedIndex + 1) % SPEED_STEPS.length;
  const newSpeed = SPEED_STEPS[currentSpeedIndex];
  mediaEl.playbackRate = newSpeed;
  btn.textContent = `${newSpeed}x`;
}

window.seekRelative = seekRelative;
window.cycleSpeed = cycleSpeed;

init();