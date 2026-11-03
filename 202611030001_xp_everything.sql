-- XP DIN TOT: apă, nutriție, suplimente, antrenamente (Sport + Strava), plan bifat, zi completă.
-- Rulează DUPĂ 202611020001_fitness_rpg.sql. Aditiv: nu modifică tabelele aplicației, doar pe cele RPG.
-- Se poate rula de mai multe ori fără probleme.
--
-- Cum funcționează: clientul apelează sync_xp(). Funcția citește datele reale din baza de date și acordă XP.
-- Clientul NU trimite nicio sumă de XP. Fiecare premiu are o cheie unică (xp_ledger.source_key), deci
-- un premiu se acordă o singură dată, oricâte ori rulează sincronizarea și chiar dacă ștergi/reintroduci datele.
--
-- Valorile de XP (ține-le în sincron cu XP_RULES din src/lib/fitness/rpg.js):
--   Apă ............ 50% din țintă +8 · țintă atinsă +12
--   Nutriție ....... masă înregistrată +5 · 3 mese +10 · proteine la țintă +15
--                    · calorii între 85% și 110% din țintă, la sfârșit de zi, +20
--   Suplimente ..... fiecare luat +3 · toate luate +10
--   Alergare ....... 5 XP/km (min 5, max 60)
--   Bicicletă ...... 2 XP/km (min 8, max 50)
--   Forță .......... +20, plus 2 XP/set (max +20)      Alt antrenament: +10
--   Plan bifat ..... +10          Zi completă (apă+mese+suplimente+mișcare): +25
--   Plafon zilnic pentru antrenamente (activități RPG + Sport + Strava): 150 XP

-- ───────────────────────── 1. Atribut nou: VITALITY (apă + nutriție + suplimente) ─────────────────────────
alter table public.rpg_profiles
  add column if not exists vitality_xp integer not null default 0 check (vitality_xp >= 0);

alter table public.xp_ledger drop constraint if exists xp_ledger_category_check;
alter table public.xp_ledger add constraint xp_ledger_category_check
  check (category in ('endurance','strength','consistency','mobility','vitality','other'));

-- ───────────────────────── 2. Funcții interne (nu pot fi apelate din client) ─────────────────────────
create or replace function public._xp_level(p_total integer)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_level integer := 1;
  v_progress integer := greatest(0, coalesce(p_total, 0));
  v_next integer := 100;
begin
  -- Identic cu levelFromXp() din src/lib/fitness/rpg.js: nivelul N cere N*100 XP.
  while v_progress >= v_next and v_level < 100 loop
    v_progress := v_progress - v_next;
    v_level := v_level + 1;
    v_next := v_level * 100;
  end loop;
  return jsonb_build_object('level', v_level, 'progress_xp', v_progress, 'next_level_xp', v_next);
end;
$$;

-- Bicicleta își ține distanța în JSON, în coloana notes; importurile Strava au text liber.
create or replace function public._xp_safe_km(p_notes text)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  return coalesce((p_notes::jsonb ->> 'distance_km')::numeric, 0);
exception when others then
  return 0;
end;
$$;

