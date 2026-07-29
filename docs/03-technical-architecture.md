# RIC-003 — Technical Architecture

**Projeto:** RICK Control Center  
**Status:** Draft 1  
**Responsável:** Chief Architect  
**Data:** 29 de julho de 2026

## 1. Objetivo

Definir a arquitetura técnica inicial do RICK Control Center, incluindo limites de domínio, componentes, persistência, integrações, segurança, execução de agentes, eventos, observabilidade e estratégia de evolução do MVP.

## 2. Princípios arquiteturais

- Determinismo antes de autonomia.
- Toda execução nasce de um Execution Contract persistido e validado.
- O estado interno do RICK é autoritativo para execução; fontes externas são sincronizadas por adapters.
- Integrações externas nunca alteram o domínio diretamente.
- Toda transição relevante produz evento e trilha de auditoria.
- Operações destrutivas obedecem a políticas explícitas por projeto.
- Isolamento de contexto entre projetos é obrigatório.
- Falhas externas devem ser recuperáveis e idempotentes.
- O MVP começa como monólito modular.

## 3. Stack inicial

### Aplicação web

- Nuxt 3
- Vue 3
- TypeScript estrito
- Nitro para HTTP e SSE
- Monaco Editor

### Backend e domínio

- TypeScript
- Camadas de domínio e aplicação independentes do framework
- Validação em runtime por schemas
- Jobs assíncronos persistidos

### Persistência

- PostgreSQL
- Migrações versionadas
- JSONB apenas para payloads externos, snapshots e metadados extensíveis

### Runtime de agentes

- Claude Agent SDK como runtime inicial
- MCP para ferramentas e fontes conectadas
- Processo isolado por execução

### Tempo real

- Server-Sent Events no MVP
- Event log persistido

## 4. Visão de alto nível

O sistema é um monólito modular composto por quatro superfícies e um núcleo de execução.

Superfícies:

- Control Center
- Workspace
- Product Studio
- Design Studio

Núcleo:

- Project Registry
- Source Resolver
- Planning Engine
- Contract Engine
- Execution Orchestrator
- Validation Engine
- Evidence Engine
- Risk Engine
- Approval Engine
- Git Operations
- Synchronization Engine
- Audit and Event Store

Integrações:

- Google Drive/Docs
- Jira
- GitHub
- Claude Agent SDK
- MCP servers por projeto

## 5. Contextos de domínio

### Project Registry

Cadastro, configuração, política de autonomia, repositórios, fontes documentais, projeto Jira, stack, comandos e ambiente.

### Strategic Documentation

Visão, PRD, roadmap, decisões e design. Google Docs é a fonte estratégica principal; Markdown no repositório fornece versão rastreável.

### Work Management

Referências normalizadas para Epic, Task, Bug, Sprint e critérios de aceite. Jira permanece a fonte operacional externa.

### Execution Contract

Especificação imutável de uma execução: objetivo, requisito, tarefa, base Git, escopo, arquivos, restrições, comandos, gates, evidências e política de entrega.

### Execution Run

Tentativa concreta de execução. Um contrato pode ter múltiplas runs, mas cada run referencia uma única versão do contrato.

### Validation and Evidence

Execução e registro de gates e evidências vinculadas à run, tarefa, requisito e operação Git.

### Risk and Approval

Avaliação de risco e decisão sobre gates humanos.

### Synchronization

Efeitos externos idempotentes em Jira, GitHub e Google Docs.

## 6. Camadas

### Interface

Páginas Nuxt, componentes Vue, endpoints Nitro, SSE e handlers de entrada.

### Aplicação

Casos de uso, comandos e queries.

### Domínio

Entidades, value objects, invariantes, state machines, políticas e eventos.

### Infraestrutura

PostgreSQL, filesystem, Git, processos, Claude Agent SDK, MCP e adapters.

## 7. Componentes principais

### Project Resolver

