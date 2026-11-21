// Regras puras do rastreio do book (sem rede, sem banco): validacao dos lotes do coletor,
// de onde veio a visita e o resumo do painel. O "_" no nome faz a Vercel nao publicar como endereco.

// As paginas do book, na ordem em que aparecem (ids das <section> do BookDigitalCaucaia2/index.html).
const SECOES = [
  ['p01', 'Capa'], ['p02', 'O empreendimento'], ['p03', 'Em números'], ['p04', 'Localização'],
  ['p05', 'Centro comercial'], ['p06', 'Lazer'], ['p07', 'Espaços de lazer'], ['obra', 'Da fundação às chaves'],
  ['p13', 'As casas'], ['p14', 'Estar e jantar'], ['p15', 'Cozinha'], ['p16', 'Dormitórios'],
  ['p17', 'Segundo dormitório'], ['p18', 'Financiamento'], ['p19', 'Ficha técnica'], ['p20', 'Fale com a DPR']
];
const IDS_SECOES = new Set(SECOES.map((s) => s[0]));
const TIPOS = new Set(['click', 'move', 'secao', 'whatsapp']);
const LIMITE_POR_LOTE = 200;
const ORIGENS_PADRAO = ['caucaia2.construtoradpr.com.br', 'book-villagio-caucaia-2.vercel.app'];

function aparelho(vw) {
  const w = Number(vw) || 0;
  if (w > 0 && w < 768) return 'celular';
  if (w > 0 && w < 1024) return 'tablet';
  return 'computador';
}
const slug = (v, max) => String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || null;
function inteiro(v, min, max) { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : null; }
function fracao(v) { const n = Number(v); if (!Number.isFinite(n) || n < -0.05 || n > 1.05) return null; return Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000; }
function hostDe(url) { try { return new URL(String(url)).host.toLowerCase().replace(/^www\./, '').slice(0, 100); } catch (e) { return null; } }

// de onde veio: ?origem= ou utm_source mandam; senao, o site de onde a pessoa clicou; sem nada, "direto"
function classificarOrigem(origemInformada, referencia, site) {
  const o = slug(origemInformada, 40);
  if (o) return o;
  const r = String(referencia || '');
  if (!r || r === site) return 'direto';
  if (/instagram\./.test(r)) return 'instagram';
  if (/facebook\.|fb\.|fbclid/.test(r)) return 'facebook';
  if (/google\./.test(r)) return 'google';
  if (/whatsapp\.|wa\.me/.test(r)) return 'whatsapp';
  if (/youtube\.|youtu\.be/.test(r)) return 'youtube';
  if (/tiktok\./.test(r)) return 'tiktok';
  if (/construtoradpr\.com\.br/.test(r)) return 'site-dpr';
  return 'outro-site';
}

// Valida um lote do t.js. Nunca lanca: { ok:false, motivo } ou { ok:true, lote } no formato do book_registrar.
function sanitizarLote(corpo, geo) {
  let c = corpo;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { return { ok: false, motivo: 'json' }; } }
  if (!c || typeof c !== 'object') return { ok: false, motivo: 'corpo' };
  const sessao = String(c.sessao || '');
  const visitante = String(c.visitante || '');
  if (!/^[a-z0-9]{10,40}$/.test(sessao) || !/^[a-z0-9]{10,40}$/.test(visitante)) return { ok: false, motivo: 'id' };
  const site = String(c.site || '').toLowerCase().replace(/[^a-z0-9.:-]/g, '').slice(0, 120);
  if (!site) return { ok: false, motivo: 'site' };
  const largura = inteiro(c.vw, 1, 10000), altura = inteiro(c.vh, 1, 10000);
  if (largura === null || altura === null) return { ok: false, motivo: 'janela' };
  const referencia = hostDe(c.ref);
  const eventos = [];
  (Array.isArray(c.eventos) ? c.eventos.slice(0, LIMITE_POR_LOTE) : []).forEach((e) => {
    if (!e || typeof e !== 'object' || !TIPOS.has(e.tipo)) return;
    const secao = IDS_SECOES.has(e.secao) ? e.secao : null;
    if (e.tipo === 'secao') { if (secao) eventos.push({ tipo: 'secao', secao }); return; }
    if (e.tipo === 'whatsapp') { eventos.push({ tipo: 'whatsapp', secao, alvo: String(e.alvo || '').slice(0, 80) || null }); return; }
    const xr = fracao(e.xr), yr = fracao(e.yr);
    if (!secao || xr === null || yr === null) return;
    eventos.push({ tipo: e.tipo, secao, xr, yr, alvo: e.tipo === 'click' ? (String(e.alvo || '').slice(0, 80) || null) : null });
  });
  const g = geo || {};
  return {
    ok: true,
    lote: {
      sessao, visitante, site,
      origem: classificarOrigem(c.origem, referencia, site),
      referencia: referencia && referencia !== site ? referencia : null,
      campanha: slug(c.campanha, 60),
      aparelho: aparelho(largura), largura, altura,
      cidade: g.cidade || null, estado: g.estado || null, pais: g.pais || null,
      eventos
    }
  };
}

