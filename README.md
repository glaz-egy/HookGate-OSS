# HookGate OSS

HookGate OSS is a webhook proxy for receiving JSON events and relaying them to Discord or Slack without exposing the destination webhook URL to event senders.

This repository is the OSS implementation track. Billing, Stripe, plan enforcement, and paid feature gates from the original commercial requirements are intentionally excluded.

## Current Scope

- Cloudflare Workers API for `POST /api/v1/hooks/:endpoint_id`
- Cloudflare Queues producer and consumer
- Discord and Slack outgoing webhook adapters
- API key lookup with hashed key verification
- Payload validation, size limits, idempotency checks, and basic rate limiting hooks
- Secret-safe logging helpers
- Static Cloudflare Pages compatible management UI shell
- Supabase PostgreSQL schema with RLS enabled
- Documentation under `Docs/`

## Repository Layout

```text
Docs/                  Requirements and implementation tracking
public/                Static management UI shell
src/adapters/          Destination-specific payload adapters
src/lib/               Shared validation, crypto, database, and security helpers
src/worker/            Cloudflare Worker entrypoints
supabase/migrations/   Supabase schema migrations
test/                  Node test suite
```

## Local Checks

```bash
npm test
npm run check
```

No install step is required for the current test suite.

## Deployment Notes

1. Create a Supabase project and apply `supabase/migrations/0001_initial_schema.sql`.
2. Create a Cloudflare Queue named `hookgate-deliveries`.
3. Configure Worker environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WEBHOOK_URL_ENCRYPTION_KEY`
4. Bind the queue as `WEBHOOK_QUEUE`.
5. Deploy `src/worker/index.js` as the API Worker and `src/worker/queue.js` as the queue consumer.
6. Deploy `public/` with Cloudflare Pages for the management UI shell.

## Security Defaults

- Webhook URLs are encrypted before storage and masked in API/UI contexts.
- API keys are stored as SHA-256 hashes only.
- Query-string API keys are supported for compatibility but should remain disabled per endpoint unless required.
- Logs avoid destination URLs, raw API keys, authorization headers, and full payload bodies.
