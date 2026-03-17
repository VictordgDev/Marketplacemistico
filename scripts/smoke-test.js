import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return String(baseUrl).trim().replace(/\/+$/, '');
}

function createDefaultHeaders({ token, metricsSecret }) {
  const headers = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (metricsSecret) {
    headers['x-metrics-secret'] = metricsSecret;
  }
  return headers;
}

async function runCheck({ name, method, path, expectedStatuses, headers }, timeoutMs, baseUrl) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      signal: controller.signal
    });

    const ok = expectedStatuses.includes(response.status);
    return {
      name,
      method,
      path,
      status: response.status,
      ok,
      duration_ms: Math.round(performance.now() - startedAt)
    };
  } catch (error) {
    return {
      name,
      method,
      path,
      status: 0,
      ok: false,
      duration_ms: Math.round(performance.now() - startedAt),
      error: error.name === 'AbortError' ? 'timeout' : String(error.message || error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function writeJsonReport(filePath, payload) {
  const outputPath = resolve(filePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2));
}

async function main() {
  if (typeof fetch !== 'function') {
    console.error('Fetch indisponivel. Use Node.js >= 18.');
    process.exit(1);
  }

  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL || process.env.BASE_URL);
  if (!baseUrl) {
    console.error('Defina SMOKE_BASE_URL para executar o smoke test.');
    process.exit(1);
  }

  const timeoutMs = toPositiveInteger(process.env.SMOKE_TIMEOUT_MS, 10000);
  const token = process.env.SMOKE_JWT_TOKEN || '';
  const metricsSecret = process.env.METRICS_SECRET || process.env.SMOKE_METRICS_SECRET || '';
  const reportFile = process.env.SMOKE_REPORT_FILE || '';

  const defaultHeaders = createDefaultHeaders({ token, metricsSecret });
  const checks = [
    { name: 'health', method: 'GET', path: '/api/health', expectedStatuses: [200], headers: defaultHeaders },
    { name: 'products', method: 'GET', path: '/api/products', expectedStatuses: [200], headers: defaultHeaders }
  ];

  if (token) {
    checks.push({
      name: 'auth_me',
      method: 'GET',
      path: '/api/auth/me',
      expectedStatuses: [200],
      headers: defaultHeaders
    });
  }

  if (token) {
    checks.push({
      name: 'observability_metrics',
      method: 'GET',
      path: '/api/observability/metrics',
      expectedStatuses: [200],
      headers: defaultHeaders
    });
  }

  const results = [];
  for (const check of checks) {
    results.push(await runCheck(check, timeoutMs, baseUrl));
  }

  const summary = {
    executed_at: new Date().toISOString(),
    base_url: baseUrl,
    total_checks: results.length,
    passed_checks: results.filter(result => result.ok).length,
    failed_checks: results.filter(result => !result.ok).length,
    timeout_ms: timeoutMs,
    checks: results
  };

  console.log('Smoke test summary:');
  for (const result of results) {
    const status = result.ok ? 'PASS' : 'FAIL';
    const statusCode = result.status ? String(result.status) : '-';
    console.log(`- [${status}] ${result.name} ${result.method} ${result.path} status=${statusCode} duration_ms=${result.duration_ms}`);
    if (result.error) {
      console.log(`  error=${result.error}`);
    }
  }

  console.log(`Total: ${summary.total_checks} | Pass: ${summary.passed_checks} | Fail: ${summary.failed_checks}`);

  if (reportFile) {
    await writeJsonReport(reportFile, summary);
    console.log(`Relatorio JSON salvo em: ${resolve(reportFile)}`);
  }

  if (summary.failed_checks > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Falha ao executar smoke test:', error);
  process.exit(1);
});
