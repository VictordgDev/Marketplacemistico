import { query } from '../../db.js';

function getRunner(db) {
  if (db && typeof db.query === 'function') {
    return (text, params) => db.query(text, params);
  }
  return (text, params) => query(text, params);
}

export async function recordAuditLog({
  db,
  actorUserId = null,
  action,
  resourceType,
  resourceId,
  before = null,
  after = null,
  metadata = null
}) {
  const runner = getRunner(db);

  if (!action || !resourceType || resourceId === undefined || resourceId === null) {
    throw new Error('action, resourceType e resourceId sao obrigatorios para auditoria');
  }

  const result = await runner(
    `INSERT INTO audit_logs (
       actor_user_id, action, resource_type, resource_id,
       before_json, after_json, metadata_json
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
     RETURNING *`,
    [
      actorUserId,
      action,
      resourceType,
      String(resourceId),
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      metadata ? JSON.stringify(metadata) : null
    ]
  );

  return result?.rows?.[0] || result?.[0] || null;
}
