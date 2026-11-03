-- PERSONAL FITNESS RPG — additive migration
-- Safe to run after the existing FitTracker schema. Does not alter existing tables.

create table if not exists public.exercise_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'strength' check (category in ('endurance','strength','mobility','recovery','other')),
  unit text not null default 'reps' check (unit in ('reps','km','meters','minutes','seconds','kg','hours','rounds')),
  xp_enabled boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid references public.exercise_definitions(id) on delete set null,
  title text not null,
  category text not null default 'other' check (category in ('endurance','strength','mobility','recovery','other')),
  activity_date date not null default current_date,
  unit text not null default 'reps' check (unit in ('reps','km','meters','minutes','seconds','kg','hours','rounds')),
  metric_value numeric(12,3) not null default 0 check (metric_value >= 0),
  duration_minutes numeric(10,2) check (duration_minutes is null or duration_minutes >= 0),
  distance_km numeric(10,3) check (distance_km is null or distance_km >= 0),
  elevation_gain_m numeric(10,2) check (elevation_gain_m is null or elevation_gain_m >= 0),
  notes text,
  source text not null default 'manual' check (source in ('manual','strava','import')),
  source_external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_external_source_check check (
    (source = 'manual' and source_external_id is null) or
    (source in ('strava','import') and source_external_id is not null)
  )
);

create unique index if not exists activity_logs_external_unique
  on public.activity_logs(user_id, source, source_external_id)
  where source_external_id is not null;
create index if not exists activity_logs_user_date_idx
  on public.activity_logs(user_id, activity_date desc);
create index if not exists activity_logs_user_category_idx
  on public.activity_logs(user_id, category, activity_date desc);

create table if not exists public.activity_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.activity_logs(id) on delete cascade,
  set_number integer not null check (set_number > 0),
  quantity numeric(12,3) not null default 0 check (quantity >= 0),
  unit text not null,
  weight_kg numeric(10,2) check (weight_kg is null or weight_kg >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now(),
  unique (activity_id, set_number)
);
create index if not exists activity_sets_activity_idx on public.activity_sets(activity_id);

create table if not exists public.rpg_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_xp integer not null default 0 check (total_xp >= 0),
  endurance_xp integer not null default 0 check (endurance_xp >= 0),
  strength_xp integer not null default 0 check (strength_xp >= 0),
  consistency_xp integer not null default 0 check (consistency_xp >= 0),
  mobility_xp integer not null default 0 check (mobility_xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid references public.activity_logs(id) on delete set null,
  source_key text not null,
  category text not null check (category in ('endurance','strength','consistency','mobility','other')),
  xp_amount integer not null check (xp_amount > 0),
  reason text not null,
  awarded_at timestamptz not null default now(),
  unique (user_id, source_key)
);
create index if not exists xp_ledger_user_date_idx on public.xp_ledger(user_id, awarded_at desc);

create table if not exists public.quest_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  metric_key text not null check (metric_key in ('distance_km','reps','duration_minutes','elevation_gain_m','activity_count')),
  target_value numeric(12,3) not null check (target_value > 0),
  period text not null check (period in ('daily','weekly','monthly','custom')),
  starts_on date not null default current_date,
  ends_on date,
  reward_xp integer not null default 0 check (reward_xp >= 0 and reward_xp <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists quest_definitions_user_active_idx on public.quest_definitions(user_id, is_active);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  title text not null,
  description text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_key)
);

-- RLS: all rows are scoped to the authenticated owner. Set-level access also verifies parent ownership.
alter table public.exercise_definitions enable row level security;
alter table public.activity_logs enable row level security;
alter table public.activity_sets enable row level security;
alter table public.rpg_profiles enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.quest_definitions enable row level security;
alter table public.user_achievements enable row level security;

drop policy if exists exercise_definitions_owner on public.exercise_definitions;
create policy exercise_definitions_owner on public.exercise_definitions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists activity_logs_owner on public.activity_logs;
create policy activity_logs_owner on public.activity_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists activity_sets_owner on public.activity_sets;
create policy activity_sets_owner on public.activity_sets for all to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.activity_logs a where a.id = activity_id and a.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists (select 1 from public.activity_logs a where a.id = activity_id and a.user_id = auth.uid()));
drop policy if exists rpg_profiles_owner_select on public.rpg_profiles;
create policy rpg_profiles_owner_select on public.rpg_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists xp_ledger_owner_select on public.xp_ledger;
create policy xp_ledger_owner_select on public.xp_ledger for select to authenticated using (user_id = auth.uid());
drop policy if exists quest_definitions_owner on public.quest_definitions;
create policy quest_definitions_owner on public.quest_definitions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists user_achievements_owner_select on public.user_achievements;
create policy user_achievements_owner_select on public.user_achievements for select to authenticated using (user_id = auth.uid());

