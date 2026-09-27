# 06. API e eventos

Route handlers do Next.js. Formulários do admin podem usar Server Actions; SSE, exportações e endpoints públicos ficam em route handlers. Respostas de erro: `{ error: { code, message } }` com a mensagem pronta para mostrar em pt-BR.

## Comprador

| Método | Rota | Uso |
|---|---|---|
| POST | `/api/auth/request-code` | `{ email, company?, whatsapp?, acceptTerms?, liveSlug }` cria/atualiza empresa e envia código |
| POST | `/api/auth/verify` | `{ email, code }` → cookie de sessão. Erros: `invalid_code` (com `attemptsLeft`), `blocked`, `expired` |
| POST | `/api/auth/logout` | |
| GET | `/api/me` | dados da empresa |
| PATCH | `/api/me` | perfil e preferências |
| GET | `/api/lives/[slug]` | live pública: nome, marca, data, status, formato, roteiro (nome, preço, estoque), `hlsUrl` só com sessão |
| GET | `/api/lives/[slug]/stream` | SSE (ver eventos) |
| GET | `/api/lives/[slug]/my-order` | itens do meu pedido nesta live |
| POST | `/api/lives/[slug]/orders` | `{ liveItemId, qty }` registra (soma se já existe). Erros: `not_on_air`, `below_min`, `not_multiple`, `over_stock` (com `available`), `live_not_running` |
| PATCH | `/api/order-items/[id]` | `{ qty }` altera (0 = excluir) |
| DELETE | `/api/order-items/[id]` | exclui (lógico) |
| GET | `/api/me/orders` | histórico |
| GET | `/api/me/orders/[id]` | detalhe com linha do tempo |
| GET | `/api/me/orders/[id]/summary.pdf` | resumo |
| GET | `/api/me/orders/[id]/invoice.pdf` | fatura (403 se não emitida) |
| GET | `/api/lives/[slug]/calendar.ics` | adicionar à agenda |
| POST | `/api/lives/[slug]/stock-alert` | `{ productId }` avisar se voltar |
| GET/POST | `/api/support/tickets` | listar e abrir chamado |

## Admin (`/api/admin/*`, exige sessão de admin; papel indicado)

| Método | Rota | Papel |
|---|---|---|
| GET/POST/PATCH | `/lives`, `/lives/[id]` | dona, operador |
| PUT | `/lives/[id]/items` | roteiro completo `[{ productId, durationS }]` na ordem |
| POST | `/lives/[id]/start` · `/end` | dona, operador |
| POST | `/lives/[id]/broadcast-link` → `{ url, qr, expiresAt }` link de uso único (10 min) para abrir Transmitir no celular já logado | dona, operador |
| POST | `/lives/[id]/publish-token` → `{ whipUrl, token, iceServers }` token curto para a tela Transmitir publicar | dona, operador |
| POST | `/lives/[id]/next` · `/goto` `{ itemId }` · `/pause` · `/resume` · `/extend` `{ seconds }` · `/hide` · `/show` · `/mode` `{ mode }` | dona, operador |
| GET | `/lives/[id]/stream` | SSE da Central |
| GET/POST/PATCH | `/products`, `/products/[id]` · POST `/products/import` (xlsx/csv) | dona, operador |
| GET | `/orders?status&liveId&productId&minFrom&minTo&q&from&to` | todos |
| POST | `/orders/bulk-status` `{ orderIds, status }` | dona, financeiro |
| GET | `/orders/export.csv` · `.xlsx` · `.pdf` (mesmos filtros) | dona, financeiro |
| POST | `/orders/[id]/invoice` (upload do PDF da fatura) | dona, financeiro |
| GET | `/companies`, `/companies/[id]` · `/companies/export.xlsx` | todos |
| GET/POST/PATCH | `/brands`, `/brands/[id]` | dona |
| GET/PATCH | `/settings` · POST `/settings/test-email` (o teste de câmera é no navegador) | dona |
| GET/POST/DELETE | `/team` | dona |
| GET | `/dashboard?month=` | KPIs da visão geral |
| PATCH | `/support/tickets/[id]` `{ status }` | todos |

## Interno

| POST | `/api/internal/mediamtx/auth` | Chamado pelo MediaMTX (`authHTTPAddress`, rede interna) a cada publicação e leitura. `action=read`/`playback` no caminho de uma live agendada ou no ar: 200. `action=publish`: 200 só com o token de publicação válido (assinado com a `stream_key` da live, não expirado, de um admin dona/operador ainda ativo, para o mesmo caminho). Qualquer outra coisa: 401 |

### Transmissão (WHIP)

- A tela Transmitir pede `publish-token` e publica com WHIP em `${WHIP_BASE_URL}/live/{liveId}/whip`, token no header `Authorization: Bearer <token>`.
- O caminho no MediaMTX é `live/{liveId}` (público, serve para assistir). A `stream_key` é um segredo interno que só assina os tokens; nunca aparece em tela nem em URL. Trocar a `stream_key` invalida todos os tokens da live.
- Token de publicação: HMAC-SHA256 com a `stream_key` sobre `{ liveId, adminUserId, exp }`, validade de 2 h (renovado pela tela enquanto ela está aberta).
- Link do QR code: token aleatório de uso único guardado com hash, 10 min; ao abrir, cria a sessão de admin no celular e redireciona para Transmitir.

## Eventos SSE

Formato: `event: <nome>` + `data: <json>`.

### Canal do comprador `/api/lives/[slug]/stream`

| Evento | Dados | Quando |
|---|---|---|
| `snapshot` | estado completo (status, item atual, tempos, estoque dos itens, assistindo) | ao conectar/reconectar |
| `status` | `{ status }` | live começou/terminou |
| `item` | `{ itemId, productId, position, endsAt, paused, hidden, effectiveAt }` | troca, +5 min, pausa, ocultar. O cliente aplica em `effectiveAt` (atraso do vídeo) |
| `stock` | `{ productId, available }` | a cada registro/alteração/exclusão |
| `activity` | `{ text }` | a cada registro (se `show_activity`) |
| `viewers` | `{ count }` | a cada 5 s |

### Canal da Central `/api/admin/lives/[id]/stream`

Tudo do canal do comprador (sem atraso) mais:

| Evento | Dados |
|---|---|
| `order` | `{ company, initials, product, qty, liveOffset }` para "Pedidos em tempo real" |
| `kpis` | `{ viewers, buyingCompanies, orders, units }` a cada 5 s |
| `signal` | `{ state: 'none' \| 'receiving' \| 'unstable', since }` status do sinal vindo da tela Transmitir (MediaMTX: hooks `runOnReady`/`runOnNotReady` chamando o app + checagem periódica dos bytes recebidos) |
