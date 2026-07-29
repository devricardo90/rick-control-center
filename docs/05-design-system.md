# RIC-005 — Design System

**Projeto:** RICK Control Center  
**Status:** Draft 1  
**Data:** 29 de julho de 2026

## 1. Objetivo

Definir a linguagem visual, os padrões de interação e os componentes fundamentais do RICK Control Center. O sistema deve parecer uma central operacional técnica: claro, controlável, auditável e eficiente para uso prolongado em desktop.

## 2. Princípios de experiência

- **DS-001:** clareza operacional acima de ornamentação.
- **DS-002:** o estado atual e a próxima ação devem estar sempre visíveis.
- **DS-003:** informação, alerta, bloqueio, falha e sucesso não podem depender apenas de cor.
- **DS-004:** ações destrutivas devem exibir impacto e exigir confirmação compatível com o risco.
- **DS-005:** evidências, logs, diffs e decisões devem permanecer acessíveis no contexto da execução.
- **DS-006:** componentes devem ser previsíveis e reutilizáveis entre Control Center, Workspace, Design Studio e Product Studio.

## 3. Personalidade visual

A linguagem visual será sóbria, técnica e contemporânea, com densidade informacional controlada e hierarquia clara. Devem ser evitados painéis genéricos, gradientes decorativos, sombras excessivas, animações sem função e grandes áreas com cores saturadas.

## 4. Navegação

Menu lateral persistente:

- Control Center
- Projects
- Executions
- Workspace
- Product Studio
- Design Studio
- Integrations
- Audit
- Settings

O header deve apresentar projeto, branch, ambiente, conexões, busca e ações globais. Evidências, riscos, aprovações e detalhes podem abrir em painel contextual à direita.

## 5. Layout

- Desktop é a prioridade do MVP.
- Largura mínima operacional recomendada: 1280 px.
- Sidebar expandida: 240–280 px.
- Sidebar compacta: 64–72 px.
- Header: 56–64 px.
- Painel contextual: 360–480 px.
- Grade baseada em 4 px, com escala principal de 8 px.
- Formulários e leitura longa devem limitar a largura de linha.

## 6. Tipografia

A fonte principal deve ser uma sans-serif de alta legibilidade. Código, logs, IDs, hashes e comandos usam fonte monoespaçada.

Escala recomendada:

- Display: 32/40, semibold.
- H1: 28/36, semibold.
- H2: 22/30, semibold.
- H3: 18/26, semibold.
- Body: 14/21 ou 16/24.
- Label: 12/16, medium.
- Code: 13/20.

## 7. Cores e tokens semânticos

Componentes não devem consumir cores diretas. Tokens mínimos:

- `background.canvas`
- `background.surface`
- `background.elevated`
- `border.default`
- `border.strong`
- `text.primary`
- `text.secondary`
- `text.muted`
- `action.primary`
- `action.primaryHover`
- `status.info`
- `status.success`
- `status.warning`
- `status.danger`
- `status.blocked`
- `focus.ring`

Tema escuro será o padrão operacional e tema claro será alternativa. O contraste deve cumprir WCAG AA.

## 8. Estados de execução

Cada estado deve usar texto, ícone e token semântico:

- DRAFT — neutro.
- READY — informativo.
- RUNNING — ativo.
- VALIDATING — processamento.
- REVIEW_REQUIRED — atenção.
- APPROVED — sucesso.
- COMMITTING, PUSHING e SYNCING — processamento identificado.
- COMPLETED — sucesso final.
- BLOCKED — bloqueio com causa.
- FAILED — falha com recuperação.
- CANCELLED — neutro negativo.
- ROLLED_BACK — alerta técnico.

## 9. Componentes fundamentais

`AppShell`, `SidebarNavigation`, `ProjectSwitcher`, `ContextHeader`, `Breadcrumbs`, `StatusBadge`, `RiskBadge`, `MetricCard`, `DataTable`, `FilterBar`, `SearchInput`, `Tabs`, `Drawer`, `Modal`, `CommandPalette`, `ActivityTimeline`, `ExecutionStepper`, `LogViewer`, `DiffViewer`, `EvidencePanel`, `ApprovalPanel`, `RiskPanel`, `EmptyState`, `ErrorState`, `Skeleton`, `Toast`, `Button`, `IconButton`, `FormField`, `Select`, `Checkbox`, `Toggle`, `CodeBlock`, `TerminalPanel`, `FileExplorer` e `MonacoWorkspace`.

