export type FocusSession = {
  tabId: number;
  originWindowId: number;
  focusedWindowId: number;
  mode: "focused";
};

const SESSION_KEY = "tabfocus.sessions.v1";

type SessionMap = Record<string, FocusSession>;

function keyFor(tabId: number): string {
  return String(tabId);
}

async function readAll(): Promise<SessionMap> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  const value = result[SESSION_KEY];
  if (!value || typeof value !== "object") return {};
  return value as SessionMap;
}

async function writeAll(map: SessionMap): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: map });
}

export async function getSession(tabId: number): Promise<FocusSession | null> {
  const map = await readAll();
  return map[keyFor(tabId)] ?? null;
}

export async function setSession(session: FocusSession): Promise<void> {
  const map = await readAll();
  map[keyFor(session.tabId)] = session;
  await writeAll(map);
}

export async function clearSession(tabId: number): Promise<void> {
  const map = await readAll();
  delete map[keyFor(tabId)];
  await writeAll(map);
}

/** Drop sessions whose tab no longer exists. */
export async function pruneSessions(existingTabIds: Set<number>): Promise<void> {
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
