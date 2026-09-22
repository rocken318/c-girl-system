-- 打刻時刻(JST)と店舗カットオーバー時刻から営業日を算出
create or replace function public.business_date(p_at timestamptz, p_cutover int)
returns date language sql immutable as $$
  select ((p_at at time zone 'Asia/Tokyo') - make_interval(hours => p_cutover))::date;
$$;

create table public.time_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  person_id uuid not null references public.profiles(id),
  role_at_punch public.user_role not null check (role_at_punch in ('cast','kurofuku')),
  business_date date not null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  worked_minutes int generated always as (
    case when clock_out_at is null then null
         else (extract(epoch from (clock_out_at - clock_in_at)) / 60)::int end
  ) stored,
  source text not null default 'qr' check (source in ('qr','manual')),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);
create index on public.time_records (store_id, business_date);
create index on public.time_records (person_id, business_date);
-- 1人1営業日につき「未退勤の記録」は1件まで
create unique index time_records_one_open
  on public.time_records (person_id, business_date)
  where clock_out_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  actor_user_id uuid references public.profiles(id),
  action text not null,
  target text,
  before jsonb,
  after jsonb,
  ip text,
  at timestamptz not null default now()
);
create index on public.audit_logs (store_id, at);

alter table public.time_records enable row level security;
alter table public.audit_logs enable row level security;
