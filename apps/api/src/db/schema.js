import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const hookgateRole = pgEnum("hookgate_role", ["owner", "admin", "developer", "viewer"]);
export const webhookServiceType = pgEnum("webhook_service_type", ["discord", "slack"]);
export const webhookLogStatus = pgEnum("webhook_log_status", [
  "received",
  "queued",
  "sending",
  "succeeded",
  "failed",
  "retrying",
  "cancelled",
  "rate_limited"
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  isEnabled: boolean("is_enabled").notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const organizationMembers = pgTable("organization_members", {
  organizationId: uuid("organization_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: hookgateRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  isEnabled: boolean("is_enabled").notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull(),
  projectId: uuid("project_id").notNull(),
  name: text("name").notNull(),
  serviceType: webhookServiceType("service_type").notNull(),
  webhookUrlCiphertext: text("webhook_url_ciphertext").notNull(),
  isEnabled: boolean("is_enabled").notNull(),
  timeoutSeconds: integer("timeout_seconds").notNull(),
  retryEnabled: boolean("retry_enabled").notNull(),
  allowQueryApiKey: boolean("allow_query_api_key").notNull(),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull(),
  logPolicy: text("log_policy").notNull(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const webhookApiKeys = pgTable(
  "webhook_api_keys",
  {
    id: uuid("id").primaryKey(),
    endpointId: uuid("endpoint_id").notNull(),
    apiKeyHash: text("api_key_hash").notNull(),
    isActive: boolean("is_active").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastUsedIp: text("last_used_ip"),
    useCount: integer("use_count").notNull(),
    createdBy: uuid("created_by"),
    revokedBy: uuid("revoked_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => ({
    activeEndpointIdx: uniqueIndex("webhook_api_keys_one_active_per_endpoint").on(table.endpointId),
    hashIdx: index("webhook_api_keys_hash_idx").on(table.apiKeyHash)
  })
);

export const webhookLogs = pgTable("webhook_logs", {
  id: uuid("id").primaryKey(),
  requestId: text("request_id").notNull(),
  organizationId: uuid("organization_id").notNull(),
  projectId: uuid("project_id").notNull(),
  endpointId: uuid("endpoint_id").notNull(),
  status: webhookLogStatus("status").notNull(),
  serviceType: webhookServiceType("service_type").notNull(),
  httpStatus: integer("http_status"),
  retryCount: integer("retry_count").notNull(),
  sourceIp: text("source_ip"),
  requestSummary: jsonb("request_summary").notNull(),
  requestPayload: jsonb("request_payload"),
  responseSummary: jsonb("response_summary").notNull(),
  errorMessage: text("error_message"),
  idempotencyKey: text("idempotency_key"),
  queuedAt: timestamp("queued_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id"),
  actorUserId: uuid("actor_user_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  beforeSummary: jsonb("before_summary").notNull(),
  afterSummary: jsonb("after_summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const schema = {
  organizations,
  organizationMembers,
  projects,
  webhookEndpoints,
  webhookApiKeys,
  webhookLogs,
  auditLogs
};

export const restTables = {
  organizations: {
    columns: ["id", "name", "slug", "is_enabled", "created_by", "created_at", "updated_at"]
  },
  organization_members: {
    columns: ["organization_id", "user_id", "role", "created_at"]
  },
  projects: {
    columns: ["id", "organization_id", "name", "slug", "is_enabled", "created_by", "created_at", "updated_at"]
  },
  webhook_endpoints: {
    columns: [
      "id",
      "organization_id",
      "project_id",
      "name",
      "service_type",
      "webhook_url_ciphertext",
      "is_enabled",
      "timeout_seconds",
      "retry_enabled",
      "allow_query_api_key",
      "rate_limit_per_minute",
      "log_policy",
      "created_by",
      "updated_by",
      "created_at",
      "updated_at"
    ]
  },
  webhook_api_keys: {
    columns: [
      "id",
      "endpoint_id",
      "api_key_hash",
      "is_active",
      "last_used_at",
      "last_used_ip",
      "use_count",
      "created_by",
      "revoked_by",
      "created_at",
      "revoked_at"
    ]
  },
  webhook_logs: {
    columns: [
      "id",
      "request_id",
      "organization_id",
      "project_id",
      "endpoint_id",
      "status",
      "service_type",
      "http_status",
      "retry_count",
      "source_ip",
      "request_summary",
      "request_payload",
      "response_summary",
      "error_message",
      "idempotency_key",
      "queued_at",
      "sent_at",
      "completed_at",
      "duration_ms",
      "created_at"
    ]
  },
  audit_logs: {
    columns: [
      "id",
      "organization_id",
      "actor_user_id",
      "action",
      "target_type",
      "target_id",
      "ip_address",
      "user_agent",
      "before_summary",
      "after_summary",
      "created_at"
    ]
  }
};
