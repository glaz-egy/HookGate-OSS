import { encryptString, decryptString } from "../lib/crypto.js";
import { createRequestId } from "../lib/ids.js";
import { errorResponse, getClientIp, jsonResponse } from "../lib/http.js";
import {
  assertAllowedDestinationUrl,
  createPlainApiKey,
  maskSecret,
  maskWebhookUrl,
  redactForLog,
  sha256Hex
} from "../lib/security.js";
import { validateIncomingPayload } from "../lib/validation.js";

const ROLE_ORDER = {
  viewer: 0,
  developer: 1,
  admin: 2,
  owner: 3
};

export async function handleManagement(request, env, ctx, db) {
  const user = await requireUser(request, db);
  if (!user.ok) {
    return user.response;
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/v1\/management/, "") || "/";
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "organizations") {
    return handleOrganizations(request, db, user.value, parts, url);
  }

  if (parts[0] === "projects") {
    return handleProjects(request, db, user.value, parts, url);
  }

  if (parts[0] === "endpoints") {
    return handleEndpoints(request, env, db, user.value, parts, url);
  }

  if (parts[0] === "api-keys") {
    return handleApiKeys(request, db, user.value, parts);
  }

  if (parts[0] === "logs") {
    return handleLogs(request, env, ctx, db, user.value, parts, url);
  }

  return errorResponse(404, "ENDPOINT_NOT_FOUND", "Management endpoint not found.");
}

async function handleOrganizations(request, db, user, parts) {
  if (request.method === "GET" && parts.length === 1) {
    const rows = await db.list("organization_members", {
      select: "role,organizations(id,name,slug,is_enabled,created_at,updated_at)",
      filters: [{ column: "user_id", operator: "eq", value: user.id }],
      order: { column: "created_at", direction: "desc" }
    });
    return jsonResponse({
      success: true,
      organizations: rows.map((row) => ({ ...row.organizations, role: row.role }))
    });
  }

  if (request.method === "POST" && parts.length === 1) {
    const body = await readBody(request);
    const name = requireString(body.name, "name");
    const slug = slugify(name);
    const organization = await db.insert("organizations", {
      name,
      slug,
      created_by: user.id
    });
    await db.insert("organization_members", {
      organization_id: organization.id,
      user_id: user.id,
      role: "owner"
    });
    await audit(db, request, user, organization.id, "organization.created", "organization", organization.id, null, {
      name,
      slug
    });
    return jsonResponse({ success: true, organization }, { status: 201 });
  }

  const organizationId = parts[1];
  if (!organizationId) {
    return errorResponse(404, "ENDPOINT_NOT_FOUND", "Organization endpoint not found.");
  }

  if (request.method === "PATCH" && parts.length === 2) {
    await requireRole(db, organizationId, user.id, ["owner", "admin"]);
    const before = await getOrganization(db, organizationId);
    const body = await readBody(request);
    const name = optionalString(body.name);
    const patch = compact({
      name,
      slug: name ? slugify(name) : undefined,
      is_enabled: optionalBoolean(body.is_enabled),
      updated_at: new Date().toISOString()
    });
    const organization = await db.patch("organizations", organizationId, patch);
    await audit(db, request, user, organizationId, "organization.updated", "organization", organizationId, summarizeOrg(before), summarizeOrg(organization));
    return jsonResponse({ success: true, organization });
  }

  if (request.method === "DELETE" && parts.length === 2) {
    await requireRole(db, organizationId, user.id, ["owner"]);
    const before = await getOrganization(db, organizationId);
    await db.remove("organizations", organizationId);
    await audit(db, request, user, organizationId, "organization.deleted", "organization", organizationId, summarizeOrg(before), null);
    return jsonResponse({ success: true });
  }

  return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
}

