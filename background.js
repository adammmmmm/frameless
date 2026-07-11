// src/lib/session.ts
var SESSION_KEY = "tabfocus.sessions.v1";
function keyFor(tabId) {
  return String(tabId);
}
async function readAll() {
  const result = await chrome.storage.session.get(SESSION_KEY);
  const value = result[SESSION_KEY];
  if (!value || typeof value !== "object") return {};
  return value;
}
async function writeAll(map) {
  await chrome.storage.session.set({ [SESSION_KEY]: map });
}
async function getSession(tabId) {
  const map = await readAll();
  return map[keyFor(tabId)] ?? null;
}
async function setSession(session) {
  const map = await readAll();
  map[keyFor(session.tabId)] = session;
  await writeAll(map);
}
async function clearSession(tabId) {
  const map = await readAll();
  delete map[keyFor(tabId)];
  await writeAll(map);
}
async function pruneSessions(existingTabIds) {
  const map = await readAll();
  let changed = false;
  for (const id of Object.keys(map)) {
    if (!existingTabIds.has(Number(id))) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) await writeAll(map);
}

// src/lib/urls.ts
var RESTRICTED_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "chrome-search://",
  "chrome-untrusted://",
  "devtools://",
  "edge://",
  "about:",
  "view-source:",
  "https://chrome.google.com/webstore",
  "https://chromewebstore.google.com/"
];
function isRestrictedUrl(url) {
  if (!url) return true;
  const value = url.trim();
  if (!value) return true;
  const lower = value.toLowerCase();
  return RESTRICTED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

// src/lib/focus.ts
async function getWindow(windowId) {
  return chrome.windows.get(windowId);
}
async function windowStillExists(windowId) {
  try {
    await getWindow(windowId);
    return true;
  } catch {
    return false;
  }
}
async function focusTab(tab) {
  if (tab.id == null || tab.windowId == null) {
    return { ok: false, reason: "Tab is missing an id." };
  }
  if (isRestrictedUrl(tab.url)) {
    return { ok: false, reason: "This page cannot be focused (restricted URL)." };
  }
  const tabId = tab.id;
  const originWindowId = tab.windowId;
  try {
    const focused = await chrome.windows.create({
      tabId,
      type: "popup",
      focused: true
    });
    if (focused.id == null) {
      return { ok: false, reason: "Popup window was not created." };
    }
    const session = {
      tabId,
      originWindowId,
      focusedWindowId: focused.id,
      mode: "focused"
    };
    await setSession(session);
    return { ok: true, action: "focused", degraded: false };
  } catch (moveError) {
    const url = tab.url;
    if (!url || isRestrictedUrl(url)) {
      return {
        ok: false,
        reason: moveError instanceof Error ? moveError.message : "Could not move tab into a popup."
      };
    }
    try {
      const focused = await chrome.windows.create({
        url,
        type: "popup",
        focused: true
      });
      if (focused.id == null || !focused.tabs?.[0]?.id) {
        return { ok: false, reason: "Degraded popup was not created." };
      }
      await chrome.tabs.remove(tabId);
      const newTabId = focused.tabs[0].id;
      await setSession({
        tabId: newTabId,
        originWindowId,
        focusedWindowId: focused.id,
        mode: "focused"
      });
      return { ok: true, action: "focused", degraded: true };
    } catch (degradedError) {
      const msg = degradedError instanceof Error ? degradedError.message : "Focus failed.";
      return { ok: false, reason: msg };
    }
  }
}
async function pickRestoreWindowId(originWindowId) {
  if (await windowStillExists(originWindowId)) {
    const origin = await getWindow(originWindowId);
    if (origin.type === "normal" || origin.type === void 0) {
      return originWindowId;
    }
  }
  const normals = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const first = normals[0];
  return first?.id ?? null;
}
async function restoreTab(tab) {
  if (tab.id == null) {
    return { ok: false, reason: "Tab is missing an id." };
  }
  const tabId = tab.id;
  const session = await getSession(tabId);
  const originWindowId = session?.originWindowId;
  const targetId = originWindowId != null ? await pickRestoreWindowId(originWindowId) : await pickRestoreWindowId(-1);
  try {
    if (targetId != null) {
      await chrome.tabs.move(tabId, { windowId: targetId, index: -1 });
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(targetId, { focused: true });
      await clearSession(tabId);
      return { ok: true, action: "restored" };
    }
    const created = await chrome.windows.create({
      tabId,
      type: "normal",
      focused: true
    });
    if (created.id == null) {
      return { ok: false, reason: "Could not create a normal window." };
    }
    await clearSession(tabId);
    return { ok: true, action: "restored" };
  } catch (error) {
    const url = tab.url;
    if (!url || isRestrictedUrl(url)) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "Restore failed."
      };
    }
    try {
      await chrome.windows.create({ url, type: "normal", focused: true });
      await chrome.tabs.remove(tabId);
      await clearSession(tabId);
      return { ok: true, action: "restored", degraded: true };
    } catch (degradedError) {
      return {
        ok: false,
        reason: degradedError instanceof Error ? degradedError.message : "Restore failed."
      };
    }
  }
}
async function toggleTabFocus(tab, windowType) {
  if (tab.id == null) {
    return { ok: false, reason: "No active tab." };
  }
  const session = await getSession(tab.id);
  const inPopup = windowType === "popup" || windowType === "panel";
  if (session || inPopup) {
    return restoreTab(tab);
  }
  return focusTab(tab);
}
async function setFocusedBadge(tabId, focused) {
  try {
    await chrome.action.setBadgeText({
      tabId,
      text: focused ? "ON" : ""
    });
    if (focused) {
      await chrome.action.setBadgeBackgroundColor({
        tabId,
        color: "#4f46e5"
      });
    }
  } catch {
  }
}

