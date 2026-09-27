# 02. Telas

Cada tela tem PNG em `design/screens/` e protótipo em `design/prototypes/` com o mesmo nome. Tamanhos de referência: desktop 1440×900 (cadastro e código 1280×800), celular 390×844. Todas as telas são responsivas: o desktop vale a partir de 1024 px; abaixo disso, usar a versão celular.

Legenda: **Rota** · **Dados** (o que vem do servidor) · **Ações** · **Estados**.

---

## Comprador

### 1. Cadastro da empresa · `Login` / `LoginMobile`
- **Rota**: `/l/[slug]` quando não há sessão.
- **Conteúdo**: à esquerda (desktop) card escuro com data/hora da live, nome da live, descrição e os 3 passos. À direita, formulário: Nome da empresa, E-mail, WhatsApp, aceite dos termos.
- **Ações**: "Receber código por e-mail" → cria/atualiza a empresa e envia o código (`POST /api/auth/request-code`) → vai para o Código. "Entrar só com o e-mail" → modo login: só e-mail.
- **Estados**: campos obrigatórios com erro inline; e-mail inválido; WhatsApp com máscara `(11) 90000-0000`; botão com loading.

### 2. Código por e-mail · `Codigo` / `CodigoMobile`
- **Rota**: `/l/[slug]/codigo`.
- **Conteúdo**: "Confira seu e-mail", e-mail de destino, campo de 6 dígitos (no desktop 6 caixas; no celular um campo único com `autocomplete="one-time-code"`), "O código vale por 10 minutos", "Trocar e-mail", "Reenviar em 0:30".
- **Ações**: Entrar (`POST /api/auth/verify`). Reenviar libera após 30 s e **invalida o código anterior**.
- **Estados** (ver `CodigoMobile`): digitando; código incorreto (campo vermelho, tremida, "Você tem mais N tentativas"); bloqueado após 3 erros ("Muitas tentativas. Por segurança, peça um novo código."); reenviado (mensagem verde); expirado; sucesso ("Tudo certo") → Sala de espera ou Live.

### 1b. Sala de espera · `SalaEspera` / `SalaEsperaMobile`
- **Rota**: `/l/[slug]` com sessão e live `scheduled`.
- **Conteúdo**: cabeçalho com live, marca, chip "EM BREVE", empresa logada (link para Minha conta). Card escuro com contagem regressiva grande (lime, fonte mono). Lista "O que vai ser apresentado" (nome, preço/un., estoque). Card lime "Como funciona".
- **Ações**: "Adicionar à agenda" (baixa `.ics`), "Me avisar no WhatsApp" (marca preferência).
- **Estados**: quando a live muda para `live` (evento SSE), o card troca para "AO VIVO · A live começou · Entrar na live" com animação. Entrar leva para a Live.