async function handleProjects(request, db, user, parts, url) {
  if (request.method === "GET" && parts.length === 1) {
    const organizationId = requiredParam(url, "organization_id");
    await requireRole(db, organizationId, user.id, ["owner", "admin", "developer", "viewer"]);
    const projects = await db.list("projects", {
      select: "id,organization_id,name,slug,is_enabled,created_at,updated_at",
      filters: [{ column: "organization_id", operator: "eq", value: organizationId }],
      order: { column: "created_at", direction: "desc" }
    });
    return jsonResponse({ success: true, projects });
  }

  if (request.method === "POST" && parts.length === 1) {
    const body = await readBody(request);
    const organizationId = requireString(body.organization_id, "organization_id");
    await requireRole(db, organizationId, user.id, ["owner", "admin", "developer"]);
    const name = requireString(body.name, "name");
    const project = await db.insert("projects", {
      organization_id: organizationId,
      name,
      slug: slugify(name),
      created_by: user.id
    });
    await audit(db, request, user, organizationId, "project.created", "project", project.id, null, summarizeProject(project));
    return jsonResponse({ success: true, project }, { status: 201 });
  }

  const projectId = parts[1];
  const project = projectId ? await db.getProject(projectId) : null;
  if (!project) {
    return errorResponse(404, "ENDPOINT_NOT_FOUND", "Project not found.");
  }

  if (request.method === "PATCH" && parts.length === 2) {
    await requireRole(db, project.organization_id, user.id, ["owner", "admin", "developer"]);
    const body = await readBody(request);
    const name = optionalString(body.name);
    const patch = compact({
      name,
      slug: name ? slugify(name) : undefined,
      is_enabled: optionalBoolean(body.is_enabled),
      updated_at: new Date().toISOString()
    });
    const updated = await db.patch("projects", projectId, patch);
    await audit(db, request, user, project.organization_id, "project.updated", "project", projectId, summarizeProject(project), summarizeProject(updated));
    return jsonResponse({ success: true, project: updated });
  }

  if (request.method === "DELETE" && parts.length === 2) {
    await requireRole(db, project.organization_id, user.id, ["owner", "admin"]);
    await db.remove("projects", projectId);
    await audit(db, request, user, project.organization_id, "project.deleted", "project", projectId, summarizeProject(project), null);
    return jsonResponse({ success: true });
  }

  return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
}