## 10. Botões e ações

- Primary: uma ação principal por contexto.
- Secondary: alternativas seguras.
- Tertiary/Ghost: navegação e baixa ênfase.
- Danger: ações destrutivas.

Todos os botões precisam de estados default, hover, active, focus, disabled e loading. Botões apenas com ícone exigem tooltip e nome acessível.

## 11. Tabelas e listas

Tabelas devem suportar ordenação, filtros, paginação ou carregamento incremental, seleção, estado vazio e densidade configurável. Status, risco, responsável e última atualização devem permanecer legíveis.

## 12. Logs, terminal e código

Logs devem permitir busca, filtro por nível, pausa de streaming, cópia e geração de evidência. Segredos devem ser mascarados.

O terminal deve mostrar projeto, ambiente e política ativa. Comandos bloqueados devem indicar a regra do Execution Contract violada.

O Diff Viewer deve mostrar arquivo, tipo de alteração, linhas adicionadas/removidas e contexto, com revisão por arquivo antes da aprovação.

## 13. Formulários

Labels permanecem visíveis. Placeholder não substitui label. Erros devem explicar correção. Alterações não salvas devem ser sinalizadas.

## 14. Feedback

- Toast para confirmação transitória.
- Banner para condição persistente.
- Inline alert para problema localizado.
- Modal apenas quando interrupção for necessária.
- Timeline para eventos auditáveis.

Falhas devem apresentar causa, impacto, possibilidade de retry e referência técnica.

## 15. Acessibilidade

- Navegação por teclado.
- Foco visível.
- Ordem de tabulação lógica.
- Labels acessíveis.
- Contraste WCAG AA.
- Suporte a `prefers-reduced-motion`.
- Áreas clicáveis adequadas.
- Status não comunicado apenas por cor.

## 16. Responsividade

O MVP prioriza desktop, mas deve funcionar em tablet. Em larguras menores, a sidebar recolhe, painéis viram drawers, tabelas priorizam colunas essenciais e o Workspace alterna entre Explorer, Editor, Terminal e Evidências por abas. Mobile completo está fora do escopo inicial.

## 17. Movimento

Animações devem comunicar transição, expansão, carregamento ou mudança de estado. Duração recomendada: 120–240 ms.

## 18. Design tokens

Tokens serão organizados em:

1. Primitivos: cores, medidas, tipografia e sombras.
2. Semânticos: surface, text, action, status e focus.
3. Componentes: button, input, badge, panel e table.

Devem ser expostos como CSS custom properties e tipados no código.

## 19. Regras para o Design Studio

Cada página ou fluxo deve registrar objetivo, estado de aprovação, breakpoints, componentes, assets, decisões DEC e evidências visuais. Estados mínimos: loading, empty, error, populated e permission-denied quando aplicável.

## 20. Telas prioritárias do MVP

- Project selector/onboarding.
- Control Center dashboard.
- Project overview.
- Execution detail.
- Execution Contract review.
- Validation and evidence review.
- Approval gate.
- Workspace com Explorer, Editor, Terminal e Git.
- Integrations status.
- Audit timeline.

## 21. Critérios de aceite

- Componentes fundamentais documentados e reutilizáveis.
- Temas claro e escuro usando os mesmos tokens semânticos.
- Fluxos críticos utilizáveis por teclado.
- Estados de execução consistentes.
- Contraste WCAG AA nos fluxos essenciais.
- Nenhuma ação destrutiva sem impacto explícito.
- Logs, diffs e evidências legíveis em sessões prolongadas.
- Layout funcional em 1280×720, 1440×900 e tablet de 1024 px.

## 22. Pendências para aprovação

- Família tipográfica final.
- Paleta visual e cor de marca.
- Biblioteca de componentes base.
- Conjunto de ícones.
- Wireframe do AppShell e do Control Center.

## 23. Registro de aprovação

Este documento permanece em Draft 1 até revisão e aprovação explícita do Product Owner.
