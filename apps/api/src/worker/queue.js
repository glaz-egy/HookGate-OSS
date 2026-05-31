import { buildDestinationPayload } from "../adapters/index.js";
import { createSupabaseClient } from "../lib/db.js";
import { redactForLog, assertAllowedDestinationUrl } from "../lib/security.js";

export default {
  async queue(batch, env) {
    const db = createSupabaseClient(env);
    await Promise.all(batch.messages.map((message) => deliverMessage(message, db)));
  }
};

export async function deliverMessage(queueMessage, db) {
  const job = queueMessage.body;
  const started = Date.now();

  try {
    assertAllowedDestinationUrl(job.service_type, job.webhook_url);
    await db.updateDeliveryLog(job.request_id, {
      status: "sending",
      sent_at: new Date().toISOString()
    });

    const payload = buildDestinationPayload(job.service_type, job.payload);
    const response = await fetchWithTimeout(job.webhook_url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }, (job.timeout_seconds || 10) * 1000);

    const durationMs = Date.now() - started;
    if (response.ok) {
      await db.updateDeliveryLog(job.request_id, {
        status: "succeeded",
        http_status: response.status,
        retry_count: job.retry_count,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs
      });
      queueMessage.ack();
      return;
    }

    const status = shouldRetry(response.status) && job.retry_enabled ? "retrying" : "failed";
    await db.updateDeliveryLog(job.request_id, {
      status,
      http_status: response.status,
      retry_count: job.retry_count,
      response_summary: { status: response.status, retry_after: response.headers.get("retry-after") },
      completed_at: status === "failed" ? new Date().toISOString() : null,
      duration_ms: durationMs
    });

    if (status === "retrying") {
      queueMessage.retry();
    } else {
      queueMessage.ack();
    }
  } catch (error) {
    console.error("Delivery failed", redactForLog({ request_id: job.request_id, error: error.message }));
    await db.updateDeliveryLog(job.request_id, {
      status: job.retry_enabled ? "retrying" : "failed",
      error_message: error.message,
      retry_count: job.retry_count,
      duration_ms: Date.now() - started
    });

    if (job.retry_enabled) {
      queueMessage.retry();
    } else {
      queueMessage.ack();
    }
  }
}

function shouldRetry(status) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
