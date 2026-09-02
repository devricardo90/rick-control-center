# RIC-004 — Roadmap

**Projeto:** RICK Control Center
**Status:** Draft 1
**Data:** 29 de julho de 2026

## 1. Objetivo

Transformar a visão, o PRD e a arquitetura técnica em uma sequência executável de fases, Epics e sprints, preservando dependências, critérios de saída e rastreabilidade.

## 2. Princípios de planejamento

- Nenhuma implementação começa sem spec válida, objetivo, escopo, critérios de aceite e Execution Contract derivado.
- Cada fase deve produzir um incremento verificável.
- A infraestrutura mínima precede a autonomia.
- O sistema começa supervisionado e evolui para autonomia controlada.
- Integrações externas devem ser encapsuladas por adapters.
- Toda sprint termina com evidências, validação e atualização das fontes de verdade.

## 3. Visão geral das fases

Fase 0 — Fundação e governança
Fase 1 — Project Control Plane
Fase 2 — Execution Contract e State Machine
Fase 3 — Runtime de agentes e eventos
Fase 4 — Validação, evidências e aprovação
Fase 5 — Git, Jira e documentação sincronizados

Fase 6 — Workspace integrado
Fase 7 — Autonomia controlada e recuperação
Fase 8 — Product Studio e Design Studio
Fase 9 — Hardening e MVP operacional

## 4. Fase 0 — Fundação e governança

**Objetivo:** estabelecer o repositório, padrões, documentação e base técnica do produto.

### Epic RIC-E01 — Product Governance

- Consolidar Product Vision, PRD, arquitetura, roadmap e decisões.
- Definir convenções REQ, DEC, Epic, Sprint e Execution Contract.
- Criar regra de sincronização entre Google Docs, Jira e GitHub.

### Epic RIC-E02 — Repository Foundation

- Inicializar Nuxt 3 e TypeScript.
- Configurar lint, typecheck, testes e build.
- Configurar PostgreSQL e migrações.
- Definir estrutura de módulos e adapters.
- Criar CI inicial.

**Critério de saída:** repositório executável, documentação base versionada e pipeline mínimo aprovado.

## 5. Fase 1 — Project Control Plane

**Objetivo:** permitir cadastrar, conectar, selecionar e diagnosticar projetos.

### Epic RIC-E03 — Project Registry

- Cadastro, edição, arquivamento e seleção de projetos.
- Configuração de repositório, Jira, documentação, stack e autonomia.
- Isolamento lógico por projeto.

### Epic RIC-E04 — Integration Registry

- Conexões GitHub, Jira e Google Drive.
- Teste de conectividade e permissões.
- Estado de saúde dos conectores.

### Epic RIC-E05 — Project State Resolver

- Leitura consolidada das fontes.
- Detecção de divergências.
- Exibição do próximo trabalho elegível.

**Critério de saída:** um projeto real pode ser conectado e ter seu estado resolvido pela interface.

## 6. Fase 2 — Execution Contract e State Machine

**Objetivo:** tornar toda execução formal, limitada, reproduzível e governada por uma autoridade determinística independente do julgamento informal do agente.

### Epic RIC-E06 — Execution Contract Engine

- Schema validado em runtime.
- Objetivo, escopo, arquivos permitidos, comandos, gates e política Git.
- Versionamento e hash do contrato.
- Aditivos e invalidação controlada.

### Epic RIC-E07 — Execution State Machine

- Estados normais e excepcionais.
- Transições atômicas.
- Checkpoints.
- Bloqueio de transições inválidas.

### Epic RIC-E07A — Spec-Driven Development Layer

