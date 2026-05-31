# HookGate OSS

HookGate OSS is a webhook proxy for receiving JSON events and relaying them to Discord or Slack without exposing the destination webhook URL to event senders.

This repository is the OSS implementation track. Billing, Stripe, plan enforcement, and paid feature gates from the original commercial requirements are intentionally excluded.

## Current Scope

- Next.js frontend under `apps/web`
- Cloudflare Workers API under `apps/api` for `POST /api/v1/hooks/:endpoint_id`
- Cloudflare Queues producer and consumer
- Supabase Auth protected management console
- Discord and Slack outgoing webhook adapters
- API key lookup with hashed key verification
- Payload validation, size limits, idempotency checks, and basic rate limiting hooks
- Secret-safe logging helpers
- Next.js management UI shell with Supabase Auth
- Supabase PostgreSQL schema with RLS enabled
- Documentation under `Docs/`

## Repository Layout

```text
apps/api/              Cloudflare Workers API and Queue consumer
apps/web/              Next.js frontend with Supabase Auth
Docs/                  Requirements, status, and local setup docs
supabase/migrations/   Supabase schema migrations
```

## Local Checks

```bash
npm test
npm run check
```

See `Docs/local-development.md` for local Supabase, Next.js, and Worker setup.

## Deployment Notes

1. Create a Supabase project and apply `supabase/migrations/0001_initial_schema.sql`.
2. Create a Cloudflare Queue named `hookgate-deliveries`.
3. Configure Worker environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WEBHOOK_URL_ENCRYPTION_KEY`
4. Bind the queue as `WEBHOOK_QUEUE`.
5. Deploy `apps/api/src/worker/index.js` as the API Worker and `apps/api/src/worker/queue.js` as the queue consumer.
6. Deploy `apps/web` as the Next.js frontend.

## Security Defaults

- Webhook URLs are encrypted before storage and masked in API/UI contexts.
- API keys are stored as SHA-256 hashes only.
- Query-string API keys are supported for compatibility but should remain disabled per endpoint unless required.
- Logs avoid destination URLs, raw API keys, authorization headers, and full payload bodies.
