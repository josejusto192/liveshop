# 07. Design system

Fonte de verdade visual: os PNGs em `design/screens/` e os protótipos em `design/prototypes/`. Tokens prontos em `design/tokens.css` (importar no `globals.css` e mapear no `tailwind.config`).

## Cores

| Token | Valor | Uso |
|---|---|---|
| `--bg` | #EDEEF0 | Fundo da página |
| `--surface` | #FFFFFF | Cards e painéis |
| `--surface-2` | #F4F5F6 | Inputs, áreas internas |
| `--line` / `--line-2` | #E4E6EA / #F1F2F4 | Bordas e divisórias |
| `--ink` / `--ink-2` / `--muted` | #111214 / #44474D / #6B6F76 | Texto |
| `--dark` / `--dark-2` / `--dark-3` / `--dark-line` | #141518 / #1E2024 / #26282D / #3A3D44 | Sidebar, cards escuros, live |
| `--dark-muted` | #A9ADB5 | Texto secundário no escuro |
| `--accent` / `--accent-ink` | #D6F35B / #3A4214 | Ação principal, destaque (cor configurável em Configurações) |
| `--live` | #C92A2F | Selo AO VIVO |
| `--danger-bg` / `--danger` | #FDECEC / #A11F24 | Erro, excluir, esgotado |
| `--warn-bg` / `--warn` | #FFF1E0 / #8A4A0B | Estoque baixo, em faturamento |
| `--ok-bg` / `--ok` | #EEF8D0 / #3F5A06 | Sucesso, faturado |

## Tipografia

- **Geist** para tudo; **Geist Mono** para números (timer, códigos, preços em tabela, minuto da live). Números sempre com `font-variant-numeric: tabular-nums`.
- Escala: 12 (legenda), 13 (tabela), 14 (corpo), 16 (destaque), 20, 28, 40 (títulos e KPIs). Pesos 400, 500, 600.
- Títulos com `letter-spacing: -0.02em`.
- Moeda: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

## Raios e espaçamento

- Cards 22 a 24px, painel principal 28px, inputs 12 a 18px, pills e botões 999px.
- Desktop: sidebar fixa à esquerda; conteúdo com `margin: 24px 24px 24px 16px`, sem painel de fundo. O conteúdo não pode passar do fim da sidebar.
- Grade de 8px.

## Componentes

| Componente | Notas |
|---|---|
| **Button** | Pill. Primário escuro com círculo lime à direita contendo a seta/ícone; secundário branco com borda; perigo em `--danger`. `white-space: nowrap`, nunca quebra linha. `:active` escala 0.97 |
| **Pill / Chip** | Status e filtros. Cores por status: Registrado (surface-2), Em faturamento (warn), Faturado (ok), Entregue (dark), Cancelado (danger) |
| **LiveBadge** | Ponto vermelho pulsando + "AO VIVO" |
| **Card / KPI** | Rótulo pequeno, número grande em mono, variação em chip |
| **Sidebar** | Escura, ícone + texto, item ativo com fundo lime |
| **Segmented** | Horizontal/Vertical, Automático/Manual, abas |
| **Switch** | Liga/desliga com trilho lime |
| **QuantityInput** | Botões − e + e campo **digitável** no meio (`inputmode="numeric"`). Passo = `step_qty`. Valida mínimo, múltiplo e estoque ao sair do campo e no envio |
| **Toast** | Canto inferior (desktop) ou topo (mobile), some em 3 s |
| **Drawer** | Painel lateral direito (Meus pedidos no desktop). Abre sobre a live, não troca de tela |
| **BottomSheet** | Mobile: pedir, meus pedidos, editar item |
| **Modal** | Confirmações (excluir, encerrar live) |
| **Table** | Admin: linha clicável, seleção em massa, filtros em chips acima |
| **Timer** | mm:ss mono; fica laranja no último minuto |
| **ProgressTicks** | Roteiro da live em traços (apresentado, no ar, próximo) |
| **ProductCard** | Foto, nome, **preço/un.**, mínimo, estoque, quantidade e total estimado |
| **OrderRow** | Clicar no item abre editar/excluir (só com live no ar) |

## Movimento

Tudo sutil. Nada pisca. Todas as animações respeitam `prefers-reduced-motion: reduce` (desligar).

| Nome | Uso | Especificação |
|---|---|---|
| `lsIn` | Entrada de tela e cards | opacity 0→1, translateY 8px→0, 0.5 s `cubic-bezier(.2,.7,.2,1)`, cards em cascata de 40 ms |
| `lsFade` | Troca de conteúdo | opacity, 0.3 s |
| `lsPopC` | Toast central | scale .96→1 com translate(-50%) |
| `lsModal` | Modal | fundo fade 0.2 s, caixa scale .97→1 0.25 s |
| `lsSheet` / `lsSheetOut` | Bottom sheet | translateY 100%→0, 0.35 s; saída 0.25 s |
| `lsDrawer` / `lsDrawerOut` | Drawer | translateX 100%→0, 0.35 s; saída 0.25 s |
| Troca de produto na live | Card do produto | saída fade+translateY −6px, entrada fade+translateY 6px, 0.4 s |
