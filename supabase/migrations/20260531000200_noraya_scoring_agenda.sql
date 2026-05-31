-- NORAYA — Scoring + Agenda Migration
-- Migration 2/3
-- Functions and views for:
-- articles -> article_scores -> agenda briefs -> agenda_topics
--
-- This migration is live-first.
-- It computes from real articles/classifications.
-- It does not create fake demo political situations.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. REFRESH ARTICLE SCORES — BASELINE
-- Called by /api/classify and safe to run repeatedly.
-- ============================================================

create or replace function public.refresh_article_scores_baseline()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  insert into public.article_scores (
    article_id,
    outlet_id,
    score_version,
    outlet_influence,
    topic_relevance,
    political_relevance,
    locality_relevance,
    originality_score,
    frame_intensity,
    audience_relevance,
    recency_score,
    final_article_score,
    dominant_frame,
    documentation_level,
    explanation,
    scored_at
  )
  select
    a.id,
    mo.id,
    1,

    coalesce(mo.base_influence_score, 50) as outlet_influence,

    case
      when a.topic is not null and trim(a.topic) <> '' then 70
      when a.category is not null and trim(a.category) <> '' then 55
      else 40
    end as topic_relevance,

    case
      when a.is_political is true then 75
      when a.is_political is false then 15
      when a.relevance is not null then least(greatest(a.relevance * 10, 0), 100)
      else 45
    end as political_relevance,

    50 as locality_relevance,

    case
      when a.originality_type = 'original_reporting' then 100
      when a.originality_type = 'opinion' then 70
      when a.originality_type = 'reproduction' then 35
      when a.originality_type = 'press_release' then 25
      else 55
    end as originality_score,

    case
      when lower(coalesce(a.sentiment, '')) in ('αρνητικό', 'negative') then 70
      when lower(coalesce(a.sentiment, '')) in ('θετικό', 'positive') then 55
      else 45
    end as frame_intensity,

    50 as audience_relevance,

    case
      when a.published_at is null then 35
      when a.published_at > now() - interval '24 hours' then 100
      when a.published_at > now() - interval '48 hours' then 75
      when a.published_at > now() - interval '72 hours' then 50
      when a.published_at > now() - interval '7 days' then 30
      else 15
    end as recency_score,

    50 as final_article_score,

    nullif(a.sentiment, '') as dominant_frame,

    case
      when coalesce(mo.documentation_level, 'initial') = 'medium' then 'medium'
      else 'initial'
    end as documentation_level,

    'Baseline score from outlet registry, recency, RSS metadata and available classification fields.' as explanation,

    now() as scored_at

  from public.articles a
  left join public.media_outlets mo
    on lower(mo.name) = lower(coalesce(a.source_name, ''))
    or lower(mo.feed_url) = lower(coalesce(a.source_feed_url, ''))

  on conflict (article_id) do update set
    outlet_id = excluded.outlet_id,
    score_version = excluded.score_version,
    outlet_influence = excluded.outlet_influence,
    topic_relevance = excluded.topic_relevance,
    political_relevance = excluded.political_relevance,
    locality_relevance = excluded.locality_relevance,
    originality_score = excluded.originality_score,
    frame_intensity = excluded.frame_intensity,
    audience_relevance = excluded.audience_relevance,
    recency_score = excluded.recency_score,
    dominant_frame = excluded.dominant_frame,
    documentation_level = excluded.documentation_level,
    explanation = excluded.explanation,
    scored_at = now();

  update public.article_scores
  set final_article_score = round((
      outlet_influence * 0.25
    + originality_score * 0.20
    + topic_relevance * 0.15
    + political_relevance * 0.10
    + frame_intensity * 0.10
    + locality_relevance * 0.10
    + recency_score * 0.05
    + audience_relevance * 0.05
  )::numeric, 2);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- ============================================================
-- 2. REFRESH ARTICLE SCORES — CLASSIFIED
-- Reweights articles after AI classification.
-- ============================================================

