# HookGate OSS Requirements

This document adapts the attached commercial Webhook Proxy requirements for an OSS project. Paid plans, Stripe billing, usage-based charging, and commercial feature gates are out of scope.

## 1. System Overview

HookGate OSS receives event JSON from external services and safely relays it to configured Discord or Slack webhooks.

Primary goals:

- Keep destination webhook URLs hidden from event senders.
- Authenticate inbound requests with endpoint API keys.
- Validate and normalize incoming payloads.
- Convert normalized payloads through service-specific adapters.
- Queue delivery work by default.
- Store delivery logs and audit logs without leaking secrets.

## 2. Architecture

- Frontend: Next.js application deployed separately from the API
- API: Cloudflare Workers
- Queue: Cloudflare Queues
- Auth: Supabase Auth
- Database: Supabase PostgreSQL
- Secret management: Cloudflare Worker secrets and encrypted database fields

OSS exclusions:

- Stripe
- Billing plans
- Usage-based charging
- Commercial operator billing screens
- Paid-only feature locks

## 3. Data Hierarchy

```text
User
  Organization
    Project
      Webhook Endpoint
        Active API Key
```

Organization is retained as a collaboration, access-control, audit, and usage grouping unit, not a billing unit.

## 4. Supported Destinations

Initial supported destinations:

- Discord Webhook
- Slack Incoming Webhook

Future destinations:

- Microsoft Teams
- Google Chat
- Generic HTTP Webhook with SSRF protections
- Custom JSON adapters

## 5. Webhook Endpoint Requirements

Each endpoint stores:

- Name
- Organization and project
- Service type
- Encrypted webhook URL
- Enabled flag
- Timeout seconds
- Retry flag
- Query-string API key allowance
- Rate limit settings
- Log storage policy
- Created and updated metadata

Security rules:

- Never store webhook URLs in plaintext.
- Never return full webhook URLs from API responses.
- Never log webhook URLs.
- Mask URLs in the UI.

## 6. API Key Requirements

Each endpoint has one active API key.

Accepted locations, in order:

1. `X-API-Key` header
2. JSON body `api_key`
3. URL query `api_key`, only when enabled for the endpoint

Storage rules:

- Show plaintext only on creation.
- Store only SHA-256 hash.
- Support regeneration and revocation.
- Track last used time, last used IP, and use count.

## 7. Receive API

```http
POST /api/v1/hooks/{endpoint_id}
```

Minimum payload:

```json
{
  "message": "Notification body"
}
```

Optional fields:

- `title`
- `level`
- `fields`
- `url`
- `username`
- `icon_url`
- `color`
- `metadata`
- `mentions`
- `attachments`
- `template_id`
- `idempotency_key`

Limits:

- Request body: 256 KB
- `message`: 4000 characters
- `title`: 256 characters
- `fields`: 25 entries
- `metadata`: 64 KB serialized

## 8. Delivery

Default mode is asynchronous queue delivery.

Success response:

```json
{
  "success": true,
  "request_id": "req_xxxxx",
  "status": "queued"
}
```

Retryable failures:

- `408`
- `409`
- `425`
- `429`
- `500`
- `502`
- `503`
- `504`
- Network errors
- Timeout

Default max retries: 3.

Resend behavior:

- Failed or historical delivery logs can be queued again from the management UI.
- Resend creates a new `request_id` and log row.
- Resend requires the original normalized payload to be available in `webhook_logs.request_payload`.
- Resend writes an audit-log entry linking the original and new request IDs.

## 9. Security

Required controls:

- API key hashing
- Webhook URL encryption
- Drizzle-backed table schema definitions in backend code
- Whitelisted DB query construction for management API filters, columns, and operators
- HTTPS-only destination URLs
- Discord/Slack URL allowlisting in the initial release
- Secret-safe logging
- Supabase RLS
- Rate limit hooks
- Audit logs
- No service-role key in frontend code

## 10. Roles

| Role | Capability |
| --- | --- |
| Owner | All organization operations |
| Admin | Organization settings, members, endpoints, keys, logs |
| Developer | Endpoints, keys, delivery logs, resend |
| Viewer | Read-only logs and configuration |

Billing permissions from the commercial draft are removed.

## 11. Non-Functional Requirements

- Receive API p95 target: under 500 ms
- Queue-only receive target: under 300 ms
- Sync delivery target, when added: under 3 seconds
- Adapter pattern for destination expansion
- Logs must support incident investigation without storing secrets
- OSS deployment should be possible with Cloudflare and Supabase free-tier friendly defaults
