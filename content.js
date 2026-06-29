// ─── SELECTORS ───────────────────────────────────────────────────────────────
// All use substring matching so they survive testid renames between Jira releases.
//
// Layout discovered in the DOM:
//   page-layout.aside              <- outer aside slot; Jira sizes it via --n_pnlW CSS var
//     preview-panels.preview-panel <- inner panel; also carries its own --n_pnlW
//   page-layout.main               <- list area; needs min-width:0 to yield space
//   preview-panels.panel-splitter  <- Jira's drag handle; we overlay ours on top of it

const ASIDE_SELECTOR    = '[data-testid*="page-layout.aside"]';
const PANEL_SELECTOR    = '[data-testid*="preview-panels.preview-panel"]';
const LIST_SELECTOR     = '[data-testid*="page-layout.main"]';
// "preview-panels" prefix excludes the sidebar-entry.panel-splitter which shares
// the same "panel-splitter" substring. [draggable] excludes the container sibling.
const SPLITTER_SELECTOR = '[data-testid*="preview-panels.panel-splitter"][draggable]';

const DEFAULT_WIDTH = '70vw';
const MAX_WIDTH     = '85vw';
const MIN_WIDTH_PX  = 400;   // matches Jira's own --minWidth on the panel
const DEBOUNCE_MS   = 150;

const KEY_ENABLED = 'widenerEnabled';
const KEY_WIDTH   = 'widenerWidth';

// ─── State ───────────────────────────────────────────────────────────────────

let enabled     = true;
let targetWidth = DEFAULT_WIDTH;
let debounceTimer = null;
let dragHandle  = null;
let isDragging  = false;

// ─── Style helpers ───────────────────────────────────────────────────────────

// Trims before comparing because getPropertyValue on custom properties can
// return a value with a leading space. Returns false and skips the write if
// the element already has this value at !important priority.
function setProp(el, prop, value) {
  if (el.style.getPropertyValue(prop).trim() === value.trim() &&
      el.style.getPropertyPriority(prop) === 'important') return false;
  el.style.setProperty(prop, value, 'important');
  return true;
}

function removeProp(el, prop) {
  el.style.removeProperty(prop);
}

// ─── Core style engine ───────────────────────────────────────────────────────

// writeStyles: raw style writes with no enabled-check and no side effects.
// Called directly during drag (bypassing the debounce) for smooth feedback,
// and via applyStyles for observer-triggered updates.
// Returns false and does nothing if the panel is not currently in the DOM.
function writeStyles() {
  if (!document.querySelector(PANEL_SELECTOR)) return false;

  // Jira drives panel width via the CSS custom property --n_pnlW (inline style).
  // Override it so Jira's own CSS rules use our value. Also override width/max-width
  // as a fallback in case any CSS path bypasses the custom property.
  [ASIDE_SELECTOR, PANEL_SELECTOR].forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      setProp(el, '--n_pnlW',  targetWidth);
      setProp(el, 'width',     targetWidth);
      setProp(el, 'max-width', MAX_WIDTH);
    });
  });
  // The main list area must be allowed to shrink; without min-width:0 the
  // grid/flex layout refuses to compress it and the panel overflows instead.
  document.querySelectorAll(LIST_SELECTOR).forEach(el => {
    setProp(el, 'min-width', '0');
  });
  return true;
}

function applyStyles() {
  if (!enabled) return;
  writeStyles();
  // Defer positioning until after the browser reflows from writeStyles().
  // Reading getBoundingClientRect() in the same microtask returns stale geometry.
  requestAnimationFrame(positionDragHandle);
}

function clearStyles() {
  [ASIDE_SELECTOR, PANEL_SELECTOR].forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      ['--n_pnlW', 'width', 'max-width'].forEach(p => removeProp(el, p));
    });
  });
  document.querySelectorAll(LIST_SELECTOR).forEach(el => {
    removeProp(el, 'min-width');
  });
  hideDragHandle();
}

// ─── Drag handle ─────────────────────────────────────────────────────────────
// Strategy: create a fixed-position <div> overlaid on Jira's splitter element,
// disable pointer-events on Jira's element so only ours fires, then run an
// uncapped drag that writes --n_pnlW directly on every pointermove.
//
// Why overlay instead of intercepting Jira's events: Jira's drag handler was
// registered before the content script ran, so stopImmediatePropagation cannot
// silence it. An overlay with pointer-events:none on the underlying element is
// the reliable cross-context solution.

function ensureDragHandle() {
  if (dragHandle) return dragHandle;
  dragHandle = document.createElement('div');
  dragHandle.id = 'jira-widener-handle';
  Object.assign(dragHandle.style, {
    position:   'fixed',
    width:      '8px',
    cursor:     'col-resize',
    zIndex:     '99999',
    background: 'transparent',
    display:    'none',
  });
  dragHandle.addEventListener('mouseenter', () => {
    if (!isDragging) dragHandle.style.background = 'rgba(0,82,204,0.12)';
  });
  dragHandle.addEventListener('mouseleave', () => {
    if (!isDragging) dragHandle.style.background = 'transparent';
  });
  dragHandle.addEventListener('pointerdown', onDragStart);
  document.body.appendChild(dragHandle);
  return dragHandle;
}

