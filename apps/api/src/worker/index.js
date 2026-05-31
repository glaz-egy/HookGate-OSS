import { createSupabaseClient } from "../lib/db.js";
import { decryptString } from "../lib/crypto.js";
import { corsPreflightResponse, errorResponse, getClientIp, jsonResponse, withCors } from "../lib/http.js";
import { createRequestId } from "../lib/ids.js";
import { extractApiKey, redactForLog, sha256Hex, timingSafeEqual } from "../lib/security.js";
import { readJsonWithLimit, validateIncomingPayload } from "../lib/validation.js";
import { handleManagement, managementErrorResponse } from "./management.js";
import queueWorker from "./queue.js";

export default {
  async queue(batch, env) {
    return queueWorker.queue(batch, env);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return corsPreflightResponse();
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return withCors(jsonResponse({ ok: true, service: "hookgate-oss" }));
    }

    if (url.pathname.startsWith("/api/v1/management")) {
      try {
        return withCors(await handleManagement(request, env, ctx, createSupabaseClient(env)));
      } catch (error) {
        console.error("Unhandled management error", redactForLog({ message: error.message }));
        return withCors(managementErrorResponse(error));
      }
    }

    const match = url.pathname.match(/^\/api\/v1\/hooks\/([^/]+)$/);
    if (request.method !== "POST" || !match) {
      return withCors(errorResponse(404, "ENDPOINT_NOT_FOUND", "Endpoint not found."));
    }

    try {
      return withCors(await handleWebhook(request, env, ctx, match[1]));
    } catch (error) {
      console.error("Unhandled receive error", redactForLog({ message: error.message }));
      return withCors(errorResponse(500, "INTERNAL_ERROR", "Internal error."));
    }
  }
};

export async function handleWebhook(request, env, ctx, endpointId) {
  const body = await readJsonWithLimit(request);
  if (!body.ok) {
    return errorResponse(body.code === "PAYLOAD_TOO_LARGE" ? 413 : 400, body.code, body.message);
  }

  const validation = validateIncomingPayload(body.value);
  if (!validation.ok) {
    return errorResponse(400, validation.code, validation.message);
  }

  const db = createSupabaseClient(env);
  const endpoint = await db.getEndpoint(endpointId);
  if (!endpoint) {
    return errorResponse(404, "ENDPOINT_NOT_FOUND", "Endpoint not found.");
  }
  if (!endpoint.is_enabled) {
    return errorResponse(403, "ENDPOINT_DISABLED", "Endpoint is disabled.");
  }

  const apiKey = extractApiKey(request, body.value);
  if (!apiKey.value || (apiKey.source === "query" && !endpoint.allow_query_api_key)) {
    return errorResponse(401, "INVALID_API_KEY", "Invalid API key.");
  }

  const activeKey = await db.getActiveApiKey(endpointId);
  const apiKeyHash = await sha256Hex(apiKey.value);
  if (!activeKey || !timingSafeEqual(apiKeyHash, activeKey.api_key_hash)) {
    return errorResponse(401, "INVALID_API_KEY", "Invalid API key.");
  }

  const duplicate = await db.checkIdempotency(endpointId, validation.value.idempotency_key);
  if (duplicate) {
    return jsonResponse({
      success: true,
      request_id: duplicate.request_id,
      status: duplicate.status,
      duplicate: true
    });
  }

  const requestId = createRequestId();
  const sourceIp = getClientIp(request);
  const sourceIpForDb = sourceIp === "unknown" ? null : sourceIp;
  const now = new Date().toISOString();

  await db.updateApiKeyUsage(activeKey.id, sourceIpForDb);
  await db.createDeliveryLog({
    request_id: requestId,
    organization_id: endpoint.organization_id,
    project_id: endpoint.project_id,
    endpoint_id: endpoint.id,
    status: "queued",
    service_type: endpoint.service_type,
    source_ip: sourceIpForDb,
    request_summary: summarizePayload(validation.value),
    request_payload: validation.value,
    queued_at: now,
    created_at: now,
    idempotency_key: validation.value.idempotency_key || null
  });

  const job = {
    request_id: requestId,
    organization_id: endpoint.organization_id,
    project_id: endpoint.project_id,
    endpoint_id: endpoint.id,
    service_type: endpoint.service_type,
    webhook_url: await decryptString(endpoint.webhook_url_ciphertext, env.WEBHOOK_URL_ENCRYPTION_KEY),
    timeout_seconds: endpoint.timeout_seconds || 10,
    retry_enabled: endpoint.retry_enabled,
    retry_count: 0,
    payload: validation.value,
    created_at: now,
    idempotency_key: validation.value.idempotency_key || null
  };

  if (!env.WEBHOOK_QUEUE) {
    return errorResponse(503, "QUEUE_FAILED", "Queue binding is not configured.");
  }

  ctx.waitUntil(env.WEBHOOK_QUEUE.send(job));

  return jsonResponse({
    success: true,
    request_id: requestId,
    status: "queued"
  }, { status: 202 });
}

function summarizePayload(payload) {
  return {
    title: payload.title || null,
    message_length: payload.message.length,
    level: payload.level,
    fields_count: payload.fields.length,
    has_metadata: Object.keys(payload.metadata || {}).length > 0,
    template_id: payload.template_id || null
  };
}
