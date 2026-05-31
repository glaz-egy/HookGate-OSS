import assert from "node:assert/strict";
import test from "node:test";
import { validateIncomingPayload } from "../src/lib/validation.js";

test("message is required", () => {
  const result = validateIncomingPayload({});
  assert.equal(result.ok, false);
  assert.equal(result.message, "message, content, or embeds is required.");
});

test("valid payload is normalized", () => {
  const result = validateIncomingPayload({
    message: " hello ",
    fields: [{ name: "a", value: "b" }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.message, "hello");
  assert.equal(result.value.level, "info");
});

test("too many fields fails validation", () => {
  const result = validateIncomingPayload({
    message: "hello",
    fields: Array.from({ length: 26 }, (_, index) => ({ name: String(index), value: "x" }))
  });
  assert.equal(result.ok, false);
});

test("discord content payload is normalized", () => {
  const result = validateIncomingPayload({
    content: "plain Discord text"
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.message, "plain Discord text");
  assert.equal(result.value.content, "plain Discord text");
});

test("discord embeds payload is normalized", () => {
  const result = validateIncomingPayload({
    embeds: [{ title: "Alert", description: "Something happened" }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.message, "Something happened");
  assert.equal(result.value.embeds[0].title, "Alert");
});
