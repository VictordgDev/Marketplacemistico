# Checklist de Go-Live - Ciclo 2

## Identificacao
- Projeto: Marketplace Mistico
- Ciclo: 2
- Data da revisao: ____/____/____
- Ambiente alvo: homologacao / producao

## 1) Ambiente e segredos
- [ ] `DATABASE_URL` configurada no provider de deploy.
- [ ] `JWT_SECRET` configurada com valor forte.
- [ ] `ALLOWED_ORIGIN` apontando para dominio publico correto.
- [ ] Segredos operacionais configurados (`FINANCE_OPS_SECRET`, `METRICS_SECRET`, `ALERTS_SECRET`).
- [ ] Credenciais de integracao configuradas (`EFI_*`, `MELHOR_ENVIO_*`).

## 2) Banco e migracoes
- [ ] `npm run db:migrate` executado sem falhas.
- [ ] Tabelas de ciclo 2 presentes (`webhook_events`, `refunds`, `ledger_entries`, `reconciliation_*`, `manual_payout_*`, `audit_logs`).
- [ ] Politica de backup e restore revisada.

## 3) Fluxos obrigatorios
- [ ] Criacao de pedido transacional validada.
- [ ] Concorrencia de estoque sem overselling validada.
- [ ] Refund total e parcial validados.
- [ ] Pos-venda (cancelamento/devolucao) validado.
- [ ] Retry e reprocessamento de webhook validados.
- [ ] Reconciliacao diaria executa e gera relatorio.

## 4) Seguranca e operacao interna
- [ ] Endpoints internos protegidos por RBAC (`operator`/`admin`).
- [ ] Auditoria de acoes sensiveis registrando antes/depois.
- [ ] Logs com correlation id habilitados.
- [ ] Endpoint de alertas retornando codigos esperados.

## 5) Teste tecnico final
- [ ] Smoke test executado (`npm run ops:smoke`) e sem falhas.
- [ ] Load test executado (`npm run ops:load`) dentro do limite de erro.
- [ ] Relatorio final de teste preenchido e anexado.

## Assinaturas
- Responsavel tecnico: ____________________   Data: ____/____/____
- Responsavel produto/operacao: ___________   Data: ____/____/____
- Go-live aprovado: [ ] Sim  [ ] Nao
