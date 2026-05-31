# Original Commercial Requirements

The source text attached to the implementation request described a commercial production Webhook Proxy. It included Stripe billing, plans, commercial release gates, and operator billing screens.

For HookGate OSS, those commercial requirements are intentionally narrowed in `Docs/requirements.md`. This file exists to preserve the origin and the notable differences without committing the full pasted document verbatim.

## Major Differences From Source

- Billing and Stripe are removed.
- Plan-specific limits are removed.
- Paid feature gates are removed.
- Organization is no longer a billing unit.
- Usage tracking is retained only for observability and abuse prevention.
- The initial destination scope remains Discord and Slack.
- Cloudflare Workers, Cloudflare Queues, Cloudflare Pages, Supabase Auth, and Supabase PostgreSQL remain the target platform.