- Camada obrigatória de especificação entre requisitos/planejamento e Execution Contract.
- Pipeline canônico: Intake → Classify → Specify → Design → Plan → Execution Contract → Implement → Verify → Independent Review → Approval → Delivery/Handoff.
- Toda implementação deve partir de uma spec versionada, rastreável e suficientemente precisa para execução por agente humano ou autônomo.
- A spec deve definir comportamento esperado, escopo e fora de escopo, critérios de aceite, restrições, dependências, riscos, interfaces/contratos e estratégia de validação quando aplicável.
- O Execution Contract deriva da spec aprovada e não substitui a especificação; ele limita e governa a execução concreta.
- Mudanças materiais durante a implementação exigem atualização/aditivo da spec antes de ampliar o escopo de execução.
- Specs devem ser vinculadas a requisitos, decisões, Jira, commits, evidências e execução para rastreabilidade ponta a ponta.
- O Protocolo RIC permanece como camada superior de governança; Spec-Driven Development funciona como camada formal de preparação e precisão da implementação.

Critério de saída: nenhuma implementação elegível avança ao Agent Runtime sem spec válida, critérios verificáveis e Execution Contract derivado.

### Epic RIC-E07B — Deterministic Orchestrator Kernel

- Criar o núcleo determinístico que concentra a autoridade de progressão da execução; agentes executam trabalho, mas não se autoautorizam a avançar.
- ContractCompiler para compilar spec, fontes aprovadas e políticas em Execution Contract canônico, validado, versionado e hasheado.
- TransitionEngine para decidir transições permitidas a partir de estado, precondições, versão e comando.
- GateEngine para resolver scope, validação, evidência, risco e aprovação em resultados objetivos: PASS, FAIL, BLOCKED ou APPROVAL_REQUIRED.
- LoopController para controlar execute → validate → correct → validate, tentativas máximas, backoff e stop conditions.
- Checkpoint/Recovery Engine para checkpoints, drift detection, retomada, retry, rollback e reconciliação após interrupções.
- SideEffect Executor para commit, push, Jira e demais efeitos externos somente após autorização determinística, com idempotência e verificação posterior.
- Persistir DecisionRecord para cada decisão material do kernel, contendo inputs, versões de política, decisão, motivo e evidência.
- Implementar o kernel como composição modular, reutilizando State Machine, Risk Engine, Validation Engine, Evidence Engine e adapters existentes, sem criar um segundo estado paralelo.

**Critério do Epic:** uma execução simulada deve poder atravessar contrato → decisão → agente → evidência → gate → próxima decisão de forma reproduzível, sem depender de julgamento informal do agente para continuar.

**Critério de saída:** nenhuma execução pode iniciar sem contrato válido e transição autorizada.

## 7. Fase 3 — Runtime de agentes e eventos

**Objetivo:** executar tarefas com Claude Agent SDK e transmitir o processo em tempo real.

### Epic RIC-E08 — Agent Runtime

- Adapter inicial do Claude Agent SDK.
- Sessão isolada por execução.
- Limites de comandos, arquivos e tempo.
- Cancelamento e interrupção segura.

### Epic RIC-E09 — Event Stream

- Registro cronológico de eventos.
- SSE para atualização em tempo real.
- Correlação por projeto, sprint, contrato e execução.
- Logs estruturados sem segredos.

### Epic RIC-E09A — Multi-Agent Orchestration

- Execution Orchestrator com fan-out/fan-in controlado.
- Catálogo de agentes especializados: backend, frontend, debugger, code reviewer, security reviewer e especialistas extensíveis.
- Lifecycle padronizado: queued → working → reviewing → completed/failed/blocked.
- Ownership explícito de tarefa, diretório/arquivos e recursos por agente.
- Escrita concorrente somente com isolamento comprovado; reviewers e operações read-only podem executar em paralelo.
- Correlação entre agente, subtask, modelo/runtime, eventos, gates e evidências.
- Agregação determinística dos resultados dos subagentes antes de avançar a execução principal.

#### Subcapability — RICK Verification Gauntlet / Controlled Multi-Agent Verification Loop