async function handleEndpoints(request, env, db, user, parts, url) {
  if (request.method === "GET" && parts.length === 1) {
    const organizationId = url.searchParams.get("organization_id");
    const projectId = url.searchParams.get("project_id");
    if (!organizationId && !projectId) {
      return errorResponse(400, "VALIDATION_ERROR", "organization_id or project_id is required.");
    }

    let orgId = organizationId;
    if (projectId) {
      const project = await db.getProject(projectId);
      if (!project) {
        return errorResponse(404, "ENDPOINT_NOT_FOUND", "Project not found.");
      }
      orgId = project.organization_id;
    }
    await requireRole(db, orgId, user.id, ["owner", "admin", "developer", "viewer"]);

    const endpoints = await db.list("webhook_endpoints", {
      select: "id,organization_id,project_id,name,service_type,is_enabled,timeout_seconds,retry_enabled,allow_query_api_key,rate_limit_per_minute,log_policy,created_at,updated_at",
      filters: [
        projectId
          ? { column: "project_id", operator: "eq", value: projectId }
          : { column: "organization_id", operator: "eq", value: orgId }
      ],
      order: { column: "created_at", direction: "desc" }
    });
    return jsonResponse({ success: true, endpoints });
  }

  if (request.method === "POST" && parts.length === 1) {
    const body = await readBody(request);
    const project = await db.getProject(requireString(body.project_id, "project_id"));
    if (!project) {
      return errorResponse(404, "ENDPOINT_NOT_FOUND", "Project not found.");
    }
    await requireRole(db, project.organization_id, user.id, ["owner", "admin", "developer"]);
    const serviceType = requireServiceType(body.service_type);
    const webhookUrl = requireString(body.webhook_url, "webhook_url");
    assertAllowedDestinationUrl(serviceType, webhookUrl);

    const endpoint = await db.insert("webhook_endpoints", {
      organization_id: project.organization_id,
      project_id: project.id,
      name: requireString(body.name, "name"),
      service_type: serviceType,
      webhook_url_ciphertext: await encryptString(webhookUrl, env.WEBHOOK_URL_ENCRYPTION_KEY),
      is_enabled: body.is_enabled ?? true,
      timeout_seconds: clampInteger(body.timeout_seconds, 10, 1, 30),
      retry_enabled: body.retry_enabled ?? true,
      allow_query_api_key: body.allow_query_api_key ?? false,
      rate_limit_per_minute: clampInteger(body.rate_limit_per_minute, 60, 1, 100000),
      created_by: user.id,
      updated_by: user.id
    });
    await audit(db, request, user, project.organization_id, "endpoint.created", "webhook_endpoint", endpoint.id, null, summarizeEndpoint(endpoint));
    return jsonResponse({ success: true, endpoint }, { status: 201 });
  }

  const endpointId = parts[1];
  const endpoint = endpointId ? await db.getEndpoint(endpointId) : null;
  if (!endpoint) {
    return errorResponse(404, "ENDPOINT_NOT_FOUND", "Endpoint not found.");
  }

  if (request.method === "PATCH" && parts.length === 2) {
    await requireRole(db, endpoint.organization_id, user.id, ["owner", "admin", "developer"]);
    const body = await readBody(request);
    const patch = compact({
      name: optionalString(body.name),
      is_enabled: optionalBoolean(body.is_enabled),
      timeout_seconds: body.timeout_seconds === undefined ? undefined : clampInteger(body.timeout_seconds, 10, 1, 30),
      retry_enabled: optionalBoolean(body.retry_enabled),
      allow_query_api_key: optionalBoolean(body.allow_query_api_key),
      rate_limit_per_minute:
        body.rate_limit_per_minute === undefined ? undefined : clampInteger(body.rate_limit_per_minute, 60, 1, 100000),
      updated_by: user.id,
      updated_at: new Date().toISOString()
    });

    if (body.webhook_url) {
      assertAllowedDestinationUrl(endpoint.service_type, body.webhook_url);
      patch.webhook_url_ciphertext = await encryptString(body.webhook_url, env.WEBHOOK_URL_ENCRYPTION_KEY);
    }

    const updated = await db.patch("webhook_endpoints", endpointId, patch);
    await audit(db, request, user, endpoint.organization_id, "endpoint.updated", "webhook_endpoint", endpointId, summarizeEndpoint(endpoint), summarizeEndpoint(updated));
    return jsonResponse({ success: true, endpoint: updated });
  }

  if (request.method === "DELETE" && parts.length === 2) {
    await requireRole(db, endpoint.organization_id, user.id, ["owner", "admin"]);
    await db.remove("webhook_endpoints", endpointId);
    await audit(db, request, user, endpoint.organization_id, "endpoint.deleted", "webhook_endpoint", endpointId, summarizeEndpoint(endpoint), null);
    return jsonResponse({ success: true });
  }

  if (request.method === "POST" && parts[2] === "api-key") {
    await requireRole(db, endpoint.organization_id, user.id, ["owner", "admin", "developer"]);
    const plainKey = createPlainApiKey();
    await db.deactivateApiKeys(endpointId, user.id);
    const apiKey = await db.createApiKey({
      endpoint_id: endpointId,
      api_key_hash: await sha256Hex(plainKey),
      created_by: user.id
    });
    await audit(db, request, user, endpoint.organization_id, "api_key.created", "webhook_api_key", apiKey.id, null, {
      endpoint_id: endpointId,
      key_preview: maskSecret(plainKey)
    });
    return jsonResponse({
      success: true,
      api_key: {
        ...apiKey,
        plaintext: plainKey
      }
    }, { status: 201 });
  }

  if (request.method === "GET" && parts[2] === "api-keys") {
    await requireRole(db, endpoint.organization_id, user.id, ["owner", "admin", "developer", "viewer"]);
    const apiKeys = await db.list("webhook_api_keys", {
      select: "id,endpoint_id,is_active,last_used_at,last_used_ip,use_count,created_at,revoked_at",
      filters: [{ column: "endpoint_id", operator: "eq", value: endpointId }],
      order: { column: "created_at", direction: "desc" }
    });
    return jsonResponse({ success: true, api_keys: apiKeys });
  }

  return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
}

