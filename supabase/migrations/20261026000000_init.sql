-- Stand Firm: schema for circles (accountability groups), alerts and prayers.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

-- Kept apart from profiles so circle-mates can't read each other's tokens.
create table public.push_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now()
);

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.alert_circles (
  alert_id uuid not null references public.alerts (id) on delete cascade,
  circle_id uuid not null references public.circles (id) on delete cascade,
  primary key (alert_id, circle_id)
);

create table public.prayers (
  alert_id uuid not null references public.alerts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);

create index on public.circle_members (user_id);
create index on public.alert_circles (circle_id);
create index on public.alerts (created_at desc);

-- ---------------------------------------------------------------------------
-- Auto-create a profile when someone signs up
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helpers (security definer so RLS policies don't recurse)
-- ---------------------------------------------------------------------------

create function public.is_circle_member(c uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from circle_members where circle_id = c and user_id = auth.uid()
  );
$$;

create function public.shares_circle_with(other uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from circle_members a
    join circle_members b on a.circle_id = b.circle_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create function public.can_see_alert(a uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from alerts where id = a and user_id = auth.uid()
  ) or exists (
    select 1
    from alert_circles ac
    join circle_members cm on cm.circle_id = ac.circle_id
    where ac.alert_id = a and cm.user_id = auth.uid()
  );
$$;

-- Create a circle and join it as its first member. Returns the new circle.
create function public.create_circle(circle_name text)
returns public.circles
language plpgsql security definer set search_path = public
as $$
declare
  c circles;
  code text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  loop
    -- 6 characters, no easily-confused letters/digits
    code := (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from circles where invite_code = code);
  end loop;

  insert into circles (name, invite_code, created_by)
  values (trim(circle_name), code, auth.uid())
  returning * into c;

  insert into circle_members (circle_id, user_id) values (c.id, auth.uid());
  return c;
end;
$$;

-- Join a circle by its invite code. Returns the circle.
create function public.join_circle(code text)
returns public.circles
language plpgsql security definer set search_path = public
as $$
declare
  c circles;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select * into c from circles where invite_code = upper(trim(code));
  if c.id is null then
    raise exception 'No circle found with that code';
  end if;
  insert into circle_members (circle_id, user_id)
  values (c.id, auth.uid())
  on conflict do nothing;
  return c;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.push_tokens enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.alerts enable row level security;
alter table public.alert_circles enable row level security;
alter table public.prayers enable row level security;

-- Profiles: you can see yourself and anyone you share a circle with.
create policy "read own or circle-mates' profiles" on public.profiles
  for select using (id = auth.uid() or public.shares_circle_with(id));
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "manage own push token" on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Circles: visible to members. Created/joined only through the RPCs above.
create policy "members read circles" on public.circles
  for select using (public.is_circle_member(id));
create policy "creator renames circle" on public.circles
  for update using (created_by = auth.uid());

create policy "members read membership" on public.circle_members
  for select using (public.is_circle_member(circle_id));
create policy "leave a circle" on public.circle_members
  for delete using (user_id = auth.uid());

-- Alerts: you can send to circles you belong to; visible to those circles.
-- The direct user_id check matters: can_see_alert() can't see a row that is
-- being inserted, so without it `insert ... returning` fails for the sender.
create policy "read alerts" on public.alerts
  for select using (user_id = auth.uid() or public.can_see_alert(id));
create policy "send own alert" on public.alerts
  for insert with check (user_id = auth.uid());
create policy "resolve own alert" on public.alerts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read alert circles" on public.alert_circles
  for select using (public.can_see_alert(alert_id));
create policy "target own alert at own circles" on public.alert_circles
  for insert with check (
    public.is_circle_member(circle_id)
    and exists (select 1 from public.alerts where id = alert_id and user_id = auth.uid())
  );

-- Prayers: anyone who can see the alert can pray for it.
create policy "read prayers" on public.prayers
  for select using (public.can_see_alert(alert_id));
create policy "pray" on public.prayers
  for insert with check (user_id = auth.uid() and public.can_see_alert(alert_id));
