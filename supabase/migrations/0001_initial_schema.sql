create extension if not exists pgcrypto;
create schema if not exists hookgate_private;

create type public.hookgate_role as enum ('owner', 'admin', 'developer', 'viewer');
create type public.webhook_service_type as enum ('discord', 'slack');
create type public.webhook_log_status as enum (
  'received',
  'queued',
  'sending',
  'succeeded',
  'failed',
  'retrying',
  'cancelled',
  'rate_limited'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.hookgate_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  service_type public.webhook_service_type not null,
  webhook_url_ciphertext text not null,
  is_enabled boolean not null default true,
  timeout_seconds integer not null default 10 check (timeout_seconds between 1 and 30),
  retry_enabled boolean not null default true,
  allow_query_api_key boolean not null default false,
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute > 0),
  log_policy text not null default 'summary',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.webhook_api_keys (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  api_key_hash text not null,
  is_active boolean not null default true,
  last_used_at timestamptz,
  last_used_ip inet,
  use_count bigint not null default 0,
  created_by uuid references auth.users(id),
  revoked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index webhook_api_keys_one_active_per_endpoint
  on public.webhook_api_keys(endpoint_id)
  where is_active;

create index webhook_api_keys_hash_idx on public.webhook_api_keys(api_key_hash);

create table public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  status public.webhook_log_status not null,
  service_type public.webhook_service_type not null,
  http_status integer,
  retry_count integer not null default 0,
  source_ip inet,
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  error_message text,
  idempotency_key text,
  queued_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index webhook_logs_org_created_idx on public.webhook_logs(organization_id, created_at desc);
create index webhook_logs_project_created_idx on public.webhook_logs(project_id, created_at desc);
create index webhook_logs_endpoint_created_idx on public.webhook_logs(endpoint_id, created_at desc);
create index webhook_logs_status_idx on public.webhook_logs(status);
create index webhook_logs_idempotency_idx on public.webhook_logs(endpoint_id, idempotency_key)
  where idempotency_key is not null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  ip_address inet,
  user_agent text,
  before_summary jsonb not null default '{}'::jsonb,
  after_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_api_keys enable row level security;
alter table public.webhook_logs enable row level security;
alter table public.audit_logs enable row level security;

create function hookgate_private.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, hookgate_private
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_org_id
      and member.user_id = auth.uid()
  );
$$;

create function hookgate_private.has_org_role(target_org_id uuid, allowed_roles public.hookgate_role[])
returns boolean
language sql
stable
security definer
set search_path = public, hookgate_private
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_org_id
      and member.user_id = auth.uid()
      and member.role = any(allowed_roles)
  );
$$;

create policy "members can read organizations"
  on public.organizations for select
  using (hookgate_private.is_org_member(id));

create policy "owners and admins can update organizations"
  on public.organizations for update
  using (hookgate_private.has_org_role(id, array['owner', 'admin']::public.hookgate_role[]));

create policy "members can read organization members"
  on public.organization_members for select
  using (hookgate_private.is_org_member(organization_id));

create policy "owners and admins manage organization members"
  on public.organization_members for all
  using (hookgate_private.has_org_role(organization_id, array['owner', 'admin']::public.hookgate_role[]))
  with check (hookgate_private.has_org_role(organization_id, array['owner', 'admin']::public.hookgate_role[]));

create policy "members can read projects"
  on public.projects for select
  using (hookgate_private.is_org_member(organization_id));

create policy "owners admins developers manage projects"
  on public.projects for all
  using (hookgate_private.has_org_role(organization_id, array['owner', 'admin', 'developer']::public.hookgate_role[]))
  with check (hookgate_private.has_org_role(organization_id, array['owner', 'admin', 'developer']::public.hookgate_role[]));

create policy "members can read endpoints"
  on public.webhook_endpoints for select
  using (hookgate_private.is_org_member(organization_id));

create policy "owners admins developers manage endpoints"
  on public.webhook_endpoints for all
  using (hookgate_private.has_org_role(organization_id, array['owner', 'admin', 'developer']::public.hookgate_role[]))
  with check (hookgate_private.has_org_role(organization_id, array['owner', 'admin', 'developer']::public.hookgate_role[]));

create policy "members can read api key metadata"
  on public.webhook_api_keys for select
  using (
    exists (
      select 1
      from public.webhook_endpoints endpoint
      where endpoint.id = webhook_api_keys.endpoint_id
        and hookgate_private.is_org_member(endpoint.organization_id)
    )
  );

create policy "owners admins developers manage api keys"
  on public.webhook_api_keys for all
  using (
    exists (
      select 1
      from public.webhook_endpoints endpoint
      where endpoint.id = webhook_api_keys.endpoint_id
        and hookgate_private.has_org_role(endpoint.organization_id, array['owner', 'admin', 'developer']::public.hookgate_role[])
    )
  )
  with check (
    exists (
      select 1
      from public.webhook_endpoints endpoint
      where endpoint.id = webhook_api_keys.endpoint_id
        and hookgate_private.has_org_role(endpoint.organization_id, array['owner', 'admin', 'developer']::public.hookgate_role[])
    )
  );

create policy "members can read webhook logs"
  on public.webhook_logs for select
  using (hookgate_private.is_org_member(organization_id));

create policy "owners admins developers read audit logs"
  on public.audit_logs for select
  using (hookgate_private.has_org_role(organization_id, array['owner', 'admin']::public.hookgate_role[]));

create function public.increment_api_key_usage()
returns trigger
language plpgsql
as $$
begin
  if new.last_used_at is distinct from old.last_used_at then
    new.use_count = old.use_count + 1;
  end if;
  return new;
end;
$$;

create trigger webhook_api_keys_usage_trigger
before update on public.webhook_api_keys
for each row
execute function public.increment_api_key_usage();

revoke all on schema hookgate_private from anon, authenticated;
grant usage on schema hookgate_private to authenticated;
grant execute on function hookgate_private.is_org_member(uuid) to authenticated;
grant execute on function hookgate_private.has_org_role(uuid, public.hookgate_role[]) to authenticated;
revoke select on public.webhook_endpoints from anon, authenticated;
revoke select on public.webhook_api_keys from anon, authenticated;

grant select (
  id,
  organization_id,
  project_id,
  name,
  service_type,
  is_enabled,
  timeout_seconds,
  retry_enabled,
  allow_query_api_key,
  rate_limit_per_minute,
  log_policy,
  created_by,
  updated_by,
  created_at,
  updated_at
) on public.webhook_endpoints to authenticated;

grant select (
  id,
  endpoint_id,
  is_active,
  last_used_at,
  last_used_ip,
  use_count,
  created_by,
  revoked_by,
  created_at,
  revoked_at
) on public.webhook_api_keys to authenticated;
