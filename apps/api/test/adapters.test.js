import assert from "node:assert/strict";
import test from "node:test";
import { toDiscordPayload } from "../src/adapters/discord.js";
import { toSlackPayload } from "../src/adapters/slack.js";

const message = {
  title: "Deploy finished",
  message: "Production deployment completed.",
  level: "info",
  fields: [{ name: "Commit", value: "abc123" }],
  url: "https://example.com/deploy/1",
  metadata: {},
  mentions: [],
  attachments: []
};

test("discord adapter creates embed payload", () => {
  const payload = toDiscordPayload(message);
  assert.equal(payload.embeds[0].title, "Deploy finished");
  assert.equal(payload.embeds[0].description, "Production deployment completed.");
  assert.equal(payload.embeds[0].fields[0].name, "Commit");
});

test("slack adapter creates block payload", () => {
  const payload = toSlackPayload(message);
  assert.equal(payload.text, "Deploy finished - Production deployment completed.");
  assert.equal(payload.blocks[0].type, "header");
  assert.equal(payload.blocks[1].type, "section");
});
