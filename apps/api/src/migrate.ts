import { Pool } from "pg";
import { readFileSync, readdirSync } from "node:fs";
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(718271)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const dir = process.env.MIGRATIONS_DIR || "db/migrations";
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (
        (await c.query("SELECT 1 FROM schema_migrations WHERE name=$1", [file]))
          .rowCount
      )
        continue;
      await c.query(readFileSync(dir + "/" + file, "utf8"));
      await c.query("INSERT INTO schema_migrations(name) VALUES($1)", [file]);
      console.log("Applied", file);
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