Produz um Project State Snapshot com revisões documentais, estado Jira, branch, commit e divergências.

### Planning Engine

Seleciona o próximo trabalho elegível usando prioridade, dependências, readiness, bloqueios e políticas persistidas.

### Contract Engine

Gera e valida o Execution Contract. Depois de READY, o contrato é imutável.

### Execution Orchestrator

Inicia e supervisiona a run, concede somente ferramentas autorizadas e mantém checkpoints.

### Validation Engine

Executa gates ordenados com timeout, logs, severidade e resultado.

### Evidence Engine

Consolida diff, arquivos alterados, testes, logs, screenshots, referências externas, commit e riscos residuais.

### Approval Engine

Cria Approval Requests quando a política exigir intervenção humana.

### Git Operations

Checkout, branch, diff, commit, push e futuramente pull request.

### Synchronization Engine

Processa efeitos externos por outbox com idempotência e retry.

## 8. State machine

Fluxo nominal:

`DRAFT → READY → RUNNING → VALIDATING → REVIEW_REQUIRED → APPROVED → COMMITTING → PUSHING → SYNCING → COMPLETED`

Estados excepcionais:

`BLOCKED`, `FAILED`, `CANCELLED`, `ROLLED_BACK`.

Regras:

- Somente transições declaradas são aceitas.
- Cada transição ocorre em transação.
- Toda transição grava evento e AuditRecord.
- Efeitos externos são processados por outbox.
- Retomada ocorre a partir de checkpoint persistido.
- Uma run nunca muda de contrato.

## 9. Execution Contract

Campos mínimos:

- contractId e version
- projectId
- requirementIds e decisionIds
- sprintId, epicId e taskId
- objective
- acceptanceCriteria
- sourceSnapshot
- repository, baseBranch e baseCommit
- workingBranch
- allowedPaths e deniedPaths
- allowedCommands e deniedOperations
- environment requirements
- runtime e ferramentas permitidas
- validationPlan
- evidencePlan
- autonomyPolicy
- gitPolicy
- synchronizationPlan
- timeout e limites de tentativas
- contentHash

O hash é calculado sobre serialização canônica. O contrato completo usado na execução é preservado.

## 10. Persistência

Entidades centrais:

- Project
- ProjectRepository
- IntegrationConnection
- DocumentSource
- Requirement
- Decision
- RoadmapItem
- Sprint
- ExternalWorkItem
- ExecutionContract
- ExecutionRun
- ExecutionCheckpoint
- AgentProfile
- ExecutionEvent
- Evidence
- ValidationRun
- ApprovalRequest
- GitOperation
- RiskFinding
- SyncOperation
- AuditRecord

Regras:

- IDs internos são independentes dos IDs externos.
- IDs externos são únicos por conexão e tipo.
- Eventos são append-only.
- Contratos READY são imutáveis.
- Evidências concluídas são versionadas, não sobrescritas.
- Concorrência otimista em entidades de estado.
- Efeitos externos passam por outbox transacional.

## 11. Integrações

Cada integração implementa uma porta interna estável.

Google Drive/Docs:

- localizar documentos e pastas
- ler conteúdo e revisões
- criar e atualizar documentos autorizados
- registrar revisão usada no snapshot

Jira:

- resolver projeto e workflow
- ler e criar Epics, Tasks e Bugs
- transicionar estados
- publicar comentários e evidências

GitHub:

- ler repositório, branch e arquivos
- criar branch e arquivos
- criar commit e push
- consultar checks e pull requests

Agent Runtime:

- iniciar sessão
- fornecer contexto e ferramentas
- transmitir eventos
- interromper, retomar e finalizar

## 12. Concorrência e idempotência

- Uma run mutável por workspace possui lock exclusivo por padrão.
- Locks possuem lease e heartbeat.
- Comandos críticos recebem idempotencyKey.
- SyncOperation impede duplicação de efeitos.
- Retentativas usam backoff e limite configurável.

## 13. Segurança

