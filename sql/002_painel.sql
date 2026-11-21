-- ============================================================================
-- 002_painel.sql  (21/11/2026)  -- depois do 001_book_leads.sql
--
-- O que o painel novo precisa:
--   - book_visitas.tempos: milissegundos em cada pagina do book ({"p01": 8000, ...})
--   - book_visitas.secao_atual: a pagina que a pessoa esta vendo agora ("Agora no book")
--   - book_registrar soma os tempos e grava a pagina atual que o coletor manda
--   - book_cliques(desde): cliques por visita, pagina e elemento (ranking "O que mais clicam")
--   - book_config: a meta de contatos do mes (e o que mais o painel precisar guardar)
--   - apaga as visitas de diagnostico feitas na instalacao (origem 'diagnostico')
-- Mesmas regras do 001: so a chave de servico le e grava. Pode rodar de novo.
-- ============================================================================

alter table public.book_visitas add column if not exists tempos jsonb not null default '{}'::jsonb;
alter table public.book_visitas add column if not exists secao_atual text;

create or replace function public.book_registrar(p jsonb) returns void
language plpgsql as $$
declare
  s text := p->>'sessao';
  e jsonb;
  sec text;
  ncl int := 0;
  wa boolean := false;
  t record;
begin
  insert into public.book_visitas (sessao, visitante, site, origem, referencia, campanha, aparelho, largura, altura, cidade, estado, pais)
  values (s, p->>'visitante', p->>'site', p->>'origem', p->>'referencia', p->>'campanha', p->>'aparelho',
          nullif(p->>'largura', '')::int, nullif(p->>'altura', '')::int, p->>'cidade', p->>'estado', p->>'pais')
  on conflict (sessao) do update set ultima_em = now(), largura = excluded.largura, altura = excluded.altura;

  for e in select value from jsonb_array_elements(coalesce(p->'eventos', '[]'::jsonb)) loop
    sec := e->>'secao';
    insert into public.book_eventos (sessao, tipo, secao, xr, yr, alvo)
    values (s, e->>'tipo', sec, nullif(e->>'xr', '')::real, nullif(e->>'yr', '')::real, e->>'alvo');
    if e->>'tipo' = 'secao' and sec is not null then
      update public.book_visitas
         set secoes = case when sec = any(secoes) then secoes else secoes || sec end,
             ultima_secao = sec
       where sessao = s;
    elsif e->>'tipo' = 'click' then
      ncl := ncl + 1;
    elsif e->>'tipo' = 'whatsapp' then
      wa := true;
    end if;
  end loop;

  -- tempos: o coletor manda so o que passou desde o ultimo lote; aqui soma
  for t in select key, value from jsonb_each(coalesce(p->'tempos', '{}'::jsonb)) loop
    update public.book_visitas
       set tempos = jsonb_set(tempos, array[t.key], to_jsonb(coalesce((tempos->>t.key)::bigint, 0) + least(greatest((t.value #>> '{}')::bigint, 0), 120000)))
     where sessao = s;
  end loop;

  update public.book_visitas
     set cliques = cliques + ncl,
         whatsapp = whatsapp or wa,
         whatsapp_em = coalesce(whatsapp_em, case when wa then now() end),
         secao_atual = coalesce(nullif(p->>'atual', ''), secao_atual),
         ultima_em = now()
   where sessao = s;
end $$;

-- cliques do periodo por visita, pagina e elemento (o painel filtra pelas visitas que estao na tela)
create or replace function public.book_cliques(p_desde timestamptz)
returns table (sessao text, secao text, alvo text, n bigint)
language sql stable as $$
  select e.sessao, e.secao, coalesce(e.alvo, ''), count(*)
    from public.book_eventos e
   where e.tipo = 'click' and e.criado_em >= p_desde
   group by 1, 2, 3
   limit 50000
$$;

create table if not exists public.book_config (
  chave         text primary key,
  valor         text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

alter table public.book_config enable row level security;
revoke all on public.book_config from anon, authenticated;
revoke all on function public.book_cliques(timestamptz) from public, anon, authenticated;
revoke all on function public.book_registrar(jsonb) from public, anon, authenticated;
grant all on public.book_config to service_role;
grant execute on function public.book_cliques(timestamptz) to service_role;
grant execute on function public.book_registrar(jsonb) to service_role;

-- limpeza do que nao e visita de gente (21/11/2026):
--   o diagnostico da instalacao, os robos de San Jose (verificacao da Vercel) e as visitas que o
--   teste automatico mandou sem querer para a producao entre 20:27 e 20:36 UTC (campanha "lancamento"
--   e as "direto" do navegador de teste)
delete from public.book_visitas where origem = 'diagnostico';
delete from public.book_visitas where cidade = 'San Jose';
delete from public.book_visitas where campanha = 'lancamento' and inicio >= '2026-11-21 20:00:00+00' and inicio < '2026-11-21 21:00:00+00';
delete from public.book_visitas where origem = 'direto' and inicio >= '2026-11-21 20:27:00+00' and inicio < '2026-11-21 20:37:00+00';
