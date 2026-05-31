-- NORAYA — Live Data Foundation Migration
-- Migration 1/3
-- Core live data schema:
-- organizations, party profiles, articles, media outlets, article clusters,
-- article scores, agenda topics, agenda snapshots.
--
-- This migration is live-first.
-- It does not create demo data.
-- It only creates real production structures used by Noraya.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. ORGANIZATIONS
-- ============================================================

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

create index if not exists organizations_party_key_idx
  on public.organizations(party_key);

-- ============================================================
-- 2. POLITICAL PARTY PROFILES
-- ============================================================

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

create index if not exists political_party_profiles_party_key_idx
  on public.political_party_profiles(party_key);

create index if not exists political_party_profiles_active_idx
  on public.political_party_profiles(is_active);

-- ============================================================
-- 3. ARTICLES
-- Used by /api/ingest and /api/classify
-- ============================================================

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),

  external_id text,
  title text not null,
  description text,
  link text not null,
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

create unique index if not exists articles_link_unique_idx
  on public.articles(link);

create index if not exists articles_published_at_idx
  on public.articles(published_at desc);

create index if not exists articles_ingested_at_idx
  on public.articles(ingested_at desc);

create index if not exists articles_source_name_idx
  on public.articles(source_name);

create index if not exists articles_topic_idx
  on public.articles(topic);

create index if not exists articles_classified_at_idx
  on public.articles(classified_at);

create index if not exists articles_is_political_idx
  on public.articles(is_political);

-- ============================================================
-- 4. MEDIA OUTLETS
-- Source registry for scoring and agenda weighting.
-- ============================================================

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

create index if not exists media_outlets_name_idx
  on public.media_outlets(name);

create index if not exists media_outlets_domain_idx
  on public.media_outlets(domain);

create index if not exists media_outlets_active_idx
  on public.media_outlets(is_active);

insert into public.media_outlets
  (
    name,
    domain,
    feed_url,
    category,
    language,
    scope,
    type,
    reach_tier,
    base_influence_score,
    documentation_level,
    evidence_note
  )
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

-- ============================================================
-- 5. ARTICLE CLUSTERS
-- Deduplication / canonical story layer.
-- ============================================================

create table if not exists public.article_clusters (
  id uuid primary key default gen_random_uuid(),

  canonical_article_id uuid references public.articles(id) on delete set null,

  cluster_title text,
  cluster_summary text,

  cluster_size integer default 1,
  similarity_threshold numeric default 0.82,

  originality_assessment text,
  documentation_level text default 'initial',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists article_clusters_canonical_idx
  on public.article_clusters(canonical_article_id);

-- ============================================================
-- 6. ARTICLE SCORES
-- Article-level political scoring.
-- ============================================================

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

create index if not exists article_scores_outlet_id_idx
  on public.article_scores(outlet_id);

-- ============================================================
-- 7. AGENDA TOPICS
-- Topic-level agenda layer.
-- ============================================================

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

create index if not exists agenda_topics_org_idx
  on public.agenda_topics(organization_id);

create unique index if not exists agenda_topics_org_name_unique_idx
  on public.agenda_topics(
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    name
  );

-- ============================================================
-- 8. AGENDA SNAPSHOTS
-- Cached agenda state for dashboard/advisor.
-- ============================================================

create table if not exists public.agenda_snapshots (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid references public.organizations(id) on delete cascade,

  snapshot_at timestamptz default now(),
  topics jsonb,

  data_hash text,

  created_at timestamptz default now()
);

create index if not exists agenda_snapshots_org_time_idx
  on public.agenda_snapshots(organization_id, snapshot_at desc);

-- ============================================================
-- 9. RLS
-- Keep RLS enabled where user/org data exists.
-- Service role can still write from server routes.
-- ============================================================

alter table public.organizations enable row level security;
alter table public.political_party_profiles enable row level security;
alter table public.articles enable row level security;
alter table public.media_outlets enable row level security;
alter table public.article_clusters enable row level security;
alter table public.article_scores enable row level security;
alter table public.agenda_topics enable row level security;
alter table public.agenda_snapshots enable row level security;

-- Safe read policies for registry/live public intelligence tables.
-- These do not expose private internal intelligence.

drop policy if exists "Read active party profiles" on public.political_party_profiles;
create policy "Read active party profiles"
  on public.political_party_profiles
  for select
  using (is_active = true);

drop policy if exists "Read articles" on public.articles;
create policy "Read articles"
  on public.articles
  for select
  using (true);

drop policy if exists "Read media outlets" on public.media_outlets;
create policy "Read media outlets"
  on public.media_outlets
  for select
  using (true);

drop policy if exists "Read article clusters" on public.article_clusters;
create policy "Read article clusters"
  on public.article_clusters
  for select
  using (true);

drop policy if exists "Read article scores" on public.article_scores;
create policy "Read article scores"
  on public.article_scores
  for select
  using (true);

drop policy if exists "Read agenda topics" on public.agenda_topics;
create policy "Read agenda topics"
  on public.agenda_topics
  for select
  using (
    organization_id is null
    or organization_id in (
      select id from public.organizations where user_id = auth.uid()
    )
  );

drop policy if exists "Read agenda snapshots" on public.agenda_snapshots;
create policy "Read agenda snapshots"
  on public.agenda_snapshots
  for select
  using (
    organization_id is null
    or organization_id in (
      select id from public.organizations where user_id = auth.uid()
    )
  );

drop policy if exists "Users read own organizations" on public.organizations;
create policy "Users read own organizations"
  on public.organizations
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users update own organizations" on public.organizations;
create policy "Users update own organizations"
  on public.organizations
  for update
  using (auth.uid() = user_id);

drop policy if exists "Users insert own organizations" on public.organizations;
create policy "Users insert own organizations"
  on public.organizations
  for insert
  with check (auth.uid() = user_id);
