import assert from "node:assert/strict";
import test from "node:test";
import { buildRestPath } from "../src/lib/rest-query.js";

test("buildRestPath encodes filter values", () => {
  const path = buildRestPath("projects", {
    select: "id,name",
    filters: [{ column: "organization_id", operator: "eq", value: "org');drop table projects;--" }],
    order: { column: "created_at", direction: "desc" },
    limit: 10
  });

  assert.equal(
    path,
    "projects?select=id%2Cname&organization_id=eq.org%27%29%3Bdrop+table+projects%3B--&order=created_at.desc&limit=10"
  );
});

test("buildRestPath rejects unknown tables, columns, and operators", () => {
  assert.throws(() => buildRestPath("projects;drop table users", { select: "id" }), /Invalid table/);
  assert.throws(
    () => buildRestPath("projects", { filters: [{ column: "name);drop", operator: "eq", value: "x" }] }),
    /Invalid column/
  );
  assert.throws(
    () => buildRestPath("projects", { filters: [{ column: "name", operator: "or", value: "x" }] }),
    /Invalid filter operator/
  );
});

test("buildRestPath rejects unsafe select clauses", () => {
  assert.throws(() => buildRestPath("projects", { select: "id,name;drop table projects" }), /Invalid select/);
});
