import { toggleFrameless, setFocusedBadge } from "./lib/focus.js";
import { clearSession, getSession, pruneSessions } from "./lib/session.js";
import { isRestrictedUrl } from "./lib/urls.js";

const MENU_ID = "frameless-toggle";

function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Frameless] ${context}: ${message}`);
}

async function ensureContextMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();
  await chrome.contextMenus.create({
    id: MENU_ID,
    title: "Toggle Frameless",
    contexts: ["all"],
  });
}

async function resolveActiveTab(
  tabFromEvent?: chrome.tabs.Tab,
): Promise<chrome.tabs.Tab | null> {
  if (tabFromEvent?.id != null) return tabFromEvent;
  const [active] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return active ?? null;
}

async function handleToggle(tabFromEvent?: chrome.tabs.Tab): Promise<void> {
  try {
    const tab = await resolveActiveTab(tabFromEvent);
    if (!tab?.id) {
      console.warn("[Frameless] No tab to toggle.");
      return;
    }

    if (isRestrictedUrl(tab.url)) {
      console.warn("[Frameless] Restricted URL; no-op.");
      return;
    }

    let windowType: string | undefined;
    if (tab.windowId != null) {
      try {
        const win = await chrome.windows.get(tab.windowId);
        windowType = win.type;
      } catch {
        windowType = undefined;
      }
    }

    const result = await toggleFrameless(tab, windowType);
    if (!result.ok) {
      console.warn(`[Frameless] ${result.reason}`);
      return;
    }

    // Badge on the surviving tab after focus/restore.
    const [active] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (active?.id != null) {
      await setFocusedBadge(active.id, result.action === "focused");
    }
    if (result.degraded) {
      console.warn(
        "[Frameless] Used degraded URL rehost path; in-page state may have been lost.",
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
  if (command !== "toggle-frameless") return;
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

// Periodic hygiene if the service worker wakes up.
void (async () => {
  try {
    const tabs = await chrome.tabs.query({});
    const ids = new Set(
      tabs.map((t) => t.id).filter((id): id is number => id != null),
    );
    await pruneSessions(ids);
  } catch (error) {
    logError("prune", error);
  }
})();
