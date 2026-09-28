# Live Shop B2B

Plataforma de live commerce B2B: a agência transmite lives de marcas direto do navegador e empresas compradoras registram pedidos de estoque durante a live, sem pagamento. Especificação completa em `docs/` (comece pelo `CLAUDE.md`), telas de referência em `design/`.

## Usuários de teste

| Papel | E-mail | Onde entrar |
|---|---|---|
| Admin (dona, acesso a tudo) | `admin@teste.com` | http://localhost:3000/admin |
| Comprador (Loja Teste) | `comprador@teste.com` | link da live ou http://localhost:3000/conta |

Não há senha: o acesso é por código de 6 dígitos enviado por e-mail. Sem `RESEND_API_KEY`, o código aparece no terminal onde está rodando o `pnpm dev`. Rodar `pnpm db:seed` de novo recria tudo do zero.

## Teste rápido com a câmera do notebook

1. `cp .env.example .env`, `pnpm install` e `pnpm db:setup` (sobe Postgres e MediaMTX no Docker, aplica as migrações e carrega os dados de exemplo).
2. `pnpm dev` e abra http://localhost:3000/admin. Entre com `admin@teste.com`: o código de 6 dígitos aparece no terminal do `pnpm dev`.
3. Na Visão geral, abra a **Central** da live "Lançamento Coleção Verão" e clique em **Transmitir** (abre numa aba nova). Permita câmera e microfone, escolha a webcam e o microfone e clique em **Iniciar transmissão**.
4. Volte à Central: quando aparecer "Sinal recebido", clique em **Iniciar live**.
5. Numa janela anônima (ou outro navegador), abra http://localhost:3000/l/lancamento-colecao-verao e entre com `comprador@teste.com` (ou cadastre uma empresa nova). O código também sai no terminal. O vídeo chega com alguns segundos de atraso; registre pedidos no produto no ar.
6. Use fone de ouvido ou deixe o som do comprador desligado, senão o microfone capta o áudio da própria live (eco).
7. Encerre pela Central e confira o resumo do comprador, **Pedidos** (filtros, "Marcar como faturado", CSV/Excel/PDF), **Empresas** e **Minha conta** (http://localhost:3000/conta).

O seed também traz a live encerrada "Volta às Aulas Atacado" com pedidos em vários status e chamados de suporte, para testar Pedidos, Empresas e Minha conta sem fazer uma live antes. A live de exemplo é vertical; a Nova live permite escolher vertical ou horizontal.

## Rodar localmente

Requisitos: Node 22, pnpm 10, Docker.

```bash
cp .env.example .env
pnpm install
pnpm dev            # sobe Postgres e MediaMTX (Docker Compose) e o Next.js em http://localhost:3000
pnpm db:migrate     # em outro terminal, na primeira vez
pnpm db:seed        # dados do protótipo (apaga o banco local)
```

- Live de exemplo: http://localhost:3000/l/lancamento-colecao-verao
- Painel: http://localhost:3000/admin (entre com `admin@agencia.com.br`, `operacao@agencia.com.br` ou `financeiro@agencia.com.br`)
- Sem `RESEND_API_KEY`, o e-mail com o código de acesso aparece no terminal do `pnpm dev`.

Sem Docker, basta um Postgres 16 local com os bancos `liveshop` e `liveshop_test` e `pnpm dev:app`.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Docker Compose (Postgres + MediaMTX) e Next.js |
| `pnpm dev:app` | Só o Next.js |
| `pnpm test` | Testes (usa o banco `liveshop_test`, recriado a cada execução) |
| `pnpm typecheck` | TypeScript |
| `pnpm db:generate` | Gera migração a partir de `lib/db/schema.ts` |
| `pnpm db:migrate` | Aplica as migrações |
| `pnpm db:seed` | Dados de exemplo do protótipo |
| `pnpm db:setup` | Docker Compose, migrações e seed (primeira vez) |
| `pnpm stream:test` | Publica um vídeo de teste em loop no MediaMTX local (sem câmera) |
| `pnpm load:test` | Teste de carga: 300 conexões SSE e pedidos simultâneos na live no ar (`--clients`, `--orders`, `--spread ms`, `--start`) |
| `pnpm admin:create email "Nome"` | Cria a primeira dona do painel (produção) |

## Testar a transmissão no celular (Cloudflare Tunnel)

A câmera do navegador (`getUserMedia`) só funciona em `localhost` ou em HTTPS. Para abrir a tela Transmitir no celular apontando para a sua máquina:

1. Instale o `cloudflared` ([instruções](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)).
2. Abra dois túneis rápidos (cada um imprime uma URL `https://….trycloudflare.com`):
   ```bash
   cloudflared tunnel --url http://localhost:3000   # app
   cloudflared tunnel --url http://localhost:8889   # WHIP do MediaMTX
   ```
3. No `.env`, use as URLs geradas:
   ```
   APP_URL=https://<app>.trycloudflare.com
   WHIP_BASE_URL=https://<whip>.trycloudflare.com
   MEDIAMTX_PUBLIC_HOST=<IP da sua máquina na rede Wi-Fi, ex.: 192.168.0.12>
   ```
4. Reinicie o `pnpm dev`. Deixe o celular **na mesma rede Wi-Fi**: o túnel leva a sinalização (HTTPS), mas a mídia WebRTC vai direto por UDP na porta 8189 da sua máquina (libere no firewall do sistema).
5. Abra `https://<app>.trycloudflare.com/admin` no celular (ou use o QR code da Central).

## Produção (Coolify, uma VPS)

`docker-compose.coolify.yml` sobe app, Postgres, MediaMTX e o backup diário do banco. Detalhes de portas e arquitetura em `docs/04-arquitetura.md`.

1. **DNS**: três registros A apontando para o IP da VPS: `dominio.com.br` (app), `video.dominio.com.br` (WHIP) e `hls.dominio.com.br` (HLS).
2. **Firewall da VPS**: libere 80/443 TCP (proxy do Coolify) e **8189/UDP** (mídia WebRTC).
3. **Coolify**: novo recurso › Docker Compose a partir deste repositório, arquivo `docker-compose.coolify.yml`. Em cada serviço, defina o domínio: app → `https://dominio.com.br` (porta 3000), mediamtx → `https://video.dominio.com.br` (porta 8889) e `https://hls.dominio.com.br` (porta 8888).
4. **Variáveis** (aba Environment): `POSTGRES_PASSWORD`, `SESSION_SECRET` e `MEDIAMTX_AUTH_SECRET` (gere com `openssl rand -hex 32`), `APP_URL=https://dominio.com.br`, `WHIP_BASE_URL=https://video.dominio.com.br`, `HLS_BASE_URL=https://hls.dominio.com.br`, `MEDIAMTX_PUBLIC_HOST=<IP público da VPS>`, `RESEND_API_KEY` e `MAIL_FROM` (domínio verificado no Resend), `SUPPORT_WHATSAPP`, `SUPPORT_EMAIL`. Opcional: `TURN_URL`, `TURN_USER`, `TURN_PASS`.
5. **Deploy**. O app aplica as migrações ao subir. Depois, no terminal do serviço app no Coolify: `pnpm admin:create dona@agencia.com.br "Nome"` e entre em `https://dominio.com.br/admin`. Não rode `pnpm db:seed` em produção (ele apaga o banco).
6. **Conferir**: na Central, Transmitir pelo celular (QR code) e assistir em outro aparelho; o player carrega de `https://hls.dominio.com.br`.

**Backup**: o serviço `backup` faz um dump por dia (00h de Brasília) no volume `backups`, guardando 7 diários, 4 semanais e 6 mensais. Para restaurar:

```bash
docker compose exec backup ls /backups/daily
docker compose exec -T backup sh -c 'gunzip -c /backups/daily/<arquivo>.sql.gz' | docker compose exec -T postgres psql -U postgres -d liveshop
```

Copie os backups para fora da VPS de tempos em tempos (ou configure rclone para um bucket S3/Backblaze).

## Pacote de handoff

`docs/`, `design/screens/` (PNG de cada tela), `design/prototypes/` (protótipo navegável: `cd design/prototypes && npx serve .`) e `design/tokens.css`.
