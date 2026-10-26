-- Web Push subscriptions for the home-screen web app (one row per browser).

create table public.web_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index on public.web_push_subscriptions (user_id);

alter table public.web_push_subscriptions enable row level security;

create policy "manage own web push subscriptions" on public.web_push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
