# 🏋️ FitTracker — Ghid de instalare & deploy

Aplicație PWA pentru urmărire nutriție și antrenamente. React + Supabase + Netlify.

---

## ✅ Pasul 1 — Supabase (baza de date)

1. Mergi la **https://supabase.com** → "New project"
2. Alege un nume și o parolă
3. Mergi la **SQL Editor** și rulează acest SQL:

```sql
-- Foods
create table foods (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  calories numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  created_at timestamptz default now()
);

-- Meal logs
create table meal_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  meal_type text not null,
  created_at timestamptz default now()
);

-- Meal items
create table meal_items (
  id uuid default gen_random_uuid() primary key,
  meal_log_id uuid references meal_logs(id) on delete cascade not null,
  food_id uuid references foods(id) on delete cascade not null,
  quantity_g numeric not null default 100,
  created_at timestamptz default now()
);

-- Water logs
create table water_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  amount_ml numeric not null default 0,
  created_at timestamptz default now()
);

-- Weight logs
create table weight_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  weight_kg numeric not null,
  created_at timestamptz default now()
);

-- User targets
create table user_targets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  calories numeric default 2000,
  protein_g numeric default 150,
  carbs_g numeric default 250,
  fat_g numeric default 65,
  water_ml numeric default 2000,
  created_at timestamptz default now()
);

-- Running logs
create table running_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  distance_km numeric not null,
  duration_min numeric not null,
  notes text,
  created_at timestamptz default now()
);

-- Workout logs
create table workout_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  name text not null,
  type text not null default 'strength',
  notes text,
  created_at timestamptz default now()
);

-- Workout exercises
create table workout_exercises (
  id uuid default gen_random_uuid() primary key,
  workout_log_id uuid references workout_logs(id) on delete cascade not null,
  exercise_name text not null,
  sets integer not null default 3,
  reps integer not null default 10,
  weight_kg numeric default 0,
  created_at timestamptz default now()
);

-- RLS (securitate - fiecare vede doar datele proprii)
alter table foods enable row level security;
alter table meal_logs enable row level security;
alter table meal_items enable row level security;
alter table water_logs enable row level security;
alter table weight_logs enable row level security;
alter table user_targets enable row level security;
alter table running_logs enable row level security;
alter table workout_logs enable row level security;
alter table workout_exercises enable row level security;

create policy "own foods" on foods for all using (auth.uid() = user_id);
create policy "own meal_logs" on meal_logs for all using (auth.uid() = user_id);
create policy "own meal_items" on meal_items for all using (
  meal_log_id in (select id from meal_logs where user_id = auth.uid())
);
create policy "own water_logs" on water_logs for all using (auth.uid() = user_id);
create policy "own weight_logs" on weight_logs for all using (auth.uid() = user_id);
create policy "own user_targets" on user_targets for all using (auth.uid() = user_id);
create policy "own running_logs" on running_logs for all using (auth.uid() = user_id);
create policy "own workout_logs" on workout_logs for all using (auth.uid() = user_id);
create policy "own workout_exercises" on workout_exercises for all using (
  workout_log_id in (select id from workout_logs where user_id = auth.uid())
);
```

4. Mergi la **Project Settings → API** și copiază:
   - `Project URL` → aceasta e `VITE_SUPABASE_URL`
   - `anon public` key → aceasta e `VITE_SUPABASE_ANON_KEY`

---

## ✅ Pasul 2 — Configurare locală

```bash
# Clonează sau copiază fișierele
cd fitness-tracker

# Creează fișierul .env
cp .env.example .env
# Editează .env și pune cheile Supabase

# Instalează dependențele
npm install

# Pornește local
npm run dev
```

Deschide http://localhost:5173

---

## ✅ Pasul 3 — Deploy pe Netlify

### Opțiunea A (recomandat) — prin GitHub:
1. Pune codul pe **GitHub** (repo nou)
2. Mergi la **https://netlify.com** → "Add new site" → "Import from Git"
3. Selectează repo-ul
4. Build command: `npm run build` | Publish dir: `dist`
5. Mergi la **Site configuration → Environment variables** și adaugă:
   - `VITE_SUPABASE_URL` = URL-ul din Supabase
   - `VITE_SUPABASE_ANON_KEY` = cheia din Supabase
6. Deploy!

### Opțiunea B — drag & drop:
```bash
npm run build
```
Trage folderul `dist/` în https://app.netlify.com/drop

---

## ✅ Pasul 4 — Instalare pe telefon (PWA)

**Android (Chrome):**
- Deschide linkul Netlify în Chrome
- Apasă ⋮ → "Adaugă pe ecranul de start"

**iPhone (Safari):**
- Deschide linkul în Safari
- Apasă □↑ (Share) → "Adaugă pe ecranul de start"

---

## 📁 Structura proiectului

```
fitness-tracker/
├── src/
│   ├── pages/
│   │   ├── Auth.jsx          # Login / Signup
│   │   ├── Dashboard.jsx     # Pagina principală
│   │   ├── Nutritie.jsx      # Alimente + mese + target-uri
│   │   ├── Sport.jsx         # Alergare + forță + calendar + statistici
│   │   └── Profil.jsx        # Greutate + setări cont
│   ├── components/
│   │   ├── Footer.jsx        # Navigare bottom
│   │   ├── Modal.jsx         # Bottom sheet modal
│   │   └── ProgressRing.jsx  # Inel progress SVG
│   └── lib/
│       └── supabase.js       # Client Supabase
├── netlify.toml              # Config Netlify
├── vite.config.js            # Vite + PWA plugin
└── .env.example              # Template variabile mediu
```

## 🛠 Tech stack
- **React 18** + React Router
- **Supabase** — auth + PostgreSQL
- **Tailwind CSS** — stilizare
- **Recharts** — grafice
- **Vite PWA** — instalare pe telefon
- **Netlify** — hosting gratuit