- Segredos não são armazenados em texto simples.
- Tokens são referenciados por secret handles.
- Logs passam por redaction.
- Ferramentas são concedidas por allowlist.
- Comandos são validados contra o contrato.
- Cada projeto possui raiz de filesystem.
- Path traversal é bloqueado.
- O agente não recebe credenciais quando um adapter pode executar a ação.
- Operações destrutivas exigem aprovação compatível.
- Toda ação registra o ator.

## 14. Isolamento

MVP:

- Processo separado por run
- Diretório de trabalho dedicado
- Variáveis de ambiente mínimas
- Limites de tempo
- Contexto apenas do projeto ativo

Evolução:

- Containers efêmeros
- Filas distribuídas
- Workers remotos
- Sandbox de rede e filesystem

## 15. Eventos e SSE

ExecutionEvent contém:

- eventId
- projectId
- runId
- sequence
- type
- timestamp
- actorType e actorId
- payload
- visibility

SSE aceita `Last-Event-ID`. A ordem é garantida por `sequence` dentro da run.

## 16. Observabilidade

- Logs estruturados com projectId, contractId e runId
- Métricas de duração, falha, retry, custo e tokens
- Health checks para banco, runtime e conectores
- Painel de operações bloqueadas
- Evidências de erro com redaction

## 17. Tratamento de falhas

Falha transitória externa:

- registrar tentativa
- manter estado interno consistente
- agendar retry idempotente

Falha pequena de implementação:

- permanecer na run atual dentro do contrato

Bug funcional:

- criar Bug Task na Epic atual

Falha estrutural:

- bloquear continuidade
- registrar RiskFinding
- propor Bugfix Sprint

Violação de segurança ou escopo:

- interromper a run
- revogar ferramentas
- preservar evidências
- exigir revisão humana

## 18. Estrutura proposta

```text
apps/
  web/
    app/
    server/
packages/
  domain/
  application/
  database/
  integrations/
  agent-runtime/
  execution-engine/
  validation-engine/
  shared/
docs/
  execution-contracts/
infra/
  docker/
  migrations/
```

## 19. Estratégia de testes

- Unitários para domínio, state machines e políticas
- Integração para PostgreSQL e adapters
- Contract tests para integrações externas
- E2E para projeto → contrato → run → evidência → aprovação → Git/Jira
- Testes de falha e retomada
- Testes de isolamento
- Testes de idempotência

## 20. Decisões arquiteturais iniciais

- **DEC-001:** monólito modular no MVP — Proposed
- **DEC-002:** Nuxt 3 e TypeScript — Proposed
- **DEC-003:** PostgreSQL como banco autoritativo — Proposed
- **DEC-004:** SSE no MVP — Proposed
- **DEC-005:** Claude Agent SDK por adapter — Proposed
- **DEC-006:** outbox transacional — Proposed
- **DEC-007:** contratos imutáveis após READY — Proposed
- **DEC-008:** um operador por instalação no MVP — Proposed
- **DEC-009:** branch isolada por execução — Proposed
- **DEC-010:** Design Studio básico no MVP — Proposed

## 21. Resolução proposta das pendências do PRD

- Design Studio básico no MVP
- Um operador principal por instalação
- Autenticação local inicial, preparada para OAuth
- Branch isolada por execução
- Conexão de repositórios e Jira existentes no primeiro corte; criação automática fica posterior

Esses pontos permanecem `Proposed` até aprovação explícita do Product Owner.

## 22. Critérios de aprovação

- Limites de domínio claros
- Fluxo determinístico e auditável
- Integrações desacopladas por adapters
- Estado, eventos e efeitos externos consistentes
- Segurança e isolamento verificáveis
- Base suficiente para planejar a Sprint 0

## 23. Registro de aprovação

Este documento permanece em **Draft 1**. A aprovação das decisões `DEC-001` a `DEC-010` autoriza a criação do roadmap técnico e da Sprint 0.
