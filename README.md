# leadscaucaia2

Rastreio anônimo de quem entra no book digital do Villagio Caucaia II (`caucaia2.construtoradpr.com.br`, repositório `BookDigitalCaucaia2`) e painel da equipe com mapa de calor.

Para cada visita: de onde veio (link marcado `?origem=`, Instagram, Google, WhatsApp, direto...), aparelho, cidade aproximada, tempo na página, até que página do book chegou e se clicou no WhatsApp. Para o mapa de calor: cliques e movimento do mouse, com a posição relativa à página do book onde aconteceram. **Não grava nome, telefone, e-mail nem IP.**

## Peças

- `t.js`: o coletor. Uma linha no book. Manda lotes a cada 5 s (e um sinal a cada 20 s com a aba aberta, para medir o tempo) e ao sair. Aberto com `#mapaleads=<bilhete>` no endereço do book, não coleta: desenha o mapa de calor por cima do book.
- `api/coletar.js`: recebe os lotes (só de `caucaia2.construtoradpr.com.br` e dos endereços da Vercel do book), valida e grava pela função `book_registrar`.
- `api/resumo.js`: as visitas do período e do anterior (compactas), os cliques e a meta; o painel calcula os quadros no navegador para os filtros valerem para todos.
- `api/agora.js` (quem está lendo agora), `api/jornada.js` (linha do tempo de uma visita) e `api/meta.js` (grava a meta do mês).
- `api/ticket.js` e `api/mapa.js`: mapa de calor por cima do book (`#mapaleads=<bilhete>`). O painel não mostra mais o mapa (pedido de 21/11/2026), mas os cliques seguem guardados e alimentam "O que mais clicam".
- `index.html`: o painel, com login da equipe (mesmo login do Financeiro e do Backoffice): agora no book, filtros (origem, campanha, aparelho, cidade), números com comparação ao período anterior, meta do mês, leads quentes (nota de 0 a 100), funil com tempo por página e onde desistem, qualidade por origem, celular x computador, o que mais clicam, melhor dia e horário, quem voltou, cidades, links marcados, visitas com a jornada de cada uma e exportação para o Excel.
- Robôs (buscadores, prévias de link, verificações automáticas) são descartados no `t.js` e no `api/coletar.js`.
- `sql/001_book_leads.sql`: tabelas `book_visitas` e `book_eventos` e as funções, no Supabase da DPR. Ninguém lê direto: só as funções com a chave de serviço.
- `sql/002_painel.sql`: tempo em cada página, página atual, `book_cliques`, `book_config` (meta) e a limpeza das visitas de teste de 21/11/2026.
- `api/_regras.js` e `api/_comum.js`: regras puras e o comum (o `_` faz a Vercel não publicar como endereço).

## Configuração

1. **Banco**: rodar `sql/001_book_leads.sql` e depois `sql/002_painel.sql` no SQL Editor do Supabase da DPR (o mesmo da Central). Podem rodar de novo.
2. **Vercel**: importar este repositório (framework: Other, sem build). Variáveis (Production e Preview):
   - `SUPABASE_URL` = `https://roashkfdjgsweuftqhyx.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = a chave de serviço do Supabase
   - `AUTORIZADOS` = e-mails da equipe que podem abrir o painel, separados por vírgula
   - opcional `ORIGENS_PERMITIDAS` = outros domínios do book, se houver
   Desligar a Vercel Authentication (Deployment Protection): o book chama o coletor de qualquer visitante.
3. **Book**: no `index.html` do BookDigitalCaucaia2, antes de `</body>`:
   ```html
   <script src="https://<endereco-deste-projeto>/t.js" defer></script>
   ```

Este repositório é público: nenhuma chave nem lista de e-mails vai no código, só nas variáveis da Vercel.

## Links marcados

Para saber de onde veio cada visita, divulgar o book com `?origem=` no fim, um por canal: `https://caucaia2.construtoradpr.com.br/?origem=instagram`, `...?origem=qr`, `...?origem=corretor`. O painel tem um gerador desses links. `utm_source` e `utm_campaign` também são lidos.

## Limites conhecidos

- O desenho do book muda entre celular e computador: o mapa de cada aparelho deve ser aberto no mesmo tipo de aparelho.
- Botões fixos na tela (como o WhatsApp flutuante) não entram no mapa de calor, porque não ficam numa página do book; o clique no WhatsApp é contado à parte.
- Bloqueadores de anúncio podem impedir o coletor em parte das visitas.
- Teto de 500 eventos por visita e 200 por lote.