### 3. Live horizontal (desktop) · `Main`
- **Rota**: `/l/[slug]` com live `live` e formato `horizontal`.
- **Layout**: cabeçalho (logo, nome da live, marca, AO VIVO, "312 empresas assistindo", empresa logada → Minha conta, botão preto **Meus pedidos** com sacola e contador lime). Vídeo 16:9 à esquerda com tempo de live e botão de som. Faixa "Nesta live" com o roteiro (apresentado esmaecido, no ar em preto, a seguir, em breve). À direita, card do produto e card escuro de total.
- **Card do produto**: "Produto 2 de 6", chip lime "Disponível por 12:40" (tempo restante; some se `show_timer = false`), foto, nome, chips (preço/un. em destaque preto, estoque, SKU), campo de quantidade grande com botão zerar, botões +10/+50/+100/+1.000, linha de subtotal ("Subtotal: 500 × R$ 89,90 = R$ 44.950,00"), botão **Registrar pedido**, texto "Sem pagamento agora. A fatura chega depois da live."
- **Validação**: acima do estoque disponível → campo vermelho, mensagem "Só temos 4.800 un. em estoque. Ajuste a quantidade.", botão desabilitado. Respeitar mínimo e múltiplo do produto (ver regras).
- **Ao registrar**: aviso flutuante no topo ("Pedido registrado · Produto, 500 un." + "Total registrado: 1.500 un. · R$ 45.840,00"), some em 3,6 s. Campo volta a vazio. Card escuro e contador da sacola atualizam.
- **Card escuro**: "Seus pedidos · N produtos · R$ total", unidades grandes, "Ver e editar" → abre a gaveta.
- **Gaveta Meus pedidos** (mesma tela, sem trocar de rota): desliza da direita (460 px), fundo escurecido, fecha no X ou clicando fora. Total em reais em destaque e unidades. Lista de itens: nome, "R$ 89,90/un. · subtotal R$ 44.950,00", quantidade, seta. Clicar no item expande: stepper −/+ (10 em 10) com campo digitável e botão Excluir → confirmação inline "Excluir este pedido? Manter / Excluir". Alterações valem na hora. Rodapé: "Preços de atacado por unidade. Frete e impostos vêm na fatura. As alterações valem na hora, até a live terminar." Estado vazio: "Você ainda não tem pedidos nesta live."
- **Tempo real**: troca de produto com crossfade, tempo restante, estoque disponível, contador de assistindo.

### 4. Live vertical (desktop) · `LiveVerticalDesktop`
- Igual à horizontal, mas com vídeo 9:16 no centro (444 px de largura), à esquerda "Nesta live" (roteiro com tags No ar/Apresentado/Em breve) e "Acontecendo agora" (feed de atividade anônima), à direita o card do produto. Mesma gaveta de pedidos.

### 5. Live vertical (celular) · `LiveVertical`
- **Rota**: `/l/[slug]` no celular com formato vertical. É a experiência principal no celular (estilo live shop de rede social).
- **Layout**: vídeo em tela cheia com degradê escuro em cima e embaixo para leitura. Topo: avatar da marca, nome, AO VIVO, assistindo, sair. Lateral direita: botões redondos "Meus pedidos" (sacola com contador), "Produtos da live", som. Esquerda baixa: bolhas de atividade ("Uma empresa de Sorocaba pediu 500 un."), a mais nova em destaque. Base: card branco do produto (miniatura com "2 de 5", chip "Disponível por 00:45", nome, preço/un. em destaque, estoque) e botão "Pedir este produto"; se já pediu, mostra "Você pediu 500 un." ao lado.
- **Gaveta "Fazer pedido"** (sobe de baixo): produto, "Pedido mínimo 10 un. · múltiplos de 10", campo de quantidade, +10/+50/+100/+1.000, linha "R$ 89,90/un. · Subtotal R$ 44.950,00", Registrar pedido. Ao registrar, a gaveta desce e aparece o aviso no topo.
- **Gaveta "Meus pedidos"**: card escuro com total em reais e unidades, itens com preço e subtotal, clique no item para editar ou excluir (igual ao desktop).
- **Gaveta "Produtos da live"**: roteiro com tags.

### 6. Live horizontal (celular) · `LiveMobile`
- Vídeo 16:9 no topo, aviso de pedido, card do produto, total. Mesmas regras da live vertical no celular (usar as mesmas gavetas).

### 3c. Estados do produto · `EstadosProduto`
- Referência dos 3 estados do card (vale para todas as lives):
  - **Disponível**: normal.
  - **Estoque baixo** (disponível < 10% do estoque): chip laranja "Últimas 320 un.", barra de estoque; quantidade acima do disponível deixa o campo vermelho com tremida, mensagem "Só restam 320 un. Ajuste a quantidade ou peça o máximo.", botão "Pedir o máximo" preenche o disponível, botão principal vira "Quantidade acima do estoque" desabilitado.
  - **Esgotado**: foto esmaecida com selo "Todo o estoque foi pedido", nome em cinza, aviso "Este produto esgotou durante a live", botão "Avisar se voltar ao estoque", botão principal "Esgotado" desabilitado.