create or replace function public.refresh_article_scores_classified()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  perform public.refresh_article_scores_baseline();

  update public.article_scores s
  set
    topic_relevance = case
      when a.topic is not null and trim(a.topic) <> '' then 80
      else s.topic_relevance
    end,

    political_relevance = case
      when a.is_political is true then least(greatest(coalesce(a.relevance, 7) * 10, 0), 100)
      when a.is_political is false then 15
      else s.political_relevance
    end,

    frame_intensity = case
      when lower(coalesce(a.sentiment, '')) in ('αρνητικό', 'negative') then 75
      when lower(coalesce(a.sentiment, '')) in ('θετικό', 'positive') then 55
      else 45
    end,

    dominant_frame = coalesce(nullif(a.sentiment, ''), s.dominant_frame),

    documentation_level = case
      when a.classified_at is not null then 'medium'
      else s.documentation_level
    end,

    explanation = 'Classified score after AI topic, sentiment, relevance and political relevance update.',

    scored_at = now()

  from public.articles a
  where s.article_id = a.id
    and a.classified_at is not null;

  update public.article_scores
  set final_article_score = round((
      outlet_influence * 0.25
    + originality_score * 0.20
    + topic_relevance * 0.15
    + political_relevance * 0.10
    + frame_intensity * 0.10
    + locality_relevance * 0.10
    + recency_score * 0.05
    + audience_relevance * 0.05
  )::numeric, 2);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- ============================================================
-- 3. ADVISOR AGENDA VIEW
-- Used by /api/advisor/strategy-brief and /api/advisor/strategy-chat.
-- ============================================================

create or replace view public.v_advisor_agenda_briefs_recent as
with base as (
  select
    coalesce(nullif(trim(a.topic), ''), 'Μη ταξινομημένο') as topic,
    a.id,
    a.title,
    a.description,
    a.link,
    a.source_name,
    a.source_feed_url,
    a.category,
    a.is_political,
    a.sentiment,
    a.relevance,
    a.published_at,
    a.ingested_at,
    coalesce(s.final_article_score, 35) as final_article_score,
    coalesce(s.documentation_level, 'initial') as score_documentation_level
  from public.articles a
  left join public.article_scores s
    on s.article_id = a.id
  where coalesce(a.published_at, a.ingested_at, a.created_at) > now() - interval '7 days'
),
grouped as (
  select
    topic,
    count(*)::integer as article_count,
    count(distinct source_name)::integer as source_count,
    count(*) filter (where is_political is true)::integer as political_articles,
    round(avg(final_article_score)::numeric, 0)::integer as agenda_score,
    max(coalesce(published_at, ingested_at)) as latest_seen_at
  from base
  group by topic
),
ranked_articles as (
  select
    b.*,
    row_number() over (
      partition by b.topic
      order by b.final_article_score desc nulls last, coalesce(b.published_at, b.ingested_at) desc nulls last
    ) as rn
  from base b
)
select
  g.topic,
  g.article_count,
  g.source_count,
  g.political_articles,
  g.agenda_score,

  case
    when g.source_count >= 5 and g.article_count >= 8 then 'strong'
    when g.source_count >= 3 and g.article_count >= 4 then 'medium'
    when g.article_count >= 1 then 'initial'
    else 'insufficient'
  end as documentation_level,

  case
    when g.agenda_score >= 70 then 'high'
    when g.agenda_score >= 45 then 'medium'
    else 'low'
  end as political_risk_level,

  case
    when g.topic = 'Μη ταξινομημένο'
      then 'Υπάρχουν άρθρα που δεν έχουν ακόμη πλήρη θεματική ταξινόμηση.'
    when g.political_articles >= 3
      then 'Το θέμα εμφανίζεται ως πολιτικά ενεργό στην πρόσφατη ατζέντα.'
    else
      'Το θέμα εμφανίζεται στην πρόσφατη ατζέντα με βάση κάλυψη, πηγές και βαθμολογία άρθρων.'
  end as framing_summary,

  case
    when g.topic = 'Μη ταξινομημένο'
      then 'Να ολοκληρωθεί πρώτα η ταξινόμηση πριν χρησιμοποιηθεί ως πολιτικό θέμα.'
    when g.agenda_score >= 70
      then 'Να εξεταστεί άμεσα ως πιθανή ενεργή πολιτική κατάσταση.'
    when g.agenda_score >= 45
      then 'Να παρακολουθείται και να προετοιμαστεί γραμμή.'
    else
      'Χαμηλή προτεραιότητα προς το παρόν.'
  end as recommended_action,

  case
    when g.topic = 'Μη ταξινομημένο'
      then 'Αποφύγετε να το εμφανίσετε ως κανονικό θέμα ατζέντας.'
    when g.agenda_score >= 70
      then 'Αποφύγετε βιαστική κλιμάκωση χωρίς Red Team και επαρκή τεκμηρίωση.'
    else
      'Αποφύγετε υπερανάλυση αν δεν ανέβει η ένταση.'
  end as avoid_action,

  (
    select coalesce(jsonb_agg(source_name order by source_name), '[]'::jsonb)
    from (
      select distinct b.source_name
      from base b
      where b.topic = g.topic
        and b.source_name is not null
      order by b.source_name
      limit 10
    ) sources
  ) as top_sources,

  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'title', r.title,
          'source', r.source_name,
          'url', r.link,
          'published_at', r.published_at,
          'score', r.final_article_score
        )
        order by r.final_article_score desc nulls last
      ),
      '[]'::jsonb
    )
    from ranked_articles r
    where r.topic = g.topic
      and r.rn <= 6
  ) as top_evidence_articles,

  concat(
    g.article_count,
    ' άρθρα, ',
    g.source_count,
    ' πηγές, ',
    g.political_articles,
    ' πολιτικά σχετικά άρθρα.'
  ) as evidence_summary,

  g.latest_seen_at

