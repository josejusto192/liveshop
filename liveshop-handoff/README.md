# Live Shop B2B: pacote de handoff

Pacote para iniciar o desenvolvimento no Claude Code.

## Como usar

1. Crie uma pasta vazia para o projeto e copie **todo o conteúdo deste pacote** para dentro dela (o `CLAUDE.md` precisa ficar na raiz).
2. Abra o Claude Code nessa pasta.
3. Primeira mensagem sugerida:

> Leia o CLAUDE.md e todos os arquivos de docs/. Depois me apresente o plano do marco M1 (estrutura de pastas, dependências e ordem das tarefas) antes de começar a codar.

4. Avance marco a marco (M1 a M5), revisando cada entrega com o checklist de `docs/08-entregas-e-aceite.md`.

## Conteúdo

| Pasta/arquivo | O que é |
|---|---|
| `CLAUDE.md` | Instruções que o Claude Code lê automaticamente |
| `docs/` | Especificação completa (produto, telas, regras, arquitetura, banco, API, design, entregas) |
| `design/screens/` | PNG de todas as 23 telas |
| `design/prototypes/` | Código do protótipo de cada tela (medidas, textos e estados) |
| `design/tokens.css` | Cores, raios, fontes e animações em variáveis CSS |

## Ver o protótipo localmente

```bash
cd design/prototypes
npx serve .
```

Abra `http://localhost:3000/Main.dc.html` (ou qualquer outra tela). Os links entre telas funcionam.
