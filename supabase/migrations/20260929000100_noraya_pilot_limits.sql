-- ============================================================
-- NORAYA — Pilot: κωδικοί πρόσκλησης, ημερήσια όρια, ξεκλείδωμα ημέρας,
-- καταγραφή κόστους AI και λαθών.
--
-- ΜΟΝΟ ΝΕΟΙ ΠΙΝΑΚΕΣ. Δεν αλλάζει κανέναν υπάρχοντα πίνακα.
-- Ασφαλές να τρέξει ξανά (if not exists).
-- Όλοι οι πίνακες διαβάζονται/γράφονται ΜΟΝΟ από τον server (service role):
-- RLS ενεργό χωρίς policies = κανείς browser δεν έχει πρόσβαση.
-- ============================================================

-- Κωδικοί πρόσκλησης. group_key = ο "λογαριασμός πελάτη": όσοι μπαίνουν με
-- κωδικό του ίδιου group μοιράζονται τα ίδια ημερήσια όρια και το ίδιο ξεκλείδωμα.
create table if not exists public.noraya_invite_codes (
  code text primary key,
  label text,
  group_key text not null,
  org_type text not null default 'Πολιτικό κόμμα',
  party_key text,
  max_uses integer not null default 10,
  uses integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ποιος χρήστης μπήκε με ποιον κωδικό.
create table if not exists public.noraya_access (
  user_id uuid primary key,
  group_key text not null,
  invite_code text,
  created_at timestamptz not null default now()
);

-- Κάθε κλήση AI: ποιος, ποια κατηγορία, πόσα tokens, πόσο κόστισε.
-- counted = μετράει στο ημερήσιο όριο της κατηγορίας.
create table if not exists public.noraya_ai_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  day date not null,
  scope text not null,
  user_id uuid,
  source text not null default 'user',
  category text not null,
  route text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  web_searches integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  counted boolean not null default true
);
create index if not exists noraya_ai_usage_scope_day_idx on public.noraya_ai_usage (scope, day, category);
create index if not exists noraya_ai_usage_day_source_idx on public.noraya_ai_usage (day, source);

-- Ξεκλειδώματα ημέρας (πληρωμή €40 ή χειροκίνητα από admin).
create table if not exists public.noraya_day_passes (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  scope text not null,
  day date not null,
  user_id uuid,
  amount_eur numeric(10, 2) not null default 0,
  source text not null default 'stripe',
  stripe_session_id text unique
);
create index if not exists noraya_day_passes_scope_day_idx on public.noraya_day_passes (scope, day);

-- Λάθη εφαρμογής, για να τα βλέπεις στη σελίδα admin.
create table if not exists public.noraya_error_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  route text,
  message text,
  detail jsonb,
  user_id uuid
);
create index if not exists noraya_error_log_created_idx on public.noraya_error_log (created_at desc);

-- Για να μη στέλνουμε το ίδιο email ειδοποίησης πολλές φορές.
create table if not exists public.noraya_alerts_sent (
  key text primary key,
  created_at timestamptz not null default now()
);

alter table public.noraya_invite_codes enable row level security;
alter table public.noraya_access enable row level security;
alter table public.noraya_ai_usage enable row level security;
alter table public.noraya_day_passes enable row level security;
alter table public.noraya_error_log enable row level security;
alter table public.noraya_alerts_sent enable row level security;

-- Ατομική αύξηση χρήσεων κωδικού (για να μην περάσουν δύο εγγραφές ταυτόχρονα
-- πάνω από το max_uses). Επιστρέφει τη γραμμή του κωδικού ή τίποτα.
create or replace function public.noraya_redeem_invite(p_code text)
returns setof public.noraya_invite_codes
language sql
security definer
set search_path = public
as $$
  update public.noraya_invite_codes
     set uses = uses + 1
   where code = p_code
     and active = true
     and uses < max_uses
  returning *;
$$;
revoke all on function public.noraya_redeem_invite(text) from public, anon, authenticated;
grant execute on function public.noraya_redeem_invite(text) to service_role;

