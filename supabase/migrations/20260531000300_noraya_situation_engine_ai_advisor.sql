-- NORAYA — Situation Engine + AI Advisor Context Migration
-- Migration 3/3
--
-- Live-first situation layer.
-- Builds Political Situations from real agenda topics, article scores and article evidence.
-- It does not create demo data.
-- It does not fabricate AI output.
-- It prepares verified live context for the AI Advisor.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. POLITICAL SITUATIONS
-- ============================================================

create table if not exists public.political_situations (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid references public.organizations(id) on delete cascade,
  agenda_topic_id uuid references public.agenda_topics(id) on delete set null,

  title text not null,
  topic text not null,
  situation_key text not null,

  status text default 'active',
  situation_type text default 'public_agenda',

  priority_score integer default 0,
  public_attention_score integer default 0,

  political_risk_level text default 'medium',
  opportunity_level text default 'medium',
  documentation_level text default 'initial',

  framing_summary text,
  strategic_question text,
  recommended_action text,
  avoid_action text,
  red_team_warning text,

  trigger_reason text,
  revision_triggers jsonb default '[]'::jsonb,

  evidence_summary text,
  evidence_snapshot jsonb default '[]'::jsonb,
  advisor_context jsonb default '{}'::jsonb,

  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  last_computed_at timestamptz default now(),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists political_situations_org_idx
  on public.political_situations(organization_id);

create index if not exists political_situations_agenda_topic_idx
  on public.political_situations(agenda_topic_id);

create index if not exists political_situations_priority_idx
  on public.political_situations(priority_score desc);

create index if not exists political_situations_status_idx
  on public.political_situations(status);

create unique index if not exists political_situations_org_key_unique_idx
  on public.political_situations(
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    situation_key
  );

-- ============================================================
-- 2. POLITICAL SITUATION EVIDENCE
-- ============================================================

create table if not exists public.political_situation_evidence (
  id uuid primary key default gen_random_uuid(),

  situation_id uuid not null references public.political_situations(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,

  evidence_role text default 'supporting',
  source_name text,
  article_score numeric,
  article_published_at timestamptz,

  evidence_payload jsonb default '{}'::jsonb,

  captured_at timestamptz default now()
);

create unique index if not exists political_situation_evidence_unique_idx
  on public.political_situation_evidence(situation_id, article_id);

create index if not exists political_situation_evidence_situation_idx
  on public.political_situation_evidence(situation_id);

create index if not exists political_situation_evidence_article_idx
  on public.political_situation_evidence(article_id);

-- ============================================================
-- 3. AI ADVISOR SITUATION CONTEXTS
-- Stores live context for advisor routes.
-- This is not fake AI output.
-- ============================================================

create table if not exists public.ai_advisor_situation_contexts (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid references public.organizations(id) on delete cascade,
  situation_id uuid not null references public.political_situations(id) on delete cascade,

  context_type text not null default 'strategy_advisor',
  status text default 'ready',

  model_used text,

  input_payload jsonb default '{}'::jsonb,

  advisor_system_frame text,
  advisor_user_context text,

  recommended_action text,
  avoid_action text,
  red_team_warning text,

  documentation_level text default 'initial',

  generated_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists ai_advisor_situation_contexts_unique_idx
  on public.ai_advisor_situation_contexts(situation_id, context_type);

create index if not exists ai_advisor_situation_contexts_org_idx
  on public.ai_advisor_situation_contexts(organization_id);

create index if not exists ai_advisor_situation_contexts_situation_idx
  on public.ai_advisor_situation_contexts(situation_id);

-- ============================================================
-- 4. LIVE SITUATION VIEW
-- ============================================================

create or replace view public.v_situation_engine_live as
select
  ps.id,
  ps.organization_id,
  ps.agenda_topic_id,
  ps.title,
  ps.topic,
  ps.situation_key,
  ps.status,
  ps.situation_type,
  ps.priority_score,
  ps.public_attention_score,
  ps.political_risk_level,
  ps.opportunity_level,
  ps.documentation_level,
  ps.framing_summary,
  ps.strategic_question,
  ps.recommended_action,
  ps.avoid_action,
  ps.red_team_warning,
  ps.trigger_reason,
  ps.revision_triggers,
  ps.evidence_summary,
  ps.evidence_snapshot,
  ps.advisor_context,
  ps.first_seen_at,
  ps.last_seen_at,
  ps.last_computed_at,
  ps.created_at,
  ps.updated_at,

  count(e.id)::integer as evidence_article_count,

  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'article_id', e.article_id,
        'title', a.title,
        'source', e.source_name,
        'url', a.link,
        'published_at', e.article_published_at,
        'score', e.article_score,
        'role', e.evidence_role
      )
      order by e.article_score desc nulls last, e.article_published_at desc nulls last
    ) filter (where e.article_id is not null),
    '[]'::jsonb
  ) as evidence_articles

