# RIC-007 — State Machine

**Projeto:** RICK Control Center  
**Status:** Draft 1  
**Responsável:** Product Owner + Chief Architect  
**Data:** 29 de julho de 2026

## 1. Objetivo

Definir a máquina de estados determinística que governa cada `ExecutionRun`. Nenhuma mudança de estado pode ocorrer por inferência informal do agente; toda transição exige comando, precondições, autorização, persistência e evento de auditoria.

## 2. Princípios

- O estado persistido no RICK Control Center é a fonte de verdade da execução.
- Transições são explícitas, validadas e atômicas.
- Estados terminais não podem ser reabertos; uma nova tentativa cria outro `ExecutionRun`.
- Efeitos externos usam idempotência e Outbox.
- Falhas preservam evidências e histórico.
- A interface exibe o estado persistido, não um estado calculado somente no cliente.

## 3. Estados

### Principais

`DRAFT`, `READY`, `RUNNING`, `VALIDATING`, `REVIEW_REQUIRED`, `APPROVED`, `COMMITTING`, `PUSHING`, `SYNCING`, `COMPLETED`.

### Excepcionais

`BLOCKED`, `FAILED`, `CANCELLED`, `ROLLED_BACK`.

## 4. Fluxo nominal

```text
DRAFT → READY → RUNNING → VALIDATING

VALIDATING → REVIEW_REQUIRED → APPROVED
VALIDATING → APPROVED

APPROVED → COMMITTING → PUSHING → SYNCING → COMPLETED
```

Uma validação corrigível pode retornar de `VALIDATING` para `RUNNING`. Falhas ou dependências impeditivas direcionam a execução para `FAILED` ou `BLOCKED`, conforme a classificação.

## 5. Transições essenciais

### DRAFT → READY

Requer contrato válido, projeto ativo, agente disponível, integrações acessíveis e ausência de bloqueio impeditivo.

### READY → RUNNING

Requer lock de execução, confirmação da versão do contrato, branch e workspace preparados.

### RUNNING → VALIDATING

Requer encerramento das alterações, comandos ativos finalizados, diff e arquivos alterados registrados.

### VALIDATING → REVIEW_REQUIRED

Requer todos os gates obrigatórios aprovados e política com revisão humana.

### VALIDATING → APPROVED

Requer gates aprovados e política permitindo aprovação automática.

### REVIEW_REQUIRED → APPROVED

Requer aprovador autorizado e aprovação vinculada à versão atual do diff e das evidências.

### REVIEW_REQUIRED → RUNNING

Ocorre após pedido de correção. Qualquer aprovação anterior é invalidada.

### APPROVED → COMMITTING

Requer aprovação válida, diff inalterado e política Git satisfeita.

### COMMITTING → PUSHING

Requer commit confirmado e SHA persistido.

### PUSHING → SYNCING

Requer confirmação do remote na referência autorizada.

### SYNCING → COMPLETED

Requer sincronizações obrigatórias concluídas ou registradas segundo a política de consistência.

## 6. Estados terminais

`COMPLETED`, `FAILED`, `CANCELLED` e `ROLLED_BACK` são terminais. Retry, retomada ou correção cria uma nova execução ligada por `parent_run_id` ou `retry_of_run_id`.

## 7. Bloqueio e retomada

`BLOCKED` não é terminal. O registro deve conter código, descrição, origem, ação necessária e responsável. A retomada exige comando explícito, revalidação das precondições e novo lock. O destino depende do checkpoint persistido.

## 8. Checkpoints

Checkpoints são obrigatórios:

- após preparação do workspace;
- após etapas relevantes do agente;
- antes de `VALIDATING`;
- após validações;
- antes e depois de commit;
- antes e depois de push;
- durante sincronizações externas.

Cada checkpoint registra estado, sequência do evento, hash do contrato, commit base, hash do diff, arquivos alterados, validações e efeitos externos confirmados.

## 9. Comandos de domínio

