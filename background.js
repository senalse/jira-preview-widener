// Receives the keyboard shortcut command and forwards it to the active tab's
// content script. All toggle logic lives in content.js; this is just a relay.
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-widener') return;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { action: 'toggle' }, () => {
      // Suppress "no receiving end" error when the shortcut fires on a non-Jira page.
      void chrome.runtime.lastError;
    });
  });
});