### 3d. Live encerrada · `LiveEncerrada` / `LiveEncerradaMobile`
- **Rota**: `/l/[slug]` com live `ended`.
- **Conteúdo**: "A live terminou. Obrigado por participar.", duração, 3 passos (Pedidos enviados, Fatura por e-mail em até [prazo] dias úteis, Pagamento e entrega combinados com a marca). Resumo: valor estimado em destaque, unidades, itens (quantidade × preço = subtotal), aviso de frete/impostos e e-mail para onde foi o resumo.
- **Ações**: Baixar resumo em PDF, Acompanhar meus pedidos (→ Minha conta).

### 3e. Minha conta · `MinhaConta` / `ContaMobile`
- **Rota**: `/conta` (abas: `?aba=pedidos|perfil|suporte`).
- **Meus pedidos**: lista por live (nome, marca, data, unidades, valor, status colorido). Detalhe: código do pedido, linha do tempo em 4 etapas com datas (Pedido registrado, Enviado à marca, Fatura emitida, Entregue), tabela Produto/Preço/Quantidade/Subtotal, total com "Frete e impostos vêm na fatura", "Baixar fatura (PDF)" (desabilitado com "Fatura ainda não emitida" antes do status Faturado), "Baixar resumo", "Falar com o suporte" (abre a aba Suporte já com o pedido selecionado). No celular o detalhe abre em gaveta inferior.
- **Perfil da empresa**: nome, CNPJ, e-mail de compras, WhatsApp, responsável, CEP, endereço de entrega; chaves "Receber resumo e fatura por e-mail" e "Receber lembrete das lives no WhatsApp"; Salvar; Sair da conta.
- **Suporte**: botões WhatsApp (link `wa.me`) e e-mail (`mailto:`); formulário de chamado (assunto, pedido relacionado, mensagem); lista "Seus chamados" com status (Aberto, Respondido).

---

## Admin (agência)

Todas as telas do admin têm a **sidebar escura flutuante** (236 px, margem 24 px) com: Visão geral, Central da live (selo AO VIVO quando há live no ar), Produtos, Pedidos, Empresas, Marcas, Configurações e o card do usuário. O conteúdo fica alinhado ao topo e à base da sidebar (margem 24 px, 16 px de distância dela), **sem painel de fundo**.

### 7. Visão geral · `AdminLives`
- **Rota**: `/admin`.
- Saudação, busca, notificações, seletor de mês, botão **Nova live**.
- Linha 1: card escuro "Ao vivo agora" (tempo, nome, assistindo, "Abrir central"); "Unidades registradas" no mês com variação e barra de progresso segmentada; "Conversão da live" (empresas que pediram / assistindo); card lime "Pedidos em rascunho" com "Faturar pedidos".
- Linha 2: gráfico de barras "Unidades por live" (últimas 10, destaque na maior com tooltip) e "Mais pedidos no mês" (ranking com barras).
- Linha 3: tabela de lives (nome, marca, data, status, empresas, unidades, ação: Abrir central / Configurar / Ver pedidos).

### 8. Nova live · `AdminNovaLive`
- **Rota**: `/admin/lives/nova` e `/admin/lives/[id]/editar`.
- Informações: nome, marca, data, início, **formato do vídeo** (Horizontal 16:9 / Vertical 9:16).
- Roteiro: lista numerada com produto, estoque, duração com −/+ de 5 min (mín. 5, máx. 60), remover; chips "Adicionar: …" com os produtos da marca fora do roteiro; contador e duração total. (Implementar também reordenar por arrastar.)
- Troca de produtos: Automática pelo tempo / Manual; atraso do vídeo (0 a 15 s, padrão 6); chaves "Mostrar timer para o comprador" e "Mostrar atividade de pedidos".
- Acesso: link de convite com Copiar.
- Ações: Salvar rascunho, Salvar e abrir central.