from public.political_situations ps
left join public.political_situation_evidence e
  on e.situation_id = ps.id
left join public.articles a
  on a.id = e.article_id
group by
  ps.id,
  ps.organization_id,
  ps.agenda_topic_id,
  ps.title,
  ps.topic,
  ps.situation_key,
  ps.status,
  ps.situation_type,
  ps.priority_score,
  ps.public_attention_score,
  ps.political_risk_level,
  ps.opportunity_level,
  ps.documentation_level,
  ps.framing_summary,
  ps.strategic_question,
  ps.recommended_action,
  ps.avoid_action,
  ps.red_team_warning,
  ps.trigger_reason,
  ps.revision_triggers,
  ps.evidence_summary,
  ps.evidence_snapshot,
  ps.advisor_context,
  ps.first_seen_at,
  ps.last_seen_at,
  ps.last_computed_at,
  ps.created_at,
  ps.updated_at
order by ps.priority_score desc, ps.last_seen_at desc;

-- ============================================================
-- 5. AI ADVISOR RECENT CONTEXT VIEW
-- ============================================================

create or replace view public.v_ai_advisor_situation_context_recent as
select
  c.id,
  c.organization_id,
  c.situation_id,
  ps.title as situation_title,
  ps.topic,
  ps.status as situation_status,
  ps.priority_score,
  ps.political_risk_level,
  ps.opportunity_level,
  ps.documentation_level as situation_documentation_level,

  c.context_type,
  c.status,
  c.model_used,
  c.input_payload,
  c.advisor_system_frame,
  c.advisor_user_context,
  c.recommended_action,
  c.avoid_action,
  c.red_team_warning,
  c.documentation_level,
  c.generated_at,
  c.updated_at

from public.ai_advisor_situation_contexts c
join public.political_situations ps
  on ps.id = c.situation_id
order by ps.priority_score desc, c.generated_at desc;

-- ============================================================
-- 6. REFRESH POLITICAL SITUATIONS FROM AGENDA
-- ============================================================

