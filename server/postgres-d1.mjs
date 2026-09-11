import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;

function postgresSql(sql) {
  let statement = sql.trim();
  const ignoreConflict = /^INSERT\s+OR\s+IGNORE\s+INTO\s+/i.test(statement);
  if (ignoreConflict) statement = statement.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\s+/i, "INSERT INTO ");

  let parameter = 0;
  statement = statement.replace(/\?/g, () => `$${++parameter}`);
  if (ignoreConflict && !/\bON\s+CONFLICT\b/i.test(statement)) statement += " ON CONFLICT DO NOTHING";
  return statement;
}

class PostgresStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = postgresSql(sql);
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    const result = await this.database.query(this.sql, this.values);
    return result.rows[0] || null;
  }

  async all() {
    const result = await this.database.query(this.sql, this.values);
    return { results: result.rows };
  }

  async run() {
    const result = await this.database.query(this.sql, this.values);
    return { success: true, meta: { changes: result.rowCount || 0 } };
  }
}

export class PostgresD1 {
  constructor(connectionString) {
    if (!connectionString) throw new Error("DATABASE_URL fehlt.");
    const ssl = process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined;
    this.pool = new Pool({ connectionString, ssl, max: 10 });
  }

  prepare(sql) {
    return new PostgresStatement(this, sql);
  }

  query(sql, values = []) {
    return this.pool.query(sql, values);
  }

  async batch(statements) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results = [];
      for (const statement of statements) {
        const result = await client.query(statement.sql, statement.values);
        results.push({ success: true, results: result.rows, meta: { changes: result.rowCount || 0 } });
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async initialize() {
    const schema = await readFile(resolve(import.meta.dirname, "../db/postgres-schema.sql"), "utf8");
    await this.pool.query(schema);
  }

  close() {
    return this.pool.end();
  }
}
