# 01. Produto

## O que é

Plataforma de **live commerce B2B**. A agência transmite lives (via OBS) apresentando produtos de uma marca. Empresas compradoras assistem, veem cada produto com preço de atacado e estoque, e **registram pedidos em quantidade** (10, 50, 100, 1.000 unidades…) sem pagar nada na hora. A sensação é de compra rápida: o comprador clica, aparece "Pedido registrado" e ele continua na live.

Depois da live, os pedidos ficam em **rascunho** no painel da agência, que filtra, exporta (PDF, Excel, CSV) e fatura para a marca.

## Papéis

| Papel | Quem é | Onde acessa |
|---|---|---|
| **Comprador** | Empresa B2B (lojista, distribuidor) | Link da live, cadastro com código por e-mail |
| **Admin: dona** | Dona da agência | Painel `/admin`, acesso total |
| **Admin: operador** | Quem opera a live | Central da live, produtos, lives |
| **Admin: financeiro** | Quem fatura | Pedidos, empresas, exportações |
| **Marca** | Cliente da agência (não acessa o sistema) | Recebe o PDF/Excel de pedidos por e-mail |

## Glossário

- **Live**: uma transmissão agendada para uma marca, com formato horizontal (16:9) ou vertical (9:16).
- **Roteiro**: lista ordenada de produtos da live, cada um com duração (ex.: 15 min).
- **Produto no ar**: o produto do roteiro que está sendo apresentado; é o único que aceita pedidos.
- **Troca automática / manual**: no automático, o produto muda quando o tempo acaba; no manual, o operador troca.
- **Atraso do vídeo**: segundos de atraso da transmissão (HLS). A troca de produto na tela do comprador espera esse atraso para ficar sincronizada com o vídeo.
- **Pedido**: conjunto de itens de uma empresa numa live. Status: Rascunho (Registrado) → Em faturamento → Faturado → Entregue, ou Cancelado.
- **Item do pedido**: produto + quantidade + preço unitário congelado no momento do registro + minuto da live.
- **Sala de espera**: tela antes da live começar, com contagem regressiva.

## Fluxos principais

### Comprador
1. Recebe o link da live (`/l/{slug}`) por WhatsApp/e-mail.
2. **Cadastro**: nome da empresa, e-mail, WhatsApp e aceite dos termos. Se o e-mail já existe, só pede o código.
3. **Código**: recebe código de 6 dígitos por e-mail, digita e entra.
4. **Sala de espera** (se a live ainda não começou): contagem regressiva, lista do que será apresentado, "Adicionar à agenda", "Avisar no WhatsApp". Quando a live começa, aparece "A live começou" com botão para entrar.
5. **Live**: vê o vídeo, o produto no ar (foto, nome, preço, estoque, tempo restante), escolhe a quantidade (+10, +50, +100, +1.000 ou digita), vê o subtotal e clica em **Registrar pedido**. Aparece o aviso "Pedido registrado" com o total acumulado em unidades e em reais. O produto troca sozinho quando o tempo acaba.
6. **Meus pedidos (durante a live)**: gaveta lateral (desktop) ou gaveta inferior (celular) com os itens; clicando num item ele pode alterar a quantidade (−/+ de 10 em 10 ou digitando) ou excluir com confirmação. Vale até a live terminar.
7. **Live encerrada**: resumo dos pedidos com valores, próximos passos (pedidos enviados, fatura por e-mail, pagamento e entrega com a marca), baixar resumo em PDF, "Acompanhar meus pedidos".
8. **Minha conta**: histórico de pedidos por live com status e linha do tempo, detalhe com itens e valores, baixar fatura quando emitida, perfil da empresa, suporte (WhatsApp, e-mail, chamados).

### Agência (admin)
1. Cadastra **marcas** e **produtos** (preço de atacado, estoque, pedido mínimo, múltiplo, foto).
2. Cria uma **live**: nome, marca, data, horário, formato (horizontal/vertical), roteiro com duração de cada produto, modo de troca, atraso do vídeo, opções (mostrar timer, mostrar atividade anônima) e copia o link de convite.
3. Conecta o OBS com servidor RTMP e chave mostrados na **Central da live**.
4. Durante a live, na Central: vê a prévia do vídeo, KPIs ao vivo (assistindo, empresas que pediram, pedidos, unidades), troca de produto (automática ou manual), +5 min, pausar, ocultar produto, colocar outro produto no ar, pedidos chegando em tempo real, encerrar a live (com confirmação).
5. Depois: **Pedidos** com filtros (live, produto, minuto da live, período, busca), abas por status, seleção em lote, marcar como faturado, exportar CSV/Excel/PDF para a marca.
6. **Empresas**: base de compradores com histórico. **Configurações**: identidade, transmissão, e-mail do código, equipe.

## Fora do escopo (v1)

- Pagamento online, frete calculado, emissão de nota fiscal.
- Chat na live (existe só o feed de atividade anônima).
- App nativo (é web responsivo; o celular é prioridade para a live vertical).
- Multi-agência (uma instalação = uma agência).
