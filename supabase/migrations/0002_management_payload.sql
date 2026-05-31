alter table public.webhook_logs
  add column if not exists request_payload jsonb;

create index if not exists webhook_logs_request_payload_idx
  on public.webhook_logs using gin (request_payload)
  where request_payload is not null;
