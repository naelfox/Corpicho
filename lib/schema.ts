/**
 * Schema do banco local (PGlite, dentro do app). Aplicado na primeira abertura.
 * Mudanças futuras: adicione um passo em MIGRATIONS (nunca edite um já publicado).
 */
export const SCHEMA = `
create type meal_type as enum ('cafe','almoco','lanche','jantar','outras');
create type body_region as enum ('pescoco','ombros','peitoral','braco_d','braco_e','cintura','abdomen','quadril','coxa_d','coxa_e','panturrilha_d','panturrilha_e');
create type comp_metric as enum ('body_fat_pct','muscle_kg','visceral_fat','water_pct','bmi','weight_kg');
create type comp_source as enum ('measured','calculated','estimated');
create type photo_angle as enum ('frente','lado','costas');
create type exercise_kind as enum ('musculacao','cardio','funcional','casa','mobilidade');
create type food_origin as enum ('taco','usuario','ia');

create function forbid_update() returns trigger language plpgsql as $$
begin
  raise exception 'registro histórico não pode ser alterado';
end;
$$;

create table profile (
  id int primary key default 1 check (id = 1),
  birth_date date not null,
  sex text not null check (sex in ('m','f')),
  height_cm numeric not null check (height_cm between 100 and 250),
  activity_level numeric not null check (activity_level between 1.2 and 1.9),
  fitness text not null check (fitness in ('baixo','medio','alto')),
  experience text not null check (experience in ('nenhuma','iniciante','intermediario','avancado')),
  days_per_week int not null check (days_per_week between 1 and 7),
  minutes_per_session int not null check (minutes_per_session between 10 and 240),
  equipment text[] not null default '{}',
  restrictions text not null default '' check (char_length(restrictions) <= 2000),
  created_at timestamptz not null default now()
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  start_weight_kg numeric not null check (start_weight_kg between 20 and 400),
  target_weight_kg numeric not null check (target_weight_kg between 20 and 400),
  kcal numeric not null check (kcal between 800 and 6000),
  protein_g numeric not null check (protein_g >= 0),
  carbs_g numeric not null check (carbs_g >= 0),
  fat_g numeric not null check (fat_g >= 0),
  created_at timestamptz not null default now()
);

create table foods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  origin food_origin not null,
  search text not null,
  kcal_100 numeric not null check (kcal_100 >= 0 and kcal_100 <= 900),
  protein_100 numeric not null check (protein_100 >= 0),
  carbs_100 numeric not null check (carbs_100 >= 0),
  fat_100 numeric not null check (fat_100 >= 0),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index foods_name_origin_idx on foods (lower(name), origin);

create table meals (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  type meal_type not null,
  photo_path text,
  created_at timestamptz not null default now()
);

create table meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals(id) on delete cascade,
  food_id uuid references foods(id),
  name text not null,
  grams numeric not null check (grams > 0 and grams <= 5000),
  kcal numeric not null check (kcal >= 0),
  protein_g numeric not null check (protein_g >= 0),
  carbs_g numeric not null check (carbs_g >= 0),
  fat_g numeric not null check (fat_g >= 0),
  source text not null check (source in ('manual','ia_confirmada')),
  created_at timestamptz not null default now()
);

create table weights (
  id uuid primary key default gen_random_uuid(),
  measured_at timestamptz not null,
  kg numeric not null check (kg between 20 and 400),
  created_at timestamptz not null default now()
);

create table body_measurements (
  id uuid primary key default gen_random_uuid(),
  measured_at timestamptz not null,
  region body_region not null,
  cm numeric not null check (cm between 5 and 300),
  created_at timestamptz not null default now()
);

create table body_composition (
  id uuid primary key default gen_random_uuid(),
  measured_at timestamptz not null,
  metric comp_metric not null,
  value numeric not null check (value >= 0),
  unit text not null,
  source comp_source not null,
  method text,
  created_at timestamptz not null default now()
);

create trigger weights_no_update before update on weights for each row execute function forbid_update();
create trigger body_measurements_no_update before update on body_measurements for each row execute function forbid_update();
create trigger body_composition_no_update before update on body_composition for each row execute function forbid_update();

create table body_photos (
  id uuid primary key default gen_random_uuid(),
  taken_at timestamptz not null,
  angle photo_angle not null,
  path text not null,
  thumb_path text,
  created_at timestamptz not null default now()
);

create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  kind exercise_kind not null,
  muscles text[] not null default '{}',
  demo_url text,
  created_at timestamptz not null default now()
);

create table workout_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  origin text not null check (origin in ('ia','manual')),
  active boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references workout_plans(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  exercise_id uuid not null references exercises(id),
  position int not null default 0,
  sets int,
  reps int,
  duration_s int,
  rest_s int,
  load_kg numeric,
  created_at timestamptz not null default now()
);

create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  plan_id uuid references workout_plans(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  duration_min int,
  rpe int check (rpe between 1 and 10),
  notes text,
  created_at timestamptz not null default now()
);

create table session_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  set_no int not null,
  reps int,
  load_kg numeric,
  duration_s int,
  rpe int check (rpe between 1 and 10),
  created_at timestamptz not null default now()
);

create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  created_at timestamptz not null default now()
);

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table weekly_reports (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  numbers jsonb not null,
  analysis text not null,
  created_at timestamptz not null default now()
);

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  model text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);
`

export const MIGRATIONS: string[] = []
