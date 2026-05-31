-- NORAYA — Live Data Foundation Migration
-- Phase A: real articles -> outlets -> article scores -> agenda topics -> political situations
-- Safe to run on existing Supabase project: uses IF NOT EXISTS / CREATE OR REPLACE where possible.

create extension if not exists pgcrypto;

---

-- 1. Existing app support tables

---

create table if not exists public.organizations (
id uuid primary key default gen_random_uuid(),
user_id uuid references auth.users(id) on delete cascade,
name text,
org_name text,
org_type text,
party_key text,
selected_party_profile_id uuid,
party_profile_snapshot jsonb,
profile_source text,
profile_review_status text,
themes jsonb,
issues jsonb,
events jsonb,
stakeholders jsonb,
mission text,
red_lines text,
tone text,
onboarding_completed boolean default false,
created_at timestamptz default now(),
updated_at timestamptz default now()
);

create index if not exists organizations_user_id_idx
on public.organizations(user_id);

create table if not exists public.political_party_profiles (
id uuid primary key default gen_random_uuid(),
party_key text unique not null,
party_name text not null,
short_name text,
ideological_family text,
strategic_positioning text,
default_tone text,
core_themes jsonb,
core_audiences jsonb,
known_positions jsonb,
red_lines jsonb,
opportunity_frame text,
risk_frame text,
competitor_frame text,
advisor_instructions text,
logo_url text,
brand_color text,
is_active boolean default true,
created_at timestamptz default now(),
updated_at timestamptz default now()
);

---

-- 2. Articles table used by /api/ingest and /api/classify

---

create table if not exists public.articles (
id uuid primary key default gen_random_uuid(),
external_id text,
title text not null,
description text,
link text unique not null,
image_url text,
category text,
author text,
published_at timestamptz,
ingested_at timestamptz default now(),
source_name text,
source_feed_url text,
topic text,
sentiment text,
relevance numeric,
is_political boolean,
classification_status text default 'pending',
classified_at timestamptz,
model_used text,
duplication_cluster_id uuid,
originality_type text,
created_at timestamptz default now(),
updated_at timestamptz default now()
);

alter table public.articles add column if not exists external_id text;
alter table public.articles add column if not exists title text;
alter table public.articles add column if not exists description text;
alter table public.articles add column if not exists link text;
alter table public.articles add column if not exists image_url text;
alter table public.articles add column if not exists category text;
alter table public.articles add column if not exists author text;
alter table public.articles add column if not exists published_at timestamptz;
alter table public.articles add column if not exists ingested_at timestamptz default now();
alter table public.articles add column if not exists source_name text;
alter table public.articles add column if not exists source_feed_url text;
alter table public.articles add column if not exists topic text;
alter table public.articles add column if not exists sentiment text;
alter table public.articles add column if not exists relevance numeric;
alter table public.articles add column if not exists is_political boolean;
alter table public.articles add column if not exists classification_status text default 'pending';
alter table public.articles add column if not exists classified_at timestamptz;
alter table public.articles add column if not exists model_used text;
alter table public.articles add column if not exists duplication_cluster_id uuid;
alter table public.articles add column if not exists originality_type text;
alter table public.articles add column if not exists created_at timestamptz default now();
alter table public.articles add column if not exists updated_at timestamptz default now();

create unique index if not exists articles_external_feed_unique_idx
on public.articles(external_id, source_feed_url)
where external_id is not null and source_feed_url is not null;

create index if not exists articles_published_at_idx
on public.articles(published_at desc);

create index if not exists articles_source_name_idx
on public.articles(source_name);

create index if not exists articles_topic_idx
on public.articles(topic);

create index if not exists articles_classified_at_idx
on public.articles(classified_at);

---

-- 3. Media outlets

---

create table if not exists public.media_outlets (
id uuid primary key default gen_random_uuid(),
name text unique not null,
domain text,
feed_url text,
category text,
language text default 'el',
scope text default 'national',
type text default 'portal',
reach_tier text default 'T3',
base_influence_score integer default 50,
political_audience_hint text,
demographic_hint text,
documentation_level text default 'initial',
evidence_note text,
is_active boolean default true,
last_verified_at timestamptz,
created_at timestamptz default now(),
updated_at timestamptz default now()
);

