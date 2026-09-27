# Protótipos navegáveis

Referência de comportamento, textos e animações. **Não portar este código**: reimplementar em React/Next seguindo `docs/`.

## Ver no navegador

```bash
cd design/prototypes
npx serve .
```

Abrir `http://localhost:3000/Main.dc.html` (ou qualquer outro arquivo). `support.js` é o runtime que renderiza os arquivos.

## Como ler um `.dc.html`

- A marcação fica dentro de `<x-dc>`. É HTML com estilos inline.
- `{{ nome }}` é um valor calculado pela lógica do componente.
- `<sc-for>` repete um bloco para cada item de uma lista; `<sc-if>` mostra um bloco condicionalmente.
- No fim do arquivo, `class Component extends DCLogic` guarda o estado (timers, quantidades, abas, drawers) e as funções de clique. É ali que estão as regras simuladas: mínimo, múltiplo, estoque, OTP, troca de produto.

## Mapa de arquivos

| Arquivo | Tela |
|---|---|
| Login, Codigo, LoginMobile, CodigoMobile | Cadastro e código |
| SalaEspera, SalaEsperaMobile | Antes da live |
| Main | Live horizontal (desktop) com drawer de pedidos |
| LiveVerticalDesktop, LiveVertical, LiveMobile | Live vertical desktop e mobile |
| EstadosProduto | Estoque baixo, esgotado, oculto, erros |
| LiveEncerrada, LiveEncerradaMobile | Resumo pós-live |
| MinhaConta, ContaMobile | Pedidos, detalhe, perfil, suporte |
| Admin* | Painel da agência |
