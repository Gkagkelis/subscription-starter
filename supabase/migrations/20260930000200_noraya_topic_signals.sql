-- Ελαφριά εκδοχή του v_advisor_agenda_briefs_recent για το ημερήσιο brief:
-- μόνο τα νούμερα ανά θεματική (χωρίς λίστες άρθρων/πηγών), για να μη χτυπά statement timeout.
create or replace function public.noraya_topic_signals(p_hours integer default 48)
returns table (topic text, article_count integer, source_count integer, political_articles integer, agenda_score integer)
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '30s'
as $$
  select
    coalesce(nullif(trim(a.topic), ''), 'Μη ταξινομημένο') as topic,
    count(*)::int as article_count,
    count(distinct a.source_name)::int as source_count,
    count(*) filter (where a.is_political is true)::int as political_articles,
    round(avg(coalesce(s.final_article_score, 35)))::int as agenda_score
  from public.articles a
  left join public.article_scores s on s.article_id = a.id
  where a.published_at > now() - make_interval(hours => greatest(1, least(p_hours, 168)))
    and coalesce(a.is_noise, false) = false
  group by 1
  order by agenda_score desc, article_count desc;
$$;
revoke all on function public.noraya_topic_signals(integer) from public, anon, authenticated;
grant execute on function public.noraya_topic_signals(integer) to service_role;
