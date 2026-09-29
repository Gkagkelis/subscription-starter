-- Αντίγραφα ασφαλείας πριν από αλλαγές δεδομένων (π.χ. προφίλ κόμματος, οργανισμοί).
-- Μόνο προσθήκη· δεν αλλάζει κανέναν υπάρχοντα πίνακα.
create table if not exists public.noraya_backups (
  id bigserial primary key,
  kind text not null,
  ref text not null,
  data jsonb not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists noraya_backups_kind_ref_idx on public.noraya_backups (kind, ref, created_at desc);
alter table public.noraya_backups enable row level security;