// cidade, estado e pais que a Vercel calcula pelo IP (o IP em si nao e lido nem guardado)
function geoDosCabecalhos(h) {
  const dec = (v) => { try { return decodeURIComponent(String(v || '')).slice(0, 80) || null; } catch (e) { return null; } };
  return { cidade: dec(h['x-vercel-ip-city']), estado: dec(h['x-vercel-ip-country-region']), pais: dec(h['x-vercel-ip-country']) };
}

function origemPermitida(origin, extras) {
  let host = '';
  try { host = new URL(String(origin || '')).host.toLowerCase(); } catch (e) { host = ''; }
  if (!host) return false;
  const lista = ORIGENS_PADRAO.concat(String(extras || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  return lista.some((d) => host === d || host.endsWith('.' + d)) || /^book-villagio-caucaia-2-[a-z0-9-]+\.vercel\.app$/.test(host);
}

// o resumo do painel a partir das visitas do periodo (cada uma com inicio, ultima_em, origem, aparelho, cidade, estado, secoes, whatsapp, visitante)
function resumir(visitas, hoje) {
  const total = visitas.length;
  const unicos = new Set(visitas.map((v) => v.visitante)).size;
  const wa = visitas.filter((v) => v.whatsapp).length;
  const tempos = visitas.map((v) => Math.max(0, (new Date(v.ultima_em) - new Date(v.inicio)) / 1000)).filter((s) => s > 0).sort((a, b) => a - b);
  const mediana = tempos.length ? Math.round(tempos[Math.floor(tempos.length / 2)]) : 0;
  const contar = (f) => { const m = {}; visitas.forEach((v) => { const k = f(v) || 'não informado'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n); };
  const dia = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(d));
  const porDia = {};
  visitas.forEach((v) => { const k = dia(v.inicio); porDia[k] = porDia[k] || { dia: k, visitas: 0, whatsapp: 0 }; porDia[k].visitas++; if (v.whatsapp) porDia[k].whatsapp++; });
  const funil = SECOES.map(([id, nome]) => ({ id, nome, n: visitas.filter((v) => (v.secoes || []).includes(id)).length }));
  const voltaram = (() => { const m = {}; visitas.forEach((v) => { m[v.visitante] = (m[v.visitante] || 0) + 1; }); return Object.values(m).filter((n) => n > 1).length; })();
  return {
    total, unicos, voltaram, whatsapp: wa, conversao: total ? Math.round((wa / total) * 1000) / 10 : 0, tempoMediano: mediana,
    porDia: Object.values(porDia).sort((a, b) => a.dia.localeCompare(b.dia)),
    origens: contar((v) => v.origem), aparelhos: contar((v) => v.aparelho),
    cidades: contar((v) => (v.cidade ? v.cidade + (v.estado ? ' / ' + v.estado : '') : null)).slice(0, 12),
    funil
  };
}

module.exports = { SECOES, IDS_SECOES, LIMITE_POR_LOTE, aparelho, classificarOrigem, sanitizarLote, geoDosCabecalhos, origemPermitida, resumir };
