import { Pool } from "pg";
import { passwordHash } from "./auth";
import { readFileSync } from "node:fs";
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw Error("DEMO_PASSWORD obrigatório para seed");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    for (const [i, name] of ["Alice", "Bruno", "Carla"].entries()) {
      await c.query(
        "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
        [
          "00000000-0000-4000-8000-00000000000" + (i + 1),
          name,
          ["alice@example.test", "bruno@example.test", "carla@example.test"][i],
          await passwordHash(password),
          i === 0 ? "admin" : "user",
        ],
      );
    }
    await c.query(readFileSync("db/seed.sql", "utf8"));
    await c.query("COMMIT");
    console.log("Demo seeded; existing records preserved.");
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
