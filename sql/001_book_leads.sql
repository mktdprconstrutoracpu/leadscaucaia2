-- ============================================================================
-- 001_book_leads.sql  (21/11/2026)
--
-- Rastreio ANONIMO de quem entra no book digital do Villagio Caucaia II
-- (caucaia2.construtoradpr.com.br): de onde veio, aparelho, cidade aproximada,
-- ate que pagina do book chegou, se clicou no WhatsApp, e os pontos do mapa de
-- calor. Sem nome, telefone, e-mail nem IP.
--
--   book_visitas   uma linha por visita (aba aberta), com o resumo dela
--   book_eventos   cliques, movimento do mouse, paginas vistas e cliques no WhatsApp
--   book_registrar(p)  grava um lote do coletor (funcao api/coletar.js) de uma vez
--   book_mapa(...)     devolve os pontos do mapa de calor ja somados
--
-- Ninguem le nem grava direto: so as funcoes do projeto leadscaucaia2, com a
-- chave de servico (que passa por cima da RLS). Visitante e cliente da Central
-- nao enxergam nada daqui.
--
-- Rode no SQL Editor do Supabase da DPR (o mesmo da Central). Pode rodar de novo.
-- ============================================================================

create table if not exists public.book_visitas (
  sessao        text primary key,             -- id aleatorio da aba (sessionStorage)
  visitante     text not null,                -- id aleatorio do navegador (localStorage): conta quem voltou
  site          text not null,
  inicio        timestamptz not null default now(),
  ultima_em     timestamptz not null default now(),
  origem        text,                         -- instagram, google, qr, whatsapp, direto... (?origem= ou de onde veio)
  referencia    text,                         -- site de onde veio (so o dominio)
  campanha      text,                         -- utm_campaign, se houver
  aparelho      text,                         -- celular, tablet, computador
  largura       int,
  altura        int,
  cidade        text,                         -- aproximada, pelo provedor de internet (Vercel); o IP nao e guardado
  estado        text,
  pais          text,
  secoes        text[] not null default '{}', -- paginas do book vistas, na ordem
  ultima_secao  text,
  cliques       int not null default 0,
  whatsapp      boolean not null default false,
  whatsapp_em   timestamptz
);
create index if not exists book_visitas_inicio_idx on public.book_visitas (inicio desc);
create index if not exists book_visitas_visitante_idx on public.book_visitas (visitante);

create table if not exists public.book_eventos (
  id         bigint generated always as identity primary key,
  sessao     text not null references public.book_visitas(sessao) on delete cascade,
  criado_em  timestamptz not null default now(),
  tipo       text not null,
  secao      text,                            -- id da pagina do book (p01 ... p20, obra)
  xr         real,                            -- posicao horizontal: fracao da largura (0 a 1)
  yr         real,                            -- posicao vertical: fracao da altura da secao (0 a 1)
  alvo       text                             -- o que foi clicado (ex.: a.flutua)
);
alter table public.book_eventos drop constraint if exists book_eventos_tipo;
alter table public.book_eventos add constraint book_eventos_tipo check (tipo in ('click', 'move', 'secao', 'whatsapp'));
create index if not exists book_eventos_tipo_idx on public.book_eventos (tipo, criado_em);
create index if not exists book_eventos_sessao_idx on public.book_eventos (sessao);

comment on table public.book_visitas is 'Book digital Caucaia II: uma linha por visita anonima (projeto leadscaucaia2).';
comment on table public.book_eventos is 'Book digital Caucaia II: cliques, movimento, paginas vistas e WhatsApp (mapa de calor).';

-- grava um lote ja validado pela funcao api/coletar.js:
--   p = { sessao, visitante, site, origem, referencia, campanha, aparelho, largura, altura,
--         cidade, estado, pais, eventos: [{ tipo, secao, xr, yr, alvo }] }
create or replace function public.book_registrar(p jsonb) returns void
language plpgsql as $$
declare
  s text := p->>'sessao';
  e jsonb;
  sec text;
  ncl int := 0;
  wa boolean := false;
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

  update public.book_visitas
     set cliques = cliques + ncl,
         whatsapp = whatsapp or wa,
         whatsapp_em = coalesce(whatsapp_em, case when wa then now() end),
         ultima_em = now()
   where sessao = s;
end $$;

-- os pontos do mapa de calor, somados (posicao arredondada em 3 casas), do mais quente para o mais frio
create or replace function public.book_mapa(p_tipo text, p_desde timestamptz, p_aparelho text)
returns table (secao text, xr real, yr real, n bigint)
language sql stable as $$
  select e.secao, round(e.xr::numeric, 3)::real, round(e.yr::numeric, 3)::real, count(*)
    from public.book_eventos e
    join public.book_visitas v on v.sessao = e.sessao
   where e.tipo = p_tipo
     and e.criado_em >= p_desde
     and (p_aparelho is null or v.aparelho = p_aparelho)
     and e.secao is not null and e.xr is not null and e.yr is not null
   group by 1, 2, 3
   order by 4 desc
   limit 20000
$$;

alter table public.book_visitas enable row level security;
alter table public.book_eventos enable row level security;
revoke all on public.book_visitas from anon, authenticated;
revoke all on public.book_eventos from anon, authenticated;
revoke all on function public.book_registrar(jsonb) from public, anon, authenticated;
revoke all on function public.book_mapa(text, timestamptz, text) from public, anon, authenticated;
grant all on public.book_visitas, public.book_eventos to service_role;
grant execute on function public.book_registrar(jsonb) to service_role;
grant execute on function public.book_mapa(text, timestamptz, text) to service_role;
