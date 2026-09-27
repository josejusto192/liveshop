# 04. Arquitetura

## Stack (decidida)

| Parte | Escolha | Por quê |
|---|---|---|
| App (front + back) | **Next.js 15** (App Router) + **TypeScript** | Um projeto só para comprador, admin e API |
| Estilo | **Tailwind CSS** com os tokens de `design/tokens.css` | Rápido e fiel ao protótipo |
| Banco | **PostgreSQL 16** | Transações e lock de linha para o estoque |
| ORM / migrações | **Drizzle ORM** + drizzle-kit | Leve, SQL visível |
| Tempo real | **Server-Sent Events (SSE)** | Só servidor → navegador; nativo, sem biblioteca |
| Servidor de vídeo | **MediaMTX** (Docker) | Recebe RTMP do OBS e entrega HLS / LL-HLS |
| Player | **hls.js** | HLS em qualquer navegador |
| CDN (quando crescer) | **Bunny CDN** (pull zone apontando para o MediaMTX) | Só troca a variável `HLS_BASE_URL` |
| E-mail | **Resend** (ou SMTP via Nodemailer) | Código de acesso e resumos |
| Excel/CSV | **exceljs** | |
| PDF | **@react-pdf/renderer** | Resumo, fatura e PDF para a marca |
| Fontes | **Geist** e **Geist Mono** via `next/font` | |
| Deploy | **Coolify** numa VPS (app + Postgres) e **uma VPS separada** para o MediaMTX | Vídeo não disputa CPU/banda com o app |

## Desenho

```
OBS ──RTMP──▶ MediaMTX (VPS vídeo) ──HLS──▶ [Bunny CDN opcional] ──▶ hls.js (navegador)
                                                                   ▲
Navegador ──HTTP/SSE──▶ Next.js (VPS app) ──▶ PostgreSQL           │
                         │  └─ relógio da live (setInterval no servidor)
                         └─ Resend (e-mail)
```

## Tempo real (SSE)

- Um endpoint por live para o comprador: `GET /api/lives/[slug]/stream`.
- Um endpoint por live para a Central: `GET /api/admin/lives/[id]/stream`.
- Barramento de eventos **em memória** dentro do processo Node (um `EventEmitter` por live). Funciona com **uma instância** do app, que é o suficiente para a v1.
  - `// simplificação: event bus em memória, trocar por Postgres LISTEN/NOTIFY quando houver mais de uma instância`
- **Relógio da live**: um único `setInterval` de 1 s no servidor percorre as lives com status `live`, calcula o tempo e faz a troca automática. Ao reiniciar o servidor, o estado é recalculado do banco (`item_started_at`, `paused_at`, `extra_ms`).
- O navegador faz a contagem regressiva local a partir de `ends_at` recebido; o servidor reenvia o estado a cada troca e a cada 15 s para corrigir desvios.
- Reconexão automática do `EventSource`; ao reconectar, o servidor manda um evento `snapshot` com o estado completo.
- Assistindo agora: conexões SSE abertas por live (contador em memória), emitido a cada 5 s.

## Vídeo

- MediaMTX com `rtmp` habilitado e `hls` em modo `lowLatency` (LL-HLS). Caminho por live: `live/{stream_key}`.
- Autenticação da publicação: a chave da transmissão (`stream_key`) é única por live e validada pelo MediaMTX via `authHTTPAddress` chamando `POST /api/internal/mediamtx/auth` do app.
- URL do player: `${HLS_BASE_URL}/live/{stream_key}/index.m3u8`. Formato vertical: o OBS transmite em 720×1280; o player só muda a proporção do container.
- Qualidade padrão 720p, 2,5 Mbps (sem transcodificação na v1).
- `// simplificação: uma qualidade só, sem ABR, adicionar transcodificação quando houver público com internet ruim`

## Variáveis de ambiente

```
DATABASE_URL=
APP_URL=https://live.dominio.com.br
SESSION_SECRET=
RESEND_API_KEY=
MAIL_FROM="Live Shop <acesso@dominio.com.br>"
RTMP_PUBLIC_URL=rtmp://video.dominio.com.br/live
HLS_BASE_URL=https://video.dominio.com.br   # ou a URL da pull zone da CDN
MEDIAMTX_AUTH_SECRET=
SUPPORT_WHATSAPP=5511999999999
SUPPORT_EMAIL=suporte@dominio.com.br
```

## Estrutura de pastas sugerida

```
app/
  (comprador)/l/[slug]/page.tsx        # decide: cadastro, sala de espera, live ou encerrada
  (comprador)/l/[slug]/codigo/page.tsx
  (comprador)/conta/page.tsx
  admin/(painel)/...                   # visão geral, lives, central, produtos, pedidos, empresas, marcas, configuracoes
  admin/login/page.tsx
  api/...                              # route handlers (SSE, exportações, auth, pedidos)
components/                            # ui compartilhada (Button, Pill, Drawer, Sheet, Toast, QuantityInput...)
lib/
  db/schema.ts  db/index.ts
  auth.ts  otp.ts  mail.ts
  live-clock.ts  events.ts            # relógio da live e event bus
  orders.ts                            # registrar, editar, excluir (transações)
  money.ts                             # formatação pt-BR
docker-compose.yml                     # postgres + mediamtx para desenvolvimento
mediamtx.yml
```

## Desempenho e limites esperados

- Até ~300 compradores simultâneos numa VPS de app comum (SSE é leve).
- Vídeo: sem CDN, cerca de 200 a 300 espectadores por porta de 1 Gbps. Acima disso, ativar a CDN.
- Registro de pedido deve responder em < 300 ms.

## Alternativa (se o cliente preferir)

Supabase (Auth com OTP por e-mail, Realtime e Postgres gerenciado) substitui auth, SSE e banco sem mudar telas nem regras. Só adotar se for decidido antes do M1.