`PREPARE_RUN`, `MARK_READY`, `START_RUN`, `REQUEST_VALIDATION`, `RECORD_VALIDATION`, `REQUEST_REVIEW`, `APPROVE_RUN`, `REQUEST_CHANGES`, `START_COMMIT`, `CONFIRM_COMMIT`, `START_PUSH`, `CONFIRM_PUSH`, `START_SYNC`, `COMPLETE_RUN`, `BLOCK_RUN`, `RESOLVE_BLOCKER`, `FAIL_RUN`, `CANCEL_RUN` e `CONFIRM_ROLLBACK`.

Todo comando contém `command_id` idempotente, ator, `expected_version`, timestamp, motivo e payload validado.

## 10. Eventos de domínio

`RunCreated`, `RunMarkedReady`, `RunStarted`, `RunBlocked`, `BlockerResolved`, `ValidationStarted`, `ValidationRecorded`, `ReviewRequested`, `ChangesRequested`, `RunApproved`, `CommitStarted`, `CommitConfirmed`, `PushStarted`, `PushConfirmed`, `SyncStarted`, `ExternalSyncConfirmed`, `RunCompleted`, `RunFailed`, `RunCancelled` e `RollbackConfirmed`.

Eventos são append-only e possuem `sequence_number` único por execução. A publicação ocorre por Outbox na mesma transação da atualização de estado.

## 11. Concorrência e idempotência

- `execution_runs.version` usa optimistic locking.
- Um comando mutável só pode ser confirmado para a versão esperada.
- `command_id` não pode produzir efeitos duas vezes.
- Operações externas armazenam chave idempotente, identificador do provedor e status de confirmação.
- Locks possuem owner, aquisição, expiração e heartbeat.
- Lock expirado exige reconciliação antes de outra execução assumir o controle.

## 12. Invariantes

- `RUNNING` exige agente e contrato vinculados.
- `VALIDATING` exige snapshot do diff.
- `REVIEW_REQUIRED` exige pacote de evidências associado ao diff atual.
- `APPROVED` exige aprovação aplicável à versão atual.
- `COMMITTING` exige política Git autorizada.
- `PUSHING` exige commit SHA confirmado.
- `COMPLETED` exige evidências mínimas, commit e sincronizações obrigatórias.
- Mudança de contrato, escopo ou diff invalida aprovações dependentes.
- Uma execução não pode misturar projeto, workspace ou credenciais de outro projeto.

## 13. Falhas externas

Timeout não equivale a falha definitiva. O sistema deve reconciliar com o provedor antes de repetir. Resultado desconhecido mantém a execução bloqueada ou no estado operacional atual; nunca permite avanço por suposição.

## 14. Retry e tentativas

Cada etapa possui `max_attempts` e backoff. Falhas pequenas podem retornar a `RUNNING`. Falhas de infraestrutura podem gerar `BLOCKED`. Violação de escopo, corrupção de estado ou risco crítico levam a `FAILED`.

## 15. Cancelamento e rollback

Cancelamento interrompe novos comandos, solicita parada do runtime e aguarda confirmação. Processos filhos e efeitos externos são reconciliados. Quando houver efeito a desfazer, a execução termina em `ROLLED_BACK`; caso contrário, em `CANCELLED`.

## 16. Persistência mínima

- `execution_runs`: status, version, current_step, contract_hash, diff_hash, SHAs, lock, tentativas, timestamps e motivo terminal.
- `execution_events`: run_id, sequence_number, type, actor, payload e occurred_at.
- `execution_checkpoints`: run_id, status, event_sequence, snapshot e created_at.
- `execution_commands`: command_id, run_id, type, expected_version, result e processed_at.

## 17. Testes obrigatórios

- matriz de transições válidas e inválidas;
- invariantes por estado;
- optimistic locking e concorrência;
- idempotência de comandos e efeitos externos;
- timeout seguido de reconciliação;
- invalidação de aprovação por mudança de diff;
- retomada por checkpoint;
- cancelamento seguro;
- estados terminais imutáveis;
- isolamento entre projetos.

## 18. Critério de aprovação

O documento pode ser aprovado quando transições, estados terminais, bloqueio, retomada, idempotência e invariantes estiverem alinhados com RIC-002, RIC-003 e RIC-006.
