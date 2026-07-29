# RIC-002 — Product Requirements Document (PRD)

**Projeto:** RICK Control Center  
**Status:** Draft 1  
**Responsável:** Product Owner + Chief Architect  
**Data:** 29 de julho de 2026

## 1. Objetivo

Definir os requisitos funcionais, não funcionais e operacionais do RICK Control Center, uma plataforma para planejar, executar, supervisionar e auditar desenvolvimento de software assistido por agentes de IA.

## 2. Princípios do produto

- Execução determinística baseada em contratos formais.
- Google Docs como fonte estratégica de verdade.
- Jira como fonte operacional de verdade.
- GitHub como fonte de verdade do código.
- RICK Control Center como fonte de verdade do estado de execução, eventos e evidências.
- Autonomia controlada com validações e gates explícitos.
- Rastreabilidade entre visão, requisito, decisão, Epic, Task, commit e evidência.

## 3. Personas

### 3.1 Product Owner

Define visão, prioridades, aprova documentos, sprints e mudanças de escopo.

### 3.2 Operador

Seleciona projetos, inicia execuções, acompanha agentes, revisa evidências e intervém quando necessário.

### 3.3 Arquiteto

Mantém arquitetura, decisões técnicas, contratos de integração e políticas de execução.

### 3.4 Agente executor

Recebe um Execution Contract, executa tarefas autorizadas, produz evidências e respeita limites de escopo.

## 4. Ambientes principais

### 4.1 Control Center

Dashboard operacional com projetos, sprints, execuções, agentes, riscos, bloqueios, evidências e ações de aprovação.

### 4.2 Workspace

Ambiente integrado com Explorer, Monaco Editor, terminal, Git, logs e contexto do projeto.

### 4.3 Design Studio

Área para descoberta visual, wireframes, design system, páginas, componentes, assets e validação responsiva.

### 4.4 Product Studio

Área para visão, PRD, roadmap, backlog, decisões, critérios de aceite e rastreabilidade.

## 5. Fluxo principal

1. Selecionar ou criar projeto.
2. Conectar Google Drive/Docs, Jira e GitHub.
3. Resolver o estado atual do projeto.
4. Identificar o próximo trabalho elegível.
5. Gerar Execution Contract determinístico.
6. Sincronizar Epic e Tasks no Jira.
7. Iniciar execução por agente.
8. Executar validações automáticas.
9. Reunir evidências.
10. Solicitar aprovação quando exigida.
11. Criar commit e push autorizados.
12. Atualizar Jira e documentação.
13. Continuar o loop quando permitido.

## 6. Requisitos funcionais

- **REQ-001** — O sistema deve permitir criar, editar, arquivar e selecionar projetos.
- **REQ-002** — Cada projeto deve possuir nome, descrição, repositório, documentação, Jira, stack, ambiente e política de autonomia.
- **REQ-003** — O sistema deve conectar um ou mais repositórios GitHub.
- **REQ-004** — O sistema deve conectar um projeto Jira e mapear Epics, Tasks, Bugs e estados.
- **REQ-005** — O sistema deve conectar documentos e pastas do Google Drive.
- **REQ-006** — O sistema deve exibir o estado consolidado do projeto a partir das fontes conectadas.
- **REQ-007** — O sistema deve detectar divergências entre documentação, Jira, Git e execução.
- **REQ-008** — O sistema deve gerar um Execution Contract antes de qualquer execução.
- **REQ-009** — O Execution Contract deve registrar objetivo, escopo permitido, arquivos autorizados, restrições, validações, política Git e critérios de conclusão.
- **REQ-010** — O sistema deve impedir execução sem contrato válido.
- **REQ-011** — O sistema deve permitir escolher o agente executor disponível para o projeto.
- **REQ-012** — O sistema deve suportar execução supervisionada e loop autônomo controlado.
- **REQ-013** — O sistema deve registrar eventos de execução em ordem cronológica.
- **REQ-014** — O sistema deve transmitir eventos em tempo real por SSE.
- **REQ-015** — O sistema deve exibir logs, comandos, alterações, testes e decisões do agente.
- **REQ-016** — O sistema deve manter evidências associadas à execução e à tarefa.
- **REQ-017** — O sistema deve executar gates de lint, typecheck, testes, build e verificações específicas do projeto.
- **REQ-018** — O sistema deve bloquear commit quando uma validação obrigatória falhar.
- **REQ-019** — O sistema deve permitir aprovação, rejeição, pedido de correção e cancelamento.
- **REQ-020** — O sistema deve criar commits com referência ao requisito e à tarefa Jira.
- **REQ-021** — O sistema deve efetuar push apenas quando autorizado pela política do projeto.
- **REQ-022** — O sistema deve atualizar automaticamente o Jira após conclusão válida.
- **REQ-023** — O sistema deve atualizar o status da sprint na documentação estratégica.
- **REQ-024** — O sistema deve criar Bug Task para falhas funcionais dentro da Epic atual.
- **REQ-025** — O sistema deve criar Bugfix Sprint para falhas estruturais.
- **REQ-026** — O sistema deve manter histórico imutável de execuções concluídas.
- **REQ-027** — O sistema deve permitir retomar uma execução interrompida a partir do último checkpoint válido.
- **REQ-028** — O sistema deve apresentar um painel de risco com severidade, causa, impacto e ação recomendada.
- **REQ-029** — O sistema deve permitir visualizar diffs antes da aprovação.
- **REQ-030** — O sistema deve permitir navegar e editar arquivos no Workspace.
- **REQ-031** — O sistema deve permitir abrir terminais isolados por projeto ou execução.
- **REQ-032** — O sistema deve impedir comandos fora do escopo autorizado pelo contrato.
- **REQ-033** — O Design Studio deve armazenar páginas, componentes, estados responsivos e decisões visuais.
- **REQ-034** — O Product Studio deve manter visão, PRD, roadmap, backlog e decisões relacionados.
- **REQ-035** — Cada requisito deve poder ser relacionado a uma Epic, Task, commit e evidência.
- **REQ-036** — Cada decisão deve possuir identificador DEC e status.
- **REQ-037** — O sistema deve exibir progresso por documento, requisito, Epic, sprint e release.
- **REQ-038** — O sistema deve oferecer uma trilha de auditoria pesquisável.
- **REQ-039** — O sistema deve permitir configurar políticas diferentes por projeto.
- **REQ-040** — O sistema deve suportar múltiplos projetos sem misturar contexto, segredos, arquivos ou estado.

