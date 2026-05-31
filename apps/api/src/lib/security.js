export function extractApiKey(request, payload = {}) {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) {
    return { source: "header", value: headerKey };
  }

  if (typeof payload.api_key === "string" && payload.api_key.length > 0) {
    return { source: "body", value: payload.api_key };
  }

  const queryKey = new URL(request.url).searchParams.get("api_key");
  if (queryKey) {
    return { source: "query", value: queryKey };
  }

  return { source: "none", value: "" };
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createPlainApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `hg_${token}`;
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

export function maskSecret(value, visible = 4) {
  if (!value) {
    return "";
  }
  if (value.length <= visible) {
    return "*".repeat(value.length);
  }
  return `${"*".repeat(Math.max(8, value.length - visible))}${value.slice(-visible)}`;
}

export function maskWebhookUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}/***`;
  } catch {
    return "***";
  }
}

export function redactForLog(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactForLog);
  }

  if (typeof value === "object") {
    const redacted = {};
    for (const [key, child] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (lower.includes("key") || lower.includes("token") || lower.includes("authorization") || lower.includes("webhook")) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactForLog(child);
      }
    }
    return redacted;
  }

  return value;
}

export function assertAllowedDestinationUrl(serviceType, webhookUrl) {
  const url = new URL(webhookUrl);
  if (url.protocol !== "https:") {
    throw new Error("webhook URL must use https.");
  }

  if (serviceType === "discord") {
    const allowed = url.hostname === "discord.com" || url.hostname === "discordapp.com";
    if (!allowed || !url.pathname.startsWith("/api/webhooks/")) {
      throw new Error("webhook URL is not a valid Discord webhook URL.");
    }
    return true;
  }

  if (serviceType === "slack") {
    if (url.hostname !== "hooks.slack.com" || !url.pathname.startsWith("/services/")) {
      throw new Error("webhook URL is not a valid Slack incoming webhook URL.");
    }
    return true;
  }

  throw new Error("unsupported service type.");
}
