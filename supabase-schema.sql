-- =====================================================================
-- Expense Control: schema Supabase v3  (rode inteiro no SQL Editor)
-- Pode rodar de novo sem quebrar (idempotente).
-- NADA aqui foi executado contra um projeto real: rode e confira os
-- testes de RLS ao final (secao "TESTES").
-- =====================================================================

-- ---------- 1) Perfil/preferencias (um documento por usuario) ----------
create table if not exists public.profiles(
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  prefs jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  constraint profiles_prefs_size check (octet_length(prefs::text) < 20000)
);
-- caso a versao antiga do schema ja tenha sido criada:
alter table public.profiles add column if not exists synced_at timestamptz not null default now();
alter table public.profiles alter column user_id set default auth.uid();

-- ---------- 2) Tabelas de dados: 1 linha por item, com exclusao logica ----------
-- updated_at = momento da EDICAO no aparelho (decide quem vence um conflito)
-- synced_at  = momento em que o servidor recebeu (cursor para baixar mudancas)
-- deleted    = exclusao logica: avisa os outros aparelhos que o item foi apagado
do $$ declare t text; begin
 foreach t in array array['expenses','recurring','installments','goals','incomes'] loop
  execute format($f$create table if not exists public.%I(
    user_id uuid not null default auth.uid() references auth.users on delete cascade,
    id text not null check (char_length(id) between 1 and 64),
    data jsonb not null default '{}' check (octet_length(data::text) < 20000),
    deleted boolean not null default false,
    updated_at timestamptz not null default now(),
    synced_at timestamptz not null default now(),
    primary key(user_id,id))$f$, t);
  execute format('alter table public.%I add column if not exists deleted boolean not null default false', t);
  execute format('alter table public.%I add column if not exists synced_at timestamptz not null default now()', t);
  execute format('create index if not exists %I on public.%I(user_id, synced_at)', t||'_sync_idx', t);
 end loop; end $$;

-- ---------- 3) Trigger: protege contra sobrescrita antiga e relogio no futuro ----------
create or replace function public.ec_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  -- aparelho atrasado (ficou offline) nunca sobrescreve uma edicao mais nova
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;               -- ignora esta escrita, mantem a linha atual
  end if;
  -- relogio do celular adiantado nao pode "ganhar para sempre"
  if new.updated_at > now() + interval '5 minutes' then new.updated_at := now(); end if;
  new.synced_at := now();
  return new;
end $$;

do $$ declare t text; begin
 foreach t in array array['profiles','expenses','recurring','installments','goals','incomes'] loop
  execute format('drop trigger if exists ec_touch_trg on public.%I', t);
  execute format('create trigger ec_touch_trg before insert or update on public.%I for each row execute function public.ec_touch()', t);
 end loop; end $$;

-- ---------- 4) RLS: cada usuario so enxerga/escreve as proprias linhas ----------
do $$ declare t text; begin
 foreach t in array array['profiles','expenses','recurring','installments','goals','incomes'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('alter table public.%I force row level security', t);
  execute format('drop policy if exists own_all on public.%I', t);
  execute format('drop policy if exists own_select on public.%I', t);
  execute format('drop policy if exists own_insert on public.%I', t);
  execute format('drop policy if exists own_update on public.%I', t);
  execute format('drop policy if exists own_delete on public.%I', t);
  execute format('create policy own_select on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
  execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
  execute format('create policy own_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  execute format('create policy own_delete on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  -- visitante (anon) nao tem nenhum acesso, nem de leitura
  execute format('revoke all on public.%I from anon', t);
  execute format('grant select, insert, update, delete on public.%I to authenticated', t);
 end loop; end $$;

-- A tabela "budgets" da versao antiga nao e mais usada (orcamentos vao em profiles.prefs).
-- Se voce ja a criou, pode apagar com:  drop table if exists public.budgets;

-- ---------- 5) Comprovantes REMOVIDOS: fecha o Storage e limpa dados antigos ----------
-- O app nao envia mais fotos/comprovantes. Esta secao e idempotente e faz 3 coisas:
--  a) NINGUEM mais consegue enviar arquivo: apaga as politicas de INSERT/UPDATE do bucket "receipts".
--  b) Mantem SO select + delete (do proprio dono) para o app limpar, uma vez por conta, os arquivos
--     antigos de <uid>/ ao sincronizar. (Nao da para apagar de storage.objects por SQL: o Supabase
--     bloqueia; a limpeza e feita pela API de Storage, que o app ja usa.)
--  c) Remove das linhas (jsonb) qualquer vestigio de foto: photo, photoPath, photoExp.
-- Depois que todos os aparelhos sincronizarem (ou voce decidir encerrar), APAGUE O BUCKET:
--   Dashboard > Storage > receipts > ... > Delete bucket   (confira antes: veja teste (b) abaixo)
-- e entao rode a secao 5-final (comentada no fim deste arquivo) para remover as politicas restantes.
drop policy if exists receipts_own on storage.objects;
drop policy if exists receipts_insert on storage.objects;
drop policy if exists receipts_update on storage.objects;
drop policy if exists receipts_select on storage.objects;
drop policy if exists receipts_delete on storage.objects;
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id='receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id='receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- bucket (se existir) fica privado e sem aceitar nada novo:
update storage.buckets set public=false, file_size_limit=1, allowed_mime_types=array['application/x-disabled']
  where id='receipts';