create or replace function public._xp_award(
  p_uid uuid, p_key text, p_category text, p_xp integer, p_reason text, p_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  if p_xp is null or p_xp <= 0 then return 0; end if;
  insert into public.xp_ledger(user_id, source_key, category, xp_amount, reason, awarded_at)
  values (p_uid, p_key, p_category, p_xp, p_reason, p_at)
  on conflict (user_id, source_key) do nothing;
  get diagnostics v_rows = row_count;
  return case when v_rows > 0 then p_xp else 0 end;
end;
$$;

create or replace function public._xp_recompute(p_uid uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
begin
  insert into public.rpg_profiles(user_id) values (p_uid) on conflict (user_id) do nothing;
  update public.rpg_profiles p set
    total_xp       = (select coalesce(sum(xp_amount), 0)::integer from public.xp_ledger where user_id = p_uid),
    endurance_xp   = (select coalesce(sum(xp_amount), 0)::integer from public.xp_ledger where user_id = p_uid and category = 'endurance'),
    strength_xp    = (select coalesce(sum(xp_amount), 0)::integer from public.xp_ledger where user_id = p_uid and category = 'strength'),
    mobility_xp    = (select coalesce(sum(xp_amount), 0)::integer from public.xp_ledger where user_id = p_uid and category = 'mobility'),
    vitality_xp    = (select coalesce(sum(xp_amount), 0)::integer from public.xp_ledger where user_id = p_uid and category = 'vitality'),
    -- 5 puncte pentru fiecare zi în care ai câștigat XP + bonusurile de consecvență
    consistency_xp = (select count(distinct awarded_at::date)::integer * 5 from public.xp_ledger where user_id = p_uid)
                   + (select coalesce(sum(xp_amount), 0)::integer from public.xp_ledger where user_id = p_uid and category = 'consistency'),
    updated_at = now()
  where p.user_id = p_uid
  returning p.total_xp into v_total;
  return v_total;
end;
$$;

-- ───────────────────────── 3. sync_xp: motorul de XP ─────────────────────────
-- p_today     = data de azi pe dispozitiv (folosită doar ca să știe ce zi e „încheiată"; limitată la ±1 zi față de server)
-- p_days_back = câte zile în urmă se reevaluează (0 = doar azi; max 60 — util și pentru recuperarea istoricului)
create or replace function public.sync_xp(p_today date default null, p_days_back integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_server date := current_date;
  v_today date;
  d date;
  v_at timestamptz;
  v_cal_t numeric; v_prot_t numeric; v_water_t numeric;
  v_water numeric := 0;
  v_meal_items integer := 0; v_meal_types integer := 0;
  v_cal numeric := 0; v_prot numeric := 0;
  v_sup_total integer := 0; v_sup_taken integer := 0; v_sup_cal numeric := 0; v_sup_prot numeric := 0;
  v_train_done boolean;
  v_train_left integer;
  v_cand jsonb;
  v_tmp jsonb;
  r record;
  v_xp integer;
  v_got integer;
  v_awarded integer := 0;
  v_items jsonb := '[]'::jsonb;
  v_total integer;
begin
  if v_uid is null then raise exception 'Autentificare necesară.'; end if;

  v_today := least(greatest(coalesce(p_today, v_server), v_server - 1), v_server + 1);
  p_days_back := least(greatest(coalesce(p_days_back, 0), 0), 60);

  insert into public.rpg_profiles(user_id) values (v_uid) on conflict (user_id) do nothing;
  perform 1 from public.rpg_profiles where user_id = v_uid for update;  -- serializează sincronizările simultane

  select coalesce(calories, 2000), coalesce(protein_g, 150), coalesce(water_ml, 2000)
    into v_cal_t, v_prot_t, v_water_t
  from public.user_targets where user_id = v_uid;
  if not found then v_cal_t := 2000; v_prot_t := 150; v_water_t := 2000; end if;
  v_cal_t := greatest(v_cal_t, 1); v_prot_t := greatest(v_prot_t, 1); v_water_t := greatest(v_water_t, 1);

  for d in select g::date from generate_series(v_today - p_days_back, v_today, interval '1 day') g loop
    v_at := least(now(), (d::timestamp + interval '12 hours')::timestamptz);
    v_cand := '[]'::jsonb;

    -- ── Apă ──
    select coalesce(sum(amount_ml), 0) into v_water
    from public.water_logs where user_id = v_uid and date = d;

    if v_water >= v_water_t * 0.5 then
      v_cand := v_cand || jsonb_build_array(jsonb_build_object(
        'k', 'water:' || to_char(d, 'YYYY-MM-DD') || ':50', 'c', 'vitality', 'xp', 8,
        't', 'Apă: jumătate din țintă', 'tr', false));
    end if;
    if v_water >= v_water_t then
      v_cand := v_cand || jsonb_build_array(jsonb_build_object(
        'k', 'water:' || to_char(d, 'YYYY-MM-DD') || ':100', 'c', 'vitality', 'xp', 12,
        't', 'Apă: ținta zilei atinsă', 'tr', false));
    end if;

    -- ── Mese (macro-urile suplimentelor luate se adună, ca pe ecranul Acasă) ──
    select count(mi.id)::integer,
           count(distinct ml.meal_type)::integer,
           coalesce(sum(mi.quantity_g / 100.0 * coalesce(f.calories, 0)), 0),
           coalesce(sum(mi.quantity_g / 100.0 * coalesce(f.protein, 0)), 0)
      into v_meal_items, v_meal_types, v_cal, v_prot
    from public.meal_logs ml
    join public.meal_items mi on mi.meal_log_id = ml.id
    left join public.foods f on f.id = mi.food_id
    where ml.user_id = v_uid and ml.date = d;

    -- ── Suplimente ──
    select count(*)::integer into v_sup_total from public.daily_supplements where user_id = v_uid;

    select count(*)::integer, coalesce(sum(s.calories), 0), coalesce(sum(s.protein_g), 0)
      into v_sup_taken, v_sup_cal, v_sup_prot
    from public.daily_supplements s
    where s.user_id = v_uid
      and s.id in (select supplement_id from public.supplement_logs where user_id = v_uid and date = d and taken);

    v_cal := v_cal + v_sup_cal;
    v_prot := v_prot + v_sup_prot;

    if v_meal_items > 0 then
      v_cand := v_cand || jsonb_build_array(jsonb_build_object(
        'k', 'meal:' || to_char(d, 'YYYY-MM-DD') || ':logged', 'c', 'vitality', 'xp', 5,
        't', 'Nutriție: masă înregistrată', 'tr', false));
      if v_prot >= v_prot_t then
        v_cand := v_cand || jsonb_build_array(jsonb_build_object(
          'k', 'protein:' || to_char(d, 'YYYY-MM-DD'), 'c', 'vitality', 'xp', 15,
          't', 'Proteine: ținta atinsă', 'tr', false));
      end if;
      -- caloriile se evaluează doar pentru zile încheiate (altfel „85%" ar fi atins la prânz)
      if d < v_today and v_cal between v_cal_t * 0.85 and v_cal_t * 1.10 then
        v_cand := v_cand || jsonb_build_array(jsonb_build_object(
          'k', 'cal:' || to_char(d, 'YYYY-MM-DD'), 'c', 'vitality', 'xp', 20,
          't', 'Calorii în zona țintă', 'tr', false));
      end if;
    end if;
    if v_meal_types >= 3 then
      v_cand := v_cand || jsonb_build_array(jsonb_build_object(
        'k', 'meal:' || to_char(d, 'YYYY-MM-DD') || ':three', 'c', 'vitality', 'xp', 10,
        't', 'Nutriție: 3 mese înregistrate', 'tr', false));
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
             'k', 'sup:' || to_char(d, 'YYYY-MM-DD') || ':' || s.id, 'c', 'vitality', 'xp', 3,
             't', 'Supliment luat: ' || coalesce(s.name, '—'), 'tr', false) order by s.created_at), '[]'::jsonb)
      into v_tmp
    from public.daily_supplements s
    where s.user_id = v_uid
      and s.id in (select supplement_id from public.supplement_logs where user_id = v_uid and date = d and taken);
    v_cand := v_cand || v_tmp;

    if v_sup_total > 0 and v_sup_taken >= v_sup_total then
      v_cand := v_cand || jsonb_build_array(jsonb_build_object(
        'k', 'sup:' || to_char(d, 'YYYY-MM-DD') || ':all', 'c', 'vitality', 'xp', 10,
        't', 'Toate suplimentele luate', 'tr', false));
    end if;

    -- ── Alergări (Sport + Strava) ──
    select coalesce(jsonb_agg(jsonb_build_object(
             'k', 'run:' || id, 'c', 'endurance',
             'xp', least(60, greatest(5, round(least(distance_km, 1000) * 5)::integer)),
             't', 'Alergare ' || round(distance_km, 1) || ' km', 'tr', true) order by created_at), '[]'::jsonb)
      into v_tmp
    from public.running_logs where user_id = v_uid and date = d and distance_km > 0;
    v_cand := v_cand || v_tmp;

    -- ── Antrenamente din Sport (forță, bicicletă, altele; includ importurile Strava) ──
    select coalesce(jsonb_agg(jsonb_build_object(
             'k', 'workout:' || w.id,
             'c', case w.type when 'cycling' then 'endurance' when 'strength' then 'strength' else 'other' end,
             'xp', case w.type
                     when 'cycling'  then least(50, greatest(8, round(least(public._xp_safe_km(w.notes), 500) * 2)::integer))
                     when 'strength' then 20
                     else 10 end,
             't', 'Antrenament: ' || coalesce(w.name, w.type), 'tr', true) order by w.created_at), '[]'::jsonb)
      into v_tmp
    from public.workout_logs w where w.user_id = v_uid and w.date = d;
    v_cand := v_cand || v_tmp;

    -- bonus de volum la forță: seturile se introduc după antrenament, de aceea e o cheie separată
    select coalesce(jsonb_agg(jsonb_build_object(
             'k', 'workout:' || w.id || ':vol', 'c', 'strength',
             'xp', least(20, least(x.total_sets, 1000) * 2),
             't', 'Volum antrenament: ' || x.total_sets || ' seturi', 'tr', true) order by w.created_at), '[]'::jsonb)
      into v_tmp
    from public.workout_logs w
    join lateral (select coalesce(sum(e.sets), 0)::integer as total_sets
                  from public.workout_exercises e where e.workout_log_id = w.id) x on true
    where w.user_id = v_uid and w.date = d and w.type = 'strength' and x.total_sets > 0;
    v_cand := v_cand || v_tmp;

    -- ── Plan bifat ──
    select coalesce(jsonb_agg(jsonb_build_object(
             'k', 'plan:' || l.id, 'c', 'consistency', 'xp', 10,
             't', 'Antrenament din plan bifat', 'tr', false) order by l.created_at), '[]'::jsonb)
      into v_tmp
    from public.workout_schedule_logs l where l.user_id = v_uid and l.date = d and l.done;
    v_cand := v_cand || v_tmp;

    -- ── Zi completă ──
    v_train_done :=
         exists (select 1 from public.running_logs where user_id = v_uid and date = d and distance_km > 0)
      or exists (select 1 from public.workout_logs where user_id = v_uid and date = d)
      or exists (select 1 from public.workout_schedule_logs where user_id = v_uid and date = d and done);

    if v_water >= v_water_t and v_meal_items > 0
       and (v_sup_total = 0 or v_sup_taken >= v_sup_total) and v_train_done then
      v_cand := v_cand || jsonb_build_array(jsonb_build_object(
        'k', 'perfect:' || to_char(d, 'YYYY-MM-DD'), 'c', 'consistency', 'xp', 25,
        't', 'Zi completă: apă, mese, suplimente și mișcare', 'tr', false));
    end if;

    -- ── Acordare (plafon zilnic pentru antrenamente, valabil și pentru activitățile RPG manuale) ──
    select greatest(0, 150 - coalesce(sum(xp_amount), 0))::integer into v_train_left
    from public.xp_ledger
    where user_id = v_uid and awarded_at::date = d and source_key ~ '^(activity|workout|run):';

    for r in
      select * from jsonb_to_recordset(v_cand) as x(k text, c text, xp integer, t text, tr boolean)
    loop
      v_xp := r.xp;
      if r.tr then v_xp := least(v_xp, v_train_left); end if;
      v_got := public._xp_award(v_uid, r.k, r.c, v_xp, r.t, v_at);
      if v_got > 0 then
        if r.tr then v_train_left := v_train_left - v_got; end if;
        v_awarded := v_awarded + v_got;
        v_items := v_items || jsonb_build_array(jsonb_build_object('reason', r.t, 'xp', v_got, 'category', r.c));
      end if;
    end loop;
  end loop;

  v_total := public._xp_recompute(v_uid);
  return jsonb_build_object('awarded', v_awarded, 'total_xp', v_total, 'items', v_items) || public._xp_level(v_total);
end;
$$;

-- ───────────────────────── 4. award_activity_xp: același comportament + plafon comun ─────────────────────────
-- Schimbări față de versiunea anterioară:
--   * plafonul de 150 XP/zi numără doar XP de antrenament (nu și apa/nutriția/suplimentele);
--   * totalurile se calculează într-un singur loc (_xp_recompute), inclusiv VITALITY;
--   * repară o ambiguitate de nume (total_xp) care ar fi dat eroare la a doua apelare pe aceeași activitate.
create or replace function public.award_activity_xp(p_activity_id uuid)
returns table (awarded_xp integer, total_xp integer, level integer, progress_xp integer, next_level_xp integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_activity public.activity_logs%rowtype;
  v_base integer;
  v_daily integer;
  v_award integer := 0;
  v_category text;
  v_total integer;
  v_info jsonb;
begin
  if v_uid is null then raise exception 'Autentificare necesară.'; end if;
  select * into v_activity from public.activity_logs where id = p_activity_id and user_id = v_uid;
  if not found then raise exception 'Activitatea nu există sau nu îți aparține.'; end if;
  insert into public.rpg_profiles(user_id) values (v_uid) on conflict (user_id) do nothing;
  perform 1 from public.rpg_profiles where user_id = v_uid for update;

  if exists (select 1 from public.xp_ledger where user_id = v_uid and source_key = 'activity:' || p_activity_id::text)
     or v_activity.source <> 'manual' then
    -- deja acordat, sau import extern (acestea se acordă prin fluxul verificat de import)
    select coalesce(p.total_xp, 0) into v_total from public.rpg_profiles p where p.user_id = v_uid;
    v_info := public._xp_level(v_total);
    return query select 0, v_total, (v_info->>'level')::integer, (v_info->>'progress_xp')::integer, (v_info->>'next_level_xp')::integer;
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

  select coalesce(sum(xp_amount), 0)::integer into v_daily
  from public.xp_ledger
  where user_id = v_uid and awarded_at >= date_trunc('day', now()) and source_key ~ '^(activity|workout|run):';
  v_award := least(v_base, greatest(0, 150 - v_daily));
  v_award := public._xp_award(v_uid, 'activity:' || p_activity_id::text, v_category, v_award,
                              'Activitate: ' || v_activity.title, now());

  v_total := public._xp_recompute(v_uid);
  v_info := public._xp_level(v_total);
  return query select v_award, v_total, (v_info->>'level')::integer, (v_info->>'progress_xp')::integer, (v_info->>'next_level_xp')::integer;
end;
$$;

-- ───────────────────────── 5. Permisiuni ─────────────────────────
-- Pe Supabase, funcțiile noi primesc implicit EXECUTE pentru anon/authenticated, de aceea le retragem explicit.
revoke all on function public._xp_award(uuid, text, text, integer, text, timestamptz) from public, anon, authenticated;
revoke all on function public._xp_recompute(uuid) from public, anon, authenticated;
revoke all on function public.sync_xp(date, integer) from public, anon;
grant execute on function public.sync_xp(date, integer) to authenticated;
revoke all on function public.award_activity_xp(uuid) from public, anon;
grant execute on function public.award_activity_xp(uuid) to authenticated;

-- Defensă în plus: XP-ul, profilul RPG și realizările se scriu DOAR prin funcțiile de mai sus.
-- (RLS le blochează deja; pe Supabase, privilegiile implicite sunt însă largi, deci le retragem explicit.)
revoke insert, update, delete, truncate, references, trigger
  on public.rpg_profiles, public.xp_ledger, public.user_achievements from anon, authenticated;
