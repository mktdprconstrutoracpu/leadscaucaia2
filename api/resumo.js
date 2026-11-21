// GET /api/resumo?dias=7|30|90|180  (so equipe autorizada)
// -> { dias, resumo: { total, unicos, voltaram, whatsapp, conversao, tempoMediano, porDia, origens, aparelhos, cidades, funil },
//      visitas: [ as 200 mais recentes, com o caminho de paginas ] }
const { responder, tudo, quemPediu } = require('./_comum');
const { resumir, SECOES } = require('./_regras');

const DIAS = new Set([7, 30, 90, 180]);

module.exports = async (req, res) => {
  const quem = await quemPediu(req);
  if (quem.erro) return responder(res, quem.erro[0], { erro: quem.erro[1] });
  if (req.method !== 'GET') return responder(res, 405, { erro: 'Use GET.' });
  const url = new URL(req.url, 'http://x');
  const dias = DIAS.has(Number(url.searchParams.get('dias'))) ? Number(url.searchParams.get('dias')) : 30;
  const desde = new Date(Date.now() - dias * 86400e3).toISOString();
  const r = await tudo('/rest/v1/book_visitas?select=sessao,visitante,inicio,ultima_em,origem,referencia,campanha,aparelho,cidade,estado,secoes,cliques,whatsapp,whatsapp_em&inicio=gte.' + encodeURIComponent(desde) + '&order=inicio.desc');
  if (!r.ok) {
    if (/book_visitas|relation|schema cache/i.test(JSON.stringify(r.dados || ''))) return responder(res, 409, { erro: 'O rastreio ainda nao foi ligado no banco: rode o sql/001_book_leads.sql no SQL Editor do Supabase.' });
    return responder(res, 502, { erro: 'Nao consegui ler as visitas (' + r.status + ').' });
  }
  const visitas = r.dados;
  return responder(res, 200, {
    dias, secoes: SECOES,
    resumo: resumir(visitas),
    visitas: visitas.slice(0, 200).map((v) => ({
      inicio: v.inicio, ultima_em: v.ultima_em, origem: v.origem, referencia: v.referencia, campanha: v.campanha,
      aparelho: v.aparelho, cidade: v.cidade, estado: v.estado, secoes: v.secoes || [], cliques: v.cliques, whatsapp: v.whatsapp,
      novo: visitas.filter((x) => x.visitante === v.visitante && x.inicio < v.inicio).length === 0
    }))
  });
};
