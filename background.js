const DEFAULT_CATEGORIES = {
  video: {
    name: "Video & Media",
    domains: ["youtube.com", "bilibili.com"],
    redirectUrl: "",
    excludedDomains: ["music.youtube.com"],
    iconUrl: "",
    timerMinutes: 25
  },
  comics: {
    name: "Comics & Novels",
    domains: ["asuracomic.net", "manganato.com", "novelupdates.com"],
    redirectUrl: "",
    excludedDomains: [],
    iconUrl: "",
    timerMinutes: 25
  }
};

chrome.runtime.onInstalled.addListener(async () => {
  const { categories } = await chrome.storage.local.get(["categories"]);
  if (!categories) {
    await chrome.storage.local.set({ categories: DEFAULT_CATEGORIES, sessions: {} });
  }
});

function matchesDomain(urlStr, targetDomain, cat) {
  try {
    const hostname = new URL(urlStr).hostname;
    const matchesTarget = hostname === targetDomain || hostname.endsWith("." + targetDomain);
    if (!matchesTarget) return false;

    const isExcluded = cat?.excludedDomains?.some((ex) => ex.trim() && (hostname === ex.trim() || hostname.endsWith("." + ex.trim())));
    return !isExcluded;
  } catch (e) {
    return false;
  }
}

async function updateTabFocusState() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeUrl = activeTab?.url || "";

  const { categories = {}, sessions = {} } = await chrome.storage.local.get(["categories", "sessions"]);

  let activeDomain = null;
  if (activeUrl) {
    for (const cat of Object.values(categories)) {
      const match = cat.domains?.find((d) => matchesDomain(activeUrl, d, cat));
      if (match) {
        activeDomain = match;
        break;
      }
    }
  }

  let updated = false;

  for (const [domainKey, session] of Object.entries(sessions)) {
    if (!session || session.remainingMs <= 0) continue;

    if (domainKey === activeDomain) {
      if (session.isPaused) {
        session.isPaused = false;
        session.lastActiveTimestamp = Date.now();
        chrome.alarms.create(`session_${domainKey}`, { delayInMinutes: session.remainingMs / 60000 });
        updated = true;
      }
    } else {
      if (!session.isPaused) {
        const elapsed = Date.now() - (session.lastActiveTimestamp || Date.now());
        session.remainingMs = Math.max(0, session.remainingMs - elapsed);
        session.isPaused = true;
        session.lastActiveTimestamp = null;
        chrome.alarms.clear(`session_${domainKey}`);
        updated = true;
      }
    }
  }

  if (updated) {
    await chrome.storage.local.set({ sessions });
  }
}

chrome.tabs.onRemoved.addListener(async () => {
  const allTabs = await chrome.tabs.query({});
  const { categories = {}, sessions = {} } = await chrome.storage.local.get(["categories", "sessions"]);
  let updated = false;

  for (const [domainKey, session] of Object.entries(sessions)) {
    if (!session) continue;
    const cat = categories[session.categoryKey];

    const hasOpenTab = allTabs.some((tab) => tab.url && matchesDomain(tab.url, domainKey, cat));
    if (!hasOpenTab) {
      delete sessions[domainKey];
      chrome.alarms.clear(`session_${domainKey}`);
      updated = true;
    }
  }

  if (updated) {
    await chrome.storage.local.set({ sessions });
  }
});

chrome.tabs.onActivated.addListener(updateTabFocusState);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    updateTabFocusState();
  }
});
chrome.windows.onFocusChanged.addListener(updateTabFocusState);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "START_SESSION") {
    const durationMs = msg.duration * 60000;
    chrome.storage.local.get(["sessions"], async (res) => {
      const sessions = res.sessions || {};
      sessions[msg.domain] = {
        categoryKey: msg.categoryKey,
        mode: msg.mode,
        remainingMs: durationMs,
        lastActiveTimestamp: Date.now(),
        isPaused: false
      };
      // Explicitly schedule initial alarm for session start
      chrome.alarms.create(`session_${msg.domain}`, { delayInMinutes: msg.duration });
      await chrome.storage.local.set({ sessions });
      updateTabFocusState();
    });
  } else if (msg.type === "END_SESSION") {
    chrome.storage.local.get(["sessions"], async (res) => {
      const sessions = res.sessions || {};
      delete sessions[msg.domain];
      chrome.alarms.clear(`session_${msg.domain}`);
      await chrome.storage.local.set({ sessions });
      updateTabFocusState();
    });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("session_")) return;
  const domainKey = alarm.name.replace("session_", "");

  const { categories = {}, sessions = {} } = await chrome.storage.local.get(["categories", "sessions"]);
  const currentSession = sessions[domainKey];

  let targetCategory = null;
  if (currentSession) {
    targetCategory = categories[currentSession.categoryKey];
  }

  if (currentSession?.mode === "unproductive" && targetCategory && targetCategory.redirectUrl) {
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      if (tab.url && matchesDomain(tab.url, domainKey, targetCategory)) {
        chrome.tabs.update(tab.id, { url: targetCategory.redirectUrl });
      }
    });
  }

  delete sessions[domainKey];
  await chrome.storage.local.set({ sessions });

  const tabs = await chrome.tabs.query({});
  tabs.forEach((tab) => {
    if (tab.url && matchesDomain(tab.url, domainKey, targetCategory)) {
      chrome.tabs.sendMessage(tab.id, { type: "SESSION_EXPIRED" }).catch(() => {});
    }
  });
});