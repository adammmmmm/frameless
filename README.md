# TabFocus

Toggle the current tab into a **focused popup window** (hide tabs, omnibox, and bookmarks) and restore it to a normal window. Narrow on purpose.

![Example screenshot](./src/images/examples/example.png)

## Behavior (v3)

| Action | What happens |
| --- | --- |
| **Focus** | Prefer `windows.create({ tabId, type: "popup" })` so the **same tab** moves into a popup (document state preserved when Chrome allows it). |
| **Restore** | Move the tab back to its **origin normal window** when that window still exists; otherwise the first normal window, otherwise a new normal window. |
| **Degraded path** | If the move fails, fall back to opening `tab.url` in a new popup/normal window and closing the old tab. **In-page state may be lost.** Logged to the service worker console. |
| **Restricted URLs** | No-op on `chrome://`, Web Store, `edge://`, `about:`, extension pages, etc. |

Session metadata (origin window, focused window, tab id) lives in `chrome.storage.session`.

## Usage

- Click the extension icon  
- Right-click → **Toggle TabFocus**  
- Keyboard: **Ctrl+Shift+F** (Windows/Linux) / **⌘⇧F** (macOS) — remappable in `chrome://extensions/shortcuts`  

## Install (unpacked zip — no npm)

1. Download **`tabfocus-v*-unpacked.zip`** from [Releases](https://github.com/adammmmmm/tabfocus/releases)
2. Extract the zip (you get a `tabfocus/` folder)
3. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select the **`tabfocus`** folder

## Install (from source)

1. `git clone https://github.com/adammmmmm/tabfocus.git && cd tabfocus`
2. `npm install && npm run build` (generates `background.js`)
3. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select this folder

```bash
npm run pack   # writes dist/tabfocus-v*-unpacked.zip
```

## Develop

```bash
npm install
npm run build      # bundle service worker + tests
npm run typecheck  # tsc --noEmit
npm test           # pure unit tests (URL policy)
npm run verify     # typecheck + test
```

Source is TypeScript under `src/`. The MV3 service worker entry is `background.js` (esbuild bundle).

## Permissions

| Permission | Why |
| --- | --- |
| `contextMenus` | Toggle from the page context menu |
| `storage` | Session map for origin window / focus state |
| `tabs` | Read tab URL/window id, move tabs, update focus reliably |

No host permissions, no tracking, no network.

## Limits (honest)

- Chrome does not expose a first-class “hide browser chrome on this tab” API; TabFocus uses **popup windows**.
- Multi-window restore prefers the **recorded origin window**, not “whatever is first.”
- Fullscreen, PiP, and site-injected UI hiding are **out of scope**.
- Degraded URL rehost can drop SPA/form state; prefer the move path (default).

## License

[MIT](./LICENSE)
