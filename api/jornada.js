// GET /api/jornada?id=<id da visita>  (so equipe autorizada)
// -> { visita: { inicio, ultima_em, origem, tempos }, eventos: [{ tipo, secao, alvo, em }] }
// A linha do tempo de uma visita: paginas vistas, cliques e WhatsApp, na ordem (sem o movimento do mouse).
const { responder, sb, quemPediu } = require('./_comum');

module.exports = async (req, res) => {
  const quem = await quemPediu(req);
  if (quem.erro) return responder(res, quem.erro[0], { erro: quem.erro[1] });
  const id = String(new URL(req.url, 'http://x').searchParams.get('id') || '');
  if (!/^[a-z0-9]{10,40}$/.test(id)) return responder(res, 400, { erro: 'Visita invalida.' });
  const [v, e] = await Promise.all([
    sb('/rest/v1/book_visitas?select=inicio,ultima_em,origem,tempos&sessao=eq.' + id),
    sb('/rest/v1/book_eventos?select=tipo,secao,alvo,criado_em&sessao=eq.' + id + '&tipo=neq.move&order=id.asc&limit=500')
  ]);
  if (!v.ok || !e.ok) return responder(res, 502, { erro: 'Nao consegui ler a visita.' });
  const visita = (v.dados || [])[0];
  if (!visita) return responder(res, 404, { erro: 'Visita nao encontrada.' });
  return responder(res, 200, { visita, eventos: (e.dados || []).map((x) => ({ tipo: x.tipo, secao: x.secao, alvo: x.alvo, em: x.criado_em })) });
};
