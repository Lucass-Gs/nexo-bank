import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "./client.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(c, id) {
  for (let i = 0; i < 100; i++) {
    const t = (await c.ok("/bank/transfers")).find((t) => t.id === id);
    if (["settled", "rejected"].includes(t?.status)) return t;
    await sleep(250);
  }
  throw Error("Saga did not complete");
}
test("internal transfer is idempotent, authorized and balanced", async () => {
  const a = await new Client().login(),
    b = await new Client().login("bruno@example.test");
  const from = (await a.ok("/bank/accounts"))[0],
    to = (await b.ok("/bank/accounts"))[0];
  const body = {
    idempotencyKey: randomUUID(),
    sourceId: from.id,
    destinationId: to.id,
    amount: "100",
    kind: "internal",
  };
  const [one, two] = await Promise.all([
    a.ok("/bank/transfers", "POST", body),
    a.ok("/bank/transfers", "POST", body),
  ]);
  assert.equal(one.id, two.id);
  assert.equal((await wait(a, one.id)).status, "settled");
  assert.equal(
    (
      await b.request("/bank/transfers", "POST", {
        ...body,
        idempotencyKey: randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(
    (await a.request("/bank/transfers", "POST", { ...body, amount: "200" }))
      .status,
    409,
  );
  const report = await a.ok("/bank/reconciliation");
  assert.deepEqual(report.unbalanced, []);
  assert.deepEqual(report.balanceDrift, []);
  for (let i = 0; i < 40; i++) {
    if (
      (await a.ok("/bank/statement")).some(
        (e) => e.description === "Transferência interna",
      )
    )
      return;
    await sleep(500);
  }
  throw Error("Projection did not catch up");
});
test("external response lost reconciles; rejection releases reservation", async () => {
  const a = await new Client().login();
  const account = (await a.ok("/bank/accounts"))[0];
  for (const mode of ["timeout", "reject"]) {
    const t = await a.ok("/bank/transfers", "POST", {
      idempotencyKey: randomUUID(),
      sourceId: account.id,
      amount: "75",
      kind: "external",
      mode,
    });
    assert.equal(
      (await wait(a, t.id)).status,
      mode === "timeout" ? "settled" : "rejected",
    );
  }
  const current = (await a.ok("/bank/accounts"))[0];
  assert.equal(current.reserved, "0");
  assert.equal(BigInt(account.balance) - BigInt(current.balance), 75n);
});
test("concurrent requests cannot overspend available balance", async () => {
  const c = new Client();
  await c.ok("/auth/register", "POST", {
    name: "Race tester",
    email: "race-" + randomUUID() + "@example.test",
    password: "Test12345!",
  });
  const account = await c.ok("/bank/accounts", "POST");
  const a = await new Client().login();
  const dest = (await a.ok("/bank/accounts"))[0];
  const txs = await Promise.all(
    Array.from({ length: 5 }, () =>
      c.ok("/bank/transfers", "POST", {
        idempotencyKey: randomUUID(),
        sourceId: account.id,
        destinationId: dest.id,
        amount: "60000",
        kind: "internal",
      }),
    ),
  );
  const results = await Promise.all(txs.map((t) => wait(c, t.id)));
  assert.equal(results.filter((t) => t.status === "settled").length, 1);
  assert.equal((await c.ok("/bank/accounts"))[0].available, "40000");
});