-- vestigios de foto nas linhas (o trigger ec_touch aceita: updated_at igual nao e "escrita antiga")
do $$ declare t text; begin
 foreach t in array array['expenses','recurring','installments','goals','incomes'] loop
  execute format($f$update public.%I set data = data - 'photo' - 'photoPath' - 'photoExp'
    where data ? 'photo' or data ? 'photoPath' or data ? 'photoExp'$f$, t);
 end loop; end $$;

-- =====================================================================
-- EXCLUIR A PROPRIA CONTA (LGPD / exigencia das lojas)  -- idempotente
-- O app chama sb.rpc('delete_my_account') com o login da propria pessoa.
-- Apagar de auth.users dispara o ON DELETE CASCADE nas 6 tabelas (profiles,
-- expenses, recurring, installments, goals, incomes). O cascade NAO apaga o
-- Storage: por isso o app remove antes eventuais arquivos antigos de <uid>/ no bucket "receipts".
-- IMPORTANTE: a chave service_role NUNCA e usada no app. Esta funcao e
-- security definer, so apaga auth.uid() (quem esta logado) e so authenticated executa.
-- =====================================================================
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = public, auth as $$ begin if auth.uid() is null then raise exception 'not authenticated'; end if; delete from auth.users where id = auth.uid(); end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- =====================================================================
-- TESTES (rode no SQL Editor depois; todos devem dar o resultado indicado)
-- =====================================================================
-- a) RLS ligada e forcada nas 6 tabelas -> todas as linhas com true/true:
--   select relname, relrowsecurity, relforcerowsecurity from pg_class
--   where relnamespace='public'::regnamespace and relname in
--   ('profiles','expenses','recurring','installments','goals','incomes');
-- b) bucket fechado (ou inexistente, depois de apagado) -> public = false e file_size_limit = 1:
--   select id, public, file_size_limit from storage.buckets where id='receipts';
--    Quantos arquivos antigos ainda restam (quando for 0 em todas as contas, apague o bucket):
--   select count(*) from storage.objects where bucket_id='receipts';
-- c) Teste real com DOIS usuarios (o mais importante): entre com a conta A no app,
--    crie um gasto; entre com a conta B em outro navegador: o gasto de A NAO pode aparecer.
-- d) Excluir conta: logado como usuario de teste, no app use Conta > Excluir minha conta.
--    Depois confira (devem dar 0 linhas / 0 arquivos):
--   select count(*) from auth.users where email='SEU-TESTE@EMAIL';
--   select count(*) from public.expenses where user_id='<uid>';
--   select count(*) from storage.objects where bucket_id='receipts' and name like '<uid>/%';

-- =====================================================================
-- 5-final) SO DEPOIS de apagar o bucket "receipts" no Dashboard (Storage). Descomente e rode:
-- =====================================================================
-- drop policy if exists receipts_select on storage.objects;
-- drop policy if exists receipts_delete on storage.objects;