-- Create/read the profile through a narrow RPC so clients cannot write XP totals directly.
create or replace function public.ensure_rpg_profile()
returns public.rpg_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.rpg_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Autentificare necesară.'; end if;
  insert into public.rpg_profiles(user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_profile from public.rpg_profiles where user_id = v_uid;
  return v_profile;
end;
$$;
revoke all on function public.ensure_rpg_profile() from public;
grant execute on function public.ensure_rpg_profile() to authenticated;

-- Award XP only through this RPC. A unique ledger key makes awards idempotent.
create or replace function public.award_activity_xp(p_activity_id uuid)
returns table (awarded_xp integer, total_xp integer, level integer, progress_xp integer, next_level_xp integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_activity public.activity_logs%rowtype;
  v_base integer;
  v_daily integer;
  v_award integer;
  v_category text;
  v_total integer;
  v_level integer;
  v_progress integer;
  v_next integer;
begin
  if v_uid is null then raise exception 'Autentificare necesară.'; end if;
  select * into v_activity from public.activity_logs where id = p_activity_id and user_id = v_uid;
  if not found then raise exception 'Activitatea nu există sau nu îți aparține.'; end if;
  insert into public.rpg_profiles(user_id) values (v_uid) on conflict (user_id) do nothing;
  perform 1 from public.rpg_profiles where user_id = v_uid for update;
  if exists (select 1 from public.xp_ledger where user_id = v_uid and source_key = 'activity:' || p_activity_id::text) then
    select coalesce(total_xp, 0) into v_total from public.rpg_profiles where user_id = v_uid;
    v_total := coalesce(v_total, 0);
    v_level := 1;
    v_progress := v_total;
    v_next := 100;
    while v_progress >= v_next and v_level < 100 loop
      v_progress := v_progress - v_next;
      v_level := v_level + 1;
      v_next := v_level * 100;
    end loop;
    return query select 0, v_total, v_level, v_progress, v_next;
    return;
  end if;
  if v_activity.source <> 'manual' then
    -- External imports should be awarded by a separately verified import workflow.
    return query select 0, coalesce((select total_xp from public.rpg_profiles where user_id=v_uid),0), 1, 0, 100;
    return;
  end if;

  v_category := case
    when v_activity.category = 'endurance' then 'endurance'
    when v_activity.category = 'strength' then 'strength'
    when v_activity.category = 'mobility' then 'mobility'
    else 'other'
  end;

  v_base := case
    when v_activity.category = 'endurance' then least(60, greatest(5, round(coalesce(v_activity.distance_km, v_activity.metric_value, 0) * 5)::integer))
    when v_activity.category = 'strength' then least(40, greatest(5, round(coalesce(v_activity.metric_value, 0) / 5)::integer))
    when v_activity.category = 'mobility' then least(25, greatest(5, round(coalesce(v_activity.duration_minutes, v_activity.metric_value, 0) / 2)::integer))
    when v_activity.category = 'recovery' then 5
    else least(20, greatest(5, round(coalesce(v_activity.duration_minutes, 0) / 5)::integer))
  end;

  select coalesce(sum(xp_amount),0)::integer into v_daily
  from public.xp_ledger where user_id=v_uid and awarded_at >= date_trunc('day', now());
  v_award := least(v_base, greatest(0, 150 - v_daily));
  if v_award > 0 then
    insert into public.xp_ledger(user_id, activity_id, source_key, category, xp_amount, reason)
    values (v_uid, p_activity_id, 'activity:' || p_activity_id::text, v_category, v_award, 'Activitate: ' || v_activity.title)
    on conflict (user_id, source_key) do nothing;
  end if;

  update public.rpg_profiles p set
    total_xp = (select coalesce(sum(xp_amount),0)::integer from public.xp_ledger where user_id=v_uid),
    endurance_xp = (select coalesce(sum(xp_amount),0)::integer from public.xp_ledger where user_id=v_uid and category='endurance'),
    strength_xp = (select coalesce(sum(xp_amount),0)::integer from public.xp_ledger where user_id=v_uid and category='strength'),
    consistency_xp = (select count(distinct awarded_at::date)::integer * 5 from public.xp_ledger where user_id=v_uid),
    mobility_xp = (select coalesce(sum(xp_amount),0)::integer from public.xp_ledger where user_id=v_uid and category='mobility'),
    updated_at=now()
  where p.user_id=v_uid returning p.total_xp into v_total;

  -- Level 1 starts at 0 XP; each level requires 100 * current level XP.
  v_level := 1;
  v_progress := greatest(0, v_total);
  v_next := 100;
  while v_progress >= v_next and v_level < 100 loop
    v_progress := v_progress - v_next;
    v_level := v_level + 1;
    v_next := v_level * 100;
  end loop;
  return query select v_award, v_total, v_level, v_progress, v_next;
end;
$$;
revoke all on function public.award_activity_xp(uuid) from public;
grant execute on function public.award_activity_xp(uuid) to authenticated;

-- Users can create their own activities, but cannot directly write the XP ledger/profile or achievements.
grant select, insert, update, delete on public.exercise_definitions, public.activity_logs, public.activity_sets, public.quest_definitions to authenticated;
grant select on public.rpg_profiles, public.xp_ledger, public.user_achievements to authenticated;