## 7. Estados de execução

`DRAFT → READY → RUNNING → VALIDATING → REVIEW_REQUIRED → APPROVED → COMMITTING → PUSHING → SYNCING → COMPLETED`

Estados excepcionais: `BLOCKED`, `FAILED`, `CANCELLED`, `ROLLED_BACK`.

## 8. Regras de autonomia

- Alterações fora do escopo exigem novo contrato ou aditivo aprovado.
- Falha pequena de implementação permanece no loop atual.
- Bug funcional gera tarefa de bug na Epic atual.
- Falha estrutural interrompe o fluxo e gera Bugfix Sprint.
- Push direto na branch protegida não é permitido sem política explícita.
- O agente não pode marcar uma tarefa como concluída sem evidências mínimas.

## 9. Evidências mínimas

- Diff final.
- Resultado dos testes obrigatórios.
- Resultado de build quando aplicável.
- Lista de arquivos alterados.
- Commit produzido.
- Referência Jira.
- Resumo do comportamento implementado.
- Riscos e observações residuais.

## 10. Requisitos não funcionais

- **NFR-001** — A interface deve ser responsiva para desktop e tablet; o MVP prioriza desktop.
- **NFR-002** — Eventos ativos devem aparecer com baixa latência por SSE.
- **NFR-003** — Credenciais devem ser armazenadas de forma segura e nunca aparecer em logs.
- **NFR-004** — Cada projeto deve possuir isolamento lógico de contexto e execução.
- **NFR-005** — Operações destrutivas devem exigir autorização compatível com a política configurada.
- **NFR-006** — O sistema deve manter logs estruturados e correlacionados por projeto, sprint e execução.
- **NFR-007** — O backend deve usar TypeScript, PostgreSQL e contratos validados em runtime.
- **NFR-008** — Integrações devem ser encapsuladas por adapters para permitir substituição futura.
- **NFR-009** — Falhas de conectores externos não devem corromper o estado interno.
- **NFR-010** — Toda transição de estado deve ser validada e persistida atomicamente.

## 11. Escopo do MVP

### Incluído

- Cadastro e seleção de projetos.
- Conexões GitHub, Jira e Google Drive.
- Dashboard operacional.
- Geração e visualização de Execution Contract.
- Execução com runtime inicial baseado no Claude Agent SDK.
- Eventos em tempo real.
- Evidências e gates.
- Aprovação manual.
- Commit, push e sincronização Jira.
- Workspace básico com arquivos, editor, terminal e Git.

### Fora do MVP

- Marketplace público de agentes.
- Aplicativo móvel nativo.
- Colaboração multiempresa avançada.
- Billing comercial.
- Execução distribuída em múltiplas regiões.
- Automação visual completa do Design Studio.

## 12. Critérios de sucesso do MVP

- Um projeto real pode ser conectado e resolvido sem configuração manual fora da interface.
- Uma sprint pode ser transformada em Execution Contract reproduzível.
- Um agente pode concluir uma Task dentro do escopo e produzir evidências verificáveis.
- O operador consegue acompanhar execução e bloqueios em tempo real.
- O sistema consegue validar, aprovar, commitar, fazer push e sincronizar Jira sem perder rastreabilidade.
- Nenhuma execução mistura contexto entre projetos.

## 13. Integrações iniciais

- GitHub: repositórios, branches, commits, pull requests e checks.
- Jira: projetos, Epics, Tasks, Bugs, estados e comentários.
- Google Drive/Docs: documentos estratégicos e atualização de status.
- Claude Agent SDK: runtime inicial dos agentes.

## 14. Dados principais

`Project`, `IntegrationConnection`, `DocumentSource`, `Requirement`, `Decision`, `RoadmapItem`, `Sprint`, `Epic`, `Task`, `ExecutionContract`, `ExecutionRun`, `Agent`, `Event`, `Evidence`, `Validation`, `Approval`, `GitOperation`, `Risk` e `AuditRecord`.

## 15. Pendências para aprovação

- Confirmar limites exatos do MVP do Design Studio.
- Confirmar modelo inicial de autenticação e usuários.
- Confirmar política padrão de branches.
- Confirmar se o MVP terá apenas um operador por instalação.
- Confirmar escopo da criação automática de repositórios e projetos Jira.

## 16. Registro de aprovação

Este documento permanece em Draft 1 até revisão e aprovação explícita do Product Owner.

## 17. Documento estratégico relacionado

Google Docs: `RIC-002 — Product Requirements Document (PRD)`.