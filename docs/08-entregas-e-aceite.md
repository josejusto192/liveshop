# 08. Entregas e critérios de aceite

Entregar por marco. Cada marco termina com o app rodando, testes passando e uma demo curta.

## M1. Base, acesso, marcas e produtos

- Projeto Next.js + Drizzle + docker-compose (Postgres, MediaMTX), seed com os dados do protótipo.
- Login por código (comprador e admin), sessão, logout.
- Admin: layout com sidebar, Marcas, Produtos (CRUD + importação xlsx/csv), Configurações básicas, Equipe.

Aceite:
- [ ] Código chega por e-mail, expira em 10 min, bloqueia na 3ª tentativa, reenvio só depois de 30 s e invalida o anterior.
- [ ] Papéis: financeiro não cria live; operador não mexe em Configurações.
- [ ] Importar planilha com 200 produtos em menos de 10 s, com relatório de linhas com erro.

## M2. Lives, vídeo e Central

- Nova live (roteiro com arrastar para ordenar, duração por item, formato, modo, atraso, opções).
- **Transmissão pelo navegador** (WebRTC/WHIP para o MediaMTX): tela Transmitir responsiva (celular e computador), QR code na Central, seleção de câmera/microfone, medidor do microfone, troca de câmera, mutar, wake lock, reconexão com backoff, indicador de conexão. Sem OBS/RTMP.
- Autenticação da publicação no MediaMTX (`/api/internal/mediamtx/auth`) com token de publicação; player hls.js (horizontal e vertical).
- Central com status do sinal (SSE) e **Iniciar live** separado de iniciar a transmissão.
- `pnpm stream:test`: FFmpeg publica um vídeo de teste em loop (vertical ou horizontal) no MediaMTX local.
- Central ao vivo com todos os controles; relógio no servidor; SSE nos dois canais.
- Comprador: Sala de espera, Live (desktop horizontal, desktop vertical, mobile vertical).

Aceite:
- [ ] Do celular (Chrome Android e Safari iPhone), a transmissão aparece para o comprador em até 10 s, com áudio.
- [ ] Transmitir pelo Chrome no Windows e no Mac com webcam USB e microfone externo selecionados.
- [ ] Trocar câmera e mutar funcionam sem derrubar a transmissão.
- [ ] Derrubar o Wi-Fi por 10 s reconecta sozinho.
- [ ] Usuário sem permissão ou link expirado não consegue publicar.
- [ ] A tela não apaga durante a transmissão.
- [ ] Troca automática acontece no tempo certo; pausa, +5 min, ocultar e colocar no ar refletem para o comprador.
- [ ] Card do produto troca alinhado ao vídeo (atraso aplicado).
- [ ] Reiniciar o servidor no meio da live não perde o item atual nem o tempo.

## M3. Pedidos na live

- Registrar, somar, editar (+/− e digitando), excluir; drawer (desktop) e sheet (mobile) de Meus pedidos com preço e totais.
- Estoque em tempo real, estoque baixo, esgotado, avisar se voltar; atividade anônima.
- Live encerrada com resumo e PDF.

Aceite:
- [ ] Teste de concorrência: 50 registros simultâneos no último estoque nunca passam do disponível.
- [ ] Mínimo e múltiplo validados no servidor com as mensagens da tela.
- [ ] Preço congelado: mudar o preço do produto não altera pedido existente.
- [ ] Editar e excluir só funcionam com a live no ar.

## M4. Operação pós-live

- Admin: Pedidos (filtros, seleção, mudar status, anexar fatura), exportações CSV/Excel/PDF para a marca, Empresas.
- Comprador: Minha conta (pedidos, detalhe com linha do tempo, fatura, perfil, suporte).
- Chamados de suporte.

Aceite:
- [ ] Exportações respeitam os filtros e batem com a tela (quantidades e totais).
- [ ] Comprador vê a mudança de status e baixa a fatura quando faturado.
- [ ] Chamado aberto aparece para a agência e pode ser marcado como respondido.

## M5. Acabamento

- Animações conforme `07-design-system.md`, estados vazios, erros e carregamento.
- E-mails: código, resumo pós-live, mudança de status, PDF para a marca.
- Teste de carga com 300 conexões SSE e registros simultâneos.
- Deploy no Coolify numa única VPS (app, Postgres e MediaMTX como serviços): WebRTC/WHIP (8889) e HLS (8888) pelo proxy do Coolify em subdomínios com HTTPS, porta UDP 8189 aberta no firewall; backup diário do banco.

Aceite:
- [ ] Lighthouse acessibilidade ≥ 90 nas telas do comprador.
- [ ] Nenhum botão quebra linha em 360px de largura.
- [ ] Registro de pedido responde em < 300 ms com 300 conectados, **com uma live transmitindo na mesma VPS**.
- [ ] A tela Transmitir publica pelo subdomínio do WHIP em produção (HTTPS) e o player carrega o HLS pelo subdomínio com HTTPS.

## Perguntas em aberto (usar a suposição até resposta do cliente)

| Pergunta | Suposição v1 |
|---|---|
| Prazo de faturamento informado ao comprador | Texto configurável, padrão "em até 5 dias úteis" |
| Desconto por volume | Não existe |
| Pedir item já apresentado | Não permitido |
| Mesmo produto de novo | Soma na mesma linha |
| Acesso só por convite | Não, qualquer um com o link se cadastra |
| Cidade na atividade | Opcional; sem cidade, texto genérico |
| Quem emite a fatura | A agência anexa o PDF recebido da marca |
| Frete | Fora do sistema, vem na fatura |
| Várias agências (multi-tenant) | Não, uma agência por instalação |
| TURN para apresentadores em redes restritas | Não na v1; variáveis opcionais `TURN_URL/TURN_USER/TURN_PASS` |
| Áudio Opus não toca no Safari do iPhone (HLS) | Testar no M2; se não tocar, `runOnReady` com FFmpeg convertendo o áudio para AAC no MediaMTX |
