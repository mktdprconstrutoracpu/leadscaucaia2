// POST /api/coletar: recebe um lote do t.js (o coletor que roda no book), valida e grava com
// book_registrar (sql/001_book_leads.sql). Aberto (o book chama sem senha), mas so aceita o formato
// exato, no maximo 200 eventos por lote e so de paginas do book. Nao grava IP: da Vercel so usa a
// cidade, o estado e o pais aproximados. Nunca devolve erro que quebre a pagina do visitante.
const { responder, sb, lerCorpo, CHAVE } = require('./_comum');
const { sanitizarLote, geoDosCabecalhos, origemPermitida, ehRobo } = require('./_regras');

module.exports = async (req, res) => {
  const origin = String(req.headers.origin || '');
  const permitida = origemPermitida(origin, process.env.ORIGENS_PERMITIDAS);
  const cors = permitida ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' } : {};
  if (req.method === 'OPTIONS') return responder(res, 204, null, cors);
  if (req.method !== 'POST') return responder(res, 405, { ok: false, motivo: 'metodo' }, cors);
  if (!permitida) return responder(res, 403, { ok: false, motivo: 'origem' });
  if (ehRobo(req.headers['user-agent'])) return responder(res, 204, null, cors);   // robo: aceita e descarta
  const r = sanitizarLote(await lerCorpo(req), geoDosCabecalhos(req.headers));
  if (!r.ok) return responder(res, 400, { ok: false, motivo: r.motivo }, cors);
  if (!CHAVE) return responder(res, 204, null, cors);   // sem banco configurado: aceita e descarta
  try {
    const g = await sb('/rest/v1/rpc/book_registrar', { method: 'POST', body: { p: r.lote } });
    if (!g.ok) { console.error('[coletar] banco recusou', g.status, JSON.stringify(g.dados).slice(0, 300)); return responder(res, 500, { ok: false, motivo: 'gravacao' }, cors); }
  } catch (e) {
    console.error('[coletar] falha', e && e.message);
    return responder(res, 500, { ok: false, motivo: 'gravacao' }, cors);
  }
  return responder(res, 204, null, cors);
};
