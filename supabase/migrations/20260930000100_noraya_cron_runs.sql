-- Καταγραφή κάθε τρεξίματος των αυτόματων βημάτων της ατζέντας (detect / advise / brief / refresh):
-- πότε κλήθηκαν, αν έκαναν δουλειά ή όχι και γιατί. Μόνο προσθήκη — δεν αλλάζει κανέναν υπάρχοντα πίνακα.
create table if not exists public.noraya_cron_runs (
  id bigserial primary key,
  route text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  http_status int,
  outcome text,          -- ran | off_hours | budget_reached | unauthorized | error | ...
  did_work boolean not null default false,
  detail jsonb
);
create index if not exists noraya_cron_runs_route_started on public.noraya_cron_runs (route, started_at desc);
alter table public.noraya_cron_runs enable row level security;
