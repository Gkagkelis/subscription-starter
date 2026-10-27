-- ============================================================
-- Greek Synthetic Research Lab — ΠΡΟΤΕΙΝΟΜΕΝΟ σχήμα για παραγωγή.
--
-- ΔΕΝ βρίσκεται στο supabase/migrations και ΔΕΝ εφαρμόζεται αυτόματα.
-- Το MVP αποθηκεύει σε ιδιωτικά αρχεία (.synthetic-lab-data). Για μετάβαση σε
-- Supabase: έλεγχος από τον υπεύθυνο της βάσης, εφαρμογή πρώτα σε branch.
-- Ξεχωριστό schema ώστε να μην αγγίζονται οι πίνακες της NORAYA.
-- ============================================================

create schema if not exists synthetic_lab;

create table if not exists synthetic_lab.datasets (
  id text primary key,
  name text not null,
  organization text not null,
  source_url text,
  collection_year_from int,
  collection_year_to int,
  publication_date text,
  imported_at timestamptz not null default now(),
  kind text not null check (kind in ('aggregate_survey','synthetic_population','calibration_targets','dev_fixture')),
  record_count bigint,
  license text not null,
  license_verified boolean not null default false,
  commercial_use text not null check (commercial_use in ('allowed','allowed_with_attribution','unclear','not_allowed')),
  restrictions text[] not null default '{}',
  usage text not null check (usage in ('used','validation_only','excluded','not_connected')),
  validation_status text not null default 'not_applicable',
  source_sha256 text,
  meta jsonb not null default '{}'::jsonb
);

create table if not exists synthetic_lab.studies (
  id text primary key,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null,
  domain text not null,
  research_question text not null,
  plan jsonb not null,
  population_id text not null,
  engine jsonb not null,
  seed bigint not null,
  respondent_count int not null,
  cost jsonb not null,
  aggregates jsonb not null,
  warnings text[] not null default '{}',
  datasets_used text[] not null default '{}',
  validation jsonb not null
);

-- Πλήρεις συνθετικές απαντήσεις (μία γραμμή ανά ερωτώμενο).
create table if not exists synthetic_lab.study_respondents (
  study_id text not null references synthetic_lab.studies(id) on delete cascade,
  persona_id text not null,
  weight double precision not null,
  label text not null default 'SIMULATED RESPONSE — NOT HUMAN SURVEY DATA',
  answers jsonb not null,
  cost_usd double precision,
  primary key (study_id, persona_id)
);

create table if not exists synthetic_lab.focus_groups (
  id text primary key,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null,
  session jsonb not null
);

create table if not exists synthetic_lab.validations (
  id text primary key,
  created_at timestamptz not null default now(),
  metric text,
  result jsonb not null
);

alter table synthetic_lab.datasets enable row level security;
alter table synthetic_lab.studies enable row level security;
alter table synthetic_lab.study_respondents enable row level security;
alter table synthetic_lab.focus_groups enable row level security;
alter table synthetic_lab.validations enable row level security;

-- Κάθε χρήστης βλέπει μόνο τις δικές του μελέτες· τα datasets/validations μόνο ανάγνωση.
create policy studies_owner on synthetic_lab.studies for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy respondents_owner on synthetic_lab.study_respondents for select using (
  exists (select 1 from synthetic_lab.studies s where s.id = study_id and s.owner_id = auth.uid())
);
create policy focus_owner on synthetic_lab.focus_groups for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy datasets_read on synthetic_lab.datasets for select using (auth.role() = 'authenticated');
create policy validations_read on synthetic_lab.validations for select using (auth.role() = 'authenticated');
