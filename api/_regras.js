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
  // tempo em cada pagina desde o ultimo lote (ms) e a pagina que esta na tela agora
  const tempos = {};
  if (c.tempos && typeof c.tempos === 'object') {
    Object.keys(c.tempos).slice(0, 40).forEach((k) => { const ms = inteiro(c.tempos[k], 0, 120000); if (IDS_SECOES.has(k) && ms) tempos[k] = ms; });
  }
  const atual = IDS_SECOES.has(c.atual) ? c.atual : null;
  const g = geo || {};
  return {
    ok: true,
    lote: {
      sessao, visitante, site, tempos, atual,
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

// robos pelo nome que o navegador informa (buscadores, previa de link, verificacoes automaticas)
const ROBO = /bot|crawl|spider|slurp|headless|lighthouse|vercel|facebookexternalhit|whatsapp|preview|pingdom|uptime|python|curl|wget|axios|node-fetch|go-http/i;
function ehRobo(ua) { return !ua || ROBO.test(String(ua)); }

function origemPermitida(origin, extras) {
  let host = '';
  try { host = new URL(String(origin || '')).host.toLowerCase(); } catch (e) { host = ''; }
  if (!host) return false;
  const lista = ORIGENS_PADRAO.concat(String(extras || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  return lista.some((d) => host === d || host.endsWith('.' + d)) || /^book-villagio-caucaia-2-[a-z0-9-]+\.vercel\.app$/.test(host);
}

module.exports = { SECOES, IDS_SECOES, LIMITE_POR_LOTE, aparelho, classificarOrigem, sanitizarLote, geoDosCabecalhos, origemPermitida, ehRobo };
