import { restTables } from "../db/schema.js";

const OPERATORS = new Set(["eq", "gte", "is"]);
const DIRECTIONS = new Set(["asc", "desc"]);
const SELECT_PATTERN = /^[a-zA-Z0-9_(),*]+$/;

export function buildRestPath(table, options = {}) {
  assertTable(table);
  const params = new URLSearchParams();

  if (options.select) {
    assertSelect(options.select);
    params.set("select", options.select);
  }

  for (const filter of options.filters || []) {
    assertColumn(table, filter.column);
    assertOperator(filter.operator);
    params.append(filter.column, `${filter.operator}.${formatFilterValue(filter.value)}`);
  }

  if (options.order) {
    assertColumn(table, options.order.column);
    const direction = options.order.direction || "asc";
    if (!DIRECTIONS.has(direction)) {
      throw new Error("Invalid order direction.");
    }
    params.set("order", `${options.order.column}.${direction}`);
  }

  if (options.limit !== undefined) {
    const limit = Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new Error("Invalid query limit.");
    }
    params.set("limit", String(limit));
  }

  const query = params.toString();
  return query ? `${table}?${query}` : table;
}

export function assertTable(table) {
  if (!Object.hasOwn(restTables, table)) {
    throw new Error("Invalid table.");
  }
}

export function assertColumn(table, column) {
  assertTable(table);
  if (!restTables[table].columns.includes(column)) {
    throw new Error(`Invalid column '${column}' for table '${table}'.`);
  }
}

function assertOperator(operator) {
  if (!OPERATORS.has(operator)) {
    throw new Error("Invalid filter operator.");
  }
}

function assertSelect(select) {
  if (typeof select !== "string" || select.length > 600 || !SELECT_PATTERN.test(select)) {
    throw new Error("Invalid select clause.");
  }
}

function formatFilterValue(value) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  return String(value);
}