from grouped g
order by g.agenda_score desc, g.article_count desc;

-- ============================================================
-- 4. REFRESH AGENDA TOPICS FROM RECENT ARTICLES
-- Avoids ON CONFLICT expression-index ambiguity by using update + insert.
-- ============================================================

create or replace function public.refresh_agenda_topics_from_recent_articles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  -- Update existing global agenda topics.
  update public.agenda_topics t
  set
    category = v.topic,
    agenda_score = coalesce(v.agenda_score, 0),
    coverage_level = case
      when v.article_count >= 8 then 'high'
      when v.article_count >= 4 then 'medium'
      else 'low'
    end,
    source_diversity = coalesce(v.source_count, 0),
    originality_assessment = 'mixed',
    documentation_level = v.documentation_level,
    public_attention_signal = 0,
    political_risk_level = v.political_risk_level,
    framing_summary = v.framing_summary,
    recommended_action = v.recommended_action,
    avoid_action = v.avoid_action,
    last_computed_at = now(),
    updated_at = now()
  from public.v_advisor_agenda_briefs_recent v
  where t.organization_id is null
    and t.name = v.topic
    and v.topic <> 'Μη ταξινομημένο';

  get diagnostics affected = row_count;

  -- Insert new global agenda topics.
  insert into public.agenda_topics (
    organization_id,
    name,
    category,
    agenda_score,
    coverage_level,
    source_diversity,
    originality_assessment,
    documentation_level,
    public_attention_signal,
    internal_relevance,
    political_risk_level,
    framing_summary,
    recommended_action,
    avoid_action,
    last_computed_at,
    updated_at
  )
  select
    null,
    v.topic,
    v.topic,
    coalesce(v.agenda_score, 0),
    case
      when v.article_count >= 8 then 'high'
      when v.article_count >= 4 then 'medium'
      else 'low'
    end,
    coalesce(v.source_count, 0),
    'mixed',
    v.documentation_level,
    0,
    0,
    v.political_risk_level,
    v.framing_summary,
    v.recommended_action,
    v.avoid_action,
    now(),
    now()
  from public.v_advisor_agenda_briefs_recent v
  where v.topic <> 'Μη ταξινομημένο'
    and not exists (
      select 1
      from public.agenda_topics existing
      where existing.organization_id is null
        and existing.name = v.topic
    );

  get diagnostics affected = affected + row_count;

  return affected;
end;
$$;

-- ============================================================
-- 5. Initial refresh call
-- Safe if there are no articles yet.
-- ============================================================

select public.refresh_article_scores_baseline();
select public.refresh_article_scores_classified();
select public.refresh_agenda_topics_from_recent_articles();
