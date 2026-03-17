import { neon, Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

let sql;
let pool;

neonConfig.webSocketConstructor = ws;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL nao configurada nas variaveis de ambiente');
  }
  return databaseUrl;
}

export function getDb() {
  if (!sql) {
    sql = neon(getDatabaseUrl());
  }
  return sql;
}

export function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: getDatabaseUrl() });
  }
  return pool;
}

export async function query(text, params = []) {
  const sql = getDb();
  try {
    const result = await sql(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    console.error('Query:', text);
    console.error('Params:', params);
    throw error;
  }
}

export async function withTransaction(callback) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Erro no rollback da transacao:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}