function positionDragHandle() {
  if (isDragging) return; // never reposition while the user is actively dragging

  const handle = ensureDragHandle();

  // Disable Jira's own splitter so it doesn't intercept pointer events.
  document.querySelectorAll(SPLITTER_SELECTOR).forEach(el => {
    setProp(el, 'pointer-events', 'none');
  });

  // The aside is display:none in this Jira version; the panel element itself
  // is what's actually rendered. Anchor to its left edge instead.
  const panel = document.querySelector(PANEL_SELECTOR);
  if (!panel) { handle.style.display = 'none'; return; }
  const rect = panel.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) { handle.style.display = 'none'; return; }

  handle.style.left    = (rect.left - 4) + 'px'; // center the 8px handle on the edge
  handle.style.top     = rect.top + 'px';
  handle.style.height  = rect.height + 'px';
  handle.style.display = '';
}

function hideDragHandle() {
  if (dragHandle) dragHandle.style.display = 'none';
  document.querySelectorAll(SPLITTER_SELECTOR).forEach(el => removeProp(el, 'pointer-events'));
}

function onDragStart(e) {
  if (!enabled) return;
  e.preventDefault();
  isDragging = true;
  dragHandle.style.background = 'rgba(0,82,204,0.2)';
  // Pointer capture keeps pointermove/pointerup firing on the handle even if
  // the mouse leaves it during a fast drag.
  dragHandle.setPointerCapture(e.pointerId);

  // The aside is display:none; measure the panel element itself.
  const panelEl = document.querySelector(PANEL_SELECTOR);
  if (!panelEl) { isDragging = false; return; }

  // Disconnect the observer for the entire drag so Jira re-renders don't
  // trigger applyStyles mid-drag (which would snap the handle back and flicker).
  observer.disconnect();

  const startX     = e.clientX;
  const startWidth = panelEl.getBoundingClientRect().width;
  const vwFactor   = 100 / window.innerWidth;
  const maxPx      = window.innerWidth * parseInt(MAX_WIDTH) / 100;

  function onMove(e) {
    // Panel is on the right, so dragging left widens it (positive delta).
    const delta = startX - e.clientX;
    const newPx = Math.max(MIN_WIDTH_PX, Math.min(maxPx, startWidth + delta));
    targetWidth = Math.round(newPx * vwFactor) + 'vw';
    writeStyles();
    dragHandle.style.left = (e.clientX - 4) + 'px'; // keep handle centred on pointer
  }

  function onUp() {
    isDragging = false;
    dragHandle.style.background = 'transparent';
    chrome.storage.local.set({ [KEY_WIDTH]: targetWidth });
    dragHandle.removeEventListener('pointermove', onMove);
    dragHandle.removeEventListener('pointerup', onUp);
    // Reconnect observer then snap handle to the aside's final left edge.
    observer.observe(document.body, { childList: true, subtree: true });
    positionDragHandle();
  }

  dragHandle.addEventListener('pointermove', onMove);
  dragHandle.addEventListener('pointerup', onUp);
}

// ─── MutationObserver ────────────────────────────────────────────────────────
// Observes childList+subtree (node additions/removals) only. Our inline-style
// writes trigger attribute mutations, not childList, so the observer never
// fires because of its own side effects - no loop is possible.
// Debounced to absorb Jira's burst re-renders.

const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(applyStyles, DEBOUNCE_MS);
});

observer.observe(document.body, { childList: true, subtree: true });

// ─── Message handler ─────────────────────────────────────────────────────────
// 'toggle'     - flip enabled (sent by background.js on keyboard shortcut)
// 'setEnabled' - set enabled to explicit value (sent by popup toggle switch)
// 'setWidth'   - update panel width (sent by popup slider)
// 'getState'   - return current state (for popup initialisation)

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {
    case 'toggle':
      enabled = !enabled;
      chrome.storage.local.set({ [KEY_ENABLED]: enabled });
      if (enabled) applyStyles(); else clearStyles();
      sendResponse({ enabled, width: targetWidth });
      break;

    case 'setEnabled':
      enabled = msg.enabled;
      chrome.storage.local.set({ [KEY_ENABLED]: enabled });
      if (enabled) applyStyles(); else clearStyles();
      sendResponse({ enabled, width: targetWidth });
      break;

    case 'setWidth':
      targetWidth = msg.width;
      chrome.storage.local.set({ [KEY_WIDTH]: targetWidth });
      if (enabled) applyStyles();
      sendResponse({ enabled, width: targetWidth });
      break;

    case 'getState':
      sendResponse({ enabled, width: targetWidth });
      break;
  }
  return true;
});

// ─── Init ────────────────────────────────────────────────────────────────────

chrome.storage.local.get([KEY_ENABLED, KEY_WIDTH], (result) => {
  if (result[KEY_ENABLED] !== undefined) enabled = result[KEY_ENABLED];
  if (result[KEY_WIDTH])                 targetWidth = result[KEY_WIDTH];
  if (enabled) applyStyles();
});