// src/background.ts
var MENU_ID = "tabfocus-toggle";
function logError(context, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[TabFocus] ${context}: ${message}`);
}
async function ensureContextMenu() {
  await chrome.contextMenus.removeAll();
  await chrome.contextMenus.create({
    id: MENU_ID,
    title: "Toggle TabFocus",
    contexts: ["all"]
  });
}
async function resolveActiveTab(tabFromEvent) {
  if (tabFromEvent?.id != null) return tabFromEvent;
  const [active] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return active ?? null;
}
async function handleToggle(tabFromEvent) {
  try {
    const tab = await resolveActiveTab(tabFromEvent);
    if (!tab?.id) {
      console.warn("[TabFocus] No tab to toggle.");
      return;
    }
    if (isRestrictedUrl(tab.url)) {
      console.warn("[TabFocus] Restricted URL; no-op.");
      return;
    }
    let windowType;
    if (tab.windowId != null) {
      try {
        const win = await chrome.windows.get(tab.windowId);
        windowType = win.type;
      } catch {
        windowType = void 0;
      }
    }
    const result = await toggleTabFocus(tab, windowType);
    if (!result.ok) {
      console.warn(`[TabFocus] ${result.reason}`);
      return;
    }
    const [active] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    if (active?.id != null) {
      await setFocusedBadge(active.id, result.action === "focused");
    }
    if (result.degraded) {
      console.warn(
        "[TabFocus] Used degraded URL rehost path; in-page state may have been lost."
      );
    }
  } catch (error) {
    logError("toggle", error);
  }
}
chrome.runtime.onInstalled.addListener(() => {
  void ensureContextMenu();
});
chrome.runtime.onStartup.addListener(() => {
  void ensureContextMenu();
});
chrome.action.onClicked.addListener((tab) => {
  void handleToggle(tab);
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  void handleToggle(tab);
});
chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-tabfocus") return;
  void handleToggle();
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void clearSession(tabId);
});
chrome.tabs.onActivated.addListener((activeInfo) => {
  void (async () => {
    const session = await getSession(activeInfo.tabId);
    await setFocusedBadge(activeInfo.tabId, session != null);
  })();
});
void (async () => {
  try {
    const tabs = await chrome.tabs.query({});
    const ids = new Set(
      tabs.map((t) => t.id).filter((id) => id != null)
    );
    await pruneSessions(ids);
  } catch (error) {
    logError("prune", error);
  }
})();
//# sourceMappingURL=background.js.map