insert into public.media_outlets
(name, domain, feed_url, category, language, scope, type, reach_tier, base_influence_score, documentation_level, evidence_note)
values
('Καθημερινή', 'kathimerini.gr', 'https://feeds.feedburner.com/kathimerini/DJpy', 'broadsheet', 'el', 'national', 'newspaper', 'T1', 90, 'medium', 'Seeded from Noraya RSS registry.'),
('Τα Νέα', 'tanea.gr', 'https://www.tanea.gr/feed/', 'broadsheet', 'el', 'national', 'newspaper', 'T1', 88, 'medium', 'Seeded from Noraya RSS registry.'),
('Το Βήμα', 'tovima.gr', 'https://www.tovima.gr/feed/', 'broadsheet', 'el', 'national', 'newspaper', 'T1', 88, 'medium', 'Seeded from Noraya RSS registry.'),
('Αυγή', 'avgi.gr', 'https://www.avgi.gr/rss.xml', 'broadsheet', 'el', 'national', 'newspaper', 'T2', 70, 'initial', 'Seeded from Noraya RSS registry.'),
('Εφ.Συν.', 'efsyn.gr', 'https://www.efsyn.gr/rss.xml', 'broadsheet', 'el', 'national', 'newspaper', 'T2', 72, 'initial', 'Seeded from Noraya RSS registry.'),
('Documento', 'documentonews.gr', 'https://www.documentonews.gr/feed/', 'alternative', 'el', 'national', 'portal', 'T2', 68, 'initial', 'Seeded from Noraya RSS registry.'),
('Kontra News', 'kontranews.gr', 'https://www.kontranews.gr/feed', 'alternative', 'el', 'national', 'portal', 'T3', 55, 'initial', 'Seeded from Noraya RSS registry.'),
('News247', 'news247.gr', 'https://www.news247.gr/feed', 'portal', 'el', 'national', 'portal', 'T1', 82, 'initial', 'Seeded from Noraya RSS registry.'),
('Newsbeast', 'newsbeast.gr', 'https://www.newsbeast.gr/feed', 'portal', 'el', 'national', 'portal', 'T1', 80, 'initial', 'Seeded from Noraya RSS registry.'),
('News.gr', 'news.gr', 'https://www.news.gr/feed', 'portal', 'el', 'national', 'portal', 'T3', 55, 'initial', 'Seeded from Noraya RSS registry.'),
('ThePressProject', 'thepressproject.gr', 'https://thepressproject.gr/feed/', 'alternative', 'el', 'national', 'portal', 'T2', 65, 'initial', 'Seeded from Noraya RSS registry.'),
('TVXS', 'tvxs.gr', 'https://tvxs.gr/feed', 'alternative', 'el', 'national', 'portal', 'T3', 58, 'initial', 'Seeded from Noraya RSS registry.'),
('Reuters Europe', 'reutersagency.com', 'https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best', 'agency', 'en', 'international', 'agency', 'T1', 90, 'medium', 'Seeded from Noraya RSS registry.'),
('AP News World', 'apnews.com', 'https://rsshub.app/apnews/topics/world-news', 'agency', 'en', 'international', 'agency', 'T1', 88, 'medium', 'Seeded from Noraya RSS registry.'),
('BBC Europe', 'bbc.co.uk', 'https://feeds.bbci.co.uk/news/world/europe/rss.xml', 'international', 'en', 'international', 'portal', 'T1', 90, 'medium', 'Seeded from Noraya RSS registry.'),
('Guardian Europe', 'theguardian.com', 'https://www.theguardian.com/world/europe-news/rss', 'international', 'en', 'international', 'newspaper', 'T1', 88, 'medium', 'Seeded from Noraya RSS registry.'),
('Politico EU', 'politico.eu', 'https://www.politico.eu/feed/', 'international', 'en', 'eu', 'portal', 'T1', 84, 'medium', 'Seeded from Noraya RSS registry.'),
('Euronews', 'euronews.com', 'https://www.euronews.com/rss', 'international', 'en', 'international', 'portal', 'T1', 82, 'medium', 'Seeded from Noraya RSS registry.'),
('Ekathimerini EN', 'ekathimerini.com', 'https://www.ekathimerini.com/rss', 'international', 'en', 'international', 'newspaper', 'T2', 72, 'initial', 'Seeded from Noraya RSS registry.'),
('Βουλή RSS', 'hellenicparliament.gr', 'https://www.hellenicparliament.gr/rss/hppress.xml', 'institutional', 'el', 'institutional', 'institutional', 'T3', 60, 'medium', 'Institutional feed.'),
('Ευρωκοινοβούλιο', 'europarl.europa.eu', 'https://www.europarl.europa.eu/rss/doc/top-stories/el.xml', 'institutional', 'el', 'eu', 'institutional', 'T3', 60, 'medium', 'Institutional feed.')
on conflict (name) do update set
domain = excluded.domain,
feed_url = excluded.feed_url,
category = excluded.category,
language = excluded.language,
scope = excluded.scope,
type = excluded.type,
reach_tier = excluded.reach_tier,
base_influence_score = excluded.base_influence_score,
documentation_level = excluded.documentation_level,
evidence_note = excluded.evidence_note,
updated_at = now();

