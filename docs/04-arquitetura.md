# 04. Arquitetura

## Stack (decidida)

| Parte | Escolha | Por quê |
|---|---|---|
| App (front + back) | **Next.js 15** (App Router) + **TypeScript** | Um projeto só para comprador, admin e API |
| Estilo | **Tailwind CSS** com os tokens de `design/tokens.css` | Rápido e fiel ao protótipo |
| Banco | **PostgreSQL 16** | Transações e lock de linha para o estoque |
| ORM / migrações | **Drizzle ORM** + drizzle-kit | Leve, SQL visível |
| Tempo real | **Server-Sent Events (SSE)** | Só servidor → navegador; nativo, sem biblioteca |
| Transmissão | **Navegador do admin** (WebRTC + WHIP), sem OBS | O apresentador transmite do celular ou do computador, sem instalar nada |
| Servidor de vídeo | **MediaMTX** (Docker) | Recebe WebRTC por WHIP e entrega HLS / LL-HLS |
| Player | **hls.js** | HLS em qualquer navegador |
| CDN (quando crescer) | **Bunny CDN** (pull zone apontando para o MediaMTX) | Só troca a variável `HLS_BASE_URL` |
| E-mail | **Resend** (ou SMTP via Nodemailer) | Código de acesso e resumos |
| Excel/CSV | **exceljs** | |
| PDF | **@react-pdf/renderer** | Resumo, fatura e PDF para a marca |
| Fontes | **Geist** e **Geist Mono** via `next/font` | |
| Deploy | **Coolify** numa **única VPS** com três serviços: app, Postgres e MediaMTX | Uma máquina só para operar e pagar; a CDN tira o peso do vídeo quando o público crescer |

## Desenho

```
                              ┌───────────────────── VPS (Coolify) ──────────────────────┐
Tela Transmitir ──WHIP/HTTPS──┼─▶ proxy (video.) ─▶ MediaMTX :8889 (sinalização WebRTC)   │
 (navegador do admin)         │                     MediaMTX :8189/UDP (mídia WebRTC) ◀───┼── UDP direto
                              │      │ authHTTPAddress (rede interna)                      │
                              │      ▼                                                     │
Comprador ───HTTPS/SSE────────┼─▶ proxy (live.) ─▶ Next.js ──▶ PostgreSQL                  │
                              │                     │  └─ relógio da live (setInterval)     │
                              │                     └─ Resend (e-mail)                      │
hls.js ◀── [Bunny CDN opc.] ◀─┼── proxy (hls.) ◀── MediaMTX :8888 (LL-HLS)                 │
                              └───────────────────────────────────────────────────────────┘
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

### Serviço e portas

- MediaMTX roda como serviço do Coolify **na mesma VPS** do app e do Postgres.
  - **8889 (HTTP, WebRTC/WHIP)**: exposta pelo proxy do Coolify num subdomínio com HTTPS (ex.: `video.dominio.com.br` → `mediamtx:8889`). É por onde a tela Transmitir negocia a conexão.
  - **8189/UDP (mídia WebRTC)**: publicada direto no IP da VPS. Liberar 8189/UDP no firewall. `webrtcAdditionalHosts` recebe o IP/domínio público da VPS para os candidatos ICE.
  - **8888 (HLS)**: exposta pelo proxy num segundo subdomínio (ex.: `hls.dominio.com.br` → `mediamtx:8888`). A pull zone da CDN aponta para ele.
  - **RTMP, RTSP, SRT e a API de controle ficam desligados.** Não há OBS.
- `hls` em modo `lowLatency` (LL-HLS). Nada muda para o comprador.

### Transmissão pelo navegador (tela Transmitir, M2)

- `getUserMedia` com a resolução do formato da live: vertical 720×1280, horizontal 1280×720, 30 fps. No celular, câmera traseira por padrão e botão de trocar frontal/traseira; no computador, menus de câmera e microfone (`enumerateDevices`, lista atualizada no `devicechange`, última escolha lembrada no `localStorage`).
- Publicação por **WHIP**: `RTCPeerConnection` só de envio, oferta SDP com `POST ${WHIP_BASE_URL}/live/{liveId}/whip` e token de publicação no `Authorization`.
- **Codecs**: vídeo em **H.264** (`RTCRtpTransceiver.setCodecPreferences`), porque o HLS precisa dele. Áudio sai em **Opus**. Testar no Safari do iPhone; se o HLS com Opus não tocar, configurar no MediaMTX um `runOnReady` com FFmpeg convertendo o áudio para AAC num segundo caminho (o player usa esse caminho).
- **Bitrate** limitado a 2,5 Mbps (`RTCRtpSender.setParameters`, `maxBitrate`).
- Trocar câmera/microfone e mutar usam `replaceTrack` / `track.enabled`: não renegociam nem derrubam a transmissão.
- **Wake Lock** (`navigator.wakeLock`) para a tela não apagar; readquirir ao voltar para a página. Página em segundo plano (`visibilitychange`): avisar que a transmissão pode cair.
- **Reconexão**: queda de ICE/conexão → nova oferta WHIP com backoff (1, 2, 4, 8… s) por até 60 s, com o selo "Reconectando"; depois, botão "Tentar de novo".
- **Qualidade da conexão**: `getStats` a cada 2 s (RTT, perda, `qualityLimitationReason`, bitrate enviado) → bom / instável / ruim.
- **Medidor do microfone**: Web Audio (`AnalyserNode`) sobre a trilha de áudio local.
- Iniciar a transmissão **não** inicia a live. A Central recebe o status do sinal (evento `signal`) e o operador clica em Iniciar live; a tela Transmitir oferece "Iniciar a live junto" para quem está sozinho.
- **TURN**: não usar na v1. Variáveis opcionais `TURN_URL`, `TURN_USER`, `TURN_PASS`; se preenchidas, entram em `iceServers` (junto com o STUN público).
  - `// simplificação: sem TURN, adicionar coturn se apresentadores em redes restritas não conseguirem conectar`

