-- Expense Control — esquema do Supabase (execute no SQL Editor, uma vez)
-- Segurança: RLS ligado em tudo; cada usuário só enxerga as próprias linhas.
-- Não há tabela nem bucket de fotos/comprovantes (o app não guarda imagens).

create table if not exists public.ec_items (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('expenses','recurring','inst','incomes','goals')),
  id         text not null check (char_length(id) between 1 and 80),
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) < 8192),
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create table if not exists public.ec_prefs (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) < 8192),
  updated_at timestamptz not null default now()
);

create index if not exists ec_items_user_updated on public.ec_items (user_id, updated_at);

-- updated_at sempre vem do servidor (evita problema de relógio errado no celular)
create or replace function public.ec_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ec_items_touch on public.ec_items;
create trigger ec_items_touch before insert or update on public.ec_items
  for each row execute function public.ec_touch();

drop trigger if exists ec_prefs_touch on public.ec_prefs;
create trigger ec_prefs_touch before insert or update on public.ec_prefs
  for each row execute function public.ec_touch();

-- RLS
alter table public.ec_items enable row level security;
alter table public.ec_prefs enable row level security;

drop policy if exists ec_items_own on public.ec_items;
create policy ec_items_own on public.ec_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists ec_prefs_own on public.ec_prefs;
create policy ec_prefs_own on public.ec_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Sem acesso para visitantes não logados
revoke all on public.ec_items from anon;
revoke all on public.ec_prefs from anon;
grant select, insert, update, delete on public.ec_items to authenticated;
grant select, insert, update, delete on public.ec_prefs to authenticated;

-- Excluir a própria conta e todos os dados (as linhas somem por "on delete cascade")
create or replace function public.ec_delete_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.ec_delete_account() from public, anon;
grant execute on function public.ec_delete_account() to authenticated;
