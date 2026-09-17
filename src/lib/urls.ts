/** URLs Chrome will not rehost or focus into a popup usefully. */
const RESTRICTED_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "chrome-search://",
  "chrome-untrusted://",
  "devtools://",
  "edge://",
  "about:",
  "view-source:",
  "https://chrome.google.com/webstore",
  "https://chromewebstore.google.com/",
] as const;

/**
 * Return true when Frameless must no-op for this URL.
 */
export function isRestrictedUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  const value = url.trim();
  if (!value) return true;
  const lower = value.toLowerCase();
  return RESTRICTED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}
