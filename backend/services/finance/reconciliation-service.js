import { query } from '../../db.js';

function getRunner(db) {
  if (db && typeof db.query === 'function') {
    return (text, params) => db.query(text, params);
  }
  return (text, params) => query(text, params);
}

function rowsOf(result) {
  return result?.rows || result || [];
}

function buildSummary(issues = []) {
  const byType = {};
  const bySeverity = {};

  for (const issue of issues) {
    byType[issue.issue_type] = (byType[issue.issue_type] || 0) + 1;
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
  }

  return {
    total_issues: issues.length,
    by_type: byType,
    by_severity: bySeverity
  };
}

export async function collectReconciliationIssues({ db } = {}) {
  const runner = getRunner(db);
  const issues = [];

  const ordersWithoutPayment = rowsOf(await runner(
    `SELECT o.id AS order_id
     FROM orders o
     LEFT JOIN payments p
       ON p.order_id = o.id
      AND p.status IN ('approved', 'partially_refunded', 'refunded')
     WHERE o.payment_status IN ('approved', 'partially_refunded', 'refunded')
       AND p.id IS NULL`
  ));

  for (const row of ordersWithoutPayment) {
    issues.push({
      issue_type: 'ORDER_PAYMENT_STATUS_WITHOUT_APPROVED_PAYMENT',
      severity: 'high',
      order_id: row.order_id,
      details_json: { message: 'Pedido com status pago sem pagamento aprovado associado' }
    });
  }

  const approvedPaymentsWithoutWebhook = rowsOf(await runner(
    `SELECT p.id AS payment_id, p.order_id
     FROM payments p
     LEFT JOIN webhook_events w
       ON w.provider = p.provider
      AND w.external_id = p.provider_charge_id
      AND w.status = 'processed'
     WHERE p.status IN ('approved', 'partially_refunded', 'refunded')
       AND p.provider_charge_id IS NOT NULL
       AND w.id IS NULL`
  ));

  for (const row of approvedPaymentsWithoutWebhook) {
    issues.push({
      issue_type: 'APPROVED_PAYMENT_WITHOUT_PROCESSED_WEBHOOK',
      severity: 'medium',
      order_id: row.order_id,
      payment_id: row.payment_id,
      details_json: { message: 'Pagamento aprovado sem evento de webhook processado' }
    });
  }

  const ignoredWebhookRetries = rowsOf(await runner(
    `SELECT id AS webhook_event_id, external_id, retry_count, max_retries
     FROM webhook_events
     WHERE provider = 'efi'
       AND status = 'ignored'
       AND retry_count >= max_retries`
  ));

  for (const row of ignoredWebhookRetries) {
    issues.push({
      issue_type: 'WEBHOOK_MAX_RETRIES_REACHED',
      severity: 'high',
      webhook_event_id: row.webhook_event_id,
      details_json: {
        external_id: row.external_id,
        retry_count: row.retry_count,
        max_retries: row.max_retries
      }
    });
  }

  const pendingManualPayouts = rowsOf(await runner(
    `SELECT id AS manual_payout_id, order_id, created_at
     FROM manual_payouts
     WHERE status = 'pending'
       AND created_at < CURRENT_TIMESTAMP - INTERVAL '7 days'`
  ));

  for (const row of pendingManualPayouts) {
    issues.push({
      issue_type: 'MANUAL_PAYOUT_PENDING_TOO_LONG',
      severity: 'medium',
      order_id: row.order_id,
      manual_payout_id: row.manual_payout_id,
      details_json: { created_at: row.created_at }
    });
  }

  return issues;
}

export async function runDailyReconciliation({ db, runDate } = {}) {
  const runner = getRunner(db);
  const safeRunDate = runDate || new Date().toISOString().slice(0, 10);

  const runInsert = rowsOf(await runner(
    `INSERT INTO reconciliation_runs (run_date, status)
     VALUES ($1, 'running')
     RETURNING id, run_date, started_at`,
    [safeRunDate]
  ));

  const run = runInsert[0];
  const issues = await collectReconciliationIssues({ db });

  for (const issue of issues) {
    await runner(
      `INSERT INTO reconciliation_issues (
         run_id, issue_type, severity, order_id, payment_id,
         webhook_event_id, manual_payout_id, details_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        run.id,
        issue.issue_type,
        issue.severity,
        issue.order_id || null,
        issue.payment_id || null,
        issue.webhook_event_id || null,
        issue.manual_payout_id || null,
        JSON.stringify(issue.details_json || {})
      ]
    );
  }

  const summary = buildSummary(issues);

  await runner(
    `UPDATE reconciliation_runs
     SET status = 'completed',
         summary_json = $2::jsonb,
         finished_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [run.id, JSON.stringify(summary)]
  );

  return {
    run_id: run.id,
    run_date: run.run_date,
    summary,
    issues
  };
}
