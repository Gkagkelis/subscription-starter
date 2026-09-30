-- ============================================================
-- NORAYA — η cache αποτελεσμάτων (analysis_cache) ελέγχει τη φρεσκάδα με
-- updated_at, αλλά η στήλη έλειπε: τα αποθηκευμένα σενάρια / επιθέσεις /
-- strategic images δεν ξαναχρησιμοποιούνταν και το AI πληρωνόταν ξανά.
-- Μόνο προσθήκη στήλης + trigger. Τα υπάρχοντα δεδομένα δεν αλλάζουν.
-- (Εφαρμόστηκε στη βάση του Noraya στις 2026-09-29.)
-- ============================================================
alter table public.analysis_cache add column if not exists updated_at timestamptz;
update public.analysis_cache set updated_at = coalesce(created_at, now()) where updated_at is null;
alter table public.analysis_cache alter column updated_at set default now();

create or replace function public.noraya_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists analysis_cache_touch_updated_at on public.analysis_cache;
create trigger analysis_cache_touch_updated_at
  before update on public.analysis_cache
  for each row execute function public.noraya_touch_updated_at();
