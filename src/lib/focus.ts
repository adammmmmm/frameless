import { clearSession, getSession, setSession, type FocusSession } from "./session.js";
import { isRestrictedUrl } from "./urls.js";

export type ToggleResult =
  | { ok: true; action: "focused" | "restored"; degraded?: boolean }
  | { ok: false; reason: string };

async function getTab(tabId: number): Promise<chrome.tabs.Tab> {
  return chrome.tabs.get(tabId);
}

async function getWindow(windowId: number): Promise<chrome.windows.Window> {
  return chrome.windows.get(windowId);
}

async function windowStillExists(windowId: number): Promise<boolean> {
  try {
    await getWindow(windowId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Prefer moving the live tab into a popup (preserves document state).
 * Fall back to rehosting tab.url only when the move path fails.
 */
export async function focusTab(tab: chrome.tabs.Tab): Promise<ToggleResult> {
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
      focused: true,
    });
    if (focused.id == null) {
      return { ok: false, reason: "Popup window was not created." };
    }
    const session: FocusSession = {
      tabId,
      originWindowId,
      focusedWindowId: focused.id,
      mode: "focused",
    };
    await setSession(session);
    return { ok: true, action: "focused", degraded: false };
  } catch (moveError) {
    // Degraded path: rehost URL (state loss). Last resort only.
    const url = tab.url;
    if (!url || isRestrictedUrl(url)) {
      return {
        ok: false,
        reason:
          moveError instanceof Error
            ? moveError.message
            : "Could not move tab into a popup.",
      };
    }
    try {
      const focused = await chrome.windows.create({
        url,
        type: "popup",
        focused: true,
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
        mode: "focused",
      });
      return { ok: true, action: "focused", degraded: true };
    } catch (degradedError) {
      const msg =
        degradedError instanceof Error
          ? degradedError.message
          : "Focus failed.";
      return { ok: false, reason: msg };
    }
  }
}

async function pickRestoreWindowId(originWindowId: number): Promise<number | null> {
  if (await windowStillExists(originWindowId)) {
    const origin = await getWindow(originWindowId);
    if (origin.type === "normal" || origin.type === undefined) {
      return originWindowId;
    }
  }
  const normals = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const first = normals[0];
  return first?.id ?? null;
}

/**
 * Restore a focused tab to a normal window (prefer origin).
 */
export async function restoreTab(tab: chrome.tabs.Tab): Promise<ToggleResult> {
  if (tab.id == null) {
    return { ok: false, reason: "Tab is missing an id." };
  }
  const tabId = tab.id;
  const session = await getSession(tabId);

  const originWindowId = session?.originWindowId;
  const targetId =
    originWindowId != null
      ? await pickRestoreWindowId(originWindowId)
      : await pickRestoreWindowId(-1);

  try {
    if (targetId != null) {
      await chrome.tabs.move(tabId, { windowId: targetId, index: -1 });
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(targetId, { focused: true });
      await clearSession(tabId);
      return { ok: true, action: "restored" };
    }

    // No normal window left: create one by moving tab into a new normal window.
    const created = await chrome.windows.create({
      tabId,
      type: "normal",
      focused: true,
    });
    if (created.id == null) {
      return { ok: false, reason: "Could not create a normal window." };
    }
    await clearSession(tabId);
    return { ok: true, action: "restored" };
  } catch (error) {
    // Degraded restore: open URL in normal window and drop popup tab.
    const url = tab.url;
    if (!url || isRestrictedUrl(url)) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "Restore failed.",
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
        reason:
          degradedError instanceof Error
            ? degradedError.message
            : "Restore failed.",
      };
    }
  }
}

/**
 * Toggle focus for a tab given the window it currently lives in.
 */
export async function toggleTabFocus(
  tab: chrome.tabs.Tab,
  windowType: string | undefined,
): Promise<ToggleResult> {
  if (tab.id == null) {
    return { ok: false, reason: "No active tab." };
  }

  const session = await getSession(tab.id);
  const inPopup = windowType === "popup" || windowType === "panel";

  // Prefer session record; fall back to window type.
  if (session || inPopup) {
    return restoreTab(tab);
  }
  return focusTab(tab);
}

export async function setFocusedBadge(tabId: number, focused: boolean): Promise<void> {
  try {
    await chrome.action.setBadgeText({
      tabId,
      text: focused ? "ON" : "",
    });
    if (focused) {
      await chrome.action.setBadgeBackgroundColor({
        tabId,
        color: "#4f46e5",
      });
    }
  } catch {
    // Badge is best-effort (tab may have closed).
  }
}
