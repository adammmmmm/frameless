# Changelog

## [3.0.0] - 2026-07-11

### Changed

- Prefer moving the live tab into a popup (`tabId` + `type: "popup"`) to preserve in-page state.
- Restore to the **origin** normal window when possible (not always `windows[0]`).
- TypeScript source + esbuild bundle for the MV3 service worker.
- Context menu lifecycle: `removeAll` then create on install/startup.
- Session state in `chrome.storage.session`; badge **ON** while focused.
- Keyboard command `Ctrl+Shift+F` / `⌘⇧F`.
- Restricted URL no-op list; `lastError`-safe async Chrome calls.
- Degraded URL-rehost path only when move fails (logged).

### Removed

- Manifest V2-era assumptions; `activeTab`-only mental model replaced with explicit storage + window APIs.

## [2.0.0] - 2022-03-11

- Port to Manifest V3.

## [1.0.0] - 2019-07-22

- Initial release (popup via URL rehost).