---

-- 4. Article clusters and scores

---

create table if not exists public.article_clusters (
id uuid primary key default gen_random_uuid(),
canonical_article_id uuid,
cluster_size integer default 1,
similarity_threshold numeric default 0.82,
created_at timestamptz default now(),
updated_at timestamptz default now()
);

create table if not exists public.article_scores (
id uuid primary key default gen_random_uuid(),
article_id uuid unique references public.articles(id) on delete cascade,
outlet_id uuid references public.media_outlets(id) on delete set null,
score_version integer default 1,
outlet_influence numeric default 50,
topic_relevance numeric default 50,
political_relevance numeric default 50,
locality_relevance numeric default 50,
originality_score numeric default 50,
frame_intensity numeric default 50,
audience_relevance numeric default 50,
recency_score numeric default 50,
final_article_score numeric default 50,
dominant_frame text,
blamed_actors text[],
affected_groups text[],
documentation_level text default 'initial',
explanation text,
scored_at timestamptz default now()
);

create index if not exists article_scores_final_idx
on public.article_scores(final_article_score desc);

create index if not exists article_scores_article_id_idx
on public.article_scores(article_id);

---

-- 5. Agenda topics and snapshots

---

create table if not exists public.agenda_topics (
id uuid primary key default gen_random_uuid(),
organization_id uuid references public.organizations(id) on delete cascade,
name text not null,
category text,
agenda_score integer default 0,
coverage_level text,
source_diversity integer default 0,
originality_assessment text,
documentation_level text default 'initial',
public_attention_signal integer default 0,
internal_relevance integer default 0,
political_risk_level text default 'medium',
framing_summary text,
recommended_action text,
avoid_action text,
last_computed_at timestamptz default now(),
created_at timestamptz default now(),
updated_at timestamptz default now()
);

create index if not exists agenda_topics_score_idx
on public.agenda_topics(agenda_score desc);

