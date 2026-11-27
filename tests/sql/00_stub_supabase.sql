-- Stub mínimo do Supabase para testar as migrações num Postgres local.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create schema if not exists extensions;
create or replace function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create table if not exists public.employees(employee_id text primary key, first_name text, last_name text, email text, updated_at timestamptz);
create table if not exists public.sales_team_mappings(id serial primary key, equipe_vendas text, descr_equipe text, uf text, canal_vendas text, regiao_equipe text, vigente boolean);
insert into public.employees values ('10001','Fulano','Teste','fulano.teste@araguaia.com.br',now()),('10002','Ciclana','Silva','ciclana.silva@araguaia.com.br',now()) on conflict do nothing;
insert into public.sales_team_mappings(equipe_vendas,descr_equipe,uf,canal_vendas,regiao_equipe,vigente) values ('E01','Equipe Rio Verde','GO','Revenda','Centro',true),('E02','Equipe Antiga','MT','Revenda','Norte',false);
do $$ begin if not exists (select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if; end $$;
