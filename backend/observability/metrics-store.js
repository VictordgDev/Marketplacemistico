const counters = new Map();

function buildKey(name, labels = {}) {
  const labelEntries = Object.entries(labels)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));

  if (labelEntries.length === 0) {
    return name;
  }

  const labelString = labelEntries
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(',');

  return `${name}{${labelString}}`;
}

export function incrementMetric(name, labels = {}, value = 1) {
  const safeValue = Number(value) || 0;
  if (safeValue === 0) {
    return;
  }

  const key = buildKey(name, labels);
  const current = counters.get(key) || 0;
  counters.set(key, current + safeValue);
}

export function getMetricsSnapshot() {
  const snapshot = {};
  for (const [key, value] of counters.entries()) {
    /* eslint-disable-next-line security/detect-object-injection */
    snapshot[key] = value;
  }
  return snapshot;
}

export function resetMetrics() {
  counters.clear();
}
