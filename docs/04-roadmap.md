# RIC-004 — Roadmap

**Projeto:** RICK Control Center  
**Status:** Draft 1  
**Data:** 29 de julho de 2026

## 1. Objetivo

Transformar a visão, o PRD e a arquitetura técnica em uma sequência executável de fases, Epics e sprints, preservando dependências, critérios de saída e rastreabilidade.

## 2. Princípios de planejamento

- Nenhuma implementação começa sem objetivo, escopo, critérios de aceite e Execution Contract.
- Cada fase deve produzir um incremento verificável.
- A infraestrutura mínima precede a autonomia.
- O sistema começa supervisionado e evolui para autonomia controlada.
- Integrações externas devem ser encapsuladas por adapters.
- Toda sprint termina com evidências, validação e atualização das fontes de verdade.

## 3. Visão geral das fases

1. Fundação e governança.
2. Project Control Plane.
3. Execution Contract e State Machine.
4. Runtime de agentes e eventos.
5. Validação, evidências e aprovação.
6. Git, Jira e documentação sincronizados.
7. Workspace integrado.
8. Autonomia controlada e recuperação.
9. Product Studio e Design Studio.
10. Hardening e MVP operacional.

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

**Objetivo:** tornar toda execução formal, limitada e reproduzível.

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

### Epic RIC-E16 — File Explorer and Editor

- Explorer do projeto.
- Monaco Editor.
- Visualização de diff.

### Epic RIC-E17 — Terminal and Git Console

- Terminal isolado por projeto ou execução.
- Histórico de comandos.
- Estado de branch, alterações e commits.

**Critério de saída:** o operador consegue inspecionar e intervir sem sair do RICK Control Center.

## 11. Fase 7 — Autonomia controlada e recuperação

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

### Epic RIC-E21 — Product Studio

- Visão, PRD, roadmap, backlog, decisões e critérios de aceite.
- Matriz de rastreabilidade.

### Epic RIC-E22 — Design Studio MVP

- Páginas, componentes, assets e estados responsivos.
- Registro de decisões visuais.
- Ligação entre design e requisitos.

**Critério de saída:** requisito, design, tarefa, execução e evidência podem ser navegados como uma cadeia única.

## 13. Fase 9 — Hardening e MVP operacional

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

### Escopo

- Inicializar Nuxt 3 + TypeScript.
- Estruturar aplicação, server API e módulos de domínio.
- Configurar PostgreSQL e camada de persistência.
- Criar entidades Project e IntegrationConnection.
- Criar tela mínima de projetos.
- Configurar lint, typecheck, teste, build e CI.
- Criar templates de Execution Contract e registro de decisões.

### Fora do escopo

- Execução real de agentes.
- Jira automático.
- Terminal web.
- Design Studio completo.

### Critérios de aceite

- Aplicação inicia localmente.
- Banco sobe e migra de forma reproduzível.
- Projeto pode ser criado e listado.
- Validações obrigatórias passam.
- Documentação e evidências da sprint são publicadas.

## 15. Ordem de prioridade do MVP

**P0:** Foundation, Project Registry, Integration Registry, Execution Contract, State Machine, Agent Runtime, Events, Validation, Evidence, Approval e Git/Jira sync.

**P1:** Workspace básico, recuperação, políticas de autonomia e auditoria pesquisável.

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
