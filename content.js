let currentOverlay = null;
let currentHud = null;
let timerInterval = null;
let noteCountdownInterval = null;

const DEFAULT_HUD_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2300f3ff'%3E%3Cpath d='M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'/%3E%3C/svg%3E";

function calculateRemainingMs(session) {
  if (!session) return 0;
  if (session.isPaused || !session.lastActiveTimestamp) {
    return session.remainingMs || 0;
  }
  const elapsed = Date.now() - session.lastActiveTimestamp;
  return Math.max(0, session.remainingMs - elapsed);
}

async function checkIntent() {
  if (!chrome.runtime?.id || !chrome.storage?.local) return;

  const host = window.location.hostname;
  const { categories = {}, sessions = {}, unproductiveNote = "" } = await chrome.storage.local.get([
    "categories",
    "sessions",
    "unproductiveNote"
  ]);

  let matchedCategoryKey = null;
  let matchedCategory = null;
  let matchedDomain = null;

  for (const [key, cat] of Object.entries(categories)) {
    const domain = cat.domains?.find((d) => host.includes(d));
    if (domain) {
      const isExcluded = cat.excludedDomains?.some((ex) => ex.trim() && host.includes(ex.trim()));
      if(!isExcluded){
      matchedCategoryKey = key;
      matchedCategory = cat;
      matchedDomain = domain;
      break;
      }
    }
  }

  if (!matchedDomain) {
    removeModal();
    removeHud();
    return;
  }

  const activeSession = sessions[matchedDomain];
  const remainingMs = calculateRemainingMs(activeSession);

  if (activeSession && remainingMs > 0) {
    removeModal();
    renderHud(matchedDomain, matchedCategoryKey, matchedCategory, activeSession);
  } else {
    removeHud();
    renderModal(matchedDomain, matchedCategoryKey, matchedCategory, unproductiveNote);
  }
}

/* ==========================================================================
   1. CHECK-IN MODAL WITH 5-SECOND MINDFULNESS NOTE DISPLAY
   ========================================================================== */
function renderModal(domain, categoryKey, category, unproductiveNote) {
  if (currentOverlay) return;

  const container = document.createElement("div");
  container.id = "intentional-web-modal";
  const shadow = container.attachShadow({ mode: "closed" });

  const duration = parseInt(category.timerMinutes, 10) || 25;

  shadow.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap');

      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(3, 7, 18, 0.94);
        backdrop-filter: blur(12px);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Rajdhani', system-ui, sans-serif;
        color: #f8fafc;
        background-image: 
          radial-gradient(circle at 50% 50%, rgba(0, 243, 255, 0.05) 0%, transparent 60%),
          linear-gradient(rgba(0, 243, 255, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 243, 255, 0.03) 1px, transparent 1px);
        background-size: 100% 100%, 30px 30px, 30px 30px;
      }

      .card {
        background: rgba(10, 15, 29, 0.85);
        border: 1px solid #00f3ff;
        border-radius: 4px;
        padding: 36px 32px;
        text-align: center;
        max-width: 440px;
        box-shadow: 
          0 0 25px rgba(0, 243, 255, 0.25),
          inset 0 0 15px rgba(0, 243, 255, 0.1);
        position: relative;
        overflow: hidden;
      }

      .tag {
        font-family: 'Orbitron', monospace;
        font-size: 0.75rem;
        letter-spacing: 3px;
        color: #00f3ff;
        text-transform: uppercase;
        margin-bottom: 8px;
        text-shadow: 0 0 8px rgba(0, 243, 255, 0.8);
      }

      h2 {
        font-family: 'Orbitron', sans-serif;
        margin: 0 0 12px 0;
        font-size: 1.6rem;
        font-weight: 900;
        color: #ffffff;
        text-transform: uppercase;
        letter-spacing: 1.5px;
      }

      p {
        margin: 0 0 28px 0;
        color: #94a3b8;
        font-size: 1.05rem;
        line-height: 1.4;
      }

      .category-highlight {
        color: #ff0055;
        font-weight: 700;
        text-shadow: 0 0 8px rgba(255, 0, 85, 0.6);
      }

      .note-box {
        background: rgba(255, 0, 85, 0.08);
        border-left: 3px solid #ff0055;
        padding: 12px 16px;
        margin-bottom: 24px;
        text-align: left;
        color: #f1f5f9;
        font-size: 0.95rem;
      }

      .btn-group { display: flex; gap: 14px; justify-content: center; }

      button {
        flex: 1;
        padding: 14px 16px;
        border: 1px solid transparent;
        border-radius: 2px;
        font-family: 'Orbitron', sans-serif;
        font-weight: 700;
        font-size: 0.85rem;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .prod {
        background: rgba(0, 243, 255, 0.1);
        border-color: #00f3ff;
        color: #00f3ff;
        box-shadow: 0 0 10px rgba(0, 243, 255, 0.2);
      }
      .prod:hover {
        background: #00f3ff;
        color: #030712;
        box-shadow: 0 0 20px rgba(0, 243, 255, 0.8);
      }

      .unprod {
        background: rgba(255, 0, 85, 0.1);
        border-color: #ff0055;
        color: #ff0055;
        box-shadow: 0 0 10px rgba(255, 0, 85, 0.2);
      }
      .unprod:hover {
        background: #ff0055;
        color: #ffffff;
        box-shadow: 0 0 20px rgba(255, 0, 85, 0.8);
      }
    </style>
    <div class="overlay">
      <div class="card" id="modal-card">
        <div class="tag">System Intercept // Cortical Check</div>
        <h2>Intent Protocol</h2>
        <p>Accessing <span class="category-highlight">${escapeHtml(category.name)}</span> (${escapeHtml(domain)}).<br>Confirm operational purpose for this session:</p>
        <div class="btn-group">
          <button class="prod" id="btn-prod">Productive (60m)</button>
          <button class="unprod" id="btn-unprod">Leisure (${duration}m)</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  currentOverlay = container;

  shadow.getElementById("btn-prod").onclick = () => startSession(domain, categoryKey, "productive", 60);

  shadow.getElementById("btn-unprod").onclick = () => {
    const card = shadow.getElementById("modal-card");
    const displayNote = unproductiveNote && unproductiveNote.trim() !== "" 
      ? unproductiveNote 
      : "Attention is Currency! Maintain intentional awareness.";

    let secondsLeft = 5;

    card.innerHTML = `
      <div class="tag" style="color: #ff0055; text-shadow: 0 0 8px rgba(255,0,85,0.8);">Mindfulness Directive</div>
      <h2>Intent Note</h2>
      <div class="note-box">${escapeHtml(displayNote)}</div>
      <div class="btn-group">
        <button class="unprod" id="btn-countdown" style="cursor: default;">Initiating in ${secondsLeft}s...</button>
      </div>
    `;

    const countdownBtn = shadow.getElementById("btn-countdown");

    if (noteCountdownInterval) clearInterval(noteCountdownInterval);

    noteCountdownInterval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        countdownBtn.textContent = `Initiating in ${secondsLeft}s...`;
      } else {
        clearInterval(noteCountdownInterval);
        noteCountdownInterval = null;
        startSession(domain, categoryKey, "unproductive", duration);
      }
    }, 1000);
  };
}