### Autenticação da publicação

- Caminho por live: `live/{liveId}` (público; é o que o player usa). URL do player: `${HLS_BASE_URL}/live/{liveId}/index.m3u8`.
- MediaMTX usa `authMethod: http` e `authHTTPAddress` chamando `POST /api/internal/mediamtx/auth` do app **pela rede interna do Coolify** (`http://app:3000/...`).
- O app responde 200 para `read`/`playback` e para `publish` **só** com um token de publicação válido: assinado (HMAC) com a `stream_key` da live, não expirado, emitido para uma pessoa admin com papel dona ou operador. A `stream_key` virou um segredo interno: o usuário nunca vê nem copia chave.
- O QR code da Central leva um token de uso único (10 min) que cria a sessão de admin no celular e abre a tela Transmitir.

### Qualidade

- Qualidade padrão 720p, 2,5 Mbps (sem transcodificação na v1).
- `// simplificação: uma qualidade só, sem ABR, adicionar transcodificação quando houver público com internet ruim`

## Variáveis de ambiente

```
DATABASE_URL=
APP_URL=https://live.dominio.com.br
SESSION_SECRET=
RESEND_API_KEY=
MAIL_FROM="Live Shop <acesso@dominio.com.br>"
WHIP_BASE_URL=https://video.dominio.com.br     # proxy do Coolify → mediamtx:8889 (WebRTC/WHIP)
HLS_BASE_URL=https://hls.dominio.com.br        # proxy do Coolify → mediamtx:8888, ou a URL da pull zone da CDN
MEDIAMTX_PUBLIC_HOST=203.0.113.10              # IP/domínio público da VPS (webrtcAdditionalHosts)
MEDIAMTX_AUTH_SECRET=
TURN_URL=                                      # opcional (v1 sem TURN)
TURN_USER=
TURN_PASS=
SUPPORT_WHATSAPP=5511999999999
SUPPORT_EMAIL=suporte@dominio.com.br
```

## Desenvolvimento local

- `pnpm dev` sobe Postgres e MediaMTX (Docker Compose) e o Next.js.
- `getUserMedia` exige **HTTPS fora de `localhost`**. Para testar a tela Transmitir no celular apontando para a máquina local, usar **Cloudflare Tunnel** (passo a passo no README): um túnel para o app (3000) e outro para o WHIP do MediaMTX (8889). A mídia WebRTC (UDP 8189) precisa alcançar a máquina: celular na mesma rede Wi-Fi e `MEDIAMTX_PUBLIC_HOST` com o IP local da máquina.
- `pnpm stream:test` (M2): FFmpeg publica um vídeo de teste em loop (vertical ou horizontal) no MediaMTX local, para testar player e Central sem câmera.

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

- Até ~300 compradores simultâneos (SSE é leve).
- App e vídeo **dividem a mesma VPS**: CPU, memória e principalmente a banda de saída. Sem transcodificação o MediaMTX usa pouca CPU (WebRTC → HLS só reempacota; a conversão de áudio para AAC, se for necessária, custa pouco); o gargalo é a banda (720p a 2,5 Mbps × 300 espectadores ≈ 750 Mbps).
- Sem CDN, contar com cerca de 200 espectadores numa porta de 1 Gbps, deixando folga para o app. Acima disso, **ativar a Bunny CDN** (pull zone no subdomínio do HLS): a VPS passa a servir só a CDN e o app.
- Dimensionar a VPS com pelo menos 4 vCPU / 8 GB e porta de 1 Gbps com tráfego suficiente para as horas de live do mês.
- `// simplificação: vídeo e app na mesma VPS, separar o MediaMTX numa VPS própria se a live disputar recursos com o app mesmo com a CDN ligada`
- Registro de pedido deve responder em < 300 ms.
- Medido com `pnpm load:test` (build de produção, 300 conexões SSE e uma transmissão ativa na mesma máquina): pedido isolado ~50 ms; 300 pedidos espalhados em 5 s (60/s) com p95 de 47 ms. A vazão por instância fica em torno de 130 pedidos/s: se os 300 compradores clicarem no mesmo segundo, as respostas passam de 1 s (os pedidos entram todos, só demoram). `// simplificação: uma instância do app, trocar por mais instâncias com LISTEN/NOTIFY no lugar do barramento em memória quando o pico passar de ~100 pedidos por segundo`
- Nos picos, os eventos `stock` (por produto) e `activity` são agrupados: no máximo um a cada 250 ms e 500 ms, sempre com o valor mais recente. O quadro SSE de cada evento é serializado uma vez e reaproveitado por todas as conexões.

## Alternativa (se o cliente preferir)

Supabase (Auth com OTP por e-mail, Realtime e Postgres gerenciado) substitui auth, SSE e banco sem mudar telas nem regras. Só adotar se for decidido antes do M1.
