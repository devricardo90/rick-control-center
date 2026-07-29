# RIC-006 — Data Model

**Projeto:** RICK Control Center  
**Status:** Draft 1  
**Responsável:** Chief Architect  
**Data:** 29 de julho de 2026

## 1. Objetivo

Definir o modelo de dados canônico do RICK Control Center, seus agregados, relações, invariantes, estratégias de persistência e regras de isolamento. PostgreSQL será o banco transacional principal.

## 2. Princípios

- Identificadores internos em UUID.
- Datas e horários armazenados em UTC.
- Toda entidade operacional pertence explicitamente a um `Project`.
- Transições críticas são atômicas e auditáveis.
- Dados externos usam IDs do provedor e snapshots normalizados.
- Segredos nunca são armazenados em texto puro.
- Evidências concluídas são imutáveis.
- Exclusão lógica é preferida para entidades estratégicas e operacionais.

## 3. Agregados principais

### Project
Raiz de isolamento: `id`, `key`, `name`, `description`, `status`, `autonomyPolicy`, `defaultBranchPolicy`, `workspacePath`, timestamps e arquivamento.

### IntegrationConnection
Conexões GitHub, Jira, Google Drive e runtime de agente, com configuração criptografada e estado de verificação.

### DocumentSource
Mapeia documentos estratégicos por tipo, arquivo externo, revisão, checksum e sincronização.

### Requirement e Decision
Requisitos possuem código único por projeto, prioridade, status, critérios de aceite e rastreabilidade. Decisões usam estados `PROPOSED`, `APPROVED`, `REJECTED` e `SUPERSEDED`.

### RoadmapItem, Sprint, Epic e Task
Representam planejamento estratégico e operacional. Tasks suportam `STORY`, `TASK`, `BUG`, `SPIKE` e `CHORE`.

### Agent e AgentBinding
O agente é reutilizável; o binding define função e configuração isoladas por projeto.

### ExecutionContract
Contém objetivo, escopo permitido e proibido, comandos, restrições, validações, política Git, critérios de conclusão, snapshot de origem e `contentHash`.

Invariantes:
- execução somente com contrato `APPROVED`;
- alteração material cria nova versão;
- apenas uma versão ativa por Task.

### ExecutionRun
Registra contrato, agente, modo (`SUPERVISED` ou `CONTROLLED_AUTONOMOUS`), branch, commit base, estado, falha e timestamps.

### ExecutionEvent
Registro append-only com sequência única por execução, tipo, severidade, ator, payload e data.

### Evidence
Tipos iniciais: `DIFF`, `COMMAND_OUTPUT`, `TEST_RESULT`, `BUILD_RESULT`, `FILE_LIST`, `SCREENSHOT`, `LOG_EXCERPT`, `COMMIT`, `PULL_REQUEST` e `EXTERNAL_REFERENCE`.

### Validation
Estados: `PENDING`, `RUNNING`, `PASSED`, `FAILED`, `SKIPPED` e `CANCELLED`.

### Approval
Estados: `PENDING`, `APPROVED`, `REJECTED`, `CHANGES_REQUESTED` e `CANCELLED`.

### GitOperation
Operações: `BRANCH_CREATE`, `COMMIT`, `PUSH`, `PR_CREATE`, `MERGE` e `ROLLBACK`.

### Risk
Severidade: `LOW`, `MEDIUM`, `HIGH` e `CRITICAL`, com probabilidade, impacto, mitigação, responsável e resolução.

### AuditRecord
Registro append-only com ator, ação, entidade, correlação, estado anterior, estado posterior e hash de integridade.

## 4. Rastreabilidade

Tabelas explícitas:
- `requirement_tasks`
- `requirement_commits`
- `requirement_evidence`
- `decisions_requirements`
- `document_requirements`
- `sprint_tasks`
- `execution_risks`

Cada vínculo registra origem e data.

## 5. Estado consolidado

`ProjectSnapshot` é uma projeção calculada ou materializada contendo estados de documentação, Jira, Git, execução, divergências e versão do resolver. Não substitui as fontes primárias.

## 6. Outbox e sincronização

`IntegrationOutbox` garante sincronização confiável com provedores externos. A mudança local e a criação do item de outbox ocorrem na mesma transação.

Estados: `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED` e `DEAD_LETTER`.

## 7. Checkpoints

`ExecutionCheckpoint` permite retomada somente quando o contrato, o commit do repositório e o estado do workspace continuam compatíveis.

## 8. Concorrência

- Optimistic locking em entidades mutáveis.
- Bloqueio transacional nas transições de `ExecutionRun`.
- Uma execução ativa por Task no MVP.
- Operações idempotentes com `idempotencyKey`.
- Deduplicação de eventos por provedor e ID externo.

## 9. Retenção e imutabilidade

`ExecutionEvent`, `AuditRecord` e evidências finalizadas são append-only. Conteúdo volumoso poderá migrar para object storage mantendo checksum e URI no PostgreSQL.

## 10. Índices mínimos

- `project(key)`
- `requirement(project_id, code)`
- `decision(project_id, code)`
- `task(project_id, external_provider, external_id)`
- `execution_contract(task_id, version)`
- `execution_run(project_id, status)`
- `execution_event(execution_run_id, sequence)`
- `validation(execution_run_id, status)`
- `audit_record(project_id, occurred_at)`
- `integration_outbox(status, available_at)`

## 11. Convenções

- Tabelas e colunas em `snake_case`.
- `timestamptz` para datas e horários.
- `jsonb` apenas para estruturas variáveis e snapshots.
- Foreign keys obrigatórias.
- Migrações versionadas e validadas em CI.

## 12. Escopo inicial

Incluído: Project, integrações, documentos, requisitos, decisões, roadmap, sprint, Epic, Task, agentes, contratos, execuções, eventos, evidências, validações, aprovações, operações Git, riscos, auditoria, outbox e checkpoints.

Fora do primeiro esquema: organizações multiempresa, billing, quotas comerciais, execução multirregional e analytics avançado.

## 13. Pendências

- Escolher ORM/query builder.
- Definir object storage para evidências grandes.
- Definir retenção de logs e eventos.
- Confirmar persistência inicial de `ProjectSnapshot`.
- Definir criptografia das configurações de integração.

## 14. Aprovação

Este documento permanece em Draft 1 até revisão e aprovação explícita do Product Owner e do Chief Architect.
