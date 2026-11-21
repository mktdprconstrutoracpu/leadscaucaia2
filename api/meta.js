// POST /api/meta { valor }  (so equipe autorizada) -> grava a meta de contatos pelo WhatsApp do mes.
const { responder, sb, quemPediu, lerCorpo } = require('./_comum');

module.exports = async (req, res) => {
  const quem = await quemPediu(req);
  if (quem.erro) return responder(res, quem.erro[0], { erro: quem.erro[1] });
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST.' });
  let corpo = await lerCorpo(req);
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; } }
  const valor = Math.round(Number(corpo && corpo.valor));
  if (!Number.isFinite(valor) || valor < 0 || valor > 100000) return responder(res, 400, { erro: 'A meta tem que ser um numero entre 0 e 100000.' });
  const r = await sb('/rest/v1/book_config?on_conflict=chave', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { chave: 'meta_whatsapp_mes', valor: String(valor), atualizado_em: new Date().toISOString(), atualizado_por: quem.email } });
  if (!r.ok) return responder(res, 502, { erro: 'Nao consegui gravar a meta. Confira se o sql/002_painel.sql foi rodado.' });
  return responder(res, 200, { ok: true, valor });
};