create unique index if not exists agenda_topics_org_name_unique_idx
on public.agenda_topics(coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

create table if not exists public.agenda_snapshots (
id uuid primary key default gen_random_uuid(),
organization_id uuid references public.organizations(id) on delete cascade,
snapshot_at timestamptz default now(),
topics jsonb,
data_hash text,
created_at timestamptz default now()
);

---

-- 6. Political situations

---

create table if not exists public.political_situations (
id uuid primary key default gen_random_uuid(),
organization_id uuid references public.organizations(id) on delete cascade,
title text not null,
category text,
related_agenda_topic_id uuid references public.agenda_topics(id) on delete set null,
status text default 'candidate',
urgency text default 'medium',
documentation_score integer default 0,
documentation_level text default 'initial',
documentation_basis text,
strategic_read jsonb,
heresthetic_read jsonb,
decision_options jsonb,
change_my_mind_triggers jsonb,
intensity_metrics jsonb,
escalation_level integer default 1,
escalation_recommended integer default 1,
public_pulse jsonb,
red_team_attacks jsonb,
summary_assessment jsonb,
created_at timestamptz default now(),
updated_at timestamptz default now()
);

create index if not exists political_situations_status_idx
on public.political_situations(status);

create index if not exists political_situations_org_idx
on public.political_situations(organization_id);

create table if not exists public.situation_evidence (
id uuid primary key default gen_random_uuid(),
situation_id uuid references public.political_situations(id) on delete cascade,
evidence_type text not null,
reference_id uuid,
relevance numeric default 50,
evidence_note text,
added_at timestamptz default now()
);

---

-- 7. AI cache and cost logs

---

create table if not exists public.analysis_cache (
id uuid primary key default gen_random_uuid(),
organization_id uuid references public.organizations(id) on delete cascade,
cache_key text not null,
data_hash text,
analysis_type text,
model_used text,
result jsonb,
input_tokens integer default 0,
output_tokens integer default 0,
generated_at timestamptz default now(),
expires_at timestamptz,
created_at timestamptz default now()
);

create unique index if not exists analysis_cache_key_hash_unique_idx
on public.analysis_cache(cache_key, coalesce(data_hash, ''));

create table if not exists public.ai_usage_logs (
id uuid primary key default gen_random_uuid(),
organization_id uuid references public.organizations(id) on delete cascade,
request_type text,
model_used text,
input_tokens integer default 0,
output_tokens integer default 0,
cost_estimate numeric default 0,
triggered_by text,
metadata jsonb,
created_at timestamptz default now()
);

---

-- 8. Advisor conversation support tables

---

create table if not exists public.advisor_conversations (
id uuid primary key default gen_random_uuid(),
user_id uuid references auth.users(id) on delete set null,
organization_id uuid references public.organizations(id) on delete cascade,
situation_id uuid references public.political_situations(id) on delete set null,
party_key text,
party_name text,
organization_name text,
title text,
topic_detected text,
intent_detected text,
user_mood text,
conversation_summary text,
metadata jsonb,
last_message_at timestamptz,
created_at timestamptz default now(),
updated_at timestamptz default now()
);

create table if not exists public.advisor_messages (
id uuid primary key default gen_random_uuid(),
conversation_id uuid references public.advisor_conversations(id) on delete cascade,
role text not null,
content text not null,
topic_detected text,
intent_detected text,
user_mood text,
source text,
model text,
model_used text,
input_context jsonb,
context_snapshot jsonb,
token_usage jsonb,
tokens_input integer,
tokens_output integer,
created_at timestamptz default now()
);

create index if not exists advisor_messages_conversation_idx
on public.advisor_messages(conversation_id, created_at);

---

-- 9. Scoring functions called by /api/classify

---

create or replace function public.refresh_article_scores_baseline()
returns integer
language plpgsql
security definer
as $$
declare
affected integer;
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
coalesce(mo.base_influence_score, 50),
case
when a.topic is not null then 70
when a.category is not null then 55
else 40
end,
case
when a.is_political is true then 75
when a.relevance is not null then least(greatest(a.relevance * 10, 0), 100)
else 45
end,
50,
case
when a.originality_type = 'original_reporting' then 100
when a.originality_type = 'opinion' then 70
when a.originality_type = 'reproduction' then 35
when a.originality_type = 'press_release' then 25
else 55
end,
case
when a.sentiment = 'αρνητικό' then 70
when a.sentiment = 'θετικό' then 55
else 45
end,
50,
case
when a.published_at is null then 35
when a.published_at > now() - interval '24 hours' then 100
when a.published_at > now() - interval '48 hours' then 75
when a.published_at > now() - interval '72 hours' then 50
else 25
end,
0,
null,
case
when mo.documentation_level = 'medium' then 'medium'
else 'initial'
end,
'Baseline score from outlet, recency, classification and RSS metadata.',
now()
from public.articles a
left join public.media_outlets mo
on lower(mo.name) = lower(a.source_name)
on conflict (article_id) do update set
outlet_id = excluded.outlet_id,
outlet_influence = excluded.outlet_influence,
topic_relevance = excluded.topic_relevance,
political_relevance = excluded.political_relevance,
locality_relevance = excluded.locality_relevance,
originality_score = excluded.originality_score,
frame_intensity = excluded.frame_intensity,
audience_relevance = excluded.audience_relevance,
recency_score = excluded.recency_score,
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

create or replace function public.refresh_article_scores_classified()
returns integer
language plpgsql
security definer
as $$
declare
affected integer;
begin
update public.article_scores s
set
topic_relevance = case
when a.topic is not null and a.topic <> '' then 80
else s.topic_relevance
end,
political_relevance = case
when a.is_political is true then least(greatest(coalesce(a.relevance, 7) * 10, 0), 100)
when a.is_political is false then 15
else s.political_relevance
end,
frame_intensity = case
when a.sentiment = 'αρνητικό' then 75
when a.sentiment = 'θετικό' then 55
else 45
end,
dominant_frame = coalesce(a.sentiment, s.dominant_frame),
documentation_level = case
when a.classified_at is not null then 'medium'
else s.documentation_level
end,
explanation = 'Classified score after AI topic/sentiment/relevance update.',
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

---

-- 10. Advisor agenda view used by strategy-brief and strategy-chat

---

create or replace view public.v_advisor_agenda_briefs_recent as
with base as (
select
coalesce(nullif(a.topic, ''), 'Μη ταξινομημένο') as topic,
a.id,
a.title,
a.link,
a.source_name,
a.is_political,
a.published_at,
coalesce(s.final_article_score, 35) as final_article_score,
coalesce(s.documentation_level, 'initial') as score_documentation_level
from public.articles a
left join public.article_scores s on s.article_id = a.id
where coalesce(a.published_at, a.ingested_at, a.created_at) > now() - interval '7 days'
),
grouped as (
select
topic,
count(*)::integer as article_count,
count(distinct source_name)::integer as source_count,
count(*) filter (where is_political is true)::integer as political_articles,
round(avg(final_article_score)::numeric, 0)::integer as agenda_score
from base
group by topic
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
when g.topic = 'Μη ταξινομημένο' then 'Υπάρχουν άρθρα που δεν έχουν ακόμη πλήρη θεματική ταξινόμηση.'
else 'Το θέμα εμφανίζεται στην πρόσφατη ατζέντα με βάση κάλυψη, πηγές και βαθμολογία άρθρων.'
end as framing_summary,
case
when g.agenda_score >= 70 then 'Να εξεταστεί άμεσα ως πιθανή ενεργή πολιτική κατάσταση.'
when g.agenda_score >= 45 then 'Να παρακολουθείται και να προετοιμαστεί γραμμή.'
else 'Χαμηλή προτεραιότητα προς το παρόν.'
end as recommended_action,
case
when g.agenda_score >= 70 then 'Αποφύγετε βιαστική κλιμάκωση χωρίς Red Team.'
else 'Αποφύγετε υπερανάλυση αν δεν ανέβει η ένταση.'
end as avoid_action,
(
select to_jsonb(array_agg(distinct b.source_name))
from base b
where b.topic = g.topic
and b.source_name is not null
) as top_sources,
(
select jsonb_agg(
jsonb_build_object(
'title', ranked.title,
'source', ranked.source_name,
'url', ranked.link,
'score', ranked.final_article_score
)
)
from (
select b.title, b.source_name, b.link, b.final_article_score
from base b
where b.topic = g.topic
order by b.final_article_score desc nulls last, b.published_at desc nulls last
limit 6
) ranked
) as top_evidence_articles,
concat(
g.article_count,
' άρθρα, ',
g.source_count,
' πηγές, ',
g.political_articles,
' πολιτικά σχετικά άρθρα.'
) as evidence_summary
from grouped g
order by g.agenda_score desc, g.article_count desc;

---

-- 11. Initial agenda topic refresh helper

---

create or replace function public.refresh_agenda_topics_from_recent_articles()
returns integer
language plpgsql
security definer
as $$
declare
affected integer;
begin
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
on conflict (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
do update set
agenda_score = excluded.agenda_score,
coverage_level = excluded.coverage_level,
source_diversity = excluded.source_diversity,
originality_assessment = excluded.originality_assessment,
documentation_level = excluded.documentation_level,
public_attention_signal = excluded.public_attention_signal,
internal_relevance = excluded.internal_relevance,
political_risk_level = excluded.political_risk_level,
framing_summary = excluded.framing_summary,
recommended_action = excluded.recommended_action,
avoid_action = excluded.avoid_action,
last_computed_at = now(),
updated_at = now();

get diagnostics affected = row_count;
return affected;
end;
$$;
