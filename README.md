# leadscaucaia2

Rastreio anônimo de quem entra no book digital do Villagio Caucaia II (`caucaia2.construtoradpr.com.br`, repositório `BookDigitalCaucaia2`) e painel da equipe com mapa de calor.

Para cada visita: de onde veio (link marcado `?origem=`, Instagram, Google, WhatsApp, direto...), aparelho, cidade aproximada, tempo na página, até que página do book chegou e se clicou no WhatsApp. Para o mapa de calor: cliques e movimento do mouse, com a posição relativa à página do book onde aconteceram. **Não grava nome, telefone, e-mail nem IP.**

## Peças

- `t.js`: o coletor. Uma linha no book. Manda lotes a cada 5 s (e um sinal a cada 20 s com a aba aberta, para medir o tempo) e ao sair. Aberto com `#mapaleads=<bilhete>` no endereço do book, não coleta: desenha o mapa de calor por cima do book.
- `api/coletar.js`: recebe os lotes (só de `caucaia2.construtoradpr.com.br` e dos endereços da Vercel do book), valida e grava pela função `book_registrar`.
- `api/resumo.js`: números do painel (só equipe autorizada).
- `api/ticket.js` e `api/mapa.js`: o painel pede um bilhete de 2 horas e abre o book com ele; o `t.js` busca os pontos do mapa com esse bilhete.
- `index.html`: o painel, com login da equipe (mesmo login do Financeiro e do Backoffice).
- `sql/001_book_leads.sql`: tabelas `book_visitas` e `book_eventos` e as funções, no Supabase da DPR. Ninguém lê direto: só as funções com a chave de serviço.
- `api/_regras.js` e `api/_comum.js`: regras puras e o comum (o `_` faz a Vercel não publicar como endereço).

## Configuração

1. **Banco**: rodar `sql/001_book_leads.sql` no SQL Editor do Supabase da DPR (o mesmo da Central). Pode rodar de novo.
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
