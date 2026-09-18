const DEFAULT_CATEGORIES = {
  video: {
    name: "Video & Media",
    domains: ["youtube.com", "bilibili.com"],
    redirectUrl: "",
    iconUrl: "",
    timerMinutes: 25
  },
  comics: {
    name: "Comics & Novels",
    domains: ["asuracomic.net", "manganato.com", "novelupdates.com"],
    redirectUrl: "",
    iconUrl: "",
    timerMinutes: 25
  }
};

const DEFAULT_UNPRODUCTIVE_NOTE = "Attention is Currency! These big companies are using your data and trying to brainwash you.";

document.addEventListener("DOMContentLoaded", initOptions);

async function initOptions() {
  const { categories, unproductiveNote } = await chrome.storage.local.get(["categories", "unproductiveNote"]);

  if (!categories || Object.keys(categories).length === 0) {
    await chrome.storage.local.set({ categories: DEFAULT_CATEGORIES });
    renderCategories(DEFAULT_CATEGORIES);
  } else {
    renderCategories(categories);
  }

  // Populate custom intent note field
  const noteInput = document.getElementById("unproductive-note");
  if (noteInput) {
    noteInput.value = unproductiveNote !== undefined ? unproductiveNote : DEFAULT_UNPRODUCTIVE_NOTE;
  }

  const saveNoteBtn = document.getElementById("save-note-btn");
  if (saveNoteBtn) {
    saveNoteBtn.addEventListener("click", handleSaveNote);
  }

  document.getElementById("add-category-form").addEventListener("submit", handleAddCategory);
  document.getElementById("reset-btn").addEventListener("click", handleResetDefaults);
}

async function handleSaveNote() {
  const noteInput = document.getElementById("unproductive-note");
  if (noteInput) {
    const noteValue = noteInput.value.trim();
    await chrome.storage.local.set({ unproductiveNote: noteValue });
    showToast("INTENT NOTE COMMITTED");
  }
}

function sanitizeDomain(input) {
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/^www\./, "");
  return domain.split("/")[0];
}

function renderCategories(categories) {
  const container = document.getElementById("categories-container");
  container.innerHTML = "";

  Object.entries(categories).forEach(([key, category]) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.key = key;

    const domainsHtml = category.domains
      .map((domain) => `
        <span class="pill">
          ${escapeHtml(domain)}
          <span class="pill-remove" data-domain="${escapeHtml(domain)}">&times;</span>
        </span>
      `).join("");

    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${escapeHtml(category.name)}</span>
        <button class="btn btn-danger delete-btn">Purge Protocol</button>
      </div>
      <div class="form-group">
        <label>Category Designation</label>
        <input type="text" class="cat-name" value="${escapeHtml(category.name)}">
      </div>
      <div class="form-group">
        <label>Target Domains</label>
        <div class="domain-input-group">
          <input type="text" class="new-domain-input" placeholder="Add domain (e.g. reddit.com)">
          <button type="button" class="btn btn-secondary add-domain-btn">Add Domain</button>
        </div>
        <div class="domain-pills">${domainsHtml}</div>
      </div>
      <div class="form-group">
        <label>Reroute Target URL</label>
        <input type="url" class="cat-redirect" value="${escapeHtml(category.redirectUrl)}">
      </div>
      <div class="form-group">
        <label>HUD Avatar / Emblem URL</label>
        <input type="url" class="cat-icon" placeholder="https://example.com/avatar.png" value="${escapeHtml(category.iconUrl || '')}">
      </div>
      <div class="form-group">
        <label>Leisure Window Limit (Minutes)</label>
        <input type="number" class="cat-timer" value="${category.timerMinutes}" min="1" max="240">
      </div>
      <button type="button" class="btn btn-primary save-btn">Commit Changes</button>
    `;

    const domainInput = card.querySelector(".new-domain-input");

    card.querySelector(".add-domain-btn").onclick = () => {
      const value = sanitizeDomain(domainInput.value);
      if (value && !category.domains.includes(value)) {
        category.domains.push(value);
        domainInput.value = "";
        saveAndReload(categories);
      }
    };

    card.querySelector(".domain-pills").onclick = (e) => {
      if (e.target.classList.contains("pill-remove")) {
        const domainToRemove = e.target.dataset.domain;
        category.domains = category.domains.filter((d) => d !== domainToRemove);
        saveAndReload(categories);
      }
    };

    card.querySelector(".save-btn").onclick = () => {
      category.name = card.querySelector(".cat-name").value.trim();
      category.redirectUrl = card.querySelector(".cat-redirect").value.trim();
      category.iconUrl = card.querySelector(".cat-icon").value.trim();
      category.timerMinutes = parseInt(card.querySelector(".cat-timer").value, 10) || 25;
      saveAndReload(categories);
    };

    card.querySelector(".delete-btn").onclick = () => {
      if (confirm(`Purge category "${category.name}"?`)) {
        delete categories[key];
        saveAndReload(categories);
      }
    };

    container.appendChild(card);
  });
}

async function handleAddCategory(e) {
  e.preventDefault();
  const name = document.getElementById("new-cat-name").value.trim();
  const rawDomains = document.getElementById("new-cat-domains").value;
  const redirectUrl = document.getElementById("new-cat-redirect").value.trim();
  const iconUrl = document.getElementById("new-cat-icon").value.trim();
  const timerMinutes = parseInt(document.getElementById("new-cat-timer").value, 10) || 25;

  const key = "cat_" + Date.now();
  const domains = rawDomains.split(",").map(sanitizeDomain).filter((d) => d.length > 0);

  const { categories = {} } = await chrome.storage.local.get(["categories"]);
  categories[key] = { name, domains, redirectUrl, iconUrl, timerMinutes };

  await chrome.storage.local.set({ categories });
  document.getElementById("add-category-form").reset();
  renderCategories(categories);
  showToast("NEW PROTOCOL INITIALIZED");
}

async function handleResetDefaults() {
  if (confirm("Reset neural parameters to factory defaults?")) {
    await chrome.storage.local.set({
      categories: DEFAULT_CATEGORIES,
      unproductiveNote: DEFAULT_UNPRODUCTIVE_NOTE
    });
    renderCategories(DEFAULT_CATEGORIES);

    const noteInput = document.getElementById("unproductive-note");
    if (noteInput) {
      noteInput.value = DEFAULT_UNPRODUCTIVE_NOTE;
    }

    showToast("STACK RESET COMPLETE");
  }
}

async function saveAndReload(categories) {
  await chrome.storage.local.set({ categories });
  renderCategories(categories);
  showToast("PARAMETERS COMMITTED");
}

function showToast(message) {
  const toast = document.getElementById("status-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 2000);
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}