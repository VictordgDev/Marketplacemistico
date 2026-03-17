import { sanitizeString } from '../../sanitize.js';
import { sendError, sendSuccess } from '../../response.js';
import { withCors } from '../../middleware.js';
import { requireFinanceOpsSecret } from '../ops-auth.js';
import { runDailyReconciliation } from '../../services/finance/reconciliation-service.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendError(res, 'METHOD_NOT_ALLOWED', 'Metodo nao permitido', 405);
  }

  const auth = requireFinanceOpsSecret(req, res);
  if (!auth.ok) {
    return undefined;
  }

  try {
    const requestedDate = sanitizeString(req.body?.run_date || req.query?.run_date || '');
    const runDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : new Date().toISOString().slice(0, 10);

    const report = await runDailyReconciliation({ runDate });

    return sendSuccess(res, {
      report: {
        run_id: report.run_id,
        run_date: report.run_date,
        summary: report.summary,
        issues_preview: report.issues.slice(0, 100)
      }
    });
  } catch (error) {
    console.error('Erro na conciliacao diaria:', error);
    return sendError(res, 'INTERNAL_ERROR', 'Erro ao executar conciliacao diaria', 500);
  }
}

export default withCors(handler);
