// POST /api/ticket  (so equipe autorizada) -> { bilhete }
// O painel pede o bilhete e abre o book com #mapaleads=<bilhete>; o t.js usa o bilhete para buscar
// os pontos do mapa em /api/mapa. Vale 2 horas e so serve para o mapa.
const { responder, quemPediu, criarBilhete } = require('./_comum');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST.' });
  const quem = await quemPediu(req);
  if (quem.erro) return responder(res, quem.erro[0], { erro: quem.erro[1] });
  return responder(res, 200, { bilhete: criarBilhete(quem.email) });
};