async function handleApiKeys(request, db, user, parts) {
  const apiKeyId = parts[1];
  if (!apiKeyId) {
    return errorResponse(404, "ENDPOINT_NOT_FOUND", "API key endpoint not found.");
  }

  const rows = await db.list("webhook_api_keys", {
    select: "id,endpoint_id,is_active,webhook_endpoints(id,organization_id)",
    filters: [{ column: "id", operator: "eq", value: apiKeyId }],
    limit: 1
  });
  const apiKey = rows[0];
  if (!apiKey) {
    return errorResponse(404, "ENDPOINT_NOT_FOUND", "API key not found.");
  }
  const organizationId = apiKey.webhook_endpoints.organization_id;

  if (request.method === "PATCH" && parts.length === 2) {
    await requireRole(db, organizationId, user.id, ["owner", "admin", "developer"]);
    const body = await readBody(request);
    const patch = compact({
      is_active: optionalBoolean(body.is_active),
      revoked_by: body.is_active === false ? user.id : undefined,
      revoked_at: body.is_active === false ? new Date().toISOString() : undefined
    });
    const updated = await db.patch("webhook_api_keys", apiKeyId, patch);
    await audit(db, request, user, organizationId, "api_key.updated", "webhook_api_key", apiKeyId, {
      is_active: apiKey.is_active
    }, {
      is_active: updated.is_active
    });
    return jsonResponse({ success: true, api_key: updated });
  }

  if (request.method === "DELETE" && parts.length === 2) {
    await requireRole(db, organizationId, user.id, ["owner", "admin"]);
    await db.remove("webhook_api_keys", apiKeyId);
    await audit(db, request, user, organizationId, "api_key.deleted", "webhook_api_key", apiKeyId, {
      endpoint_id: apiKey.endpoint_id,
      is_active: apiKey.is_active
    }, null);
    return jsonResponse({ success: true });
  }

  return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
}

async function handleLogs(request, env, ctx, db, user, parts, url) {
  if (request.method === "GET" && parts.length === 1) {
    const organizationId = requiredParam(url, "organization_id");
    await requireRole(db, organizationId, user.id, ["owner", "admin", "developer", "viewer"]);
    const logs = await db.list("webhook_logs", {
      select: "id,request_id,organization_id,project_id,endpoint_id,status,service_type,http_status,retry_count,source_ip,request_summary,response_summary,error_message,queued_at,sent_at,completed_at,duration_ms,created_at",
      filters: [{ column: "organization_id", operator: "eq", value: organizationId }],
      order: { column: "created_at", direction: "desc" },
      limit: 50
    });
    return jsonResponse({ success: true, logs });
  }

  const requestId = parts[1];
  if (!requestId) {
    return errorResponse(404, "ENDPOINT_NOT_FOUND", "Log endpoint not found.");
  }

  const log = await db.getDeliveryLog(requestId);
  if (!log) {
    return errorResponse(404, "ENDPOINT_NOT_FOUND", "Log not found.");
  }
  await requireRole(db, log.organization_id, user.id, ["owner", "admin", "developer", "viewer"]);

  if (request.method === "GET" && parts.length === 2) {
    return jsonResponse({ success: true, log });
  }

  if (request.method === "POST" && parts[2] === "resend") {
    await requireRole(db, log.organization_id, user.id, ["owner", "admin", "developer"]);
    if (!log.request_payload) {
      return errorResponse(409, "PAYLOAD_NOT_AVAILABLE", "Original payload is not available for resend.");
    }
    const endpoint = await db.getEndpoint(log.endpoint_id);
    if (!endpoint || !endpoint.is_enabled) {
      return errorResponse(409, "ENDPOINT_DISABLED", "Endpoint is disabled or missing.");
    }

    const validation = validateIncomingPayload(log.request_payload);
    if (!validation.ok) {
      return errorResponse(400, validation.code, validation.message);
    }

    const newRequestId = createRequestId();
    const now = new Date().toISOString();
    const deliveryLog = await db.createDeliveryLog({
      request_id: newRequestId,
      organization_id: log.organization_id,
      project_id: log.project_id,
      endpoint_id: log.endpoint_id,
      status: "queued",
      service_type: log.service_type,
      source_ip: getClientIp(request) === "unknown" ? null : getClientIp(request),
      request_summary: {
        ...(log.request_summary || {}),
        resent_from_request_id: requestId
      },
      request_payload: validation.value,
      queued_at: now,
      created_at: now,
      idempotency_key: null
    });

    const job = {
      request_id: newRequestId,
      organization_id: log.organization_id,
      project_id: log.project_id,
      endpoint_id: log.endpoint_id,
      service_type: log.service_type,
      webhook_url: await decryptString(endpoint.webhook_url_ciphertext, env.WEBHOOK_URL_ENCRYPTION_KEY),
      timeout_seconds: endpoint.timeout_seconds || 10,
      retry_enabled: endpoint.retry_enabled,
      retry_count: 0,
      payload: validation.value,
      created_at: now,
      idempotency_key: null
    };

    if (!env.WEBHOOK_QUEUE) {
      return errorResponse(503, "QUEUE_FAILED", "Queue binding is not configured.");
    }
    ctx.waitUntil(env.WEBHOOK_QUEUE.send(job));
    await audit(db, request, user, log.organization_id, "webhook_log.resent", "webhook_log", deliveryLog.id, {
      request_id: requestId
    }, {
      request_id: newRequestId
    });
    return jsonResponse({ success: true, request_id: newRequestId, status: "queued" }, { status: 202 });
  }

  return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
}