create or replace function public.refresh_political_situations_from_agenda()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  step_count integer := 0;
begin
  with src as (
    select
      t.id as agenda_topic_id,
      t.organization_id,
      t.name,
      'topic:' || md5(lower(trim(t.name))) as situation_key,

      coalesce(t.agenda_score, 0)::integer as agenda_score,
      coalesce(t.source_diversity, 0)::integer as source_diversity,
      coalesce(t.public_attention_signal, 0)::integer as public_attention_signal,

      coalesce(t.political_risk_level, 'medium') as political_risk_level,
      coalesce(t.documentation_level, 'initial') as documentation_level,

      t.framing_summary,
      t.recommended_action,
      t.avoid_action,

      coalesce(v.article_count, 0)::integer as article_count,
      coalesce(v.source_count, t.source_diversity, 0)::integer as source_count,
      coalesce(v.political_articles, 0)::integer as political_articles,
      v.evidence_summary,
      coalesce(v.top_evidence_articles, '[]'::jsonb) as top_evidence_articles,
      coalesce(v.latest_seen_at, t.last_computed_at, now()) as latest_seen_at

    from public.agenda_topics t
    left join public.v_advisor_agenda_briefs_recent v
      on t.organization_id is null
      and v.topic = t.name
    where t.name is not null
      and trim(t.name) <> ''
      and t.name <> 'Μη ταξινομημένο'
  )

  update public.political_situations ps
  set
    agenda_topic_id = src.agenda_topic_id,
    title = src.name,
    topic = src.name,

    status = case
      when src.agenda_score >= 45 then 'active'
      when src.article_count > 0 then 'monitoring'
      else 'quiet'
    end,

    situation_type = 'public_agenda',

    priority_score = least(100, greatest(src.agenda_score, 0))::integer,

    public_attention_score = least(
      100,
      greatest(
        src.public_attention_signal + (src.article_count * 10) + (src.source_count * 5),
        0
      )
    )::integer,

    political_risk_level = src.political_risk_level,

    opportunity_level = case
      when src.agenda_score >= 70 and src.documentation_level in ('medium', 'strong') then 'high'
      when src.agenda_score >= 45 then 'medium'
      else 'low'
    end,

    documentation_level = src.documentation_level,

    framing_summary = coalesce(
      src.framing_summary,
      'Το θέμα εμφανίζεται στην πρόσφατη δημόσια ατζέντα και χρειάζεται παρακολούθηση.'
    ),

    strategic_question = concat(
      'Ποια θέση πρέπει να πάρει ο οργανισμός για το θέμα «',
      src.name,
      '» με βάση την τρέχουσα δημόσια ατζέντα;'
    ),

    recommended_action = src.recommended_action,
    avoid_action = src.avoid_action,

    red_team_warning = case
      when src.political_risk_level = 'high'
        then 'Να μη δοθεί σύσταση χωρίς Red Team έλεγχο, έλεγχο τεκμηρίωσης και σαφή triggers αναθεώρησης.'
      when src.documentation_level = 'initial'
        then 'Η τεκμηρίωση είναι αρχική. Να μη θεωρηθεί πλήρως επιβεβαιωμένη πολιτική κατάσταση χωρίς πρόσθετες πηγές.'
      else
        'Να ελεγχθούν αντίπαλα frames και πιθανές δεύτερες συνέπειες πριν από δημόσια τοποθέτηση.'
    end,

    trigger_reason = concat(
      src.article_count,
      ' πρόσφατα άρθρα, ',
      src.source_count,
      ' πηγές, ',
      src.political_articles,
      ' πολιτικά σχετικά άρθρα.'
    ),

    revision_triggers = jsonb_build_array(
      'Νέα ισχυρή κάλυψη από περισσότερες πηγές',
      'Αλλαγή sentiment ή πολιτικής έντασης',
      'Εμφάνιση επίσημης κυβερνητικής ή κομματικής αντίδρασης',
      'Νέα εσωτερική πληροφορία ή δημοσκοπικό εύρημα'
    ),

    evidence_summary = coalesce(
      src.evidence_summary,
      concat(src.article_count, ' άρθρα και ', src.source_count, ' πηγές.')
    ),

    evidence_snapshot = src.top_evidence_articles,

    advisor_context = jsonb_build_object(
      'source', 'agenda_topics + recent scored articles',
      'agenda_topic_id', src.agenda_topic_id,
      'article_count', src.article_count,
      'source_count', src.source_count,
      'political_articles', src.political_articles,
      'agenda_score', src.agenda_score,
      'documentation_level', src.documentation_level,
      'risk_level', src.political_risk_level,
      'live_first', true,
      'demo_data', false
    ),

    last_seen_at = greatest(coalesce(ps.last_seen_at, src.latest_seen_at), src.latest_seen_at),
    last_computed_at = now(),
    updated_at = now()

  from src
  where coalesce(ps.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(src.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and ps.situation_key = src.situation_key;

  get diagnostics step_count = row_count;
  affected := affected + step_count;

  with src as (
    select
      t.id as agenda_topic_id,
      t.organization_id,
      t.name,
      'topic:' || md5(lower(trim(t.name))) as situation_key,

      coalesce(t.agenda_score, 0)::integer as agenda_score,
      coalesce(t.source_diversity, 0)::integer as source_diversity,
      coalesce(t.public_attention_signal, 0)::integer as public_attention_signal,

      coalesce(t.political_risk_level, 'medium') as political_risk_level,
      coalesce(t.documentation_level, 'initial') as documentation_level,

      t.framing_summary,
      t.recommended_action,
      t.avoid_action,

      coalesce(v.article_count, 0)::integer as article_count,
      coalesce(v.source_count, t.source_diversity, 0)::integer as source_count,
      coalesce(v.political_articles, 0)::integer as political_articles,
      v.evidence_summary,
      coalesce(v.top_evidence_articles, '[]'::jsonb) as top_evidence_articles,
      coalesce(v.latest_seen_at, t.last_computed_at, now()) as latest_seen_at

    from public.agenda_topics t
    left join public.v_advisor_agenda_briefs_recent v
      on t.organization_id is null
      and v.topic = t.name
    where t.name is not null
      and trim(t.name) <> ''
      and t.name <> 'Μη ταξινομημένο'
  )

  insert into public.political_situations (
    organization_id,
    agenda_topic_id,
    title,
    topic,
    situation_key,
    status,
    situation_type,
    priority_score,
    public_attention_score,
    political_risk_level,
    opportunity_level,
    documentation_level,
    framing_summary,
    strategic_question,
    recommended_action,
    avoid_action,
    red_team_warning,
    trigger_reason,
    revision_triggers,
    evidence_summary,
    evidence_snapshot,
    advisor_context,
    first_seen_at,
    last_seen_at,
    last_computed_at,
    updated_at
  )
  select
    src.organization_id,
    src.agenda_topic_id,
    src.name,
    src.name,
    src.situation_key,

    case
      when src.agenda_score >= 45 then 'active'
      when src.article_count > 0 then 'monitoring'
      else 'quiet'
    end,

    'public_agenda',

    least(100, greatest(src.agenda_score, 0))::integer,

    least(
      100,
      greatest(
        src.public_attention_signal + (src.article_count * 10) + (src.source_count * 5),
        0
      )
    )::integer,

    src.political_risk_level,

    case
      when src.agenda_score >= 70 and src.documentation_level in ('medium', 'strong') then 'high'
      when src.agenda_score >= 45 then 'medium'
      else 'low'
    end,

    src.documentation_level,

    coalesce(
      src.framing_summary,
      'Το θέμα εμφανίζεται στην πρόσφατη δημόσια ατζέντα και χρειάζεται παρακολούθηση.'
    ),

    concat(
      'Ποια θέση πρέπει να πάρει ο οργανισμός για το θέμα «',
      src.name,
      '» με βάση την τρέχουσα δημόσια ατζέντα;'
    ),

    src.recommended_action,
    src.avoid_action,

    case
      when src.political_risk_level = 'high'
        then 'Να μη δοθεί σύσταση χωρίς Red Team έλεγχο, έλεγχο τεκμηρίωσης και σαφή triggers αναθεώρησης.'
      when src.documentation_level = 'initial'
        then 'Η τεκμηρίωση είναι αρχική. Να μη θεωρηθεί πλήρως επιβεβαιωμένη πολιτική κατάσταση χωρίς πρόσθετες πηγές.'
      else
        'Να ελεγχθούν αντίπαλα frames και πιθανές δεύτερες συνέπειες πριν από δημόσια τοποθέτηση.'
    end,

    concat(
      src.article_count,
      ' πρόσφατα άρθρα, ',
      src.source_count,
      ' πηγές, ',
      src.political_articles,
      ' πολιτικά σχετικά άρθρα.'
    ),

    jsonb_build_array(
      'Νέα ισχυρή κάλυψη από περισσότερες πηγές',
      'Αλλαγή sentiment ή πολιτικής έντασης',
      'Εμφάνιση επίσημης κυβερνητικής ή κομματικής αντίδρασης',
      'Νέα εσωτερική πληροφορία ή δημοσκοπικό εύρημα'
    ),

    coalesce(
      src.evidence_summary,
      concat(src.article_count, ' άρθρα και ', src.source_count, ' πηγές.')
    ),

    src.top_evidence_articles,

    jsonb_build_object(
      'source', 'agenda_topics + recent scored articles',
      'agenda_topic_id', src.agenda_topic_id,
      'article_count', src.article_count,
      'source_count', src.source_count,
      'political_articles', src.political_articles,
      'agenda_score', src.agenda_score,
      'documentation_level', src.documentation_level,
      'risk_level', src.political_risk_level,
      'live_first', true,
      'demo_data', false
    ),

    src.latest_seen_at,
    src.latest_seen_at,
    now(),
    now()

  from src
  where not exists (
    select 1
    from public.political_situations existing
    where coalesce(existing.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(src.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and existing.situation_key = src.situation_key
  );

  get diagnostics step_count = row_count;
  affected := affected + step_count;

  return affected;
end;
$$;

-- ============================================================
-- 7. REFRESH SITUATION EVIDENCE FROM RECENT ARTICLES
-- ============================================================

create or replace function public.refresh_political_situation_evidence_from_recent_articles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  step_count integer := 0;
begin
  delete from public.political_situation_evidence e
  using public.political_situations ps
  where e.situation_id = ps.id
    and ps.organization_id is null
    and ps.situation_type = 'public_agenda';

  get diagnostics step_count = row_count;
  affected := affected + step_count;

  with ranked as (
    select
      ps.id as situation_id,
      a.id as article_id,
      a.source_name,
      coalesce(s.final_article_score, 35) as article_score,
      coalesce(a.published_at, a.ingested_at, a.created_at) as article_seen_at,

      row_number() over (
        partition by ps.id
        order by
          coalesce(s.final_article_score, 35) desc,
          coalesce(a.published_at, a.ingested_at, a.created_at) desc
      ) as rn

    from public.political_situations ps
    join public.articles a
      on coalesce(nullif(trim(a.topic), ''), 'Μη ταξινομημένο') = ps.topic
    left join public.article_scores s
      on s.article_id = a.id

    where ps.organization_id is null
      and ps.situation_type = 'public_agenda'
      and ps.status in ('active', 'monitoring')
      and coalesce(a.published_at, a.ingested_at, a.created_at) > now() - interval '7 days'
  )

  insert into public.political_situation_evidence (
    situation_id,
    article_id,
    evidence_role,
    source_name,
    article_score,
    article_published_at,
    evidence_payload,
    captured_at
  )
  select
    r.situation_id,
    r.article_id,
    case
      when r.rn <= 3 then 'primary'
      else 'supporting'
    end,
    r.source_name,
    r.article_score,
    r.article_seen_at,
    jsonb_build_object(
      'rank', r.rn,
      'source', r.source_name,
      'score', r.article_score,
      'captured_from', 'recent scored articles'
    ),
    now()
  from ranked r
  where r.rn <= 8
  on conflict (situation_id, article_id) do update set
    evidence_role = excluded.evidence_role,
    source_name = excluded.source_name,
    article_score = excluded.article_score,
    article_published_at = excluded.article_published_at,
    evidence_payload = excluded.evidence_payload,
    captured_at = now();

  get diagnostics step_count = row_count;
  affected := affected + step_count;

  return affected;
end;
$$;

-- ============================================================
-- 8. REFRESH AI ADVISOR CONTEXTS FROM SITUATIONS
-- ============================================================

create or replace function public.refresh_ai_advisor_contexts_from_situations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  insert into public.ai_advisor_situation_contexts (
    organization_id,
    situation_id,
    context_type,
    status,
    model_used,
    input_payload,
    advisor_system_frame,
    advisor_user_context,
    recommended_action,
    avoid_action,
    red_team_warning,
    documentation_level,
    generated_at,
    updated_at
  )
  select
    ps.organization_id,
    ps.id,
    'strategy_advisor',
    'ready',
    null,

    jsonb_build_object(
      'situation_id', ps.id,
      'title', ps.title,
      'topic', ps.topic,
      'status', ps.status,
      'priority_score', ps.priority_score,
      'public_attention_score', ps.public_attention_score,
      'political_risk_level', ps.political_risk_level,
      'opportunity_level', ps.opportunity_level,
      'documentation_level', ps.documentation_level,
      'framing_summary', ps.framing_summary,
      'strategic_question', ps.strategic_question,
      'recommended_action', ps.recommended_action,
      'avoid_action', ps.avoid_action,
      'red_team_warning', ps.red_team_warning,
      'revision_triggers', ps.revision_triggers,
      'evidence_summary', ps.evidence_summary,
      'evidence_articles', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'article_id', e.article_id,
            'title', a.title,
            'source', e.source_name,
            'url', a.link,
            'published_at', e.article_published_at,
            'score', e.article_score,
            'role', e.evidence_role
          )
          order by e.article_score desc nulls last, e.article_published_at desc nulls last
        ) filter (where e.article_id is not null),
        '[]'::jsonb
      ),
      'live_first', true,
      'demo_data', false
    ),

    'You are the Noraya AI Advisor. Use only the supplied live evidence. Do not invent facts. Before any recommendation, include Red Team risk and revision triggers.',

    concat(
      'Political Situation: ',
      ps.title,
      E'\n\nStrategic question: ',
      coalesce(ps.strategic_question, 'Not defined.'),
      E'\n\nEvidence summary: ',
      coalesce(ps.evidence_summary, 'No evidence summary available.'),
      E'\n\nDocumentation level: ',
      coalesce(ps.documentation_level, 'initial'),
      E'\n\nRisk level: ',
      coalesce(ps.political_risk_level, 'medium')
    ),

    ps.recommended_action,
    ps.avoid_action,
    ps.red_team_warning,
    ps.documentation_level,
    now(),
    now()

  from public.political_situations ps
  left join public.political_situation_evidence e
    on e.situation_id = ps.id
  left join public.articles a
    on a.id = e.article_id
  where ps.status in ('active', 'monitoring')
  group by ps.id

  on conflict (situation_id, context_type) do update set
    organization_id = excluded.organization_id,
    status = excluded.status,
    model_used = excluded.model_used,
    input_payload = excluded.input_payload,
    advisor_system_frame = excluded.advisor_system_frame,
    advisor_user_context = excluded.advisor_user_context,
    recommended_action = excluded.recommended_action,
    avoid_action = excluded.avoid_action,
    red_team_warning = excluded.red_team_warning,
    documentation_level = excluded.documentation_level,
    generated_at = now(),
    updated_at = now();

  get diagnostics affected = row_count;

  return affected;
end;
$$;

-- ============================================================
-- 9. REFRESH FULL SITUATION ENGINE
-- ============================================================

create or replace function public.refresh_situation_engine_all()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  scored_count integer := 0;
  agenda_count integer := 0;
  situation_count integer := 0;
  evidence_count integer := 0;
  context_count integer := 0;
begin
  select public.refresh_article_scores_classified()
    into scored_count;

  select public.refresh_agenda_topics_from_recent_articles()
    into agenda_count;

  select public.refresh_political_situations_from_agenda()
    into situation_count;

  select public.refresh_political_situation_evidence_from_recent_articles()
    into evidence_count;

  select public.refresh_ai_advisor_contexts_from_situations()
    into context_count;

  return jsonb_build_object(
    'article_scores_refreshed', scored_count,
    'agenda_topics_refreshed', agenda_count,
    'political_situations_refreshed', situation_count,
    'situation_evidence_refreshed', evidence_count,
    'ai_advisor_contexts_refreshed', context_count,
    'refreshed_at', now(),
    'live_first', true,
    'demo_data', false
  );
end;
$$;

-- ============================================================
-- 10. RLS
-- ============================================================

alter table public.political_situations enable row level security;
alter table public.political_situation_evidence enable row level security;
alter table public.ai_advisor_situation_contexts enable row level security;

drop policy if exists "Read political situations" on public.political_situations;
create policy "Read political situations"
  on public.political_situations
  for select
  using (
    organization_id is null
    or organization_id in (
      select id from public.organizations where user_id = auth.uid()
    )
  );

drop policy if exists "Read political situation evidence" on public.political_situation_evidence;
create policy "Read political situation evidence"
  on public.political_situation_evidence
  for select
  using (
    exists (
      select 1
      from public.political_situations ps
      where ps.id = situation_id
        and (
          ps.organization_id is null
          or ps.organization_id in (
            select id from public.organizations where user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "Read AI advisor situation contexts" on public.ai_advisor_situation_contexts;
create policy "Read AI advisor situation contexts"
  on public.ai_advisor_situation_contexts
  for select
  using (
    organization_id is null
    or organization_id in (
      select id from public.organizations where user_id = auth.uid()
    )
    or exists (
      select 1
      from public.political_situations ps
      where ps.id = situation_id
        and (
          ps.organization_id is null
          or ps.organization_id in (
            select id from public.organizations where user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================
-- 11. INITIAL REFRESH
-- Safe if there are no articles yet.
-- ============================================================

select public.refresh_situation_engine_all();
