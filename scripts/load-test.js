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

function toPositiveFloat(value, fallback) {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return String(baseUrl).trim().replace(/\/+$/, '');
}

function normalizeEndpoints(value) {
  const raw = String(value || '/api/health,/api/products')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  if (raw.length === 0) {
    return ['/api/health', '/api/products'];
  }

  return raw.map(endpoint => (endpoint.startsWith('/') ? endpoint : `/${endpoint}`));
}

function percentile(values, pct) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[index];
}

async function writeJsonReport(filePath, payload) {
  const outputPath = resolve(filePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2));
}

async function executeRequest({ baseUrl, endpoint, timeoutMs, headers }) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    return {
      endpoint,
      status: response.status,
      ok: response.status >= 200 && response.status < 400,
      duration_ms: Math.round(performance.now() - startedAt)
    };
  } catch (error) {
    return {
      endpoint,
      status: 0,
      ok: false,
      duration_ms: Math.round(performance.now() - startedAt),
      error: error.name === 'AbortError' ? 'timeout' : String(error.message || error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (typeof fetch !== 'function') {
    console.error('Fetch indisponivel. Use Node.js >= 18.');
    process.exit(1);
  }

  const baseUrl = normalizeBaseUrl(process.env.LOAD_BASE_URL || process.env.SMOKE_BASE_URL || process.env.BASE_URL);
  if (!baseUrl) {
    console.error('Defina LOAD_BASE_URL para executar o teste de carga.');
    process.exit(1);
  }

  const endpoints = normalizeEndpoints(process.env.LOAD_ENDPOINTS);
  const concurrency = toPositiveInteger(process.env.LOAD_CONCURRENCY, 5);
  const requestsPerWorker = toPositiveInteger(process.env.LOAD_REQUESTS_PER_WORKER, 20);
  const timeoutMs = toPositiveInteger(process.env.LOAD_TIMEOUT_MS, 10000);
  const maxErrorRate = toPositiveFloat(process.env.LOAD_MAX_ERROR_RATE, 0.05);
  const token = process.env.LOAD_JWT_TOKEN || process.env.SMOKE_JWT_TOKEN || '';
  const metricsSecret = process.env.METRICS_SECRET || process.env.LOAD_METRICS_SECRET || '';
  const reportFile = process.env.LOAD_REPORT_FILE || '';

  const headers = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (metricsSecret) {
    headers['x-metrics-secret'] = metricsSecret;
  }

  const startedAt = performance.now();
  const tasks = [];

  for (let worker = 0; worker < concurrency; worker += 1) {
    tasks.push((async () => {
      const workerResults = [];
      for (let i = 0; i < requestsPerWorker; i += 1) {
        const endpoint = endpoints[(worker * requestsPerWorker + i) % endpoints.length];
        workerResults.push(await executeRequest({ baseUrl, endpoint, timeoutMs, headers }));
      }
      return workerResults;
    })());
  }

  const allResults = (await Promise.all(tasks)).flat();
  const elapsedMs = Math.max(1, Math.round(performance.now() - startedAt));

  const successCount = allResults.filter(result => result.ok).length;
  const failedCount = allResults.length - successCount;
  const errorRate = allResults.length === 0 ? 0 : failedCount / allResults.length;

  const latencies = allResults.map(result => result.duration_ms);
  const perEndpoint = {};
  for (const result of allResults) {
    if (!perEndpoint[result.endpoint]) {
      perEndpoint[result.endpoint] = { total: 0, success: 0, failed: 0 };
    }
    perEndpoint[result.endpoint].total += 1;
    if (result.ok) {
      perEndpoint[result.endpoint].success += 1;
    } else {
      perEndpoint[result.endpoint].failed += 1;
    }
  }

  const summary = {
    executed_at: new Date().toISOString(),
    base_url: baseUrl,
    endpoints,
    concurrency,
    requests_per_worker: requestsPerWorker,
    timeout_ms: timeoutMs,
    total_requests: allResults.length,
    success_requests: successCount,
    failed_requests: failedCount,
    error_rate: Number(errorRate.toFixed(4)),
    throughput_rps: Number((allResults.length / (elapsedMs / 1000)).toFixed(2)),
    latency_ms: {
      p50: percentile(latencies, 50),
      p90: percentile(latencies, 90),
      p95: percentile(latencies, 95),
      max: Math.max(...latencies, 0)
    },
    by_endpoint: perEndpoint
  };

  console.log('Load test summary:');
  console.log(`- Base URL: ${baseUrl}`);
  console.log(`- Endpoints: ${endpoints.join(', ')}`);
  console.log(`- Requests: ${summary.total_requests}`);
  console.log(`- Success: ${summary.success_requests}`);
  console.log(`- Failed: ${summary.failed_requests}`);
  console.log(`- Error rate: ${summary.error_rate}`);
  console.log(`- Throughput (req/s): ${summary.throughput_rps}`);
  console.log(`- Latency p50/p90/p95/max (ms): ${summary.latency_ms.p50}/${summary.latency_ms.p90}/${summary.latency_ms.p95}/${summary.latency_ms.max}`);

  if (reportFile) {
    await writeJsonReport(reportFile, summary);
    console.log(`Relatorio JSON salvo em: ${resolve(reportFile)}`);
  }

  if (summary.error_rate > maxErrorRate) {
    console.error(`Erro acima do limite. error_rate=${summary.error_rate}, limite=${maxErrorRate}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Falha ao executar teste de carga:', error);
  process.exit(1);
});