-- Αθροίσματα κόστους (για τη σελίδα admin και το όριο των crons),
-- ώστε να μη διαβάζουμε χιλιάδες γραμμές.
create or replace function public.noraya_usage_daily(p_since date)
returns table (day date, source text, cost_usd numeric, calls bigint)
language sql
stable
security definer
set search_path = public
as $$
  select u.day, u.source, coalesce(sum(u.cost_usd), 0), count(*)
    from public.noraya_ai_usage u
   where u.day >= p_since
   group by u.day, u.source;
$$;
revoke all on function public.noraya_usage_daily(date) from public, anon, authenticated;
grant execute on function public.noraya_usage_daily(date) to service_role;

create or replace function public.noraya_source_cost(p_day date, p_source text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0)
    from public.noraya_ai_usage
   where day = p_day and source = p_source;
$$;
revoke all on function public.noraya_source_cost(date, text) from public, anon, authenticated;
grant execute on function public.noraya_source_cost(date, text) to service_role;

-- Κόστος ανά (source, category) σε μία μέρα — π.χ. ξεχωριστό όριο για την ταξινόμηση ειδήσεων.
create or replace function public.noraya_category_cost(p_day date, p_source text, p_category text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0)
    from public.noraya_ai_usage
   where day = p_day and source = p_source and category = p_category;
$$;
revoke all on function public.noraya_category_cost(date, text, text) from public, anon, authenticated;
grant execute on function public.noraya_category_cost(date, text, text) to service_role;

-- ΑΤΟΜΙΚΗ "κράτηση" μιας χρήσης πριν την κλήση AI: μετράει και γράφει μέσα στην
-- ίδια κλειδαριά, ώστε ταυτόχρονα κλικ να μην περνούν πάνω από το όριο.
-- p_category = null -> μετράει όλες τις κατηγορίες (π.χ. για τις σελίδες demo).
-- Επιστρέφει το id της κράτησης, ή null αν δεν επιτρέπεται.
create or replace function public.noraya_reserve(
  p_scope text,
  p_day date,
  p_category text,
  p_count_category text,
  p_limit integer,
  p_usd_cap numeric,
  p_user uuid,
  p_source text,
  p_route text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_cost numeric;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('noraya_reserve:' || p_scope || ':' || p_day::text));

  -- Κρατήσεις που δεν ολοκληρώθηκαν σε 10 λεπτά (η κλήση AI απέτυχε) δεν μετράνε.
  select count(*) into v_used
    from public.noraya_ai_usage
   where scope = p_scope and day = p_day and counted = true
     and (p_count_category is null or category = p_count_category)
     and not (model = 'reserved' and created_at < now() - interval '10 minutes');

  select coalesce(sum(cost_usd), 0) into v_cost
    from public.noraya_ai_usage
   where scope = p_scope and day = p_day;

  if v_used >= p_limit or v_cost >= p_usd_cap then
    return null;
  end if;

  insert into public.noraya_ai_usage (day, scope, user_id, source, category, route, model, counted)
  values (p_day, p_scope, p_user, p_source, p_category, p_route, 'reserved', true)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.noraya_reserve(text, date, text, text, integer, numeric, uuid, text, text) from public, anon, authenticated;
grant execute on function public.noraya_reserve(text, date, text, text, integer, numeric, uuid, text, text) to service_role;

-- Σύνοψη μίας μέρας για τη σελίδα admin (χωρίς όριο γραμμών).
create or replace function public.noraya_usage_breakdown(p_day date)
returns table (scope text, source text, category text, route text, counted boolean, calls bigint, cost_usd numeric)
language sql
stable
security definer
set search_path = public
as $$
  select u.scope, u.source, u.category, u.route, u.counted, count(*), coalesce(sum(u.cost_usd), 0)
    from public.noraya_ai_usage u
   where u.day = p_day
   group by u.scope, u.source, u.category, u.route, u.counted;
$$;
revoke all on function public.noraya_usage_breakdown(date) from public, anon, authenticated;
grant execute on function public.noraya_usage_breakdown(date) to service_role;
