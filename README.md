# Live Shop B2B

Plataforma de live commerce B2B: a agência transmite lives de marcas direto do navegador e empresas compradoras registram pedidos de estoque durante a live, sem pagamento. Especificação completa em `docs/` (comece pelo `CLAUDE.md`), telas de referência em `design/`.

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
| `pnpm stream:test` | (M2) Publica um vídeo de teste em loop no MediaMTX local |

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

## Produção

Uma VPS com Coolify rodando `docker-compose.coolify.yml` (app, Postgres e MediaMTX). Detalhes de portas, subdomínios e firewall em `docs/04-arquitetura.md`.

## Pacote de handoff

`docs/`, `design/screens/` (PNG de cada tela), `design/prototypes/` (protótipo navegável: `cd design/prototypes && npx serve .`) e `design/tokens.css`.
