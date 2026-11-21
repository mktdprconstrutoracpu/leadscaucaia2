/* leadscaucaia2 / t.js: o coletor do book digital do Villagio Caucaia II.
   Entra no book com uma linha: <script src="https://<projeto>.vercel.app/t.js" defer></script>

   COLETA (anonima): a visita (de onde veio, tamanho da tela), as paginas do book que a pessoa viu,
   os cliques (posicao e o que foi clicado), o movimento do mouse (amostrado, so no computador) e o
   clique no WhatsApp. A posicao vai relativa a pagina do book onde aconteceu (fracao da largura e da
   altura da secao), para o mapa acompanhar telas de alturas diferentes. Nada de nome, telefone,
   e-mail ou IP. Os lotes saem a cada 5 s (e um sinal a cada 20 s com a aba aberta, para medir o
   tempo) e ao sair da pagina.

   MAPA: aberto pelo painel com #mapaleads=<bilhete> no endereco, nao coleta nada: busca os pontos e
   desenha o calor por cima do book, com um painel para trocar tipo, periodo e aparelho. */
(function () {
  'use strict';
  var script = document.currentScript;
  var BASE = '';
  try { BASE = script && script.src ? new URL(script.src).origin : ''; } catch (e) { BASE = ''; }
  if (!BASE || window.__leadsBook) return;
  window.__leadsBook = true;

  var hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  if (hash.get('mapaleads')) { mapa(); return; }
  coletar();

  function idNovo() { return (Math.random().toString(36).slice(2, 12) + Date.now().toString(36)).replace(/[^a-z0-9]/g, ''); }
  function guardado(armazem, chave) {
    var v = '';
    try { v = window[armazem].getItem(chave) || ''; } catch (e) { v = ''; }
    if (!/^[a-z0-9]{10,40}$/.test(v)) { v = idNovo(); try { window[armazem].setItem(chave, v); } catch (e) { /* sem armazenamento: id so desta pagina */ } }
    return v;
  }
  function docW() { return Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0, 1); }
  // a pagina do book (section com id) onde o ponto caiu, e a posicao dentro dela
  function posicao(el, pageX, pageY) {
    var sec = el && el.closest ? el.closest('section[id]') : null;
    if (!sec) return null;
    var r = sec.getBoundingClientRect();
    var topo = r.top + (window.scrollY || window.pageYOffset || 0);
    if (r.height < 1) return null;
    return { secao: sec.id, xr: pageX / docW(), yr: (pageY - topo) / r.height };
  }

  /* ---------------------------------------------------------------- coleta */
  function coletar() {
    var sessao = guardado('sessionStorage', 'bk_s');
    var visitante = guardado('localStorage', 'bk_v');
    var q = new URLSearchParams(location.search);
    var fila = [], enviados = 0, MAX = 500;
    function add(ev) { if (fila.length + enviados < MAX) fila.push(ev); }

    function alvoDe(el) {
      try {
        var e = el && el.nodeType === 3 ? el.parentElement : el;
        for (var i = 0; e && i < 3; i++) {
          if (e.id && e.tagName !== 'SECTION') return e.tagName.toLowerCase() + '#' + e.id;
          if (e.tagName === 'A' || e.tagName === 'BUTTON') break;
          e = e.parentElement;
        }
        if (!e) return '';
        var cls = (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        return e.tagName.toLowerCase() + (cls ? '.' + cls : '');
      } catch (err) { return ''; }
    }

    // paginas do book vistas: quando 40% da secao aparece, ou quando ela ocupa 60% da tela
    // (as paginas mais altas que a tela, como a da obra, nunca chegam a 40% visiveis de uma vez)
    var vistas = {};
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (itens) {
        itens.forEach(function (it) {
          var id = it.target.id;
          if (!it.isIntersecting || vistas[id]) return;
          if (it.intersectionRatio >= 0.4 || it.intersectionRect.height >= window.innerHeight * 0.6) { vistas[id] = 1; add({ tipo: 'secao', secao: id }); }
        });
      }, { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4] });
      var obs = function () { document.querySelectorAll('section[id]').forEach(function (s) { io.observe(s); }); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', obs); else obs();
    }

    document.addEventListener('click', function (e) {
      var p = posicao(e.target, e.pageX, e.pageY);
      var alvo = alvoDe(e.target);
      if (p) add({ tipo: 'click', secao: p.secao, xr: p.xr, yr: p.yr, alvo: alvo });
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (a && /wa\.me|whatsapp\.com/i.test(a.getAttribute('href') || '')) {
        add({ tipo: 'whatsapp', secao: p ? p.secao : null, alvo: alvo });
        enviar(true);   // o WhatsApp abre e a aba pode sair: manda ja
      }
    }, true);

    var ultimo = 0, lx = -100, ly = -100;
    document.addEventListener('mousemove', function (e) {
      var t = Date.now();
      if (t - ultimo < 250) return;
      if (Math.abs(e.pageX - lx) < 14 && Math.abs(e.pageY - ly) < 14) return;
      ultimo = t; lx = e.pageX; ly = e.pageY;
      var p = posicao(e.target, e.pageX, e.pageY);
      if (p) add({ tipo: 'move', secao: p.secao, xr: p.xr, yr: p.yr });
    }, { passive: true });

    var primeiro = true;
    function enviar(forcar) {
      var lote = fila.splice(0, fila.length);
      if (!lote.length && !forcar && !primeiro) return;
      enviados += lote.length;
      var corpo = { sessao: sessao, visitante: visitante, site: location.host, vw: window.innerWidth, vh: window.innerHeight, eventos: lote };
      if (primeiro) {
        corpo.origem = q.get('origem') || q.get('utm_source') || '';
        corpo.campanha = q.get('utm_campaign') || '';
        corpo.ref = document.referrer || '';
        primeiro = false;
      }
      var txt = JSON.stringify(corpo);
      try {
        if (navigator.sendBeacon && navigator.sendBeacon(BASE + '/api/coletar', new Blob([txt], { type: 'text/plain' }))) return;
        fetch(BASE + '/api/coletar', { method: 'POST', body: txt, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
      } catch (e) { /* o rastreio nunca pode quebrar o book */ }
    }
    enviar(true);
    setInterval(function () { if (!document.hidden) enviar(false); }, 5000);
    setInterval(function () { if (!document.hidden) enviar(true); }, 20000);
    document.addEventListener('visibilitychange', function () { if (document.hidden) enviar(true); });
    window.addEventListener('pagehide', function () { enviar(true); });
  }

  /* ------------------------------------------------------------------ mapa */
  function mapa() {
    var bilhete = hash.get('mapaleads');
    var tipo = hash.get('tipo') === 'move' ? 'move' : 'click';
    var dias = hash.get('dias') || '30';
    var aparelho = hash.get('aparelho') || 'todos';

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:2147483000;';
    var painel = document.createElement('div');
    painel.setAttribute('role', 'region');
    painel.setAttribute('aria-label', 'Mapa de calor do book');
    painel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483001;background:#15161a;color:#fff;font:13px/1.45 Arial,sans-serif;padding:14px 16px;border-radius:14px;box-shadow:0 18px 40px rgba(0,0,0,.45);display:grid;gap:9px;width:240px;max-width:calc(100vw - 32px);';
    painel.innerHTML =
      '<strong style="font-size:11px;letter-spacing:2px;color:#ff4a3d">MAPA DE CALOR · BOOK</strong>' +
      '<label>Tipo <select data-k="tipo"><option value="click">Cliques</option><option value="move">Movimento do mouse</option></select></label>' +
      '<label>Período <select data-k="dias"><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="180">180 dias</option></select></label>' +
      '<label>Aparelho <select data-k="aparelho"><option value="todos">Todos</option><option value="celular">Celular</option><option value="tablet">Tablet</option><option value="computador">Computador</option></select></label>' +
      '<div data-info style="color:#b9bcc4">Carregando...</div>' +
      '<p style="margin:0;font-size:11.5px;color:#8a8d95">Abra no mesmo tipo de aparelho escolhido: o desenho do book muda entre celular e computador.</p>';
    function montar() {
      document.body.appendChild(canvas);
      document.body.appendChild(painel);
      painel.querySelectorAll('select').forEach(function (s) {
        s.style.cssText = 'display:block;width:100%;margin-top:3px;background:#24262c;color:#fff;border:1px solid #3a3d45;border-radius:8px;padding:6px;font:inherit;';
        s.value = { tipo: tipo, dias: dias, aparelho: aparelho }[s.getAttribute('data-k')];
        s.addEventListener('change', function () {
          hash.set(this.getAttribute('data-k'), this.value);
          location.hash = hash.toString();
          location.reload();
        });
      });
      carregar();
    }
    if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);
    var info = painel.querySelector('[data-info]');

    var pontos = [];
    function altura() { return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 1); }
    function desenhar() {
      var W = docW(), H = altura(), sy = window.scrollY || window.pageYOffset || 0;
      canvas.width = W; canvas.height = H;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      if (!pontos.length) return;
      var secs = {};
      document.querySelectorAll('section[id]').forEach(function (s) { var r = s.getBoundingClientRect(); secs[s.id] = { topo: r.top + sy, h: r.height }; });
      var raio = tipo === 'click' ? 24 : 32, max = 1;
      pontos.forEach(function (p) { if (p[3] > max) max = p[3]; });
      pontos.forEach(function (p) {
        var s = secs[p[0]]; if (!s) return;
        var x = p[1] * W, y = s.topo + p[2] * s.h;
        var a = Math.min(1, 0.14 + 0.86 * (p[3] / max));
        var g = ctx.createRadialGradient(x, y, 0, x, y, raio);
        g.addColorStop(0, 'rgba(0,0,0,' + a + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x - raio, y - raio, raio * 2, raio * 2);
      });
      var c = document.createElement('canvas'); c.width = 256; c.height = 1;
      var cx = c.getContext('2d'), lg = cx.createLinearGradient(0, 0, 256, 0);
      lg.addColorStop(0.15, 'rgb(0,0,255)'); lg.addColorStop(0.4, 'rgb(0,255,255)'); lg.addColorStop(0.6, 'rgb(0,255,0)'); lg.addColorStop(0.8, 'rgb(255,255,0)'); lg.addColorStop(1, 'rgb(255,0,0)');
      cx.fillStyle = lg; cx.fillRect(0, 0, 256, 1);
      var pal = cx.getImageData(0, 0, 256, 1).data;
      var img = ctx.getImageData(0, 0, W, H), d = img.data;
      for (var k = 0; k < d.length; k += 4) {
        var al = d[k + 3]; if (!al) continue;
        d[k] = pal[al * 4]; d[k + 1] = pal[al * 4 + 1]; d[k + 2] = pal[al * 4 + 2];
        d[k + 3] = Math.min(255, Math.round(al * 0.85) + 30);
      }
      ctx.putImageData(img, 0, 0);
    }
    function carregar() {
      var url = BASE + '/api/mapa?bilhete=' + encodeURIComponent(bilhete) + '&tipo=' + tipo + '&dias=' + encodeURIComponent(dias) + '&aparelho=' + encodeURIComponent(aparelho);
      fetch(url).then(function (r) { return r.json().then(function (d) { return { st: r.status, d: d }; }); }).then(function (x) {
        if (x.st === 401) { info.textContent = 'O link do mapa venceu. Abra de novo pelo painel.'; return; }
        if (!x.d || !x.d.ok) { info.textContent = 'Não foi possível carregar o mapa.'; return; }
        pontos = x.d.pontos || [];
        info.innerHTML = (tipo === 'click' ? 'Cliques' : 'Pontos de movimento') + ': <b>' + x.d.total + '</b>' + (pontos.length ? '' : '<br>Nenhum registro nesse filtro ainda.');
        desenhar();
      }).catch(function () { info.textContent = 'Falha de rede ao carregar o mapa.'; });
    }
    var t = null;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(desenhar, 200); });
    window.addEventListener('load', function () { setTimeout(desenhar, 600); });
    // o book tem animacoes que mudam a altura ao rolar: redesenha de vez em quando
    setInterval(function () { if (pontos.length && altura() !== canvas.height) desenhar(); }, 1500);
  }
})();