### 9. Central da live · `AdminCentral`
- **Rota**: `/admin/lives/[id]/central`.
- Cabeçalho: AO VIVO, marca, nome, tempo de live, **Encerrar live** (modal de confirmação: "A transmissão para para todos os compradores. Os N pedidos registrados ficam em Pedidos em rascunho" · Continuar ao vivo / Encerrar e ver pedidos).
- KPIs com mini gráficos: Assistindo, Empresas que pediram, Pedidos, Unidades.
- Coluna esquerda: **prévia do vídeo no formato da live** (vertical 9:16 no exemplo) com AO VIVO, assistindo, resolução/taxa/atraso e o card do produto como o comprador vê; "Conectar o OBS" com servidor RTMP e chave (mascarada) com Copiar.
- Centro: card escuro "No ar agora · produto N de M" com modo Automático/Manual, produto, info de estoque, tempo restante grande em lime, barra de progresso segmentada e botões **Próximo agora**, **+5 min**, **Pausar/Retomar**, **Ocultar/Mostrar** (ocupam a largura toda). Roteiro com status (Apresentado, No ar, Próximo, Na fila), duração e "Colocar no ar".
- Direita: "Pedidos em tempo real" (empresa, produto, quantidade, minuto) e "Ver todos os pedidos".

### 10. Produtos e estoque · `AdminProdutos`
- **Rota**: `/admin/produtos`.
- KPIs: produtos cadastrados, estoque disponível, atenção no estoque.
- Filtros: Todos / Em estoque / Estoque baixo / Esgotados + busca por nome ou SKU. Importar planilha.
- Tabela: produto (foto, nome, SKU), preço atacado, barra de estoque (pedido / disponível), chip de disponível (verde, laranja se < 10%, vermelho esgotado).
- Painel lateral "Novo produto" (abre/fecha): foto, nome, SKU, preço atacado, estoque, pedido mínimo, descrição, chave "Bloquear pedidos acima do estoque", Salvar. Clicar num produto abre o mesmo painel em modo edição.

### 11. Pedidos · `AdminPedidos`
- **Rota**: `/admin/pedidos`.
- Ações de topo: CSV, Excel, **PDF para a marca**.
- KPIs do filtro: pedidos, unidades, empresas, gráfico "Pedidos por minuto da live".
- Abas: Rascunho · N / Faturados · N / Cancelados · N. Filtros: Live, Produto, Minuto (de/até), busca por empresa, e-mail ou WhatsApp.
- Tabela: seleção, empresa, contato (e-mail, WhatsApp), produto, quantidade, minuto, status. (Adicionar colunas **Preço/un.** e **Subtotal**.)
- Barra flutuante ao selecionar: "N selecionados · X un.", Limpar seleção, Baixar selecionados, **Marcar como faturado** (só na aba Rascunho). Estado vazio por aba.

### 12. Empresas compradoras · `AdminEmpresas`
- **Rota**: `/admin/empresas`.
- KPIs, segmentos (Todas / Compraram / Só assistiram), busca, exportar lista.
- Tabela e painel de detalhe: dados de contato, lives, pedidos, unidades, "Chamar no WhatsApp", "Ver pedidos", histórico nas lives.

### 13. Marcas · `AdminMarcas`
- **Rota**: `/admin/marcas`.
- Cards por marca (a que está ao vivo em destaque escuro): lives, produtos, empresas, unidades, pedidos a faturar, "Ver pedidos", "Nova live". Modal "Nova marca": nome, segmento, e-mail para receber os pedidos.

### 14. Configurações · `AdminConfig`
- **Rota**: `/admin/configuracoes`.
- Abas: Geral (logo, nome, domínio, cor de destaque, fuso), Transmissão (servidor RTMP, URL da CDN, qualidade, atraso padrão, status do servidor e "Testar conexão"), E-mail (remetente, assunto, validade do código, e-mail de teste), Equipe (membros e papéis, convidar). Card lateral "Plano e uso" (tráfego de CDN, horas ao vivo, e-mails enviados).

### Login do admin (não desenhado)
- `/admin/login`: e-mail + código por e-mail, no mesmo visual da tela de Código. Papéis: dona, operador, financeiro.
