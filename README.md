# Jira Preview Panel Widener

A Chrome extension that forces the Jira Cloud list-view preview panel wider than
its built-in ~50% cap and keeps it wide across re-renders and SPA navigations.

Works on all Jira Cloud instances (`*.atlassian.net`). No setup required.

## Usage

| Action | How |
|--------|-----|
| Toggle on/off | `Alt+Shift+W` |
| Change width | Click the toolbar icon and use the slider (50vw to 85vw) |
| Drag to resize | Hover over the panel's left edge - a resize handle appears |
| Change the shortcut | `chrome://extensions/shortcuts` |

The chosen width and enabled state persist across page loads and browser restarts.

## Defaults

| Setting | Default |
|---------|---------|
| Panel width | 70vw |
| Hard max | 85vw |
| Keyboard shortcut | Alt+Shift+W |

To change defaults permanently, edit the constants at the top of `content.js`.

## Installing unpacked (development)

1. Go to `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select the `jira-preview-widener` folder

After editing any file, click the reload icon on the extension card, then
hard-refresh Jira (`Ctrl+Shift+R`).

## Troubleshooting

**Panel does not widen**
- Open DevTools console (`F12`) and check for errors from the extension.
- Confirm the extension is enabled and you are on a `*.atlassian.net` URL.

**Width reverts after clicking a row**
- The MutationObserver should prevent this. If it happens, reload the extension
  and hard-refresh Jira. Check the console for errors.

**Keyboard shortcut does not work**
- Go to `chrome://extensions/shortcuts` and confirm `Alt+Shift+W` is assigned.
- Some OS shortcuts intercept it first; reassign if needed.

**Drag handle not visible**
- The handle only appears when the panel is open and the extension is enabled.
- Try toggling off and on with `Alt+Shift+W`.

## Privacy

This extension stores only two values locally (enabled state and panel width)
using `chrome.storage.local`. No data is transmitted anywhere.
