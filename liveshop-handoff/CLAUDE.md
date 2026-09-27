# Live Shop B2B: instruções para o Claude Code

Você vai construir o **Live Shop B2B**, uma plataforma de live commerce para vendas entre empresas. Uma agência faz lives para marcas (ex.: uma marca de utilidades apresenta a coleção nova) e empresas compradoras (lojistas) assistem e **registram pedidos de estoque durante a live, sem pagamento**. Depois a agência fatura esses pedidos e envia para a marca.

## Leia nesta ordem antes de escrever código

1. `docs/01-produto.md`: visão, papéis, glossário e fluxos
2. `docs/02-telas.md`: cada tela, rota, estados e comportamento (com o PNG de referência)
3. `docs/03-regras-de-negocio.md`: regras que não podem quebrar (estoque, OTP, edição de pedido)
4. `docs/04-arquitetura.md`: stack, vídeo, tempo real, infraestrutura
5. `docs/05-banco-de-dados.md`: schema SQL
6. `docs/06-api-e-eventos.md`: rotas e eventos em tempo real
7. `docs/07-design-system.md`: tokens, componentes e animações
8. `docs/08-entregas-e-aceite.md`: marcos, critérios de aceite e perguntas em aberto

## Referências visuais

- `design/screens/*.png`: imagem de cada tela em tamanho real (desktop 1440×900 ou 1280×800, celular 390×844). **É a fonte da verdade visual.**
- `design/prototypes/*.dc.html`: o código do protótipo navegável de cada tela. Use para copiar **medidas exatas, cores, textos e o comportamento dos estados**. Veja `design/prototypes/README.md` para entender o formato.
- `design/tokens.css`: variáveis de design prontas para importar.
- Protótipo navegável online (pedir o link ao José se precisar ver as animações rodando).

## Regras de trabalho

- **Siga as telas.** Layout, espaçamentos, raios, cores e textos em português devem bater com os PNGs e protótipos. Não invente telas, campos ou funcionalidades que não estão nos documentos.
- **Textos da interface em pt-BR**, exatamente como no protótipo. Números no formato brasileiro (`1.000`, `R$ 89,90`).
- **Faça o simples que funciona.** Uma instância de servidor, poucas dependências, sem abstrações "para o futuro". Quando cortar caminho de propósito, deixe um comentário `// simplificação: <limite> , trocar por <solução> quando <condição>`.
- **Regras de negócio no servidor.** Estoque, validação de quantidade, OTP e permissões nunca dependem só do front.
- **Testes** para o que envolve dinheiro, estoque e acesso: registro de pedido concorrente, limite de estoque, edição e cancelamento, fluxo de OTP (tentativas, expiração, reenvio). O resto pode ficar sem teste.
- **Perguntas em aberto** (`docs/08-entregas-e-aceite.md`): quando esbarrar numa delas, implemente a suposição indicada e registre no PR. Não bloqueie o trabalho.
- **Entregue por marco** (M1 a M5), com um commit/PR por marco e o checklist de aceite do marco preenchido.
- Acessibilidade básica: botões reais (`<button>`), `label` em todo campo, foco visível, `aria-live` nos avisos, contraste AA, respeitar `prefers-reduced-motion`.

## Comandos esperados no projeto

- `pnpm dev`: ambiente local (Next.js + Postgres via Docker Compose + MediaMTX via Docker Compose)
- `pnpm test`: testes
- `pnpm db:migrate` e `pnpm db:seed`: migrações e dados de exemplo iguais aos do protótipo (marcas, produtos, preços, empresas)
