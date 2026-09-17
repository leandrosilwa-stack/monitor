-- Monitor de Chamados — Supabase (100% online, sem login)
-- Execute no SQL Editor do Supabase

-- 1) Tabelas
create table if not exists analistas (
  id uuid primary key default gen_random_uuid(),
  nome text unique not null,
  status text not null default 'ativo' check (status in ('ativo','inativo')),
  inicio_expediente int not null default 8 check (inicio_expediente in (8,9)),
  created_at timestamptz default now()
);

create table if not exists slas (
  id uuid primary key default gen_random_uuid(),
  descricao text unique not null,
  prazo_horas int not null check (prazo_horas > 0)
);

create table if not exists feriados (
  id uuid primary key default gen_random_uuid(),
  dia int not null check (dia between 1 and 31),
  mes int not null check (mes between 1 and 12),
  descricao text not null,
  unique(dia, mes)
);

create table if not exists chamados (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,
  sla_id uuid not null references slas(id),
  analista_id uuid references analistas(id),
  priorizado boolean not null default false,
  status text not null default 'Aguardando Atendimento'
    check (status in ('Aguardando Atendimento','Em atendimento','Aguardando Cliente','Resolvido')),
  data_abertura timestamptz not null,
  data_posse timestamptz,
  data_vencimento timestamptz not null,
  data_resolvido timestamptz,
  solicitar_devolucao boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists chamado_pausas (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references chamados(id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz,
  duracao_util_seg int
);

create table if not exists ausencias (
  id uuid primary key default gen_random_uuid(),
  analista_id uuid not null references analistas(id) on delete cascade,
  data_inicio date not null,
  data_fim date not null,
  motivo text,
  check (data_fim >= data_inicio)
);

-- 2) RLS aberto para anon (sem login, conforme regra)
alter table analistas enable row level security;
alter table slas enable row level security;
alter table feriados enable row level security;
alter table chamados enable row level security;
alter table chamado_pausas enable row level security;
alter table ausencias enable row level security;

drop policy if exists "anon tudo" on analistas;
drop policy if exists "anon tudo" on slas;
drop policy if exists "anon tudo" on feriados;
drop policy if exists "anon tudo" on chamados;
drop policy if exists "anon tudo" on chamado_pausas;
drop policy if exists "anon tudo" on ausencias;

create policy "anon tudo" on analistas for all to anon using (true) with check (true);
create policy "anon tudo" on slas for all to anon using (true) with check (true);
create policy "anon tudo" on feriados for all to anon using (true) with check (true);
create policy "anon tudo" on chamados for all to anon using (true) with check (true);
create policy "anon tudo" on chamado_pausas for all to anon using (true) with check (true);
create policy "anon tudo" on ausencias for all to anon using (true) with check (true);

-- 4) Migração devolução (para bancos já criados)
alter table chamados add column if not exists solicitar_devolucao boolean not null default false;

-- 3) Feriados nacionais fixos + 3 variáveis (editáveis pela tela)
insert into feriados (dia, mes, descricao) values
 (1,1,'Confraternização Universal'),
 (21,4,'Tiradentes'),
 (1,5,'Dia do Trabalho'),
 (7,9,'Independência'),
 (12,10,'Nossa Senhora Aparecida'),
 (2,11,'Finados'),
 (15,11,'Proclamação da República'),
 (25,12,'Natal'),
 (3,3,'Carnaval - variável'),
 (18,4,'Sexta-feira Santa - variável'),
 (19,6,'Corpus Christi - variável')
on conflict (dia, mes) do nothing;
