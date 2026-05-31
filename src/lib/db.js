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
    async getEndpoint(endpointId) {
      const rows = await request(
        `webhook_endpoints?id=eq.${encodeURIComponent(endpointId)}&select=id,organization_id,project_id,name,service_type,webhook_url_ciphertext,is_enabled,timeout_seconds,retry_enabled,allow_query_api_key,rate_limit_per_minute`
      );
      return rows[0] || null;
    },

    async getActiveApiKey(endpointId) {
      const rows = await request(
        `webhook_api_keys?endpoint_id=eq.${encodeURIComponent(endpointId)}&is_active=eq.true&select=id,api_key_hash,use_count`
      );
      return rows[0] || null;
    },

    async updateApiKeyUsage(keyId, ipAddress) {
      return request(`webhook_api_keys?id=eq.${encodeURIComponent(keyId)}`, {
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

    async updateDeliveryLog(requestId, patch) {
      return request(`webhook_logs?request_id=eq.${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify(patch)
      });
    },

    async checkIdempotency(endpointId, idempotencyKey) {
      if (!idempotencyKey) {
        return null;
      }
      const rows = await request(
        `webhook_logs?endpoint_id=eq.${encodeURIComponent(endpointId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())}&select=request_id,status&limit=1`
      );
      return rows[0] || null;
    }
  };
}
