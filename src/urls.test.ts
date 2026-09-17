import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRestrictedUrl } from "./lib/urls.js";

describe("isRestrictedUrl", () => {
  it("rejects empty and missing", () => {
    assert.equal(isRestrictedUrl(undefined), true);
    assert.equal(isRestrictedUrl(null), true);
    assert.equal(isRestrictedUrl(""), true);
    assert.equal(isRestrictedUrl("   "), true);
  });

  it("rejects browser and store surfaces", () => {
    assert.equal(isRestrictedUrl("chrome://extensions"), true);
    assert.equal(isRestrictedUrl("chrome-extension://abc/page.html"), true);
    assert.equal(isRestrictedUrl("edge://settings"), true);
    assert.equal(isRestrictedUrl("about:blank"), true);
    assert.equal(
      isRestrictedUrl("https://chrome.google.com/webstore/detail/x"),
      true,
    );
    assert.equal(
      isRestrictedUrl("https://chromewebstore.google.com/detail/x"),
      true,
    );
  });

  it("allows normal web pages", () => {
    assert.equal(isRestrictedUrl("https://example.com"), false);
    assert.equal(isRestrictedUrl("http://localhost:3000/app"), false);
    assert.equal(isRestrictedUrl("https://github.com/adammmmmm/frameless"), false);
  });
});
