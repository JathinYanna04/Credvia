create table if not exists public.startup_idea_revisions (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.posts(id) on delete cascade,
  revision_number integer not null,
  title text not null,
  body_md text null,
  body_html text null,
  problem text not null,
  target_audience text not null,
  solution text not null,
  market_category text not null,
  stage text not null,
  monetization_model text null,
  change_summary text null,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, revision_number)
);

alter table public.startup_ideas
  add column if not exists current_revision_id uuid null references public.startup_idea_revisions(id) on delete set null,
  add column if not exists revision_count integer not null default 1,
  add column if not exists follower_count integer not null default 0,
  add column if not exists last_revision_at timestamptz not null default now();

create table if not exists public.idea_followers (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists startup_idea_revisions_post_created_idx
  on public.startup_idea_revisions (post_id, created_at desc);

create index if not exists startup_ideas_last_revision_idx
  on public.startup_ideas (last_revision_at desc);

create index if not exists idea_followers_user_created_idx
  on public.idea_followers (user_id, created_at desc);

alter table public.startup_idea_revisions enable row level security;
alter table public.idea_followers enable row level security;

drop policy if exists "startup idea revisions are public for published idea posts"
  on public.startup_idea_revisions;
create policy "startup idea revisions are public for published idea posts"
  on public.startup_idea_revisions
  for select
  using (
    exists (
      select 1
      from public.posts p
      where p.id = startup_idea_revisions.post_id
        and p.post_type = 'startup_idea'
        and p.status = 'published'
    )
  );

drop policy if exists "founders can append revisions to their own ideas"
  on public.startup_idea_revisions;
create policy "founders can append revisions to their own ideas"
  on public.startup_idea_revisions
  for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1
      from public.startup_ideas si
      join public.posts p on p.id = si.post_id
      where si.post_id = startup_idea_revisions.post_id
        and si.founder_user_id = auth.uid()
        and p.author_id = auth.uid()
        and p.post_type = 'startup_idea'
    )
  );

drop policy if exists "idea followers can view their own rows"
  on public.idea_followers;
create policy "idea followers can view their own rows"
  on public.idea_followers
  for select
  using (auth.uid() = user_id);

drop policy if exists "users can follow startup ideas for themselves"
  on public.idea_followers;
create policy "users can follow startup ideas for themselves"
  on public.idea_followers
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.posts p
      where p.id = idea_followers.post_id
        and p.post_type = 'startup_idea'
        and p.status = 'published'
    )
  );

drop policy if exists "users can unfollow startup ideas for themselves"
  on public.idea_followers;
create policy "users can unfollow startup ideas for themselves"
  on public.idea_followers
  for delete
  using (auth.uid() = user_id);
