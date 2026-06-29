const toggleEl     = document.getElementById('toggle');
const sliderEl     = document.getElementById('width-slider');
const widthDisplay = document.getElementById('width-display');
const statusEl     = document.getElementById('status');
const noJiraEl     = document.getElementById('no-jira');

let activeTabId = null;

// ─── UI helpers ──────────────────────────────────────────────────────────────

function setUI(enabled, vw) {
  toggleEl.checked         = enabled;
  sliderEl.value           = vw;
  widthDisplay.textContent = vw + 'vw';
  statusEl.textContent     = enabled ? 'Active' : 'Inactive';
  statusEl.className       = 'status ' + (enabled ? 'active' : 'inactive');
}

function markNoContent() {
  document.body.classList.add('no-content');
  noJiraEl.style.display = 'block';
  statusEl.style.display = 'none';
}

// ─── Messaging ───────────────────────────────────────────────────────────────

function sendMsg(msg) {
  if (!activeTabId) return;
  chrome.tabs.sendMessage(activeTabId, msg, () => {
    if (chrome.runtime.lastError) markNoContent();
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────

// Read persisted state from storage (source of truth for popup).
// This works even when the keyboard shortcut was used to toggle while the popup
// was closed, because content.js writes back to storage on every toggle.
chrome.storage.local.get(['widenerEnabled', 'widenerWidth'], (result) => {
  const enabled = result.widenerEnabled !== false; // default true
  const vw      = parseInt(result.widenerWidth) || 70;
  setUI(enabled, vw);
});

// Resolve the active tab ID for message passing.
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab) activeTabId = tab.id;
});

// ─── Events ──────────────────────────────────────────────────────────────────

toggleEl.addEventListener('change', () => {
  const enabled = toggleEl.checked;
  chrome.storage.local.set({ widenerEnabled: enabled });
  statusEl.textContent = enabled ? 'Active' : 'Inactive';
  statusEl.className   = 'status ' + (enabled ? 'active' : 'inactive');
  sendMsg({ action: 'setEnabled', enabled });
});

sliderEl.addEventListener('input', () => {
  const vw    = parseInt(sliderEl.value);
  const width = vw + 'vw';
  widthDisplay.textContent = width;
  chrome.storage.local.set({ widenerWidth: width });
  sendMsg({ action: 'setWidth', width });
});
