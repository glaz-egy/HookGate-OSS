import { buildRestPath, assertTable } from "./rest-query.js";

export function createSupabaseClient(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/$/, "");
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json"
  };

  async function request(path, init = {}) {
    const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers || {})
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase request failed: ${response.status} ${text}`);
    }

    if (response.status === 204) {
      return null;
    }
    return response.json();
  }

  return {
    request,

    async getUser(token) {
      const response = await fetch(`${baseUrl}/auth/v1/user`, {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        return null;
      }
      return response.json();
    },

    async list(table, options = {}) {
      return request(buildRestPath(table, options));
    },

    async insert(table, values) {
      assertTable(table);
      const rows = await request(table, {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(values)
      });
      return Array.isArray(rows) ? rows[0] || null : rows;
    },

    async patch(table, id, values) {
      const rows = await request(buildRestPath(table, {
        filters: [{ column: "id", operator: "eq", value: id }]
      }), {
        method: "PATCH",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(values)
      });
      return Array.isArray(rows) ? rows[0] || null : rows;
    },

    async remove(table, id) {
      return request(buildRestPath(table, {
        filters: [{ column: "id", operator: "eq", value: id }]
      }), {
        method: "DELETE",
        headers: { prefer: "return=minimal" }
      });
    },

    async getOrganizationRole(organizationId, userId) {
      const rows = await this.list("organization_members", {
        select: "role",
        filters: [
          { column: "organization_id", operator: "eq", value: organizationId },
          { column: "user_id", operator: "eq", value: userId }
        ],
        limit: 1
      });
      return rows[0]?.role || null;
    },

    async createAuditLog(entry) {
      return this.insert("audit_logs", entry);
    },

    async getProject(projectId) {
      const rows = await this.list("projects", {
        select: "id,organization_id,name,slug,is_enabled",
        filters: [{ column: "id", operator: "eq", value: projectId }],
        limit: 1
      });
      return rows[0] || null;
    },

    async getEndpoint(endpointId) {
      const rows = await this.list("webhook_endpoints", {
        select: "id,organization_id,project_id,name,service_type,webhook_url_ciphertext,is_enabled,timeout_seconds,retry_enabled,allow_query_api_key,rate_limit_per_minute",
        filters: [{ column: "id", operator: "eq", value: endpointId }],
        limit: 1
      });
      return rows[0] || null;
    },

    async getActiveApiKey(endpointId) {
      const rows = await this.list("webhook_api_keys", {
        select: "id,api_key_hash,use_count",
        filters: [
          { column: "endpoint_id", operator: "eq", value: endpointId },
          { column: "is_active", operator: "eq", value: true }
        ],
        limit: 1
      });
      return rows[0] || null;
    },

    async updateApiKeyUsage(keyId, ipAddress) {
      return request(buildRestPath("webhook_api_keys", {
        filters: [{ column: "id", operator: "eq", value: keyId }]
      }), {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({
          last_used_at: new Date().toISOString(),
          last_used_ip: ipAddress
        })
      });
    },

    async createDeliveryLog(log) {
      const rows = await request("webhook_logs", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(log)
      });
      return rows[0] || null;
    },

    async createApiKey(row) {
      return this.insert("webhook_api_keys", row);
    },

    async deactivateApiKeys(endpointId, userId) {
      return request(buildRestPath("webhook_api_keys", {
        filters: [
          { column: "endpoint_id", operator: "eq", value: endpointId },
          { column: "is_active", operator: "eq", value: true }
        ]
      }), {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({
          is_active: false,
          revoked_by: userId,
          revoked_at: new Date().toISOString()
        })
      });
    },

    async updateDeliveryLog(requestId, patch) {
      return request(buildRestPath("webhook_logs", {
        filters: [{ column: "request_id", operator: "eq", value: requestId }]
      }), {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify(patch)
      });
    },

    async checkIdempotency(endpointId, idempotencyKey) {
      if (!idempotencyKey) {
        return null;
      }
      const rows = await this.list("webhook_logs", {
        select: "request_id,status",
        filters: [
          { column: "endpoint_id", operator: "eq", value: endpointId },
          { column: "idempotency_key", operator: "eq", value: idempotencyKey },
          { column: "created_at", operator: "gte", value: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }
        ],
        limit: 1
      });
      return rows[0] || null;
    },

    async getDeliveryLog(requestId) {
      const rows = await this.list("webhook_logs", {
        select: "*",
        filters: [{ column: "request_id", operator: "eq", value: requestId }],
        limit: 1
      });
      return rows[0] || null;
    }
  };
}
