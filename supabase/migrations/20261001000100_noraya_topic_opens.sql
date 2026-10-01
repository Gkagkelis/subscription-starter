-- Noraya: δωρεάν εκδοχή — μετράμε τα ΘΕΜΑΤΑ που ανοίγει ο πελάτης στο «Σήμερα»
-- (όχι τις κλήσεις AI). Το ίδιο θέμα την ίδια μέρα δεν ξαναμετράει.
-- Προσθετικό: νέος πίνακας + νέα συνάρτηση, καμία αλλαγή σε υπάρχοντα.

create table if not exists public.noraya_topic_opens (
  id bigserial primary key,
  scope text not null,
  day date not null,
  topic_key text not null,
  user_id uuid,
  created_at timestamptz not null default now(),
  unique (scope, day, topic_key)
);

alter table public.noraya_topic_opens enable row level security;

-- Επιστρέφει πόσα θέματα έχουν ανοίξει σήμερα (μαζί με αυτό), ή null αν
-- ξεπερνιέται το όριο. Ατομικό ανά πελάτη/ημέρα (advisory lock).
create or replace function public.noraya_open_topic(
  p_scope text, p_day date, p_key text, p_limit integer, p_user uuid
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_used integer;
begin
  perform pg_advisory_xact_lock(hashtext('noraya_topic:' || p_scope || ':' || p_day::text));

  select count(*) into v_used
    from public.noraya_topic_opens
   where scope = p_scope and day = p_day;

  if exists (
    select 1 from public.noraya_topic_opens
     where scope = p_scope and day = p_day and topic_key = p_key
  ) then
    return v_used;
  end if;

  if v_used >= p_limit then
    return null;
  end if;

  insert into public.noraya_topic_opens (scope, day, topic_key, user_id)
  values (p_scope, p_day, p_key, p_user);
  return v_used + 1;
end;
$$;

revoke all on function public.noraya_open_topic(text, date, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.noraya_open_topic(text, date, text, integer, uuid) to service_role;