- Para unidades de trabalho elegíveis, separar formalmente Builder e Critic; o agente que implementa não pode aprovar o próprio resultado.
- O Critic deve iniciar com contexto independente/fresco e verificar o artefato real contra spec versionada, critérios de aceite, invariantes, arquitetura e gates aplicáveis.
- Permitir fan-out controlado por unidade de trabalho e verificação independente por unidade, seguido de fan-in e Integration Review antes da progressão da execução principal.
- Falhas retornam à correção através do LoopController do Deterministic Orchestrator Kernel; retries devem respeitar tentativas máximas, timeout, orçamento/custo, backoff, detecção de não convergência e stop/escalation conditions.
- Nenhum loop de verificação pode ser infinito, autoautorizado ou baseado apenas em julgamento informal do agente.
- O resultado de cada verificação deve produzir evidência estruturada e rastreável no mínimo por critério, fonte/spec, artefato, resultado PASS/FAIL/BLOCKED e referência de evidência.
- A agregação final deve ser determinística: a execução principal só pode avançar quando todas as unidades obrigatórias e a Integration Review satisfizerem os gates definidos no Execution Contract.
- O mecanismo deve permanecer runtime-agnostic e reutilizável por Claude Code, Codex ou futuros runtimes; skills externas podem inspirar adapters, mas não se tornam autoridade do protocolo RIC.

**Critério específico da subcapability:** uma tarefa decomponível deve poder executar duas ou mais unidades controladas, receber verificação independente por fresh critics, corrigir falhas dentro de limites determinísticos e produzir uma decisão final reproduzível com evidência, sem self-approval do Builder.

**Critério de saída:** uma tarefa simples é executada dentro do contrato e acompanhada em tempo real.

## 8. Fase 4 — Validação, evidências e aprovação

**Objetivo:** impedir conclusão sem prova verificável.

### Epic RIC-E10 — Validation Gates

- Lint, typecheck, testes, build e verificações customizadas.
- Políticas obrigatórias e opcionais.
- Bloqueio de commit quando gates falham.

### Epic RIC-E11 — Evidence Store

- Diff, arquivos alterados, comandos, testes, build e riscos.
- Associação com requisito, Jira e execução.
- Histórico imutável das execuções concluídas.

### Epic RIC-E12 — Review and Approval

- Aprovar, rejeitar, solicitar correção ou cancelar.
- Comparação de diff e evidências.
- Registro do responsável e justificativa.

**Critério de saída:** o operador consegue decidir com base em evidências completas.

## 9. Fase 5 — Git, Jira e documentação sincronizados

**Objetivo:** completar o ciclo operacional sem perder rastreabilidade.

### Epic RIC-E13 — Git Operations

- Branch por política.
- Commit rastreável.
- Push autorizado.
- Suporte posterior a pull request.

### Epic RIC-E14 — Jira Synchronization

- Criação e atualização de Epic, Task e Bug.
- Transições após validação.
- Comentários com evidências e commits.

### Epic RIC-E15 — Documentation Synchronization

- Atualização do status da sprint.
- Registro de decisões e desvios.
- Links cruzados entre Google Docs e GitHub.

**Critério de saída:** uma Task pode ser executada, validada, commitada, publicada e sincronizada no Jira.

## 10. Fase 6 — Workspace integrado

**Objetivo:** oferecer um ambiente operacional único.

### Epic RIC-E16 — File Explorer and Editor

- Explorer do projeto.
- Monaco Editor.
- Visualização de diff.

### Epic RIC-E17 — Terminal and Git Console

- Terminal isolado por projeto ou execução.
- Histórico de comandos.
- Estado de branch, alterações e commits.

### Epic RIC-E17A — Agent Monitor UI

- Painel por execução com sessão principal e árvore de agentes.
- Separação visual entre queued, working, reviewing, completed, failed e blocked.
- Exibir papel do agente, tarefa, runtime/modelo, duração, ownership e estado atual.
- Exibir Quality Gates, evidências, progresso e eventos em tempo real.
- Permitir drill-down em logs, comandos, arquivos, diff e evidências sem sair do Control Center.
- Consumir somente estado/eventos reais do Orchestrator e Event Store; não manter estado paralelo na UI.

**Critério de saída:** o operador consegue inspecionar e intervir sem sair do RICK Control Center.

## 11. Fase 7 — Autonomia controlada e recuperação

