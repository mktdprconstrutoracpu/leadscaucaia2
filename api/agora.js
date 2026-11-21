// GET /api/agora  (so equipe autorizada) -> { lendo: [{ origem, aparelho, cidade, estado, atual, inicio, paginas }] }
// Quem esta com o book aberto agora: o coletor manda um sinal a cada 20 s com a aba visivel,
// entao conta quem deu sinal no ultimo minuto.
const { responder, sb, quemPediu } = require('./_comum');

module.exports = async (req, res) => {
  const quem = await quemPediu(req);
  if (quem.erro) return responder(res, quem.erro[0], { erro: quem.erro[1] });
  const desde = new Date(Date.now() - 60e3).toISOString();
  const r = await sb('/rest/v1/book_visitas?select=origem,aparelho,cidade,estado,secao_atual,ultima_secao,inicio,secoes&ultima_em=gte.' + encodeURIComponent(desde) + '&order=inicio.desc&limit=50');
  if (!r.ok) return responder(res, 502, { erro: 'Nao consegui ler quem esta no book agora.' });
  return responder(res, 200, {
    lendo: (r.dados || []).map((v) => ({ origem: v.origem, aparelho: v.aparelho, cidade: v.cidade, estado: v.estado, atual: v.secao_atual || v.ultima_secao, inicio: v.inicio, paginas: (v.secoes || []).length }))
  });
};
