/* eslint-disable security/detect-object-injection */
/* eslint-disable security/detect-non-literal-fs-filename */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDb } from '../backend/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '..', 'migrations');
const migrationTable = 'schema_migrations';

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function splitSqlStatements(sqlText) {
  const statements = [];
  let buffer = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sqlText.length; i += 1) {
    const char = sqlText[i];
    const next = sqlText[i + 1];

    if (inLineComment) {
      buffer += char;
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      buffer += char;
      if (char === '*' && next === '/') {
        buffer += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === '-' && next === '-') {
      buffer += char + next;
      i += 1;
      inLineComment = true;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === '/' && next === '*') {
      buffer += char + next;
      i += 1;
      inBlockComment = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      if (inSingleQuote && next === "'") {
        buffer += char + next;
        i += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      buffer += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      buffer += char;
      continue;
    }

    if (char === ';' && !inSingleQuote && !inDoubleQuote) {
      const statement = buffer.trim();
      if (statement) {
        statements.push(statement);
      }
      buffer = '';
      continue;
    }

    buffer += char;
  }

  const trailing = buffer.trim();
  if (trailing) {
    statements.push(trailing);
  }

  return statements;
}

function parseMigrationFileName(fileName) {
  const match = fileName.match(/^(\d+_[\w-]+)\.(up|down)\.sql$/);
  if (!match) {
    return null;
  }

  return {
    baseName: match[1],
    direction: match[2]
  };
}

async function loadMigrations() {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const grouped = new Map();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const parsed = parseMigrationFileName(entry.name);
    if (!parsed) {
      continue;
    }

    const current = grouped.get(parsed.baseName) || { name: parsed.baseName };
    if (parsed.direction === 'up') {
      current.up = path.join(migrationsDir, entry.name);
    } else {
      current.down = path.join(migrationsDir, entry.name);
    }
    grouped.set(parsed.baseName, current);
  }

  return [...grouped.values()]
    .filter((migration) => migration.up && migration.down)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function ensureMigrationTable(db) {
  await db(`
    CREATE TABLE IF NOT EXISTS ${migrationTable} (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function readSql(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env');

  try {
    const content = await fs.readFile(envPath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key]) {
        continue;
      }

      let value = trimmed.slice(separatorIndex + 1).trim();
      const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
      const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");
      if (hasDoubleQuotes || hasSingleQuotes) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function runSqlFile(db, filePath) {
  const sqlText = await readSql(filePath);
  const statements = splitSqlStatements(sqlText);

  for (const statement of statements) {
    await db(statement);
  }

  return sqlText;
}

async function migrateUp(db, migrations) {
  const appliedRows = await db(`SELECT migration_name, checksum FROM ${migrationTable} ORDER BY migration_name ASC`);
  const appliedMap = new Map(appliedRows.map((row) => [row.migration_name, row.checksum]));

  const pending = migrations.filter((migration) => !appliedMap.has(migration.name));
  if (pending.length === 0) {
    console.log('Nenhuma migracao pendente.');
    return;
  }

  for (const migration of pending) {
    console.log(`Aplicando ${migration.name}...`);
    const sqlText = await runSqlFile(db, migration.up);
    const checksum = hashContent(sqlText);
    await db(`INSERT INTO ${migrationTable} (migration_name, checksum) VALUES ($1, $2)`, [migration.name, checksum]);
    console.log(`OK ${migration.name}`);
  }
}

async function migrateDown(db, migrations) {
  const rows = await db(`SELECT migration_name FROM ${migrationTable} ORDER BY applied_at DESC, id DESC LIMIT 1`);
  const last = rows[0];

  if (!last) {
    console.log('Nenhuma migracao aplicada para rollback.');
    return;
  }

  const migration = migrations.find((item) => item.name === last.migration_name);
  if (!migration) {
    throw new Error(`Arquivo da migracao ${last.migration_name} nao encontrado em ${migrationsDir}`);
  }

  console.log(`Rollback ${migration.name}...`);
  await runSqlFile(db, migration.down);
  await db(`DELETE FROM ${migrationTable} WHERE migration_name = $1`, [migration.name]);
  console.log(`Rollback concluido: ${migration.name}`);
}

async function main() {
  const mode = (process.argv[2] || 'up').toLowerCase();
  if (!['up', 'down'].includes(mode)) {
    console.error('Uso: node scripts/migrate.js [up|down]');
    process.exitCode = 1;
    return;
  }

  await loadEnvFile();
  const db = getDb();
  await ensureMigrationTable(db);

  const migrations = await loadMigrations();
  if (migrations.length === 0) {
    console.log('Nenhuma migracao encontrada na pasta migrations/.');
    return;
  }

  if (mode === 'up') {
    await migrateUp(db, migrations);
    return;
  }

  await migrateDown(db, migrations);
}

main().catch((error) => {
  console.error('Erro ao executar migracoes:', error.message);
  process.exitCode = 1;
});
