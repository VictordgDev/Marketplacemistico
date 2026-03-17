export function logInfo(event, fields = {}) {
  const payload = {
    level: 'info',
    event,
    timestamp: new Date().toISOString(),
    ...fields
  };

  console.log(JSON.stringify(payload));
}

export function logError(event, error, fields = {}) {
  const payload = {
    level: 'error',
    event,
    timestamp: new Date().toISOString(),
    ...fields,
    error: {
      message: error?.message || String(error),
      code: error?.code || null,
      stack: error?.stack || null
    }
  };

  console.error(JSON.stringify(payload));
}
