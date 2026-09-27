# 03. Regras de negócio

Todas validadas no servidor. O front só antecipa a mensagem.

## Acesso do comprador (OTP)

1. Cadastro pede nome da empresa, e-mail, WhatsApp e aceite. O e-mail é a chave única da empresa (normalizado em minúsculas).
2. Código de **6 dígitos numéricos**, guardado com hash, validade de **10 minutos**.
3. Máximo de **3 tentativas** por código. Na 3ª falha o código é invalidado e a tela pede um novo.
4. Reenvio liberado **30 s** depois do envio anterior. Novo código **invalida o anterior**.
5. Limite anti-abuso: 5 códigos por e-mail por hora e 20 por IP por hora.
6. Sessão em cookie `httpOnly`, `secure`, `sameSite=lax`, validade de **30 dias**.
7. Admin usa o mesmo mecanismo de código, mas numa tabela de usuários da agência com papel.

## Live

- Status: `draft` → `scheduled` → `live` → `ended`. Só o admin muda o status.
- Antes de `live`, o comprador vê a Sala de espera. Depois de `ended`, vê Live encerrada.
- O servidor é a **fonte da verdade do tempo**: guarda `current_item_id`, `item_started_at`, `paused_at` e `extra_ms`. O tempo restante é calculado, nunca vem do navegador.
- **Modo automático**: quando o tempo do item acaba (e não está pausado), o servidor coloca o próximo item no ar. No último item, fica no ar até o operador encerrar.
- **Modo manual**: o item só troca quando o operador clica. O comprador não vê timer.
- **+5 min** soma 300 s ao item atual. **Pausar** congela o tempo. **Ocultar** esconde o card do produto para os compradores (não aceita pedidos enquanto oculto).
- **Colocar no ar** pode escolher qualquer item do roteiro (inclusive voltar a um apresentado).
- **Atraso do vídeo**: cada troca é enviada com `effective_at = switched_at + video_delay_s`. O navegador do comprador só troca o card nesse instante, para ficar alinhado com o vídeo.

## Pedido

- Um **pedido** por empresa por live (criado no primeiro registro). Código legível `#LV-0001`.
- Só o **produto no ar e visível** aceita registro. (Pergunta em aberto: permitir pedir itens já apresentados. Suposição v1: não.)
- **Mesmo produto de novo**: soma na linha existente (`qty += nova`). O minuto registrado continua sendo o do primeiro registro; cada registro fica no histórico `order_item_events`.
- **Quantidade**: inteiro > 0, `>= min_qty` do produto e múltiplo de `step_qty` (quando `step_qty > 1`). Mensagens: "Pedido mínimo 10 un." e "Use múltiplos de 10".
- **Estoque**: `disponível = stock_total − soma das quantidades de itens ativos do produto`. Se `block_over_stock = true`, não pode passar do disponível ("Só temos X un. em estoque"). Toda escrita de item faz lock da linha do produto (`SELECT ... FOR UPDATE`) na mesma transação para evitar vender além do estoque com cliques simultâneos.
- **Preço**: o preço unitário é copiado para o item no momento do registro (`unit_price_cents`). Mudar o preço do produto depois não altera pedidos existentes.
- **Editar/excluir** pelo comprador: permitido enquanto a live está `live`. Editar para 0 é o mesmo que excluir. Excluir é lógico (`canceled_at`) e devolve o estoque.
- **Depois da live**: pedidos ficam com status `draft` (Registrado). Só a agência altera.
- Status do pedido: `draft` (Registrado) → `invoicing` (Em faturamento) → `invoiced` (Faturado, fatura disponível) → `delivered` (Entregue); ou `canceled`. Cada mudança grava a data (usada na linha do tempo do comprador).
- **Valores exibidos** são estimativas de atacado sem frete e impostos. Sempre mostrar o aviso "Frete e impostos vêm na fatura".

## Estoque baixo e esgotado

- **Estoque baixo**: disponível > 0 e < 10% de `stock_total`. Chip laranja "Últimas N un." e botão "Pedir o máximo".
- **Esgotado**: disponível = 0. Botão desabilitado; "Avisar se voltar ao estoque" guarda o interesse (`stock_alerts`).
- Estoque atualizado em tempo real para todos os compradores (evento `stock`).

## Atividade anônima

- Se `show_activity = true`, cada registro gera "Uma empresa de {cidade} pediu {qtd} un.". Sem nome de empresa. Sem cidade cadastrada: "Uma empresa pediu {qtd} un.".
- Não mostrar valores em reais na atividade.

## Exportações (admin)

- CSV e Excel com uma linha por item: live, marca, código do pedido, empresa, CNPJ, e-mail, WhatsApp, produto, SKU, quantidade, preço/un., subtotal, minuto da live, data/hora, status.
- **PDF para a marca**: agrupado por empresa, com totais por empresa e total geral, logo da agência e nome da marca.
- Sempre respeitam os filtros atuais da tela.
- "Marcar como faturado" age no **pedido** (empresa + live) de cada linha selecionada.

## Suporte

- Chamado: assunto, pedido opcional, mensagem. Status: aberto, respondido, fechado. A agência responde por e-mail ou WhatsApp (v1 sem chat interno); o admin marca como respondido.

## LGPD

- Aceite dos termos obrigatório no cadastro, com data gravada.
- Dados de contato só visíveis para a agência. A marca recebe só o que está nas exportações.