function startSession(domain, categoryKey, mode, duration) {
  if (noteCountdownInterval) {
    clearInterval(noteCountdownInterval);
    noteCountdownInterval = null;
  }
  chrome.runtime.sendMessage({
    type: "START_SESSION",
    domain: domain,
    categoryKey: categoryKey,
    mode: mode,
    duration: duration
  });
  removeModal();
  setTimeout(checkIntent, 200);
}

function removeModal() {
  if (noteCountdownInterval) {
    clearInterval(noteCountdownInterval);
    noteCountdownInterval = null;
  }
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
  }
}

/* ==========================================================================
   2. HOVER HUD TIMER WIDGET WITH PREMATURE SESSION ABORT
   ========================================================================== */
function renderHud(domain, categoryKey, category, session) {
  if (currentHud) {
    removeHud();
  }

  const container = document.createElement("div");
  container.id = "intentional-web-hud";
  const shadow = container.attachShadow({ mode: "closed" });

  const isProductive = session.mode === "productive";
  const themeColor = isProductive ? "#00f3ff" : "#ff0055";
  const iconSrc = category.iconUrl && category.iconUrl.trim() !== "" ? category.iconUrl : DEFAULT_HUD_ICON;

  shadow.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Rajdhani:wght@600;700&display=swap');

      /* Strict CSS Reset within Shadow DOM to prevent host site pollution */
      *, *::before, *::after {
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
        line-height: 1.2 !important;
        -webkit-font-smoothing: antialiased;
      }

      .hud-wrapper {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        background: rgba(10, 15, 29, 0.23);
        border: 1px solid ${themeColor};
        border-radius: 20px;
        padding: 4px !important;
        box-shadow: 0 0 12px ${themeColor}55;
        backdrop-filter: blur(10px);
        transition: max-width 0.35s cubic-bezier(0.16, 1, 0.3, 1), 
                    padding 0.35s cubic-bezier(0.16, 1, 0.3, 1), 
                    box-shadow 0.35s ease;
        max-width: 44px;
        height: 44px;
        white-space: nowrap;
        overflow: hidden;
        cursor: grab;
        user-select: none;
      }

      .hud-wrapper:hover {
        max-width: 360px;
        border-radius: 4px;
        padding: 6px 14px !important;
        box-shadow: 0 0 20px ${themeColor}aa;
      }

      .hud-wrapper:active {
        cursor: grabbing;
      }

      .hud-icon {
        width: 34px !important;
        height: 34px !important;
        min-width: 34px !important;
        min-height: 34px !important;
        border-radius: 50% !important;
        object-fit: cover !important;
        flex-shrink: 0;
        border: 1px solid ${themeColor};
        background: rgba(3, 7, 18, 0.23);
      }

      .hud-content {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-left: 10px !important;
        opacity: 0;
        transform: translateX(10px);
        transition: opacity 0.25s ease, transform 0.25s ease;
      }

      .hud-wrapper:hover .hud-content {
        opacity: 1;
        transform: translateX(0);
      }

      .hud-info {
        display: flex;
        flex-direction: column;
      }

      .hud-title {
        font-family: 'Orbitron', monospace !important;
        font-size: 10px !important;
        letter-spacing: 1.5px;
        color: ${themeColor};
        text-transform: uppercase;
      }

      .hud-status {
        font-family: 'Rajdhani', sans-serif !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        letter-spacing: 1px;
        color: #f8fafc;
      }

      .hud-timer {
        font-family: 'Orbitron', monospace !important;
        font-size: 18px !important;
        font-weight: 700 !important;
        color: ${themeColor};
        text-shadow: 0 0 8px ${themeColor}aa;
        letter-spacing: 1px;
      }

      .abort-btn {
        background: rgba(255, 0, 85, 0.15) !important;
        border: 1px solid #ff0055 !important;
        color: #ff0055 !important;
        border-radius: 2px !important;
        padding: 4px 8px !important;
        font-family: 'Orbitron', sans-serif !important;
        font-size: 10px !important;
        letter-spacing: 1px;
        cursor: pointer;
        text-transform: uppercase;
        transition: all 0.2s ease;
        margin-left: 4px !important;
      }

      .abort-btn:hover {
        background: #ff0055 !important;
        color: #ffffff !important;
        box-shadow: 0 0 10px rgba(255, 0, 85, 0.8);
      }
    </style>
    <div class="hud-wrapper" id="hud-wrapper">
      <img class="hud-icon" id="hud-img" src="${escapeHtml(iconSrc)}" alt="HUD Emblem">
      <div class="hud-content">
        <div class="hud-info">
          <span class="hud-title">${escapeHtml(domain)} // ${isProductive ? "PROD" : "LEISURE"}</span>
          <span class="hud-status" id="hud-status-text">SESSION ACTIVE</span>
        </div>
        <div class="hud-timer" id="timer-display">--:--</div>
        <button class="abort-btn" id="btn-abort" title="Prematurely terminate session">Abort</button>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  currentHud = container;

  const hudImg = shadow.getElementById("hud-img");
  hudImg.addEventListener("error", () => {
    hudImg.src = DEFAULT_HUD_ICON;
  });

  shadow.getElementById("btn-abort").onclick = (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: "END_SESSION", domain: domain });
    removeHud();
    setTimeout(checkIntent, 200);
  };

  const timerDisplay = shadow.getElementById("timer-display");
  const statusText = shadow.getElementById("hud-status-text");

  function updateClock() {
    if (!chrome.runtime?.id || !chrome?.storage?.local) {
      clearInterval(timerInterval);
      return;
    }

    chrome.storage.local.get(["sessions"], (res) => {
      const liveSession = res?.sessions?.[domain];
      const remainingMs = calculateRemainingMs(liveSession);

      if (!liveSession || remainingMs <= 0) {
        removeHud();
        clearInterval(timerInterval);
        checkIntent();
        return;
      }

      if (liveSession.isPaused) {
        statusText.textContent = "TIMER PAUSED";
        statusText.style.color = "#94a3b8";
      } else {
        statusText.textContent = "SESSION ACTIVE";
        statusText.style.color = "#f8fafc";
      }

      const totalSecs = Math.floor(remainingMs / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      timerDisplay.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    });
  }

  updateClock();
  timerInterval = setInterval(updateClock, 1000);
}

function removeHud() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (currentHud) {
    currentHud.remove();
    currentHud = null;
  }
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

// Re-check intent when returning/focusing back on tab
window.addEventListener("focus", checkIntent);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    checkIntent();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.sessions) {
    checkIntent();
  }
});

window.addEventListener("yt-navigate-finish", checkIntent);

let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    checkIntent();
  }
}, 500);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SESSION_EXPIRED") {
    checkIntent();
  }
});

checkIntent();