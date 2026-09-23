import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "./client.mjs";
test("session revocation and CSRF", async () => {
  const c = await new Client().login();
  assert.equal((await c.request("/auth/me")).status, 200);
  assert.equal(
    (await c.request("/auth/logout", "POST", {}, { "X-CSRF-Token": "wrong" }))
      .status,
    403,
  );
  await c.ok("/auth/logout", "POST");
  assert.equal((await c.request("/auth/me")).status, 401);
});
test("cross-origin login rejected", async () => {
  const c = new Client();
  assert.equal(
    (
      await c.request(
        "/auth/login",
        "POST",
        { email: "alice@example.test", password: "Demo1234!" },
        { Origin: "https://untrusted.example" },
      )
    ).status,
    403,
  );
});
