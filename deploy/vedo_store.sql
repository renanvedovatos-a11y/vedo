-- Tabela de armazenamento do VEDO no Supabase (uma "gaveta" chave→valor).
-- Rode isto UMA vez no Supabase: painel do projeto → SQL Editor → New query →
-- cole tudo → Run.

create table if not exists public.vedo_store (
  chave          text primary key,
  valor          jsonb not null,
  atualizado_em  timestamptz not null default now()
);

-- Liga o RLS sem criar nenhuma policy: assim a chave pública (anon) NÃO
-- consegue ler nada. Só a service_role key (que o servidor usa, e que ignora o
-- RLS) tem acesso. Mantém tokens e dados fora do alcance de qualquer um.
alter table public.vedo_store enable row level security;
