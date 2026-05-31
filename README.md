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
npm run build:web
```

See `Docs/local-development.md` for local Supabase, Next.js, and Worker setup.

## CI/CD

- `.github/workflows/deploy-cloudflare.yml` verifies the API, deploys the API Worker, builds the Next.js app with OpenNext, and deploys the Web Worker.
- Supabase migrations are kept in `supabase/migrations`; verify them locally with `supabase db reset` when schema changes are made.

Required GitHub `production` environment secrets for Cloudflare deployment:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEBHOOK_URL_ENCRYPTION_KEY`

Required GitHub `production` environment variables for Cloudflare deployment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_HOOKGATE_API_URL`

The workflow uses the GitHub `production` environment, creates the `hookgate-deliveries` queue if needed, uploads API Worker secrets from production environment secrets, then deploys `hookgate-oss-api` and `hookgate-oss-web`. If any required production environment secret or variable is missing, the workflow fails before mutating Cloudflare state.

## Deployment Notes

1. Create a Supabase project and apply all SQL files under `supabase/migrations`.
2. Configure GitHub `production` environment secrets and variables for Cloudflare deployment.
3. Configure Worker environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WEBHOOK_URL_ENCRYPTION_KEY`
4. Bind the queue as `WEBHOOK_QUEUE`.
5. Deploy `apps/api/src/worker/index.js` as the API Worker and `apps/api/src/worker/queue.js` as the queue consumer.
6. Deploy `apps/web` as the Next.js frontend through OpenNext on Cloudflare Workers.

## Security Defaults

- Webhook URLs are encrypted before storage and masked in API/UI contexts.
- API keys are stored as SHA-256 hashes only.
- Query-string API keys are supported for compatibility but should remain disabled per endpoint unless required.
- Logs avoid destination URLs, raw API keys, authorization headers, and full payload bodies.
