// GET /api/resumo?dias=7|30|90|180  (so equipe autorizada)
// O painel calcula tudo no navegador (assim os filtros mudam todos os quadros juntos). Esta funcao manda:
//   visitas     as visitas do periodo, compactas (id da aba, visitante anonimo, horarios, origem, aparelho,
//               cidade, paginas vistas, tempo em cada pagina, cliques e WhatsApp)
//   anteriores  as do periodo anterior de mesmo tamanho (para a comparacao)
//   cliques     cliques do periodo por visita, pagina e elemento (ranking "O que mais clicam")
//   meta        a meta de contatos do mes e quantos chamaram no WhatsApp no mes corrente
const { responder, sb, tudo, quemPediu } = require('./_comum');
const { SECOES } = require('./_regras');

const DIAS = new Set([7, 30, 90, 180]);
const CAMPOS = 'sessao,visitante,inicio,ultima_em,origem,campanha,referencia,aparelho,cidade,estado,secoes,tempos,cliques,whatsapp';
const compacta = (v) => ({ id: v.sessao, v: v.visitante, i: v.inicio, u: v.ultima_em, o: v.origem, c: v.campanha, r: v.referencia, ap: v.aparelho, ci: v.cidade, uf: v.estado, s: v.secoes || [], t: v.tempos || {}, cl: v.cliques || 0, w: !!v.whatsapp });
// 1o dia do mes em Sao Paulo (UTC-3, sem horario de verao)
function inicioDoMes() {
  const [a, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).split('-');
  return a + '-' + m + '-01T03:00:00.000Z';
}

module.exports = async (req, res) => {
  const quem = await quemPediu(req);
  if (quem.erro) return responder(res, quem.erro[0], { erro: quem.erro[1] });
  if (req.method !== 'GET') return responder(res, 405, { erro: 'Use GET.' });
  const url = new URL(req.url, 'http://x');
  const dias = DIAS.has(Number(url.searchParams.get('dias'))) ? Number(url.searchParams.get('dias')) : 30;
  const agora = Date.now();
  const desde = new Date(agora - dias * 86400e3).toISOString();
  const desdeAnterior = new Date(agora - 2 * dias * 86400e3).toISOString();
  const [r, cl, cfg, mes] = await Promise.all([
    tudo('/rest/v1/book_visitas?select=' + CAMPOS + '&inicio=gte.' + encodeURIComponent(desdeAnterior) + '&order=inicio.desc'),
    sb('/rest/v1/rpc/book_cliques', { method: 'POST', body: { p_desde: desde } }),
    sb('/rest/v1/book_config?select=valor&chave=eq.meta_whatsapp_mes'),
    tudo('/rest/v1/book_visitas?select=sessao&whatsapp=is.true&inicio=gte.' + encodeURIComponent(inicioDoMes()))
  ]);
  if (!r.ok) {
    if (/book_visitas|relation|schema cache|column/i.test(JSON.stringify(r.dados || ''))) return responder(res, 409, { erro: 'O rastreio ainda nao foi ligado no banco: rode os arquivos da pasta sql (001 e 002) no SQL Editor do Supabase.' });
    return responder(res, 502, { erro: 'Nao consegui ler as visitas (' + r.status + ').' });
  }
  if (!cl.ok) return responder(res, 409, { erro: 'Falta rodar o sql/002_painel.sql no SQL Editor do Supabase.' });
  const todas = r.dados.map(compacta);
  const meta = cfg.ok && Array.isArray(cfg.dados) && cfg.dados[0] ? Number(cfg.dados[0].valor) || 0 : 0;
  return responder(res, 200, {
    dias, agora: new Date(agora).toISOString(), secoes: SECOES,
    visitas: todas.filter((v) => v.i >= desde),
    anteriores: todas.filter((v) => v.i < desde),
    cliques: (cl.dados || []).map((x) => ({ s: x.sessao, p: x.secao, a: x.alvo, n: Number(x.n) })),
    meta: { valor: meta, whatsappMes: mes.ok ? mes.dados.length : 0 }
  });
};
