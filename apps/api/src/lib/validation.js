export const LIMITS = {
  bodyBytes: 256 * 1024,
  messageChars: 4000,
  titleChars: 256,
  fields: 25,
  metadataBytes: 64 * 1024
};

const LEVELS = new Set(["debug", "info", "notice", "warning", "error", "critical"]);

export async function readJsonWithLimit(request, maxBytes = LIMITS.bodyBytes) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, code: "VALIDATION_ERROR", message: "content-type must be application/json." };
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false, code: "PAYLOAD_TOO_LARGE", message: "request body exceeds 256KB." };
  }

  try {
    return { ok: true, value: JSON.parse(text || "{}") };
  } catch {
    return { ok: false, code: "VALIDATION_ERROR", message: "request body must be valid JSON." };
  }
}

export function validateIncomingPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return invalid("payload must be a JSON object.");
  }

  const messageText = getMessageText(payload);
  const hasMessage = typeof messageText === "string" && messageText.trim().length > 0;
  const hasEmbeds = payload.embeds !== undefined;

  if (!hasMessage && !hasEmbeds) {
    return invalid("message, content, or embeds is required.");
  }

  if (hasEmbeds) {
    const validResult = validateEmbeds(payload.embeds);
    if (validResult !== undefined) {
      return validResult;
    }
  }

  if (hasMessage && messageText.length > LIMITS.messageChars) {
    return invalid("message exceeds 4000 characters.");
  }

  if (payload.title !== undefined && (typeof payload.title !== "string" || payload.title.length > LIMITS.titleChars)) {
    return invalid("title must be a string up to 256 characters.");
  }

  if (payload.level !== undefined && (!LEVELS.has(String(payload.level).toLowerCase()))) {
    return invalid("level is not supported.");
  }

  if (payload.fields !== undefined) {
    if (!Array.isArray(payload.fields) || payload.fields.length > LIMITS.fields) {
      return invalid("fields must be an array with up to 25 entries.");
    }

    for (const field of payload.fields) {
      if (!field || typeof field !== "object" || typeof field.name !== "string" || typeof field.value !== "string") {
        return invalid("each field must contain string name and value.");
      }
    }
  }

  if (payload.metadata !== undefined) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload.metadata)).byteLength;
    if (bytes > LIMITS.metadataBytes) {
      return invalid("metadata exceeds 64KB.");
    }
  }

  if (payload.url !== undefined) {
    try {
      const url = new URL(payload.url);
      if (!["https:", "http:"].includes(url.protocol)) {
        return invalid("url must be http or https.");
      }
    } catch {
      return invalid("url must be a valid URL.");
    }
  }

  return {
    ok: true,
    value: normalizePayload(payload, messageText)
  };
}

function validateEmbeds(embeds) {
  if (!Array.isArray(embeds) || embeds.length === 0) {
    return invalid("embeds must be a non-empty array.");
  }

  if (embeds.length > 10) {
    return invalid("embeds must contain up to 10 entries.");
  }

  for (const embed of embeds) {
    if (!embed || typeof embed !== "object" || Array.isArray(embed)) {
      return invalid("each embed must be an object.");
    }
    if (embed.title !== undefined && (typeof embed.title !== "string" || embed.title.length > LIMITS.titleChars)) {
      return invalid("embed title must be a string up to 256 characters.");
    }
    if (embed.description !== undefined && typeof embed.description !== "string") {
      return invalid("embed description must be a string.");
    }
    if (!embed.title && !embed.description) {
      return invalid("each embed requires title or description.");
    }
  }

  return undefined;
}

function normalizePayload(payload, messageText) {
  const message = deriveMessage(payload, messageText);
  return {
    title: payload.title || payload.embeds?.[0]?.title || undefined,
    content: typeof payload.content === "string" ? payload.content.trim() : undefined,
    embeds: payload.embeds || undefined,
    message,
    level: payload.level ? String(payload.level).toLowerCase() : "info",
    fields: payload.fields || [],
    url: payload.url || undefined,
    username: payload.username || undefined,
    icon_url: payload.icon_url || undefined,
    color: payload.color || undefined,
    metadata: payload.metadata || {},
    mentions: payload.mentions || [],
    attachments: payload.attachments || [],
    template_id: payload.template_id || undefined,
    idempotency_key: payload.idempotency_key || undefined
  };
}

function getMessageText(payload) {
  if (typeof payload.message === "string") {
    return payload.message;
  }
  if (typeof payload.content === "string") {
    return payload.content;
  }
  return undefined;
}

function deriveMessage(payload, messageText) {
  if (typeof messageText === "string" && messageText.trim().length > 0) {
    return messageText.trim();
  }
  const firstEmbed = payload.embeds?.[0];
  return String(firstEmbed?.description || firstEmbed?.title || "").trim();
}

function invalid(message) {
  return { ok: false, code: "VALIDATION_ERROR", message };
}
