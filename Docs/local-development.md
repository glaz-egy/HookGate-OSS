# Local Development

HookGate OSS is split into two applications:

- `apps/web`: Next.js frontend with Supabase Auth
- `apps/api`: Cloudflare Workers API and Queue consumer

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- Docker Desktop for local Supabase
- Supabase CLI
- Wrangler, installed through the API workspace dev dependency

## 1. Install Dependencies

```bash
npm install
```

## 2. Start Supabase Locally

```bash
supabase start
```

Copy the local `API URL`, `Publishable` key, and `Secret` key from the Supabase CLI output.

Apply the database migration:

```bash
supabase db reset
```

## 3. Configure Environment Files

Create `apps/web/.env.local`:

```bash
cp apps/web/.env.local.example apps/web/.env.local
```

Set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_HOOKGATE_API_URL`

Create `apps/api/.dev.vars`:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` using the local Supabase `Secret` key
- `WEBHOOK_URL_ENCRYPTION_KEY`

Do not put the service role key in `apps/web/.env.local`.

## 4. Run the Frontend

```bash
npm run dev:web
```

Open:

```text
http://localhost:3000
```

The Next.js app redirects unauthenticated users to `/login`.

## 5. Run the API Worker

```bash
npm run dev:api
```

The local API listens on:

```text
http://localhost:8787
```

Health check:

```bash
curl http://localhost:8787/health
```

## 6. Create a Local Test User and Organization

1. Open `http://localhost:3000/login`.
2. Create an account.
3. In Supabase Studio, confirm the user if email confirmation is enabled.
4. Run this SQL in Supabase Studio, replacing the email address:

```sql
with selected_user as (
  select id
  from auth.users
  where email = 'you@example.com'
  limit 1
),
created_org as (
  insert into public.organizations (name, slug, created_by)
  select 'Local Test Org', 'local-test', id
  from selected_user
  returning id
)
insert into public.organization_members (organization_id, user_id, role)
select created_org.id, selected_user.id, 'owner'
from created_org, selected_user;
```

The dashboard should then show one visible organization.

## 7. Verification Commands

```bash
npm run test
npm run check
npm run build:web
```

`npm run check` runs API syntax/tests and frontend TypeScript checks.

## 8. Management API Smoke Test

After `supabase start`, `supabase db reset`, `npm run dev:api`, and `npm run dev:web`, the dashboard can manage:

- Organizations
- Projects
- Endpoints
- API keys
- Endpoint query-string API key support
- Delivery logs
- Log resend

The API requires a Supabase Auth bearer token for all `/api/v1/management/*` routes.
