import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseClient } from "../src/lib/db.js";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
};

test("Supabase REST client reports non-JSON success responses clearly", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    new Response("<!DOCTYPE html><title>Not JSON</title>", {
      status: 200,
      headers: { "content-type": "text/html" }
    });

  const client = createSupabaseClient(env);

  await assert.rejects(
    () => client.list("projects"),
    /Supabase REST request returned invalid JSON \(200, text\/html\)\. Body starts with: <!DOCTYPE html>/
  );
});
