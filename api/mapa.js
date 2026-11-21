// GET /api/mapa?bilhete=...&tipo=click|move&dias=7|30|90|180&aparelho=todos|celular|tablet|computador
// -> { ok, pontos: [[secao, xr, yr, n], ...], total }
// Chamado pelo t.js no modo mapa (o book aberto pelo painel com #mapaleads=<bilhete>).
const { responder, sb, conferirBilhete } = require('./_comum');
const { origemPermitida } = require('./_regras');

const DIAS = new Set([7, 30, 90, 180]);
const APARELHOS = new Set(['celular', 'tablet', 'computador']);

module.exports = async (req, res) => {
  const origin = String(req.headers.origin || '');
  const cors = origemPermitida(origin, process.env.ORIGENS_PERMITIDAS) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  if (req.method !== 'GET') return responder(res, 405, { ok: false, motivo: 'metodo' }, cors);
  const q = new URL(req.url, 'http://x').searchParams;
  if (!conferirBilhete(q.get('bilhete'))) return responder(res, 401, { ok: false, motivo: 'bilhete' }, cors);
  const tipo = q.get('tipo') === 'move' ? 'move' : 'click';
  const dias = DIAS.has(Number(q.get('dias'))) ? Number(q.get('dias')) : 30;
  const aparelho = APARELHOS.has(q.get('aparelho')) ? q.get('aparelho') : null;
  const desde = new Date(Date.now() - dias * 86400e3).toISOString();
  const m = await sb('/rest/v1/rpc/book_mapa', { method: 'POST', body: { p_tipo: tipo, p_desde: desde, p_aparelho: aparelho } });
  if (!m.ok) return responder(res, 502, { ok: false, motivo: 'banco' }, cors);
  const pontos = (m.dados || []).map((p) => [p.secao, p.xr, p.yr, Number(p.n)]);
  return responder(res, 200, { ok: true, tipo, dias, aparelho: aparelho || 'todos', pontos, total: pontos.reduce((s, p) => s + p[3], 0) }, cors);
};
