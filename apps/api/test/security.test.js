import assert from "node:assert/strict";
import test from "node:test";
import { assertAllowedDestinationUrl, maskSecret, sha256Hex, timingSafeEqual } from "../src/lib/security.js";

test("hash comparison succeeds for same API key", async () => {
  const hash = await sha256Hex("secret");
  assert.equal(timingSafeEqual(hash, await sha256Hex("secret")), true);
  assert.equal(timingSafeEqual(hash, await sha256Hex("other")), false);
});

test("maskSecret hides most characters", () => {
  assert.equal(maskSecret("abcdef123456"), "********3456");
});

test("destination allowlist accepts Discord and rejects generic URL", () => {
  assert.equal(assertAllowedDestinationUrl("discord", "https://discord.com/api/webhooks/1/abc"), true);
  assert.throws(() => assertAllowedDestinationUrl("discord", "https://example.com/hook"));
});
