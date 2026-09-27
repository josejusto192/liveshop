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
| POST | `/lives/[id]/next` · `/goto` `{ itemId }` · `/pause` · `/resume` · `/extend` `{ seconds }` · `/hide` · `/show` · `/mode` `{ mode }` | dona, operador |
| GET | `/lives/[id]/stream` | SSE da Central |
| GET/POST/PATCH | `/products`, `/products/[id]` · POST `/products/import` (xlsx/csv) | dona, operador |
| GET | `/orders?status&liveId&productId&minFrom&minTo&q&from&to` | todos |
| POST | `/orders/bulk-status` `{ orderIds, status }` | dona, financeiro |
| GET | `/orders/export.csv` · `.xlsx` · `.pdf` (mesmos filtros) | dona, financeiro |
| POST | `/orders/[id]/invoice` (upload do PDF da fatura) | dona, financeiro |
| GET | `/companies`, `/companies/[id]` · `/companies/export.xlsx` | todos |
| GET/POST/PATCH | `/brands`, `/brands/[id]` | dona |
| GET/PATCH | `/settings` · POST `/settings/test-email` · `/settings/test-stream` | dona |
| GET/POST/DELETE | `/team` | dona |
| GET | `/dashboard?month=` | KPIs da visão geral |
| PATCH | `/support/tickets/[id]` `{ status }` | todos |

## Interno

| POST | `/api/internal/mediamtx/auth` | MediaMTX valida `stream_key` na publicação (header com `MEDIAMTX_AUTH_SECRET`) |

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
