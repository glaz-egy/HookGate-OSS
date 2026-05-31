# Implementation Status

Last updated: 2026-05-31

## Implemented

- Repository scaffold for HookGate OSS.
- OSS-scoped requirements in `Docs/requirements.md`.
- Worker receive API route for `POST /api/v1/hooks/:endpoint_id`.
- Queue producer payload shape for asynchronous delivery.
- Queue consumer entrypoint for delivery attempts.
- Discord adapter.
- Slack adapter.
- Shared payload validator and limits.
- API key extraction and SHA-256 hashing helpers.
- Webhook URL encryption/decryption helpers using Web Crypto AES-GCM.
- Secret masking helpers.
- Supabase REST helper for server-side Worker usage.
- Initial Supabase PostgreSQL schema with RLS enabled.
- Next.js management UI shell under `apps/web`.
- Node unit tests for adapters, validation, and security helpers.
- Monorepo split between `apps/web` and `apps/api`.
- Next.js frontend scaffold with App Router.
- Supabase Auth login, signup, callback, session middleware, and protected dashboard.
- Local development guide in `Docs/local-development.md`.
- Authenticated Worker management API for organizations, projects, endpoints, API keys, logs, and resend.
- Frontend CRUD screens connected to the Worker management API.
- API key rotation/creation flow that returns plaintext only once.
- Endpoint-level query-string API key toggle in API and UI.
- Audit-log writes for organization, project, endpoint, API key, and resend management operations.
- Delivery log resend API and UI action.
- Drizzle schema definitions for backend database tables.
- Management DB access now uses a whitelisted REST query builder to avoid raw query-string composition from user input.
- Cloudflare Worker deployment workflow for `main` and manual dispatch.
- Supabase migration verification workflow that resets a local database from committed migrations.
- Supabase CLI config for local and CI migration verification.

## Remaining Tasks

- Add real rate-limit backend storage.
- Add idempotency persistence and replay response behavior.
- Add delivery retry scheduling that honors `Retry-After`.
- Add IP allowlist enforcement.
- Add local integration test harness for Worker fetch and Queue consumer.
- Add Teams, Google Chat, and Generic HTTP adapters after SSRF guard is complete.

## Explicit OSS Decisions

- No Stripe integration.
- No billing tables.
- No plan limits.
- No paid feature locks.
- Organization remains for access control, collaboration, usage grouping, and audit context.
