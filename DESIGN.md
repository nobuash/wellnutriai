# WellNutriAI — Design System (redesign visual v2)

Fonte da verdade para o redesign puramente visual. Não altera conteúdo,
funcionalidade, rotas, lógica ou integrações — só a camada de
apresentação. Ver `docs/production-hardening-round-5.md` para o
trabalho de backend/segurança (branch separada, não relacionado).

## Leitura de design

Produto de saúde + tecnologia para uso diário — não clínico, não
"app fitness genérico", não luxo/moda. Premium mas acessível, com
identidade própria. Direção extraída de 3 referências (não copiadas
literalmente):

- **NourishCo**: base off-white quente, verde único e comedido, serifa
  itálica só na palavra de destaque do headline, cards com borda sutil
  (sem sombra pesada), pill buttons, ícones funcionais em círculo.
- **TerraElix**: confiança compositiva (ambiente de cor cheio em vez de
  cor só como acento pontual), headline com dois pesos/tons pra
  hierarquia dentro da própria frase, CTA de alto contraste (preto
  sólido), faixa de informação assimétrica em vez de grid simétrico.
- **NUTRI "Wellness Walk"**: o mais sofisticado — split-screen 50/50,
  serifa itálica em tela cheia como momento de marca, máscara orgânica
  ("blob") na foto em vez de retângulo, navbar quase sem peso visual,
  lista indexada `(01)/(02)` com divisores finos em vez de cards.

Sinal repetido em 2 das 3 referências, adotado como peça central da
nova identidade: **serifa itálica para destaque/display, sans limpa
para o resto** — inversamente ao "Inter em tudo" que o produto tem
hoje.

`DESIGN_VARIANCE: 6` (moderado — quebra a simetria default, mas o
produto é health-trust, não agência experimental) · `MOTION_INTENSITY: 4`
(sutil, funcional, nunca decorativo) · `VISUAL_DENSITY: 4` no
marketing, `5-6` no dashboard (é um produto de uso diário, precisa
respirar mas também não desperdiçar espaço em telas de trabalho).

## Tipografia

| Papel | Fonte | Uso |
|---|---|---|
| Display / destaque | **Lora** (itálica em pesos 500/600) | H1 de hero, palavra de ênfase dentro de um headline sans, títulos de seção grandes |
| Sans / UI | **Manrope** | Body, labels, botões, nav, formulários, tabelas, dashboard |

Ambas via `next/font/google` — zero dependência nova, self-hosted,
sem `<link>` externo. Substituem Inter (que hoje nem carrega de
verdade — sem `@font-face`/`<link>`, cai silenciosamente pra fonte de
sistema).

Escala (Tailwind, `rem`): display `text-4xl md:text-5xl` (hero) /
`text-3xl md:text-4xl` (H2 de seção) — nunca maior que isso, para não
cair no "título gigante desnecessário" que o brief pede pra evitar.
Body `text-base leading-relaxed`, secundário `text-sm`, captions
`text-xs`. Pesos: Manrope 400 (body), 500 (labels/ênfase leve), 600
(títulos de card/subseção), 700 (só display).

## Cor

Recalibra o verde único do produto (era `#10b981`, emerald genérico de
SaaS) para um moss/forest verde mais contido — direção das três
referências, nenhuma delas usa o verde neon padrão de IA. Base
neutra quente (não `slate`, que é azulado/clínico).

| Token | Valor | Uso |
|---|---|---|
| `background` | `#FAF8F3` | fundo de página |
| `surface` | `#FFFFFF` | cards, inputs, superfícies elevadas |
| `surface-secondary` | `#F3F0E9` | seções alternadas, sidebar |
| `border` | `#E8E3D6` | borda padrão |
| `divider` | `#EFEBE0` | divisores finos (mais claro que border) |
| `ink` (text primary) | `#211F1A` | títulos, texto principal |
| `ink-secondary` | `#4A473F` | body text |
| `ink-muted` | `#8A8577` | captions, texto terciário, placeholder |
| `primary-50`…`primary-900` | ver `tailwind.config.ts` | verde moss — base `#3F6B4C`, hover `#335A3F` |
| `secondary` | `#211F1A` (mesmo tom de `ink`) | botão secundário de alto contraste (referência TerraElix) |
| `success` | `#3F6B4C` (= primary) | contextual |
| `warning` | `#B8863A` | contextual |
| `error` | `#B24632` | contextual |
| `info` | `#3D6B8C` | contextual |

Regra: **um acento por página** (o verde). Preto/`ink` é usado como
segundo contraste (botão secundário, texto), nunca como um segundo
acento colorido concorrendo com o verde.

## Forma

Uma escala de radius, usada com intenção (não tudo pill, não tudo
quadrado):

- `rounded-sm` (6px) — inputs, badges pequenos
- `rounded-md` (10px) — **default**: cards, botões secundários, selects
- `rounded-lg` (16px) — containers grandes, modais
- `rounded-full` — reservado pra CTA primário de marketing e badges de
  status (uso deliberado, não o padrão de tudo)

Sombra: sempre tingida (tom quente, nunca cinza puro/preto puro),
sutil — profundidade, não "card flutuando". Ver `shadow-soft` no
Tailwind config.

## Movimento

Sem biblioteca de animação nova (o projeto não tinha nenhuma; CSS dá
conta do que o brief pede — "sutil, rápido, discreto"). Transição
padrão `200ms cubic-bezier(0.16, 1, 0.3, 1)` em hover/focus/active de
todo elemento interativo. Sem loop infinito, sem elemento se
movimentando sem motivo.

## Componentes

Um botão primário na landing precisa ser visualmente o mesmo sistema
que um botão primário no dashboard — variantes central izadas em
`src/components/ui/`. Ícones continuam `lucide-react` (já instalado,
sem motivo pra trocar), auditados por função — nunca decorativo puro.

## Fora de escopo (não altera)

Conteúdo textual, rotas, hooks, chamadas de API, autenticação,
Supabase, Stripe/Mercado Pago, OpenAI, regras de negócio, validações,
lógica de permissão/plano. Ver instrução original do usuário.
