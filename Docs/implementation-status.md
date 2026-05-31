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

## Remaining Tasks

- Connect endpoint CRUD screens to API endpoints.
- Add CRUD management APIs for organizations, projects, endpoints, and API keys.
- Add API key creation flow that shows plaintext only once.
- Add endpoint-level query-string API key toggle in UI/API.
- Add full audit-log writes for all management operations.
- Add resend API and UI.
- Add real rate-limit backend storage.
- Add idempotency persistence and replay response behavior.
- Add delivery retry scheduling that honors `Retry-After`.
- Add IP allowlist enforcement.
- Add local integration test harness for Worker fetch and Queue consumer.
- Add Cloudflare deployment workflow.
- Add Supabase migration verification workflow.
- Add Teams, Google Chat, and Generic HTTP adapters after SSRF guard is complete.

## Explicit OSS Decisions

- No Stripe integration.
- No billing tables.
- No plan limits.
- No paid feature locks.
- Organization remains for access control, collaboration, usage grouping, and audit context.
