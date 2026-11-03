# PERSONAL FITNESS RPG — prima implementare

Această implementare adaugă un modul separat în proiectul React + Vite + Supabase existent. Nu înlocuiește pagina Sport, nutriția, scannerul sau integrarea Strava.

## Fișiere noi

- `src/pages/fitness/FitnessRpg.jsx` — interfața RPG: overview, înregistrare rapidă, seturi, exerciții, quest-uri și istoric XP.
- `src/lib/fitness/rpg.js` — funcții comune pentru niveluri, profil și exerciții standard.
- `supabase/migrations/202611020001_fitness_rpg.sql` — tabele, indexuri, RLS și funcții SQL pentru profil/XP.

## Fișiere existente modificate

- `src/App.jsx` — adaugă ruta autentificată `/fitness-rpg`.
- `src/pages/Sport.jsx` — adaugă buton de navigare către modulul RPG. În fișierul furnizat lipsea și declarația `const BIKE_TYPES = [` înaintea opțiunilor de bicicletă; aceasta a fost reparată pentru a restabili sintaxa fișierului.

## Instalare

1. Fă backup proiectului și bazei de date Supabase.
2. Deschide Supabase Dashboard → SQL Editor.
3. Rulează integral `supabase/migrations/202611020001_fitness_rpg.sql`.
4. În proiect, păstrează valorile tale existente din `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Nu adăuga cheia `service_role` în frontend.
5. Instalează dependențele conform `package-lock.json` cu `npm install` și pornește `npm run dev`.
6. Intră în pagina Sport și apasă **Fitness RPG**.

## Ce funcționează în această etapă

- Exerciții standard și exerciții personalizate, cu unități configurabile.
- Înregistrare manuală de activități cu seturi multiple.
- Editare, arhivare și ștergere a definițiilor de exerciții personalizate.
- Niveluri calculate din XP și progres către nivelul următor.
- XP acordat de o funcție SQL, cu idempotency key per activitate și plafon zilnic de 150 XP.
- Atribute inițiale ENDURANCE, STRENGTH, CONSISTENCY și MOBILITY.
- Quest-uri personalizate cu progres calculat automat din activități.
- Citire în regim read-only a alergărilor din `running_logs` pentru a include istoricul existent în totaluri și quest-uri. Alergările istorice rămân gestionate în pagina Sport.
- RLS pentru noile tabele și verificarea proprietății în funcțiile RPC.

## Limite cunoscute — nu sunt prezentate ca funcționalități finalizate

- XP-ul quest-urilor este momentan informativ; completarea unui quest nu acordă automat recompensa.
- Achievement-urile, recordurile personale și streak-urile nu sunt încă activate automat.
- Alergările istorice din `running_logs` contribuie la statistici/quest-uri, dar nu primesc XP retroactiv.
- Sincronizarea Strava existentă nu a fost rescrisă. Importul direct Strava în noile `activity_logs` și reconcilierea completă a editărilor/ștergerilor externe trebuie implementate separat după auditul fluxului actual.
- Migrarea nu modifică tabelele nutriției și nu modifică scannerul de coduri de bare.

## Verificări

- Codul JSX/JS a fost verificat sintactic cu parserul Babel.
- Build-ul Vite nu a putut fi finalizat în mediul de audit: arhiva furnizată conține `node_modules` de Windows și lipsește pachetul nativ Rollup pentru Linux. Acest lucru nu indică o eroare în codul nou; după `npm install` pe calculatorul de dezvoltare, rulează `npm run build`.
- SQL-ul trebuie executat în proiectul Supabase de test sau după backup. Nu am acces la schema live pentru a valida execuția efectivă pe baza ta.
