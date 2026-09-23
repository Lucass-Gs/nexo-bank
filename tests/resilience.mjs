import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "./integration/client.mjs";
const docker = (...args) =>
  execFileSync("docker", ["compose", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const c = await new Client().login();
const own = (await c.ok("/bank/accounts"))[0];
const dest = (await c.ok("/bank/beneficiaries")).find((a) => a.id !== own.id);
const body = {
  idempotencyKey: randomUUID(),
  sourceId: own.id,
  destinationId: dest.id,
  amount: "23",
  kind: "internal",
};
let stopped = false;
try {
  docker("stop", "statements");
  stopped = true;
  const t = await c.ok("/bank/transfers", "POST", body);
  let settled = false;
  for (let i = 0; i < 60; i++) {
    if (
      (await c.ok("/bank/transfers")).find((x) => x.id === t.id)?.status ===
      "settled"
    ) {
      settled = true;
      break;
    }
    await sleep(300);
  }
  assert.ok(settled, "Ledger must settle with projection offline");
  docker("start", "statements");
  stopped = false;
  let entry;
  for (let i = 0; i < 60; i++) {
    const result = await c.request("/bank/statement");
    entry = result.value?.find?.((e) => e.journal_id && e.amount === "-23");
    if (entry) break;
    await sleep(500);
  }
  assert.ok(entry, "Projection catches up after restart");
  assert.match(entry.journal_id, /^[0-9a-f-]{36}$/);
  docker(
    "exec",
    "-T",
    "db-ledger",
    "psql",
    "-U",
    "ledger",
    "-d",
    "ledger",
    "-c",
    `UPDATE outbox SET published_at=NULL WHERE payload->>'journalId'='${entry.journal_id}'`,
  );
  await sleep(2500);
  assert.equal(
    (await c.ok("/bank/statement")).filter(
      (e) => e.journal_id === entry.journal_id,
    ).length,
    1,
    "Duplicate event has one projection effect",
  );
  docker("restart", "ledger");
  await sleep(3000);
  assert.equal(
    (await c.ok("/bank/transfers", "POST", body)).id,
    t.id,
    "Retry after restart retains identity",
  );
  const report = await c.ok("/bank/reconciliation");
  assert.equal(report.unbalanced.length, 0);
  assert.equal(report.balanceDrift.length, 0);
  console.log(
    "PASS projection outage, replayed event, ledger restart and reconciliation",
  );
} finally {
  if (stopped) docker("start", "statements");
}
