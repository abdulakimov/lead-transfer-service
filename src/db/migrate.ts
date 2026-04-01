import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnv } from '../config/env.js';
import { formatErrorForLog } from '../utils/log-sanitize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const env = loadEnv();
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await client.query('SELECT name FROM _migrations ORDER BY id');
    const appliedSet = new Set(applied.rows.map((r: { name: string }) => r.name));

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      // eslint-disable-next-line no-console
      console.log(`Migratsiya: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    // eslint-disable-next-line no-console
    console.log('Barcha migratsiyalar muvaffaqiyatli bajarildi');
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`Migratsiya xatosi: ${formatErrorForLog(err)}`);
  process.exit(1);
});
