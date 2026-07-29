# RICK Control Center — Documentation Approval Baseline

**Status:** Approved  
**Aprovado por:** Ricardo Souza  
**Data de aprovação:** 29 de julho de 2026

## 1. Escopo

Este baseline fecha as decisões abertas dos documentos RIC-001 a RIC-012 e autoriza o início da Sprint 0. Em caso de divergência com versões anteriores marcadas como `Draft 1`, este baseline prevalece até a sincronização dos cabeçalhos históricos.

## 2. Decisões aprovadas

- Autenticação inicial: um único usuário com login e senha.
- Operação inicial: um único operador por instalação.
- Política de branches: configurável por projeto, com branch por tarefa como padrão.
- Commit e push: configuráveis por projeto, com automação após todas as validações como padrão.
- GitHub: permitir criar repositório automaticamente ou conectar um existente.
- Jira: o RICK cria automaticamente o projeto Jira, Epics e Tasks.
- ORM inicial: Prisma com PostgreSQL.
- Evidências grandes: armazenamento inicial no disco local.
- Retenção: configurável por projeto, com padrão de 90 dias para logs detalhados e auditoria permanente.
- Configurações de integração: proteção por serviço externo dedicado desde o MVP.
- `ProjectSnapshot`: estado atual persistido; histórico preservado por eventos e auditoria.
- Tema: seguir preferência do sistema, com claro e escuro.
- Marca: direção azul-violeta técnica e sóbria, materializada em tokens semânticos.
- Componentes: shadcn-vue com primitivas Reka UI.
- Ícones: Lucide.
- Tipografia: Inter para interface e JetBrains Mono para código, logs, IDs e hashes.
- Design Studio no MVP: editor visual completo, próximo de uma ferramenta de design.
- Autonomia: configurável por projeto, com modo autônomo controlado como padrão.

## 3. Resultado

```text
DOCUMENT_SET: 12/12
DOCUMENTATION_STATUS: APPROVED
OPEN_GOVERNANCE_DECISIONS: 0
SPRINT_0_STATUS: READY
NEXT_ACTION: gerar o Execution Contract da Sprint 0 e sincronizar Epic e Tasks no Jira.
```