**Objetivo:** permitir loops automáticos com segurança.

### Epic RIC-E18 — Autonomy Policies

- Modos supervisionado e autônomo controlado.
- Gates humanos configuráveis.
- Limites de sprint, custo, duração e risco.

### Epic RIC-E19 — Failure Classification

- Falha pequena permanece no loop.
- Bug funcional gera Bug Task.
- Falha estrutural gera Bugfix Sprint.

### Epic RIC-E20 — Resume and Recovery

- Checkpoint e retomada.
- Rollback controlado.
- Reconciliação após falha externa.

**Critério de saída:** o sistema conclui uma sequência curta de Tasks sem intervenção, parando corretamente diante de risco ou divergência.

## 12. Fase 8 — Product Studio e Design Studio

**Objetivo:** integrar planejamento de produto e decisões visuais.

### Epic RIC-E21 — Product Studio

- Visão, PRD, roadmap, backlog, decisões e critérios de aceite.
- Matriz de rastreabilidade.

### Epic RIC-E22 — Design Studio MVP

- Páginas, componentes, assets e estados responsivos.
- Registro de decisões visuais.
- Ligação entre design e requisitos.

**Critério de saída:** requisito, design, tarefa, execução e evidência podem ser navegados como uma cadeia única.

## 13. Fase 9 — Hardening e MVP operacional

**Objetivo:** preparar o sistema para uso contínuo em projeto real.

### Epic RIC-E23 — Security and Isolation

- Segredos, permissões, auditoria e isolamento.
- Testes contra mistura de contexto.

### Epic RIC-E24 — Reliability and Observability

- Métricas, logs, alertas e reconciliação.
- Testes de falha dos conectores.

### Epic RIC-E25 — MVP Acceptance

- Fluxo end-to-end com projeto piloto.
- Testes de aceitação.
- Manual operacional e critérios de release.

**Critério de saída:** MVP aprovado em projeto real, com execução rastreável e recuperação testada.

## 14. Sprint 0 proposta

**Objetivo:** criar a base executável do RICK Control Center.

**Escopo:**

- Inicializar Nuxt 3 + TypeScript.
- Estruturar aplicação, server API e módulos de domínio.
- Configurar PostgreSQL e camada de persistência.
- Criar entidades Project e IntegrationConnection.
- Criar tela mínima de projetos.
- Configurar lint, typecheck, teste, build e CI.
- Criar templates de Execution Contract e registro de decisões.

### Fora do escopo:

- Execução real de agentes.
- Jira automático.
- Terminal web.
- Design Studio completo.

### Critérios de aceite:

- Aplicação inicia localmente.
- Banco sobe e migra de forma reproduzível.
- Projeto pode ser criado e listado.
- Validações obrigatórias passam.
- Documentação e evidências da sprint são publicadas.

## 15. Ordem de prioridade do MVP

**P0:** Foundation, Project Registry, Integration Registry, Spec-Driven Development, Execution Contract, State Machine, Deterministic Orchestrator Kernel, Agent Runtime, Events, Multi-Agent Orchestration, Validation, Evidence, Approval e Git/Jira sync.

**P1:** Workspace básico, Agent Monitor UI, recuperação, políticas de autonomia e auditoria pesquisável.

**P2:** Product Studio avançado, Design Studio avançado, colaboração e múltiplos runtimes.

## 16. Gates entre fases

Cada fase só avança quando:

- seus critérios de saída estiverem atendidos;
- testes e build estiverem aprovados;
- riscos críticos estiverem resolvidos;
- documentação e Jira estiverem sincronizados;
- houver decisão explícita quando existir mudança arquitetural.

## 17. Próximos documentos dependentes

- RIC-005 — Design System.
- RIC-006 — Data Model.
- RIC-007 — State Machine.
- RIC-008 — Risk Engine.
- RIC-009 — MVP Specification.
- RIC-010 — Backlog.

## 18. Registro de aprovação

Este roadmap permanece em Draft 1 até revisão e aprovação explícita do Product Owner.