async function requireUser(request, db) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!token) {
    return { ok: false, response: errorResponse(401, "UNAUTHORIZED", "Authorization bearer token is required.") };
  }

  const user = await db.getUser(token);
  if (!user?.id) {
    return { ok: false, response: errorResponse(401, "UNAUTHORIZED", "Invalid Supabase session.") };
  }

  return { ok: true, value: user };
}

async function requireRole(db, organizationId, userId, allowedRoles) {
  const role = await db.getOrganizationRole(organizationId, userId);
  if (!role || !allowedRoles.includes(role)) {
    const error = new Error("Forbidden.");
    error.status = 403;
    error.code = "FORBIDDEN";
    throw error;
  }
  return role;
}

async function audit(db, request, user, organizationId, action, targetType, targetId, beforeSummary, afterSummary) {
  await db.createAuditLog({
    organization_id: organizationId,
    actor_user_id: user.id,
    action,
    target_type: targetType,
    target_id: targetId,
    ip_address: getClientIp(request) === "unknown" ? null : getClientIp(request),
    user_agent: request.headers.get("user-agent"),
    before_summary: redactForLog(beforeSummary || {}),
    after_summary: redactForLog(afterSummary || {}),
    created_at: new Date().toISOString()
  });
}

async function getOrganization(db, organizationId) {
  const rows = await db.list("organizations", {
    select: "id,name,slug,is_enabled,created_at,updated_at",
    filters: [{ column: "id", operator: "eq", value: organizationId }],
    limit: 1
  });
  return rows[0] || null;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    const error = new Error(`${name} is required.`);
    error.status = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  return value.trim();
}

function optionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function requiredParam(url, name) {
  const value = url.searchParams.get(name);
  if (!value) {
    const error = new Error(`${name} is required.`);
    error.status = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  return value;
}

function requireServiceType(value) {
  if (value !== "discord" && value !== "slack") {
    const error = new Error("service_type must be discord or slack.");
    error.status = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  return value;
}

function clampInteger(value, fallback, min, max) {
  const number = Number.isInteger(Number(value)) ? Number(value) : fallback;
  return Math.min(max, Math.max(min, number));
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined));
}

function slugify(value) {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `item-${Date.now()}`;
}

function summarizeOrg(org) {
  if (!org) {
    return null;
  }
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    is_enabled: org.is_enabled
  };
}

function summarizeProject(project) {
  if (!project) {
    return null;
  }
  return {
    id: project.id,
    organization_id: project.organization_id,
    name: project.name,
    slug: project.slug,
    is_enabled: project.is_enabled
  };
}

function summarizeEndpoint(endpoint) {
  if (!endpoint) {
    return null;
  }
  return {
    id: endpoint.id,
    organization_id: endpoint.organization_id,
    project_id: endpoint.project_id,
    name: endpoint.name,
    service_type: endpoint.service_type,
    is_enabled: endpoint.is_enabled,
    timeout_seconds: endpoint.timeout_seconds,
    retry_enabled: endpoint.retry_enabled,
    allow_query_api_key: endpoint.allow_query_api_key,
    rate_limit_per_minute: endpoint.rate_limit_per_minute,
    webhook_url: endpoint.webhook_url ? maskWebhookUrl(endpoint.webhook_url) : undefined
  };
}

export function managementErrorResponse(error) {
  return errorResponse(error.status || 500, error.code || "INTERNAL_ERROR", error.status ? error.message : "Internal error.");
}
