// Comum as funcoes do leadscaucaia2 (Vercel, Node 18+, sem dependencias).
// Variaveis de ambiente (na Vercel, NUNCA no codigo; este repositorio e publico):
//   SUPABASE_URL               https://roashkfdjgsweuftqhyx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  a chave de servico (service_role) do Supabase da DPR
//   AUTORIZADOS                e-mails da equipe que podem abrir o painel, separados por virgula
//   ORIGENS_PERMITIDAS         (opcional) outros dominios do book, alem de caucaia2.construtoradpr.com.br
const crypto = require('crypto');

const URL_SB = (process.env.SUPABASE_URL || 'https://roashkfdjgsweuftqhyx.supabase.co').replace(/\/$/, '');
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

function responder(res, status, corpo, extra) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(extra || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.end(corpo == null ? '' : JSON.stringify(corpo));
}

// chamada ao Supabase com a chave de servico
async function sb(caminho, opcoes) {
  const o = opcoes || {};
  const r = await fetch(URL_SB + caminho, {
    method: o.method || 'GET',
    headers: Object.assign({ apikey: CHAVE, Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json' }, o.headers || {}),
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch (e) { dados = texto; }
  return { ok: r.ok, status: r.status, dados };
}

// le uma consulta inteira, de 1000 em 1000 (o PostgREST corta em 1000 linhas); teto de 20 mil
async function tudo(caminho) {
  const saida = [];
  for (let de = 0; de < 20000; de += 1000) {
    const r = await sb(caminho, { headers: { Range: de + '-' + (de + 999), 'Range-Unit': 'items' } });
    if (!r.ok) return { ok: false, status: r.status, dados: r.dados };
    const lote = Array.isArray(r.dados) ? r.dados : [];
    saida.push(...lote);
    if (lote.length < 1000) break;
  }
  return { ok: true, dados: saida };
}

const autorizados = () => String(process.env.AUTORIZADOS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

// confere quem chamou: o token do login (Supabase) e o e-mail na lista AUTORIZADOS
async function quemPediu(req) {
  if (!CHAVE) return { erro: [500, 'A chave de servico do Supabase nao esta configurada na Vercel (SUPABASE_SERVICE_ROLE_KEY).'] };
  if (!autorizados().length) return { erro: [500, 'A lista AUTORIZADOS nao esta configurada na Vercel.'] };
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { erro: [401, 'Entre no painel.'] };
  const r = await fetch(URL_SB + '/auth/v1/user', { headers: { apikey: CHAVE, Authorization: 'Bearer ' + token } });
  if (!r.ok) return { erro: [401, 'Sessao vencida. Entre de novo.'] };
  const u = await r.json();
  const email = String((u && u.email) || '').trim().toLowerCase();
  if (!email || autorizados().indexOf(email) < 0) return { erro: [403, 'Este e-mail nao esta autorizado no painel do book.'] };
  return { email };
}

// "bilhete" do mapa de calor: o painel pede um, valido por 2 horas, e abre o book com ele no endereco.
// Assinado com a chave de servico (nada de variavel nova); nao da acesso a mais nada alem do mapa.
function assinar(texto) { return crypto.createHmac('sha256', 'mapa-book:' + CHAVE).update(texto).digest('base64url'); }
function criarBilhete(email) {
  const exp = Date.now() + 2 * 3600e3;
  const corpo = Buffer.from(JSON.stringify({ e: email, x: exp })).toString('base64url');
  return corpo + '.' + assinar(corpo);
}
function conferirBilhete(b) {
  const [corpo, sig] = String(b || '').split('.');
  if (!corpo || !sig || !CHAVE) return false;
  const esperado = assinar(corpo);
  if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return false;
  try { const d = JSON.parse(Buffer.from(corpo, 'base64url').toString()); return d.x > Date.now(); } catch (e) { return false; }
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return await new Promise((ok) => { let t = ''; req.on('data', (c) => { t += c; if (t.length > 200000) t = ''; }); req.on('end', () => ok(t)); });
}

module.exports = { responder, sb, tudo, quemPediu, criarBilhete, conferirBilhete, lerCorpo, CHAVE };
